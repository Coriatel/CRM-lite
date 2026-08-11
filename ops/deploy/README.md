# crmlite-web deploy recovery

## Root cause this fixes

On 2026-08-01 the `crmlite-web` container was lost (stopped by Shabbat mode on
07-31, then never recreated across a docker-ce upgrade and daemon restart). It
stayed missing for ten days.

The deploy could not recover it, and did not report the problem:

1. The step ran `sudo -n /usr/bin/docker restart crmlite-web`. `docker restart`
   can only restart an **existing** container; it cannot recreate a missing one.
2. The whole step was a single `&&` chain ending in `|| echo '(prune partial …)'`.
   When the restart failed, the chain short-circuited and the trailing `|| echo`
   returned 0 — so the step went **green while production served 502**.

Observed in run `31487656608` (2026-08-11):

```
swapped; live SHA=637ca2d
Error response from daemon: No such container: crmlite-web
(prune partial — non-fatal: some legacy backups not owned by deploy user)
```

…reported as a successful step.

## The fix

| File | Role |
|---|---|
| `crmlite-web-refresh` | Root-owned, argument-less wrapper. Runs `docker compose up -d --no-build --pull never crmlite-web`, which **recreates** the container if missing and converges if present. |
| `sudoers.d/deploy-crmlite-refresh` | Replaces the `docker restart` grant with permission to run only that wrapper, with no arguments. |
| `../../.github/workflows/deploy.yml` | Calls the wrapper; statements are newline-separated under `set -eu` so a failed refresh fails the deploy; adds a local `127.0.0.1:8090` readiness gate before the external smoke; prune stays non-fatal but is isolated. |
| `test/refresh_wrapper_test.sh` | Deterministic mock harness (43 assertions). Run with `bash ops/deploy/test/refresh_wrapper_test.sh`. |

### Wrapper containment

- No caller-controlled service, compose path, image, command or argument. Every
  operand is a `readonly` literal; any argument at all exits 64 before docker runs.
- `--no-build` and `--pull never`: this path can never build or reach a registry.
- Never stops, removes, prunes or names another service.
- `set -euo pipefail`, fixed `PATH`, single `exec` of `/usr/bin/docker`.

---

# PRODUCTION APPLY PACKET

Not applied by this PR. Requires owner authorisation: it installs a root-owned
binary and changes sudoers (access control).

## Files to install

| Source (repo) | Destination | Owner | Mode |
|---|---|---|---|
| `ops/deploy/crmlite-web-refresh` | `/usr/local/sbin/crmlite-web-refresh` | `root:root` | `0755` |
| `ops/deploy/sudoers.d/deploy-crmlite-refresh` | `/etc/sudoers.d/deploy-crmlite-refresh` | `root:root` | `0440` |

`0755` is deliberate: readable and executable by the deploy account, writable
only by root. The deploy user must never be able to edit what it runs as root.

## Sudoers change

Preimage — `/etc/sudoers.d/deploy-crmlite-restart`:

```
deploy ALL=(root) NOPASSWD: /usr/bin/docker restart crmlite-web
```

Postimage — `/etc/sudoers.d/deploy-crmlite-refresh`:

```
deploy ALL=(root) NOPASSWD: /usr/local/sbin/crmlite-web-refresh ""
```

The trailing `""` permits the command **with no arguments only**. Without it the
deploy user could append arbitrary arguments to a root-run command.

## Deployment order

Order matters: the workflow must never be live against a grant that does not
exist yet, and the old grant must not be withdrawn while the old workflow is live.

1. Install the wrapper (root, `0755`). Nothing uses it yet.
2. Validate it by hand as root, with the container already present:
   `/usr/local/sbin/crmlite-web-refresh` → expect `Container crmlite-web Running`
   (or `Started`) and exit 0.
3. Install the new sudoers file, validating **before** activation:
   `visudo -cf ops/deploy/sudoers.d/deploy-crmlite-refresh` then install `0440`.
4. Confirm the grant works and is narrow, as the deploy user:
   - `sudo -n /usr/local/sbin/crmlite-web-refresh` → exit 0
   - `sudo -n /usr/local/sbin/crmlite-web-refresh foo` → refused by sudo
   - `sudo -n /usr/bin/docker ps` → refused
5. Merge this PR (workflow now calls the wrapper).
6. Remove the superseded `/etc/sudoers.d/deploy-crmlite-restart`.
7. Trigger one `workflow_dispatch` deploy and watch the step.

## Production acceptance

1. Site remains 200 throughout: `https://crmphone.merkazneshama.co.il/` and `/ops`.
2. Wrapper converges with `crmlite-web` already present — exit 0, container keeps
   running, `RestartCount` does not climb unexpectedly.
3. **Missing-container recovery is proven only if separately authorised.** It
   requires deliberately removing a healthy production container; do not perform
   it as part of this rollout. Until then it is covered by the mock harness only.
4. Local `curl http://127.0.0.1:8090/` → 200, then external `/ops` → 200.

## Rollback

| Change | Rollback |
|---|---|
| Workflow | `git revert <merge-sha>` — restores the previous step verbatim. |
| Sudoers | Restore `/etc/sudoers.d/deploy-crmlite-restart` with the preimage line above (`0440`), then remove `/etc/sudoers.d/deploy-crmlite-refresh`. Validate with `visudo -c` before and after. |
| Wrapper | `rm /usr/local/sbin/crmlite-web-refresh`. Inert once the workflow and sudoers are reverted. |

Reverting the workflow alone is safe and sufficient to restore the old behaviour;
the wrapper and grant are then simply unused. Rolling back reinstates the masking
defect, so it is a stop-gap, not a resting state.
