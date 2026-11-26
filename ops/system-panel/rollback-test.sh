#!/usr/bin/env bash
# Proves the --rollback ordering of install-system-panel.sh without root, Caddy or systemd:
# fake `caddy validate` (fails when an imported site file contains BROKEN) and fake systemctl (logs calls) in a temp dir.
#   bash ops/system-panel/rollback-test.sh        -> "PASS n/n", exit 0
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
INST="$HERE/install-system-panel.sh"
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok   - $1"; }
no() { fail=$((fail + 1)); echo "FAIL - $1"; }

setup() {
  T=$(mktemp -d); mkdir -p "$T/sites" "$T/bin"
  printf '(mnhome) {\n}\nimport %s/sites/*.caddy\n' "$T" > "$T/Caddyfile"
  printf 'other.example {\n\timport mnhome\n}\n' > "$T/sites/other.caddy"
  printf 'nihul {\n\thandle /api/wa-contact {\n\t}\n\thandle /api/system/* {\n\t\treverse_proxy 127.0.0.1:8794\n\t}\n}\n' > "$T/sites/nihul.merkazneshama.co.il.caddy"
  printf 'nihul {\n\thandle /api/wa-contact {\n\t}\n}\n' > "$T/sites/nihul.merkazneshama.co.il.caddy.bak-system-20261126150000"
  cat > "$T/bin/caddy" <<'EOF'
#!/usr/bin/env bash
cfg=$3
[ "${FAKE_LIVE_FAIL:-}" = 1 ] && [ "$cfg" = "$SP_CADDYFILE" ] && exit 1
for g in $(sed -n 's/^import \(.*\*\.caddy\)$/\1/p' "$cfg"); do
  for f in $g; do grep -q BROKEN "$f" && exit 1; done
done
exit 0
EOF
  cat > "$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
[ "${FAKE_RELOAD_FAIL:-}" = 1 ] && [ "$1" = reload ] && exit 1
exit 0
EOF
  chmod +x "$T/bin/caddy" "$T/bin/systemctl"
  LIVE="$T/sites/nihul.merkazneshama.co.il.caddy"; LOG="$T/systemctl.log"; : > "$LOG"
}
run() { SP_TEST=1 SP_CADDYFILE="$T/Caddyfile" SP_SITES_DIR="$T/sites" SP_CADDY="$T/bin/caddy" SP_SYSTEMCTL="$T/bin/systemctl" FAKE_LOG="$LOG" "$@" bash "$INST" --rollback >"$T/out" 2>&1; echo $?; }
sum() { sha256sum "$1" | cut -d' ' -f1; }

# 1. a backup that does not validate: live file untouched, nothing reloaded, API not stopped, non-zero exit
setup; echo BROKEN >> "$T/sites/nihul.merkazneshama.co.il.caddy.bak-system-20261126150000"; before=$(sum "$LIVE")
rc=$(run env)
[ "$rc" = 5 ] && [ "$(sum "$LIVE")" = "$before" ] && [ ! -s "$LOG" ] && ! ls "$LIVE".pre-rollback-* >/dev/null 2>&1 \
  && ok "failed staged validate leaves the live file untouched and the API running (exit $rc)" || no "staged validate failure (rc=$rc, log=$(cat "$LOG"))"
rm -rf "$T"

# 2. good backup: route removed, previous file kept, reload BEFORE the API stops, exit 0
setup; rc=$(run env)
first=$(sed -n 1p "$LOG"); second=$(sed -n 2p "$LOG")
[ "$rc" = 0 ] && ! grep -q 'handle /api/system/' "$LIVE" && grep -q 'handle /api/system/' "$LIVE".pre-rollback-* \
  && [ "$first" = "reload caddy" ] && [ "$second" = "disable --now system-panel-api" ] \
  && ok "route removed, pre-rollback copy kept, reload then stop" || no "good rollback (rc=$rc, log=$(tr '\n' '|' < "$LOG"))"
rm -rf "$T"

# 3. live reload fails: site file restored, API not stopped, non-zero exit
setup; before=$(sum "$LIVE"); rc=$(run env FAKE_RELOAD_FAIL=1)
[ "$rc" = 6 ] && [ "$(sum "$LIVE")" = "$before" ] && ! grep -q disable "$LOG" \
  && ok "reload failure restores the site file and keeps the API (exit $rc)" || no "reload failure (rc=$rc, log=$(tr '\n' '|' < "$LOG"))"
rm -rf "$T"

# 4. live validate fails after the swap: restored, API not stopped
setup; before=$(sum "$LIVE"); rc=$(run env FAKE_LIVE_FAIL=1)
[ "$rc" = 6 ] && [ "$(sum "$LIVE")" = "$before" ] && ! grep -q disable "$LOG" \
  && ok "live validate failure restores the site file (exit $rc)" || no "live validate failure (rc=$rc)"
rm -rf "$T"

# 5. two backups: the newest by NAME wins, even when it is older by mtime
setup
newer="$T/sites/nihul.merkazneshama.co.il.caddy.bak-system-20261126170000"
printf 'nihul {\n\t# newest\n}\n' > "$newer"; touch -d '2020-01-01' "$newer"
rc=$(run env)
[ "$rc" = 0 ] && grep -q '# newest' "$LIVE" && ok "backup chosen by name, not mtime" || no "backup choice (rc=$rc)"
rm -rf "$T"

# 6. route present but no backup: nothing changed, API not stopped
setup; rm "$T"/sites/*.bak-system-*; before=$(sum "$LIVE"); rc=$(run env)
[ "$rc" = 7 ] && [ "$(sum "$LIVE")" = "$before" ] && [ ! -s "$LOG" ] && ok "no backup: refuses, nothing changed (exit $rc)" || no "no backup (rc=$rc)"
rm -rf "$T"

echo "PASS $pass/$((pass + fail))"
[ "$fail" -eq 0 ]
