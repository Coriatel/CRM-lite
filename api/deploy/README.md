# Deploy procedure — crmlite-api (S3, A′)

**Prepared but not installed.** Both targets require root and touch
production config; per `karpathy.md ## Authority gates` #2 and the S3
plan, applying these is an owner-gated step.

## What this adds at runtime

- One systemd unit (`crmlite-api.service`) running Node on `127.0.0.1:8211`.
- One Caddy block routing `https://crmphone.merkazneshama.co.il/api/queue-actions*`
  to that local port. Cloudflare + Caddy keep the perimeter unchanged.

## Pre-flight (no changes yet)

```
# verify the slice is on the right branch + working
cd /home/elron/services/crm-lite
git status --short
git log --oneline -3
node --test api/server.test.js

# verify the upstream scripts exist as the service expects them
ls -l /srv/ops-vault/automation-registry/scripts/queue_action_submit.py \
      /srv/ops-vault/scripts/mn-os-writers/mn-os-queue-actions-merger \
      /srv/ops-vault/automation-registry/scripts/build-operational-queue-state.py
```

If the scripts above are not yet on `/srv/ops-vault` `main` (S1+S2 only land
there once the queue-mutation-substrate branches are merged), apply this
deploy AFTER those merges. Until then the unit will start but POSTs will
return `accepted: false` with the submitter's "no such file" error.

## Apply (owner-gated)

```
# 1) systemd unit
sudo install -m 0644 \
  /home/elron/services/crm-lite/api/deploy/crmlite-api.service \
  /etc/systemd/system/crmlite-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now crmlite-api
sudo systemctl status crmlite-api --no-pager

# 2) Caddy patch — splice into the existing crmphone block (manual edit;
#    insert the `handle_path` block from caddyfile.patch BEFORE the catch-all
#    `handle { reverse_proxy 127.0.0.1:8090 ... }`)
sudoedit /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Smoke (after apply)

```
curl -sS http://127.0.0.1:8211/api/queue-actions/health
curl -sS -X POST -H content-type:application/json \
  -d '{"action":"ack","queue_item_id":"blocker:deploy-smoke"}' \
  https://crmphone.merkazneshama.co.il/api/queue-actions
tail -1 /srv/ops-vault/state/queue_actions.jsonl
```

## Rollback

```
sudo systemctl disable --now crmlite-api
sudo rm /etc/systemd/system/crmlite-api.service
sudo systemctl daemon-reload

# remove the `handle_path /api/queue-actions*` block from /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The append-only spool log and reducer output are unaffected by rollback.
