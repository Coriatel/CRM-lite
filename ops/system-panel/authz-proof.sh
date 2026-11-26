#!/usr/bin/env bash
# Authz proof for system-panel-api: 3 modes x 2 layers, directly against the API (no browser).
#   layers: app = 127.0.0.1:8794 (the service itself), network = https://nihul.merkazneshama.co.il (Cloudflare -> Caddy)
#   modes : none = no / junk token; other = a logged-in NON-owner (OTHER_TOKEN); owner = OWNER_TOKEN (only if given)
#   OTHER_TOKEN=<test admin access token> [OWNER_TOKEN=…] bash authz-proof.sh
# Tokens are read from the environment and never printed. Exit 0 only if every row that ran matched.
set -u
APP=http://127.0.0.1:8794
NET=https://nihul.merkazneshama.co.il
fail=0
code() { curl -s -m 15 -o /dev/null -w '%{http_code}' "$@"; }
row() {  # layer mode path expected token
  local got
  if [ -n "$5" ]; then got=$(code -H "Authorization: Bearer $5" "$1$3"); else got=$(code "$1$3"); fi
  local ok=PASS; [ "$got" = "$4" ] || { ok=FAIL; fail=1; }
  printf '%-8s %-6s %-22s want %s got %s %s\n' "$([ "$1" = "$APP" ] && echo app || echo network)" "$2" "$3" "$4" "$got" "$ok"
}
for base in "$APP" "$NET"; do
  for p in /api/system/ok /api/system/map /api/system/permissions /api/system/security; do
    row "$base" none "$p" 401 ""
    row "$base" junk "$p" 401 "not-a-real-token-0000000000"
    if [ -n "${OTHER_TOKEN:-}" ]; then row "$base" other "$p" 403 "$OTHER_TOKEN"; fi
    if [ -n "${OWNER_TOKEN:-}" ]; then row "$base" owner "$p" 200 "$OWNER_TOKEN"; fi
  done
  # writes do not exist for anyone
  got=$(code -X POST "$base/api/system/map"); [ "$got" = 401 ] || fail=1; echo "$base POST no-token -> $got (want 401)"
done
# the raw files are not reachable as static files on either public name
for u in "$NET/SYSTEM_MAP.json" "$NET/security_map.json" "https://crmphone.merkazneshama.co.il/api/system/map"; do
  got=$(code "$u"); printf 'static  %-60s -> %s\n' "$u" "$got"
  case "$got" in 200) b=$(curl -s -m 15 "$u" | head -c 200); case "$b" in *'"nodes"'*|*'"findings"'*) echo "FAIL: data reachable at $u"; fail=1;; esac;; esac
done
[ -z "${OTHER_TOKEN:-}" ] && echo "NOTE: 'other' mode not run (no OTHER_TOKEN)"
[ -z "${OWNER_TOKEN:-}" ] && echo "NOTE: 'owner' mode not run here; the owner proves 200 by opening the tab once"
exit $fail
