#!/bin/bash
# Adversarial test suite for secrets-materialize.
# Uses a TEMP store + TEMP key + a clearly-named throwaway target that is deleted.
# Never touches the production store or any real secret.
SCRATCH="$(cd "$(dirname "$0")" && pwd)"
T="$1"; [ -d "$T" ] || { echo "usage: $0 <tempdir>"; exit 2; }
BIN="$SCRATCH/secrets-materialize"
DEST="/etc/ai-secrets/.materialize-selftest.env"
AL="$T/allow.json"
DUMMY="DUMMY-NOT-A-REAL-SECRET-abc123"
PASS=0; FAIL=0

run() { # run <id> -> captures combined output
  sudo -n env SECRET_STORE_ROOT="$T/store" SECRET_KEY_FILE="$T/key" \
    DEPLOY_TARGETS_FILE="$AL" node "$BIN" "$@" 2>&1
}
mkal() { printf '%s\n' "$1" | sudo -n tee "$AL" >/dev/null; sudo -n chown root:root "$AL"; sudo -n chmod 0600 "$AL"; }
ok()   { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n      -> %s\n' "$1" "$2"; }
want_fail() { # want_fail <desc> <pattern> <output>
  if grep -qiE "$2" <<<"$3"; then ok "$1"; else bad "$1" "$(head -2 <<<"$3")"; fi
}

GOOD='{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/.materialize-selftest.env","env_var":"SELFTEST_TOKEN","owner":"root","group":"aisecrets","mode":"0640"}]}'

echo "== adversarial =="
mkal "$GOOD"
want_fail "unknown deployment id rejected" "no such deployment id" "$(run does-not-exist)"
want_fail "extra argv rejected"            "usage"                 "$(run selftest extra)"
want_fail "missing argv rejected"          "usage"                 "$(run)"

mkal '{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/passwd","env_var":"SELFTEST_TOKEN","owner":"root","group":"aisecrets","mode":"0640"}]}'
want_fail "destination outside allowed dir" "outside /etc/ai-secrets" "$(run selftest)"

mkal '{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/../../etc/shadow","env_var":"SELFTEST_TOKEN","owner":"root","group":"aisecrets","mode":"0640"}]}'
want_fail "path traversal rejected" "traversal|outside|direct child" "$(run selftest)"

mkal '{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/sub/nested.env","env_var":"SELFTEST_TOKEN","owner":"root","group":"aisecrets","mode":"0640"}]}'
want_fail "nested path rejected" "direct child" "$(run selftest)"

mkal '{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/.materialize-selftest.env","env_var":"SELFTEST_TOKEN","owner":"root","group":"aisecrets","mode":"0644"}]}'
want_fail "world-readable mode rejected" "not permitted" "$(run selftest)"

mkal '{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/.materialize-selftest.env","env_var":"SELFTEST_TOKEN","owner":"root","group":"nosuchgroup123","mode":"0640"}]}'
want_fail "nonexistent group rejected" "group does not exist" "$(run selftest)"

mkal '{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/.materialize-selftest.env","env_var":"SELFTEST_TOKEN","owner":"nobody","group":"aisecrets","mode":"0640"}]}'
want_fail "non-root owner rejected" "owner must be root" "$(run selftest)"

mkal '{"targets":[{"id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/.materialize-selftest.env","env_var":"bad-var name","owner":"root","group":"aisecrets","mode":"0640"}]}'
want_fail "invalid env_var rejected" "not a valid shell identifier" "$(run selftest)"

mkal '{"targets":[{"surprise":"x","id":"selftest","secret":"test-token","consumer":"selftest","path":"/etc/ai-secrets/.materialize-selftest.env","env_var":"SELFTEST_TOKEN","owner":"root","group":"aisecrets","mode":"0640"}]}'
want_fail "unknown field rejected" "unknown field" "$(run selftest)"

mkal "$GOOD"; sudo -n chmod 0640 "$AL"
want_fail "group-readable allowlist refused" "group/other accessible" "$(run selftest)"
mkal "$GOOD"; sudo -n chown "$(id -un):$(id -gn)" "$AL"
want_fail "non-root-owned allowlist refused" "owned root:root" "$(run selftest)"

mkal "$GOOD"; printf 'not json' > "$T/bad.json"; sudo -n chown root:root "$T/bad.json"; sudo -n chmod 0600 "$T/bad.json"
want_fail "malformed allowlist refused" "not valid JSON" \
  "$(sudo -n env SECRET_STORE_ROOT=$T/store SECRET_KEY_FILE=$T/key DEPLOY_TARGETS_FILE=$T/bad.json node "$BIN" selftest 2>&1)"

echo "== target-file defences =="
mkal "$GOOD"
sudo -n ln -sf /etc/passwd "$DEST"
want_fail "symlinked target refused" "symlink" "$(run selftest)"; sudo -n rm -f "$DEST"

sudo -n mkfifo "$DEST" 2>/dev/null
want_fail "FIFO target refused" "not a regular file" "$(run selftest)"; sudo -n rm -f "$DEST"

sudo -n touch "$DEST"; sudo -n ln "$DEST" "$T/hardlink"
want_fail "hardlinked target refused" "link count" "$(run selftest)"
sudo -n rm -f "$DEST" "$T/hardlink"

echo "== happy path + leak checks =="
mkal "$GOOD"
OUT="$(run selftest)"
grep -q "materialized: selftest" <<<"$OUT" && ok "materialize succeeded" || bad "materialize succeeded" "$OUT"
grep -q "$DUMMY" <<<"$OUT" && bad "value absent from stdout/stderr" "LEAKED" || ok "value absent from stdout/stderr"
[ "$(sudo -n stat -c '%U:%G %a' "$DEST")" = "root:aisecrets 640" ] \
  && ok "owner/group/mode = root:aisecrets 0640" \
  || bad "owner/group/mode" "$(sudo -n stat -c '%U:%G %a' "$DEST")"
sudo -n grep -qE '^SELFTEST_TOKEN=.+$' "$DEST" && ok "content shape NAME=value" || bad "content shape" "?"
[ "$(sudo -n wc -l < "$DEST")" = "1" ] && ok "exactly one line" || bad "exactly one line" "?"
sudo -n grep -q "$DUMMY" "$DEST" && ok "value correctly delivered to file" || bad "value delivered" "?"

# idempotent re-run must replace atomically, not append
run selftest >/dev/null
[ "$(sudo -n wc -l < "$DEST")" = "1" ] && ok "re-run replaces (no append)" || bad "re-run replaces" "$(sudo -n wc -l < "$DEST")"

echo "== audit =="
A="$T/store/audit.log"
sudo -n grep -q '"operation":"materialize"' "$A" && ok "audit records materialize" || bad "audit records" "?"
sudo -n grep -q "$DUMMY" "$A" && bad "audit contains no value" "LEAKED" || ok "audit contains no value"
sudo -n grep -q '"secret":"test-token"' "$A" && ok "audit names the secret" || bad "audit names secret" "?"

echo "== cleanup =="
sudo -n rm -f "$DEST"; [ -e "$DEST" ] && bad "cleanup" "left behind" || ok "selftest target removed"

echo; echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
