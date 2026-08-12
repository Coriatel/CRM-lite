# Owner-operated secrets MVP

One owner, one host. Replaces ad-hoc plaintext credential files with a private
per-account store, a metadata registry, an owner-authenticated backend, and an
`/ops/secrets` screen that can create, list, replace and disable.

This is **not** a vault product, a multi-user platform, or a rotation system.

## What exists

| Piece | Path | Notes |
|---|---|---|
| Store library | `crm-app/scripts/secrets/secretstore.mjs` | validation, modes, locking, atomic writes, expiry enforcement |
| HTTP API | `crm-app/scripts/secrets/secretsapi.mjs` | authn + authz + CSRF; metadata out, value in once |
| API server | `crm-app/scripts/secrets/secretsd.mjs` | loopback-only daemon |
| Owner CLI | `crm-app/scripts/secrets/secretsctl.mjs` | host-side administration and recovery |
| `/ops` screen | `crm-app/src/pages/OpsSecretsPage.tsx` | metadata only; create/replace/disable |
| Store root | `~/.secrets/` on the consumer account | `0700` |

## Layout

```
~/.secrets/                 0700  devuserp:devuserp
~/.secrets/values/          0700  devuserp:devuserp
~/.secrets/values/<name>    0600  one opaque raw value per file
~/.secrets/registry.json    0600  metadata only — never a value
~/.secrets/.lock            0600  bounded mutation lock
```

**One value per file, not a shared `.env`.** A `source`-able env file leaks every
secret into the environment of every child process that touches it — precisely
the exposure this store removes.

Values are stored **verbatim and opaque**: never parsed, trimmed, or interpreted.

### Registry schema

```json
{
  "schema": 1,
  "secrets": [
    {
      "name": "example-token",
      "type": "password|token|api_key|connection_string|other",
      "purpose": "why this credential exists",
      "consumer": "what uses it",
      "owner": "derived from the authenticated session (API) or the OS user (CLI)",
      "created": "YYYY-MM-DD",
      "updated": "ISO timestamp",
      "expiry": "YYYY-MM-DD | null",
      "status": "active|disabled",
      "path": "/home/<owner>/.secrets/values/<name>"
    }
  ]
}
```

`status: expired` is **derived** at read time from `expiry`, never written back —
and, critically, it is **enforced** as well as displayed (see below).

## Why there is no static projection

The first cut of this MVP published a metadata projection to
`crm-app/public/ops-data/secrets.json` and had the page fetch
`/ops-data/secrets.json`. Independent review established that this was wrong in
two compounding ways:

1. `/ops-data/*` is a Caddy `handle_path` static route rooted at
   `/srv/ops-vault/state`, on **two public domains**, with **no authentication
   of any kind**. An anonymous request returns `200` even while the application
   itself is down. Publishing there would have put the full credential
   inventory — every name, purpose, consumer and expiry — on the open internet.
2. Because `handle_path` never falls through to the app, a file published into
   the SPA's own `public/ops-data/` could never be served at that URL anyway.
   The page could not have displayed a published projection at all.

There is therefore **no `publish` verb and no static projection**. Metadata is
reachable only through the authenticated API. A regression test asserts that no
source file fetches `/ops-data/secrets.json`.

## The API

`secretsd` binds **127.0.0.1 only** and is reached through a reverse-proxy route.

| Method | Route | Effect |
|---|---|---|
| `GET` | `/api/secrets` | metadata list |
| `POST` | `/api/secrets` | create; body carries the value exactly once |
| `PUT` | `/api/secrets/<name>` | replace the value |
| `POST` | `/api/secrets/<name>/disable` | disable (metadata only) |
| `DELETE` | `/api/secrets/<name>` | delete — removes the value file and the registry entry |

Configuration is entirely environment-driven; **no path, owner or store location
is ever taken from a request**:

```
SECRETS_API_PORT         default 8091
SECRETS_OWNER_EMAILS     comma-separated allowlist — REQUIRED, no default
SECRETS_ALLOWED_ORIGINS  comma-separated origin allowlist
VITE_DIRECTUS_URL        identity provider
SECRET_STORE_ROOT        store location (defaults to ~/.secrets)
```

`secretsd` refuses to start with an empty owner allowlist.

### Authentication, authorisation, CSRF

Authentication **reuses the app's existing session** rather than adding a second
one. The SPA already holds a Directus access token; every request here is
validated by asking Directus who the bearer is. Expiry and revocation are
therefore authoritative at the identity provider, and no signing key lives in
this process. Authorisation is an explicit owner-email allowlist.

Everything fails closed: unauthenticated → `401`, expired/revoked → `401`,
authenticated non-owner → `403`, identity provider unreachable → `503`. Every
mutation is refused *before* anything is written.

CSRF is handled as appropriate to a bearer-token session:

- authority comes **only** from the `Authorization` header. Cookies are never
  read, so no request carries ambient authority and a cross-site form or `<img>`
  cannot act as the owner — browsers do not attach `Authorization` cross-site;
- mutating requests must carry `Content-Type: application/json`, which blocks
  simple cross-site form posts;
- when the browser sends an `Origin`, it must be on the allowlist.

### What never crosses the boundary

Outbound: no raw value, no prefix, no length, no digest or other recoverable
derivative, and no filesystem path. The response is built from a nine-field
metadata allowlist, so `path` is absent by construction rather than deleted.

Inbound: no owner and no storage location. Both are derived server-side; anything
the client sends for either is discarded. Routes call the store library directly
and **never spawn a process** — a regression test asserts the API source contains
no child-process API at all.

## Durability and containment

### Expiry is enforced, not just displayed

`assertUsable()` is the single predicate at the value-access boundary, and it
checks the **current time**, not only the stored status. A secret whose expiry
has passed is stored as `active`, displays as `expired`, and is **refused** by
`readSecretValue`. Previously it displayed as expired and was still returned in
full.

### Atomic writes, one bounded lock, defined rollback

- Every mutation holds one bounded store lock (`~/.secrets/.lock`, `O_EXCL`).
  Concurrent writers serialise or fail loudly with "store is busy"; there are no
  reported-success lost updates. A lock older than 60s is treated as stale.
- **Nothing is written in place.** Content goes to a private `0600` temp file in
  the same directory, is `fsync`'d, then `rename()`d over the target, and the
  directory is `fsync`'d. An interrupted write leaves the previous valid file
  untouched.
- `create` stages the value **without publishing it**, writes the registry, then
  promotes the value. A registry failure discards the staged file, so it can
  never leave an unregistered secret on disk. A promotion failure restores the
  registry preimage.
- `replace` copies the current value aside first, so a later failure restores it
  byte for byte.
- Operator rollback primitives: `removeSecret`, `restoreRegistryBytesPublic`,
  `copyValueAside`, `restoreValueFrom`. Rollback for create, replace and disable
  is tested against a byte-exact preimage snapshot.

### Hardlink and symlink containment

A hardlink *is* the file, so `lstat` cannot see it; the old in-place write put
the value straight into an external hardlinked inode. Two defences now:

- `assertSafeTargetFile` refuses a target that is not a regular file or whose
  link count is not 1;
- the temp-file + `rename` write replaces the **directory entry**, so an external
  hardlink keeps pointing at the untouched old inode. A test asserts the inode
  number changes on replace.

Existing symlink and traversal defences are preserved: a symlinked value file or
`values/` directory is refused, a **symlinked store root is now refused too**
(it used to be followed and chmod'd), and names are rejected — never sanitised —
if they contain `..`, a separator, or anything resolving outside `values/`.

### Bounded registry reads

`registry.json` is `lstat`'d before reading: a symlink or non-regular file is
refused, and anything over 1 MB is refused rather than parsed. An unbounded read
of a same-UID symlink to a character device would otherwise allocate until the
process was OOM-killed.

## CLI

```bash
cd crm-app
node scripts/secrets/secretsctl.mjs init
node scripts/secrets/secretsctl.mjs add --name my-token --type token \
    --purpose "…" --consumer "…" [--expiry 2027-01-01]   # value prompted, not echoed
node scripts/secrets/secretsctl.mjs replace --name my-token
node scripts/secrets/secretsctl.mjs disable --name my-token
node scripts/secrets/secretsctl.mjs delete --name my-token
node scripts/secrets/secretsctl.mjs list
node scripts/secrets/secretsctl.mjs audit
```

The value is typed at a prompt with echo off, or piped on stdin. It is **never**
an argv token — and an **unknown flag is now rejected**, so a mistaken
`--value <secret>` fails loudly instead of being silently ignored while the value
sits in world-readable `/proc/<pid>/cmdline`. `--owner` is gone: the owner is
derived from the OS identity.

Errors never quote an argument back. An invalid name is reported as exactly
`invalid secret name`, because the old message echoed the first 40 characters of
the input and a value pasted into `--name` would have been disclosed.

`disable` is **metadata only**. It does not revoke anything at the provider.

## Delete

`delete` is the supported way to remove a secret. Without it a created secret
could only be disabled, which made the first production acceptance test
irreversible through supported interfaces — the reason this verb exists.

Contract:

- **One named secret.** The name is the only selector. There is deliberately no
  bulk, wildcard, by-path or by-filter form, no restore/undelete, and no generic
  filesystem removal: the caller supplies a name, the store resolves the path.
- **Same authority as create/replace/disable** — owner-authenticated. Non-owner
  `403`, invalid or expired session `401`, IdP unreachable `503`, unknown secret
  `404` (CLI: exit 1, `no such secret`). Caller-supplied `owner`, `path` or
  `storage` fields have no effect on deletion authority.
- **Both sides or neither.** Under the store lock: the value file is copied
  aside and unlinked, then the registry entry is dropped. If the registry write
  or the finalisation step fails, the value is restored byte-for-byte and the
  registry bytes are rolled back to their exact preimage. No orphan value and no
  orphan metadata.
- **Ordering.** The value is removed *before* the registry, mirroring
  `addSecret`. If the pair ever splits under a hard crash, orphan metadata is
  preferred over an orphan value file: a repeat `delete` clears the former,
  whereas the latter would be unreachable by name yet still hold secret material
  on disk.
- **Containment precedes existence.** The name is validated and resolved before
  the registry is consulted, so a traversal or symlinked name is rejected as an
  invalid name rather than as "no such secret" — the guard can never be bypassed
  by a name that merely happens to be absent.
- **Nothing is disclosed.** The deleted value is never read into memory, never
  returned, never logged. The API responds with the same nine-field metadata
  allowlist used everywhere else; the CLI prints the name only.

There is one deletion mechanism — `removeSecret()` — shared by the CLI, the API
and the operator rollback path. `mustExist: true` is what the owner-facing verbs
pass; the rollback path leaves it `false` so it can clean up a half-finished
create without knowing how far it got.

## Replace on a disabled secret

Replacing the value of a **disabled** secret is **allowed**, and the secret
**stays disabled**. This is intentional, not an oversight: rotating a credential
at the provider and recording the new value is a normal thing to do while the
secret is parked, and forcing an enable first would mean the store briefly holds
a live-but-unreviewed value.

Consumption remains refused for as long as the status is `disabled` —
`assertUsable()` is the single predicate at the value boundary, so
`readSecretValue()` throws regardless of how fresh the value is.

There is **no `enable` verb in this MVP**. Disable is therefore a one-way door
until one is added; `delete` is the only other exit. A focused test pins this
behaviour so it stays deliberate.

## Deployment (owner-gated, NOT applied)

The code-level flow is complete and tested. Serving it needs one reverse-proxy
route, which is a production Caddy change and therefore an owner decision — it
was deliberately **not** applied by the branch that wrote this:

```
# inside the crmphone site block, BEFORE the /ops-data handler
handle /api/secrets* {
    reverse_proxy 127.0.0.1:8091
}
```

and `secretsd` running under the owner's account with `SECRETS_OWNER_EMAILS` set.
Until that route exists, `/ops/secrets` renders its unauthorised/error state
rather than silently showing stale or public data.

In development `vite.config.ts` proxies `/api/secrets` to `127.0.0.1:8091`, so
the flow is exercisable locally without touching production.

## Future fixed launcher (documented, NOT implemented)

When an approved operation exists, the launcher contract is:

1. A **fixed allowlist** in the launcher source maps an operation id to a
   hardcoded argv and exactly one secret name. Nothing is taken from the caller.
2. The agent-facing contract is only `run approved operation <id>`. No secret
   path, no command, no arguments cross that boundary.
3. The launcher calls `readSecretValue(name)` — the one seam that returns secret
   material — and passes it to the child **via its environment or stdin only**,
   never argv.
4. It refuses to run unless `assertUsable()` passes, which now covers **both**
   disabled status and date expiry.
5. It disables shell tracing, never echoes the value, and returns only the
   child's exit code plus non-secret output.

## Honest security boundary

This MVP protects against:

- accidental leakage — group/world-readable files, values in git, logs, browser,
  API responses, shell history, process argv;
- unauthenticated and non-owner access to the metadata inventory;
- unprivileged identities — other OS accounts and the `ops-vault`/`mnos` groups;
- interrupted writes, concurrent writers, and hardlink/symlink escape.

It does **not** protect against:

- **an agent or process with unrestricted shell access as the secret-owning
  account.** `~/.secrets/values/*` is readable by that account by definition. Any
  fully-trusted owner-equivalent shell can read every value directly, launcher or
  no launcher.

Closing that gap needs a different mechanism (a broker process under a separate
UID, hardware-backed keys, or an external secret manager) and is out of scope.

## Deferred consumer: Expiry-Alert

`~/.claude/tools/verify-suppliers.mjs` reads `/working/up.txt` for an
Expiry-Alert email/password pair. That path is now an empty root-owned directory,
so the script is broken (`EISDIR`).

Deliberately **not** addressed here: no credential was migrated, requested, or
invented. When the owner supplies the value, the script should be repointed at
the store in a separate slice.

The historical exposure is **not** certified remediated. The source file is
absent now, but whether it was copied before its removal is unknown.

`/working/up.txt/` is left untouched.

## Residual LOWs (recorded, out of scope for this correction)

- `writePrivateFileAtomic` sets the mode on a fresh temp inode before the
  rename, so the pre-existing TOCTOU window is closed for value and registry
  writes. The `.lock` file is created `0600` by `O_EXCL` and holds no secret.
- `auditModes` still reports only mode drift, not ownership drift.
- The store offers no rotation, no provider revocation and no audit log of reads.
- `secretsd` has no rate limiting; it is loopback-only and single-owner, so the
  exposure is a local denial of service at worst.

---

## Hardening (encryption, identity, broker, audit, backup)

### Service identity and runtime path

The service runs as a dedicated system user `crmsecrets`, from the stable path
`/opt/crm-secrets/current` (a symlink to a timestamped release), with the store
at `/var/lib/crm-secrets` and the key at `/etc/crm-secrets/secretsd.key`.

This is the control that keeps values away from **unprivileged** processes:
`devuserp`, `devuser`, `elron` and any Claude or Codex process running as them
are a different UID than `crmsecrets`, and the store is 0700 with a 0400 key. No
API call is involved — the filesystem refuses them.

**It does not stop an account with sudo.** On this host `devuserp` — the account
agent sessions run as — currently holds `NOPASSWD: ALL`, and passwordless root
reads a 0700 store and a 0400 key directly. So the honest statement is: UID
ownership and file modes are the boundary against unprivileged code, and sudo
policy is the boundary against an agent session. Hard isolation from Claude and
Codex requires a separate owner-authorised sudo/access-policy change. That change
is out of scope here and this PR deliberately does not weaken or modify live sudo
policy. Treat the store as reachable by anything that can become root until that
gate is closed.

Unit: `ops/secrets/secretsd.service`. Installer: `ops/secrets/install-secretsd.sh`.
`MemoryDenyWriteExecute` is deliberately absent — it is incompatible with V8's
JIT and crashes node with `status=5/TRAP`.

### Encryption at rest

Values are AES-256-GCM envelopes (`v1.<iv>.<ct>.<tag>`). The secret's **name is
the AAD**, so a value file moved or renamed under another name fails to decrypt
instead of silently returning the wrong secret.

What this protects: copies that leave the host — backups, snapshots, a stolen
disk. What it does not protect: a process already running as `crmsecrets`, which
can read the key. That is the dedicated user's job, not the cipher's.

Plaintext value files are **refused**, not accepted for compatibility: silently
reading plaintext would let anyone who can write the values directory downgrade
every secret to cleartext.

**Startup posture:** a missing, malformed, or group/world-readable key makes
`secretsd` exit 3 before it accepts a request. `RestartPreventExitStatus=2 3`
stops it restart-looping on a broken key.

### Key custody and recovery — read this once

The server key is automatic (a 0400 file the unit reads at start), so restarts
need no human. The owner additionally holds a **recovery artifact**: that same
key wrapped under an owner passphrase with scrypt, in the same envelope format —
one mechanism, not a parallel recovery system.

**Recovery requires an owner-held artifact.** Without both the artifact and its
passphrase, backups are permanently unreadable. There is no escrow. This
codebase will not generate one for you; `secretsctl export-recovery` is an
explicit owner action.

### Separate test and production stores

`assertStoreSeparation()` refuses to resolve the production root under a test
runner (`VITEST`, `NODE_ENV=test`, or `SECRET_STORE_ENV=test`). A test that
forgets to set `SECRET_STORE_ROOT` fails loudly instead of mutating the owner's
real secrets.

### Capability broker — what an AI caller may do

| | |
|---|---|
| May | invoke a **named capability** the owner granted: `probe`, `sign-challenge` |
| May not | name a secret directly, enumerate secrets, or retrieve any value |

Capabilities live in `capabilities.json` (0600, owner-written). A caller names an
id; the broker resolves it. Unknown and ungranted ids give the **same** error, so
the list cannot be enumerated by probing. `sign-challenge` returns
HMAC-SHA256(secret, caller challenge) — proof of possession, one-way, over
caller-chosen input. There is deliberately no `peek`, `prefix`, `length`, or
`fingerprint` verb.

Routes: `GET /api/secrets/capabilities`, `POST /api/secrets/capabilities/<id>/invoke`.
Both sit behind the same owner authentication as everything else.

### Audit trail

`audit.log` (JSONL, 0600): `ts, actor, operation, secret, outcome, reason`. The
secret is the **symbolic name only** — never a value, never a truncation, never a
hash, because a hash of a low-entropy secret is a secret. Newlines are stripped
(no log-injection forgery) and unknown operations collapse to `unknown`. Writes
are best-effort: an audit failure never turns a committed mutation into a
reported failure.

### Backup and restore

`secretsctl backup` emits registry + **stored envelopes**. No value is decrypted
to produce a backup. `restore` refuses anything that is not an envelope, so a
tampered bundle cannot inject plaintext. Rehearse into a scratch
`SECRET_STORE_ROOT` — covered by an automated test, and by `OWNER-RUNBOOK.md`.

### CLI additions

```
secretsctl keygen --out <path>                       once, ever
secretsctl export-recovery --out <path>              owner passphrase, off-box
secretsctl import-recovery --from <p> --out <p>      rebuild after host loss
secretsctl backup --out <path>
secretsctl restore --from <path>
secretsctl capabilities
secretsctl trail [--limit N]
```
