# Owner-operated secrets MVP

One owner, one host. Replaces ad-hoc plaintext credential files with a private
per-account store, a metadata registry, and a read-only `/ops` screen.

This is **not** a vault product, a multi-user platform, or a rotation system.

## What exists

| Piece | Path | Notes |
|---|---|---|
| Store library | `crm-app/scripts/secrets/secretstore.mjs` | name validation, modes, registry |
| Owner CLI | `crm-app/scripts/secrets/secretsctl.mjs` | the only write path |
| `/ops` screen | `crm-app/src/pages/OpsSecretsPage.tsx` | metadata only, read-only |
| Store root | `~/.secrets/` on the consumer account | `0700` |

## Layout

```
~/.secrets/                 0700  devuserp:devuserp
~/.secrets/values/          0700  devuserp:devuserp
~/.secrets/values/<name>    0600  one opaque raw value per file
~/.secrets/registry.json    0600  metadata only — never a value
```

**One value per file, not a shared `.env`.** A `source`-able env file leaks every
secret into the environment of every child process that touches it — precisely
the exposure this store removes. One file per secret lets a launcher read the
single secret its operation needs and nothing else.

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
      "owner": "OS account that owns the value file",
      "created": "YYYY-MM-DD",
      "expiry": "YYYY-MM-DD | null",
      "status": "active|disabled|expired",
      "path": "/home/<owner>/.secrets/values/<name>"
    }
  ]
}
```

`status: expired` is **derived** at read time from `expiry`, never written back.

Names must match `^[a-z0-9][a-z0-9._-]{1,63}$` and are rejected — not sanitised —
if they contain `..`, a separator, or anything that resolves outside `values/`.

## Usage

```bash
cd crm-app
node scripts/secrets/secretsctl.mjs init
node scripts/secrets/secretsctl.mjs add --name my-token --type token \
    --purpose "…" --consumer "…" [--expiry 2027-01-01]   # value prompted, not echoed
node scripts/secrets/secretsctl.mjs replace --name my-token
node scripts/secrets/secretsctl.mjs disable --name my-token
node scripts/secrets/secretsctl.mjs list
node scripts/secrets/secretsctl.mjs audit                 # assert owner-only modes
node scripts/secrets/secretsctl.mjs publish --out public/ops-data/secrets.json
```

The value is typed at a prompt with echo off, or piped on stdin. It is **never** an
argv token — `/proc/<pid>/cmdline` is world-readable — and therefore never lands
in shell history.

`disable` is **metadata only**. It does not revoke anything at the provider.
This MVP has no rotation authority; revoking is a manual owner action.

## Why the `/ops` screen is read-only

The brief asked for an owner-only add-secret form on `/ops`. It is not built,
because the surface cannot host one:

- `Caddyfile` is `root * /srv` + `file_server` — a **static** file server.
- `api/` contains only `node_modules` and a lockfile. There is no backend.
- Every `/ops` card reads a static `/ops-data/*.json` projection.
- Auth is Directus JWT in `localStorage`, terminated in the SPA.

A form would require standing up a new writable service — out of scope, and it
would drag raw values through HTTP, a JS heap, and a server log on the way to a
file that lives on this account anyway. The CLI removes that path entirely.

The screen therefore lists metadata and names the CLI verbs as disabled chips,
matching the existing `OpsGatePage` precedent ("כתיבה תוטמע בסליס נפרד").

Owner-gating is **inherited**: `App.tsx` renders `LoginPage` for any
unauthenticated user before `/ops/secrets` is reachable. No second auth system.

### Publishing the projection

`secretsctl publish` writes `crm-app/public/ops-data/secrets.json` — the registry
minus every value **and** minus `path`. The filesystem layout is not the
browser's business.

`secrets.json` is deliberately **absent** from the `files[]` list in
`scripts/sync-ops-data.mjs`: that script stubs missing vault files at prebuild,
which would silently overwrite a published projection with an empty one. The page
treats a 404 as its empty state, so an unpublished registry renders
"אין סודות רשומים עדיין" rather than an error.

## Future fixed launcher (documented, NOT implemented)

When an approved operation exists, the launcher contract is:

1. A **fixed allowlist** in the launcher source maps an operation id to a hardcoded
   argv and exactly one secret name. Nothing is taken from the caller.
2. The agent-facing contract is only `run approved operation <id>`. No secret path,
   no command, no arguments cross that boundary.
3. The launcher calls `readSecretValue(name)` — the one seam in `secretstore.mjs`
   that returns secret material — and passes it to the child **via its environment
   or stdin only**, never argv.
4. It refuses to run when `status !== "active"`.
5. It disables shell tracing, never echoes the value, and returns only the child's
   exit code plus non-secret output.

`readSecretValue` already exists and is unit-tested; no CLI verb and no HTTP route
calls it.

## Honest security boundary

This MVP protects against:

- accidental leakage — group/world-readable files, values in git, logs, browser,
  API responses, shell history, process argv;
- unprivileged identities — other OS accounts and the `ops-vault`/`mnos` groups;
- casual over-broad reads — one file per secret instead of a shared env blob.

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
invented. When the owner supplies the value through `secretsctl`, the script
should be repointed at the store in a separate slice.

The historical exposure is **not** certified remediated. The source file is
absent now, but whether it was copied before its removal is unknown.

`/working/up.txt/` is left untouched.
