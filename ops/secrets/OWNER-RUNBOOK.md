# Secrets MVP — owner runbook

Everything you do day to day happens in the browser. The terminal appears in
exactly two places: first install, and disaster recovery. Both are below, in
full, with nothing implied.

---

## Day to day — browser only

`https://crmphone.merkazneshama.co.il/ops/secrets`, signed in as the owner.

| Task | How |
|---|---|
| See what exists | The list. Metadata only — a value is never shown, by design. |
| Add a secret | **Add**, fill the form, paste the value. It is sent once and never returned. |
| Rotate a value | **Replace**. Metadata and history stay; only the value changes. |
| Take one out of service | **Disable**. Reversible in the sense that the record survives — but there is no *enable* verb, so re-activating means Replace + re-add. Consumers refuse a disabled secret immediately. |
| Remove it entirely | **Delete**. Permanent, no undelete. |

Disable and Delete do **not** revoke anything at the provider. Revoke there too.

---

## One-time install (owner, ~4 commands)

Everything scriptable is in `install-secretsd.sh`. What is left is what must not
be automated: creating the key, and deciding the owner allowlist.

### 1. Generate the server key — once, ever

```
sudo -u crmsecrets /usr/bin/node /opt/crm-secrets/current/crm-app/scripts/secrets/secretsctl.mjs \
  keygen --out /etc/crm-secrets/secretsd.key
```

Writes 0400, owned by `crmsecrets`. **The key is never printed.**

> Regenerating this key destroys every stored value and every backup taken
> under the old key. The script refuses to overwrite an existing key file.

### 2. Write the service config

```
sudo install -o root -g crmsecrets -m 0640 /dev/stdin /etc/crm-secrets/secretsd.env <<'EOF'
SECRETS_API_PORT=8091
SECRETS_OWNER_EMAILS=Coriatel@gmail.com
SECRETS_ALLOWED_ORIGINS=https://crmphone.merkazneshama.co.il
VITE_DIRECTUS_URL=https://crm.merkazneshama.co.il
SECRET_STORE_ROOT=/var/lib/crm-secrets
SECRET_KEY_FILE=/etc/crm-secrets/secretsd.key
EOF
```

### 3. Install and start

```
sudo bash ops/secrets/install-secretsd.sh /path/to/repo
```

Idempotent. It creates the service user, stages a timestamped release, points
`/opt/crm-secrets/current` at it, installs the unit, and refuses to start if the
key or config is missing or the key's custody is wrong. It ends by proving
loopback-only and unauthenticated-401 itself.

### 4. Make the off-box recovery artifact — do this the same day

```
sudo -u crmsecrets /usr/bin/node /opt/crm-secrets/current/crm-app/scripts/secrets/secretsctl.mjs \
  export-recovery --out /tmp/crm-secrets-recovery.txt
```

Prompts for a passphrase (twice, never echoed). Copy the file **off this host** —
password manager, printed page in a safe, another machine — then delete the copy
in `/tmp`.

**Answering the question directly: yes, recovery requires an owner-held
artifact.** The server key is automatic so restarts need no human; that same key
wrapped under your passphrase is the only thing that survives losing this host.
Without both the artifact and the passphrase, backups are permanently
unreadable ciphertext. There is no escrow and nobody to call. This project will
not generate a recovery artifact for you — it is yours to create and hold.

---

## Backups

```
sudo -u crmsecrets /usr/bin/node /opt/crm-secrets/current/crm-app/scripts/secrets/secretsctl.mjs \
  backup --out /var/lib/crm-secrets/backup-$(date -u +%Y%m%d).json
```

The bundle is ciphertext only — no value is ever decrypted to make it. It is
useless without the key. Keep backups and the recovery artifact in *different*
places; together in one folder they are equivalent to plaintext.

## Restore rehearsal — do it once, before you need it

Rehearse into a scratch directory. It never touches the live store:

```
sudo -u crmsecrets env SECRET_STORE_ROOT=/tmp/rehearsal \
  /usr/bin/node /opt/crm-secrets/current/crm-app/scripts/secrets/secretsctl.mjs \
  restore --from /var/lib/crm-secrets/backup-YYYYMMDD.json
```

Then `list` against the same `SECRET_STORE_ROOT` and confirm the names are all
there. Delete `/tmp/rehearsal` afterwards. This exact path is covered by an
automated test, but a rehearsal you have personally run is the only one that
counts.

## Disaster recovery — new host, key gone

```
# 1. rebuild the key from your artifact (prompts for the passphrase)
sudo -u crmsecrets /usr/bin/node .../secretsctl.mjs \
  import-recovery --from /path/to/crm-secrets-recovery.txt --out /etc/crm-secrets/secretsd.key
# 2. install as above
# 3. restore the newest backup into /var/lib/crm-secrets
```

## If secretsd will not start

It exits **3** when the key is missing, malformed, or group/world readable —
deliberately, rather than starting and failing later when you actually need a
secret. `systemctl status secretsd` names which. The unit does not restart-loop
on this.

---

## Who can read a secret

- `crmsecrets` — the service. Yes.
- You, through the browser, signed in as the owner — you can *manage* metadata
  and set values. The API never returns a value back, not even to you.
- `devuserp`, `devuser`, `elron`, and any Claude or Codex session running as
  them — **not as an ordinary process.** Different user, 0700 store, 0400 key,
  and the filesystem refuses them. **But** `devuserp` currently has `NOPASSWD:
  ALL` sudo on this host, and anything that can become root can read the key and
  the store regardless of ownership. So today the real boundary against an agent
  session is sudo policy, not file modes. Closing that means removing sudo from
  the agent accounts — a separate change you have to authorise, which this work
  deliberately did not make.
- An AI caller — only named broker operations (`probe`, `sign-challenge`).
  There is no verb anywhere that returns a value to a caller.

Encryption at rest protects copies that leave the host: backups, snapshots, a
stolen disk. It does **not** protect against something already running as
`crmsecrets` — that is what the dedicated user and the file modes are for.

## Delivering a secret to a file consumer (secrets-materialize)

Some consumers can only read an env file — they cannot call the API. Example: the
Hebrew STT benchmark reads `DEEPGRAM_API_KEY` from its process environment.

You still enter the secret **once**, in the Secrets UI. You never paste it into a
shell, and it is never stored in Git.

    sudo /usr/local/sbin/secrets-materialize deepgram-stt-bench

That writes `/etc/ai-secrets/deepgram.env` as `root:aisecrets 0640`, atomically
(fresh inode renamed over the target, so a failed run leaves the previous valid file
untouched). Re-run it after any rotation.

The consumer then does:

    set -a; . /etc/ai-secrets/deepgram.env; set +a

### What it deliberately cannot do

- It takes a **deployment id**, never a secret name and never a destination path.
- Destinations are restricted to `/etc/ai-secrets/` direct children.
- There is no `get-secret`, `reveal`, `peek`, or `decrypt-to-stdout` verb — same rule
  as `secretbroker.mjs`. Output is a status line; the value never reaches stdout,
  stderr, argv, or the audit log.
- Symlinked, hardlinked, and non-regular targets are refused.

### Adding a consumer

Edit `/var/lib/crm-secrets/deploy-targets.json` (root:root 0600) and add one entry —
see `deploy-targets.example.json`. `secret` is the Registry entry name; `env_var` is
what the consumer reads; they may differ. No code change is needed.

**Never put a secret value in that file.** It holds names and destinations only.

### Who can read a materialized secret

Anyone in the target's group. `/etc/ai-secrets/deepgram.env` is `root:aisecrets 0640`,
so every member of `aisecrets` can read it. That is weaker than the encrypted registry
and is a deliberate owner decision for trusted operator accounts. Check membership with
`getent group aisecrets` before adding a target.

### Tests

    ops/secrets/test-secrets-materialize.sh <tempdir>

Uses a temp store, a temp key and a dummy value — never the live registry. Requires
root (it chowns a throwaway target under `/etc/ai-secrets/` and removes it).

### Rollback

    rm /usr/local/sbin/secrets-materialize
    rm /var/lib/crm-secrets/deploy-targets.json
    rm /etc/ai-secrets/<materialized file>

The Registry is untouched by this tool — it only ever reads.
