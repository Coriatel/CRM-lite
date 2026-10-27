#!/bin/bash
# Adversarial test suite for secrets-apply (runs it as root, as systemd does).
# Uses a TEMP queue, TEMP status dir and a STUB secretsctl that records the
# targets it was asked to rotate. Never touches the real queue, store or key.
# usage: test-secrets-apply.sh <empty tempdir>
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$1"; [ -d "$T" ] || { echo "usage: $0 <tempdir>"; exit 2; }
BIN="$HERE/secrets-apply"
Q="$T/queue"; S="$T/status"; OUT="$T/outside"
mkdir -p "$Q" "$OUT"; : >"$T/stub.log"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n      -> %s\n' "$1" "$2"; }
check() { if eval "$2"; then ok "$1"; else bad "$1" "$2"; fi; }

cat >"$T/stub-secretsctl.mjs" <<'STUB'
import { appendFileSync } from "node:fs";
const t = process.argv[process.argv.indexOf("--secret") + 1];
appendFileSync(process.env.STUB_LOG, `${t}\n`);
console.log(`rotated ${t}`);
STUB
# The test's own user stands in for the app account that owns the queue.
APP="$(id -un)"
run() {
  sudo -n env MS_APPLY_QUEUE_DIR="$Q" MS_APPLY_STATUS_DIR="${STATUS_DIR:-$S}" MS_APPLY_APP_USER="$APP" SECRETSCTL="$T/stub-secretsctl.mjs" \
    STUB_LOG="$T/stub.log" SECRET_STORE_ROOT="$T/no-store" SECRET_KEY_FILE="$T/no-key" node "$BIN" 2>&1
}
marker() { printf '%s' "$2" >"$Q/$1"; }
DUMMY="DUMMYKEY01-NOT-A-REAL-SECRET"

echo "== the normal path =="
marker good.json '{"request_id":"req_0123abcd","targets":["demo_secret"]}'
o=$(run)
check "a good marker is applied and its status written" "sudo -n grep -q '\"applied\"' '$S/req_0123abcd.json'"
check "the processed marker is removed" "[ ! -e '$Q/good.json' ]"
check "secretsctl was asked for the named target" "grep -qx demo_secret '$T/stub.log'"
check "the status file belongs to the app account, not root" "[ \"\$(stat -c %U '$S/req_0123abcd.json')\" = '$APP' ]"

echo "== marker contents are not trusted =="
marker trav.json '{"request_id":"../outside/pwned","targets":["demo_secret"]}'
o=$(run)
check "a request_id with a path is refused" "[ ! -e '$OUT/pwned.json' ] && ! sudo -n find '$T' -name 'pwned.json*' | grep -q ."
check "the refused marker is removed" "[ ! -e '$Q/trav.json' ]"

: >"$T/stub.log"
marker tgt.json '{"request_id":"req_badtarget","targets":["--dry-run","__proto__","../x","ok_target"]}'
o=$(run)
check "malformed target ids never reach secretsctl" "[ \"\$(cat '$T/stub.log')\" = ok_target ]"
check "the request is reported as failed" "sudo -n grep -q '\"apply_failed\"' '$S/req_badtarget.json'"

printf '%s\n' "$DUMMY" >"$T/fake-key"
ln -s "$T/fake-key" "$Q/link.json"
o=$(run)
check "a symlinked marker is not followed into the journal" "! grep -q DUMMYKEY <<<\"\$o\""
check "the symlink is removed, its target kept" "[ ! -L '$Q/link.json' ] && [ -f '$T/fake-key' ]"

head -c 5000 /dev/zero | tr '\0' 'x' >"$Q/big.json"
o=$(run)
check "an oversized marker is refused and removed" "[ ! -e '$Q/big.json' ]"

mkdir "$Q/dir.json"
marker after.json '{"request_id":"req_afterdir","targets":["demo_secret"]}'
o=$(run); rc=$?
check "a directory marker does not stop the run" "[ $rc -eq 0 ] && sudo -n grep -q '\"applied\"' '$S/req_afterdir.json'"
check "the directory marker is removed" "[ ! -e '$Q/dir.json' ]"

echo "== root never writes or deletes inside the app's directories =="
mkdir -p "$Q/deep.json/sub"; : >"$OUT/keep"; ln -s "$OUT" "$Q/deep.json/sub/out"
o=$(run)
check "a nested marker is removed without following the symlink in it" "[ ! -e '$Q/deep.json' ] && [ -f '$OUT/keep' ]"

sudo -n mkdir "$Q/rootdir.json"; sudo -n touch "$Q/rootdir.json/f"
marker after2.json '{"request_id":"req_afterroot","targets":["demo_secret"]}'
o=$(run); rc=$?
check "what the app account cannot delete stays (root deletes nothing there)" "sudo -n test -e '$Q/rootdir.json/f'"
check "and the run goes on" "[ $rc -eq 0 ] && grep -q '\"applied\"' '$S/req_afterroot.json'"
sudo -n rm -f "$Q/rootdir.json/f"; sudo -n rmdir "$Q/rootdir.json"

sudo -n mkdir -m 0755 "$T/rootonly"; ln -s "$T/rootonly" "$T/status-link"
marker swap.json '{"request_id":"req_swapped","targets":["demo_secret"]}'
o=$(STATUS_DIR="$T/status-link" run); rc=$?
check "a status dir swapped for a symlink is not written through as root" "! sudo -n find '$T/rootonly' -name '*.json*' | grep -q ."
check "the marker is still removed and the run ends cleanly" "[ $rc -eq 0 ] && [ ! -e '$Q/swap.json' ]"

marker r0.json '{"request_id":"req_rootapp","targets":["demo_secret"]}'
o=$(APP=root run)
check "an app account that maps to root is refused (no status, marker left)" "[ -e '$Q/r0.json' ] && ! sudo -n test -e '$S/req_rootapp.json'"
rm -f "$Q/r0.json"

echo "== $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
