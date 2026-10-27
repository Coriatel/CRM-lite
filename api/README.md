# crmlite-api

Internal Node/Express sidecar for crm-lite. Exposes `POST /api/queue-actions`
so the SPA can submit operator actions (ack/snooze/dismiss/escalate/assign/
annotate) against `state/operational_queue.json` items.

This is **Slice S3** of the MN-OS queue-mutation-substrate campaign. It
mediates writes through the existing pipeline:

  POST /api/queue-actions
    → queue_action_submit.py --via=spool       (writes one request file)
    → mn-os-queue-actions-merger               (drains → queue_actions.jsonl)
    → build-operational-queue-state.py         (reduces → operational_queue_state.json)

Synchronous for v1: the request handler runs all three subprocesses before
responding, so the reducer output is fresh by the time the client gets
`accepted: true`. `state/operational_queue.json` is never read or written by
this service.

## Posture

- Listens on `127.0.0.1:8211` only.
- Host Caddy (`crmphone.merkazneshama.co.il`) forwards `/api/queue-actions*`
  here. Cloudflare + Caddy provide the existing perimeter; no new auth code
  in this slice.
- Service UID must be a member of the group that owns
  `/srv/ops-vault/state/queue-actions-spool/`.

## Environment

| Variable             | Default                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `CRMLITE_API_HOST`   | `127.0.0.1`                                                                        |
| `CRMLITE_API_PORT`   | `8211`                                                                             |
| `OPSVAULT_DIR`       | `/srv/ops-vault`                                                                   |
| `QUEUE_SUBMIT_BIN`   | `$OPSVAULT_DIR/automation-registry/scripts/queue_action_submit.py`                 |
| `QUEUE_MERGER_BIN`   | `$OPSVAULT_DIR/scripts/mn-os-writers/mn-os-queue-actions-merger`                   |
| `QUEUE_REDUCER_BIN`  | `$OPSVAULT_DIR/automation-registry/scripts/build-operational-queue-state.py`       |
| `QUEUE_SPOOL_DIR`    | `$OPSVAULT_DIR/state/queue-actions-spool`                                          |

## Local run

```
cd api
npm install
QUEUE_SPOOL_DIR=/tmp/spool node server.js
# in another shell:
curl -sX POST -H content-type:application/json \
  -d '{"action":"ack","queue_item_id":"blocker:test"}' \
  http://127.0.0.1:8211/api/queue-actions
```

## Tests

```
npm test
```

The test suite is self-contained: it stubs out the three external scripts
and writes to a temp spool directory. No `/srv/ops-vault` access required.

## Rollback

```
# code
git revert <S3 commit>          # in /home/elron/services/crm-lite
rm -rf api/                     # if no other commits depend on it

# systemd
sudo systemctl disable --now crmlite-api
sudo rm /etc/systemd/system/crmlite-api.service
sudo systemctl daemon-reload

# caddy
# remove the `handle_path /api/queue-actions*` block from /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The append-only spool log (`state/queue_actions.jsonl`) and the derived
reducer output (`state/operational_queue_state.json`) are not affected by
rollback; both regenerate from upstream state.

## Deploy

Patches in `api/deploy/` are PREPARED but NOT INSTALLED. Owner gate per
`karpathy.md ## Authority gates` #2 (production state change) before:

- copying `api/deploy/crmlite-api.service` into `/etc/systemd/system/`
- splicing the Caddy patch into `/etc/caddy/Caddyfile`
- `daemon-reload` / `enable` / `caddy reload`

See `api/deploy/README.md` for the exact apply procedure.
