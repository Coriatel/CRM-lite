#!/usr/bin/env bash
# Install / upgrade system-panel-api and its owner-only route on nihul (slice S2 of the System tab).
# NOT RUN BY THE BUILDER SESSION. Owner approval 2026-11-26 14:30: "לאשר (מומלץ)".
#
#   sudo bash install-system-panel.sh /path/to/checked-out/CRM-lite            install + route
#   sudo bash install-system-panel.sh --rollback                               route off, service off
#
# Steps: group + snapshot dir -> release copy (/opt/system-panel/releases/<stamp>, current symlink)
#        -> env file (owner list + Directus URL copied by KEY from secretsd.env, never printed)
#        -> unit -> local 401 check -> Caddy route on nihul (backup, validate, reload) -> public 401 check.
set -euo pipefail
NAME=system-panel-api
GROUP=syspanel
DATA=/data/services/system-map
ROOT=/opt/system-panel
CONF=/etc/system-panel
UNIT=/etc/systemd/system/${NAME}.service
PORT=8794
SRC_ENV=/etc/crm-secrets/secretsd.env
# SP_* overrides exist only for rollback-test.sh (fake caddy/systemctl in a temp dir); production uses the defaults.
CADDYFILE=${SP_CADDYFILE:-/etc/caddy/Caddyfile}
SITES_DIR=${SP_SITES_DIR:-/etc/caddy/sites}
SITE=$SITES_DIR/nihul.merkazneshama.co.il.caddy
CADDY=${SP_CADDY:-caddy}
SYSTEMCTL=${SP_SYSTEMCTL:-systemctl}
[ "${SP_TEST:-}" = 1 ] || [ "$(id -u)" -eq 0 ] || { echo "must run as root (sudo)" >&2; exit 1; }

# Rollback order (Codex + critic review of #232): validate a STAGED copy of the whole config first, keep the current
# site file, swap atomically, validate + reload the live config (restore on any failure), confirm the route is gone,
# and only then stop the API. Any failure exits non-zero and leaves the API running behind the current route.
rollback() {
  local ts bak pre
  ts=$(date +%Y%m%d%H%M%S)
  # newest backup by NAME (the suffix is a sortable timestamp), not by mtime
  bak=$(find "$SITES_DIR" -maxdepth 1 -name "$(basename "$SITE").bak-system-*" | sort | tail -1)
  if [ -z "$bak" ]; then
    if grep -q 'handle /api/system/\*' "$SITE"; then echo "FAIL: route present but no .bak-system-* backup; nothing changed" >&2; exit 7; fi
    echo "no route and no backup: only the service is stopped"
  else
    if grep -q 'handle /api/system/\*' "$bak"; then echo "FAIL: backup $bak still has the route; nothing changed" >&2; exit 7; fi
    stage=$(mktemp -d); trap 'rm -rf "$stage"' EXIT   # global on purpose: exit paths must clean it too
    install -d "$stage/sites"
    cp -a "$SITES_DIR"/*.caddy "$stage/sites/"
    cp "$bak" "$stage/sites/$(basename "$SITE")"
    sed "s#^import $SITES_DIR/\*\.caddy\$#import $stage/sites/*.caddy#" "$CADDYFILE" > "$stage/Caddyfile"
    [ "$(grep -c "^import $stage/sites/\*\.caddy\$" "$stage/Caddyfile")" -eq 1 ] || { echo "FAIL: could not stage the Caddyfile import; nothing changed" >&2; exit 5; }
    "$CADDY" validate --config "$stage/Caddyfile" --adapter caddyfile >/dev/null 2>&1 || { echo "FAIL: staged config with $bak does not validate; live file untouched, service still running" >&2; exit 5; }
    pre="${SITE}.pre-rollback-$ts"          # outside the *.caddy glob, so Caddy never imports it
    cp -a "$SITE" "$pre"
    cp "$bak" "$SITE.swap.$$" && mv -f "$SITE.swap.$$" "$SITE"
    if ! { "$CADDY" validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 && "$SYSTEMCTL" reload caddy; }; then
      cp -a "$pre" "$SITE"; "$SYSTEMCTL" reload caddy || true
      echo "FAIL: live validate/reload failed; site file restored from $pre, service still running" >&2; exit 6
    fi
    if grep -q 'handle /api/system/\*' "$SITE"; then echo "FAIL: route still in $SITE after restore; service still running" >&2; exit 6; fi
    echo "route removed (restored from $bak; previous file kept as $pre)"
  fi
  "$SYSTEMCTL" disable --now "$NAME" || { echo "FAIL: could not stop $NAME (route already removed)" >&2; exit 8; }
  echo "rolled back: no route, service stopped (unit file, releases and $DATA kept)"
}

if [ "${1:-}" = "--rollback" ]; then rollback; exit 0; fi

SRC="${1:-}"
[ -f "$SRC/crm-app/scripts/system/systemapi.mjs" ] || { echo "usage: $0 /path/to/CRM-lite checkout" >&2; exit 64; }

echo "== 1. group + snapshot dir =="
getent group "$GROUP" >/dev/null || groupadd --system "$GROUP"
install -d -o devuser -g "$GROUP" -m 2750 "$DATA"      # setgid: published files inherit the group
[ -f "$DATA/current/SYSTEM_MAP.json" ] || echo "NOTE: no snapshot yet; run as devuser: scripts/system-map/publish_snapshot.sh (ops-vault)"

echo "== 2. release =="
STAMP=$(date -u +%Y%m%d-%H%M%SZ); DEST="$ROOT/releases/$STAMP"
install -d -m 0755 "$ROOT" "$ROOT/releases" "$DEST"
install -m 0644 "$SRC/crm-app/scripts/system/systemapi.mjs" "$SRC/crm-app/scripts/system/systemd.mjs" "$DEST/"
ln -sfn "$DEST" "$ROOT/current"
echo "current -> $DEST"

echo "== 3. env (owner list copied by key, values not printed) =="
install -d -o root -g root -m 0755 "$CONF"
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
owner=$(grep -E '^SECRETS_OWNER_EMAILS=.+' "$SRC_ENV" | head -1 || true)
[ -n "$owner" ] || { echo "FAIL: SECRETS_OWNER_EMAILS missing or empty in $SRC_ENV; nothing installed beyond the release copy" >&2; exit 3; }
printf '%s\n' "SYSTEM_PANEL_OWNER_EMAILS=${owner#SECRETS_OWNER_EMAILS=}" > "$tmp"; unset owner
echo "DIRECTUS_URL=http://127.0.0.1:18055" >> "$tmp"   # HyCRM Directus behind crm.merkazneshama.co.il (loopback: the unit allows localhost only)
echo "SYSTEM_PANEL_PORT=$PORT" >> "$tmp"
echo "SYSTEM_PANEL_DATA_DIR=$DATA" >> "$tmp"
[ "$(grep -c -E '^(SYSTEM_PANEL_OWNER_EMAILS|VITE_DIRECTUS_URL|DIRECTUS_URL)=' "$tmp")" -eq 2 ] || { rm -f "$tmp"; echo "FAIL: owner list or Directus URL not found in $SRC_ENV" >&2; exit 3; }
install -m 0640 "$tmp" "$CONF/system-panel.env"; rm -f "$tmp"   # systemd (root) reads it

echo "== 4. unit =="
install -m 0644 "$SRC/ops/system-panel/${NAME}.service" "$UNIT"
systemctl daemon-reload
systemctl enable "$NAME" >/dev/null
systemctl restart "$NAME"
ok=""; for _ in $(seq 1 20); do [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/system/ok")" = 401 ] && { ok=1; break; }; sleep 0.5; done
[ -n "$ok" ] || { journalctl -u "$NAME" -n 20 --no-pager; echo "FAIL: local check did not answer 401" >&2; exit 4; }
echo "local: no token -> 401"

echo "== 5. route on nihul =="
if ! grep -q 'handle /api/system/\*' "$SITE"; then
  bak="${SITE}.bak-system-$(date +%Y%m%d%H%M%S)"; cp -a "$SITE" "$bak"
  python3 - "$SITE" "$PORT" <<'PY'
import sys
p, port = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
old = "\t\tnot path /m /m/* /api/wa-contact\n"
assert s.count(old) == 1, "page matcher not found"
s = s.replace(old, "\t\tnot path /m /m/* /api/wa-contact /api/system/*\n")
anchor = "\thandle /api/wa-contact {\n\t\treverse_proxy 127.0.0.1:8131\n\t}\n"
assert s.count(anchor) == 1, "wa-contact block not found"
s = s.replace(anchor, anchor + "\n\t# 2026-11-26 owner-approved (\"לאשר (מומלץ)\"): the System tab's data. The service checks the HyCRM\n"
              "\t# session itself and answers the owner alone. Rollback: install-system-panel.sh --rollback.\n"
              f"\thandle /api/system/* {{\n\t\treverse_proxy 127.0.0.1:{port}\n\t}}\n")
open(p, "w", encoding="utf-8").write(s)
PY
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then cp -a "$bak" "$SITE"; echo "FAIL: caddy validate; site file restored" >&2; exit 5; fi
  systemctl reload caddy
  echo "route added (backup $bak)"
fi
code=$(curl -s -o /dev/null -w '%{http_code}' https://nihul.merkazneshama.co.il/api/system/ok)
echo "public: no token -> $code"
[ "$code" = 401 ] || { echo "FAIL: public check expected 401" >&2; exit 6; }
echo "OK. Next: authz-proof.sh (3 modes x 2 layers)."
