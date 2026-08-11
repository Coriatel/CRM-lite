#!/usr/bin/env bash
# Deterministic regression coverage for the crmlite-web recovery path.
#
# Two subjects:
#   1. ops/deploy/crmlite-web-refresh          — the sudo-invoked wrapper
#   2. the "Atomic swap + container refresh…" payload inside deploy.yml
#
# Everything runs against mocks in a disposable tmpdir. No docker, no sudo, no
# container and no production path is touched.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
WRAPPER="$REPO/ops/deploy/crmlite-web-refresh"
SUDOERS="$REPO/ops/deploy/sudoers.d/deploy-crmlite-refresh"
WORKFLOW="$REPO/.github/workflows/deploy.yml"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s :: %s\n' "$1" "${2:-}"; }
check(){ if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1" "${3:-}"; fi; }

TMP=$(mktemp -d)
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# ---------------------------------------------------------------- static shape
echo "== wrapper: no arbitrary service / command / argument surface =="

grep -q 'set -euo pipefail' "$WRAPPER"; check "strict shell mode" $?
grep -qE '^\s*if \[ "\$#" -ne 0 \]' "$WRAPPER"; check "rejects any argument" $?
grep -q 'readonly SERVICE=crmlite-web' "$WRAPPER"; check "service hard-coded" $?
grep -q 'readonly PROJECT_DIR=/home/elron/services/crm-lite' "$WRAPPER"; check "compose project hard-coded" $?
grep -q 'readonly DOCKER=/usr/bin/docker' "$WRAPPER"; check "docker path hard-coded" $?

# No positional parameter may ever reach a command.
if grep -nE '\$[1-9]|\$@|\$\{@|\$\*' "$WRAPPER" | grep -qv '"\$#"'; then
  bad "no positional parameter is ever used" "$(grep -nE '\$[1-9]|\$@|\$\*' "$WRAPPER" | head -1)"
else
  ok "no positional parameter is ever used"
fi

# No environment indirection for the service, project dir or binary.
if grep -qE '(DOCKER|SERVICE|PROJECT_DIR)=.*\$\{?[A-Z_]+:-' "$WRAPPER"; then
  bad "no env override of docker/service/project" "env indirection present"
else
  ok "no env override of docker/service/project"
fi

echo "== wrapper: build / pull / destructive verbs are impossible =="
grep -q -- '--no-build' "$WRAPPER"; check "--no-build present" $?
grep -q -- '--pull never' "$WRAPPER"; check "--pull never present" $?
for verb in "compose build" "compose pull" "compose down" "compose stop" "compose rm" "docker rmi" "docker rm "; do
  if grep -qF "$verb" "$WRAPPER"; then bad "wrapper never invokes '$verb'" "found"; else ok "wrapper never invokes '$verb'"; fi
done
# Exactly one docker invocation (the -x guard references $DOCKER but runs nothing).
n=$(grep -cE '^\s*exec "\$DOCKER"' "$WRAPPER")
[ "$n" -eq 1 ]; check "exactly one docker invocation (got $n)" $?

echo "== sudoers: grants only the wrapper, with no arguments =="
grep -q '^deploy ALL=(root) NOPASSWD: /usr/local/sbin/crmlite-web-refresh ""$' "$SUDOERS"
check 'grant is exactly the wrapper with the no-argument marker ""' $?
if grep -qE '^[^#]*(/usr/bin/docker|ALL$|/bin/sh|/bin/bash|sudoedit|SETENV)' "$SUDOERS"; then
  bad "no generic docker/shell/ALL/SETENV authority" "$(grep -nE '^[^#]*(/usr/bin/docker|ALL$|/bin/sh|/bin/bash|SETENV)' "$SUDOERS" | head -1)"
else
  ok "no generic docker/shell/ALL/SETENV authority"
fi
if command -v visudo >/dev/null 2>&1; then
  visudo -cf "$SUDOERS" >/dev/null 2>&1; check "visudo -c accepts the fragment (not installed)" $?
else
  echo "  SKIP  visudo unavailable"
fi

# ------------------------------------------------------------------- behaviour
# Render a test copy whose ONLY difference is the docker path -> mock.
MOCK_BIN="$TMP/bin"; mkdir -p "$MOCK_BIN"
TESTWRAP="$TMP/crmlite-web-refresh"
sed "s#^readonly DOCKER=/usr/bin/docker\$#readonly DOCKER=$MOCK_BIN/docker#" "$WRAPPER" > "$TESTWRAP"
chmod +x "$TESTWRAP"
d=$(diff <(sed "s#$MOCK_BIN/docker#/usr/bin/docker#" "$TESTWRAP") "$WRAPPER" | wc -l)
[ "$d" -eq 0 ]; check "test copy differs from the real wrapper only in the docker path" $?

# Fake compose project dir so `cd` succeeds under the mock.
mkdir -p "$TMP/proj"
sed -i "s#^readonly PROJECT_DIR=.*\$#readonly PROJECT_DIR=$TMP/proj#" "$TESTWRAP"

make_mock() { # $1 = exit code, $2 = stdout line
  cat > "$MOCK_BIN/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$TMP/argv.log"
echo "${2:-}"
exit ${1:-0}
EOF
  chmod +x "$MOCK_BIN/docker"
}
run_wrapper() { : > "$TMP/argv.log"; "$TESTWRAP" "$@" > "$TMP/out.log" 2>&1; echo $?; }

echo "== wrapper behaviour against a mock docker =="

make_mock 0 "Container crmlite-web Running"
rc=$(run_wrapper)
[ "$rc" -eq 0 ]; check "existing container -> converges, exit 0" $?
grep -qx 'compose up -d --no-build --pull never crmlite-web' "$TMP/argv.log"
check "exact argv: compose up -d --no-build --pull never crmlite-web" $? "$(cat "$TMP/argv.log")"

make_mock 0 "Container crmlite-web Created
Container crmlite-web Started"
rc=$(run_wrapper)
[ "$rc" -eq 0 ]; check "missing container -> compose-up path recreates it, exit 0" $?
grep -q 'Created' "$TMP/out.log"; check "creation is reported to the caller" $?

make_mock 1 "Error response from daemon: something failed"
rc=$(run_wrapper)
[ "$rc" -ne 0 ]; check "compose-up failure -> wrapper exits non-zero (got $rc)" $?

make_mock 0 ""
rc=$(run_wrapper extra-service)
[ "$rc" -eq 64 ]; check "argument rejected with exit 64 (got $rc)" $?
[ ! -s "$TMP/argv.log" ]; check "rejected call never reached docker" $?

rc=$(run_wrapper --pull always)
[ "$rc" -eq 64 ]; check "cannot force a pull through arguments" $?

# Across every successful invocation, only crmlite-web was ever addressed.
make_mock 0 ""; run_wrapper >/dev/null
if grep -qE 'flow-control-frontend|windmill-lsp|caddy|postgres' "$TMP/argv.log"; then
  bad "unrelated services are never addressed" "$(cat "$TMP/argv.log")"
else
  ok "unrelated services are never addressed"
fi

# ------------------------------------------------- deploy step failure semantics
echo "== deploy.yml payload: failure semantics =="

# Extract the real ssh payload from the workflow and unescape it into a script.
python3 - "$WORKFLOW" "$TMP/step.sh" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
# Greedy to the LAST quote of the scalar: the payload contains escaped inner
# quotes, so a non-greedy match would stop at the first of those.
m = re.search(r'deploy@\$\{\{ secrets\.DEPLOY_HOST \}\} \\\n\s*"(set -eu\n.*)"\n(?=\s*\n\s*- name:)', src, re.S)
if not m:
    sys.exit("could not extract deploy payload from workflow")
body = m.group(1)
body = body.replace('\\$', '$').replace('\\"', '"')
body = body.replace("${{ github.sha }}", "deadbeefcafe")
open(sys.argv[2], "w").write("#!/usr/bin/env bash\n" + body + "\n")
PY
check "extracted the real payload from deploy.yml" $?
chmod +x "$TMP/step.sh"

# Scaffold: crm-app dir with staging tree + old backups, plus sudo/curl mocks.
setup_step() {
  rm -rf "$TMP/crm-app"
  mkdir -p "$TMP/crm-app/dist-prod-staging/assets" "$TMP/crm-app/dist-prod"
  touch "$TMP/crm-app/dist-prod-staging/index.html" "$TMP/crm-app/dist-prod-staging/assets/index-abc.js"
  for n in 1 2 3 4 5; do mkdir -p "$TMP/crm-app/dist-prod.bak-old$n"; done
  sed "s#cd /home/elron/services/crm-lite/crm-app#cd $TMP/crm-app#" "$TMP/step.sh" > "$TMP/step.run.sh"
  chmod +x "$TMP/step.run.sh"
}
mock_sudo()  { printf '#!/usr/bin/env bash\nexit %s\n' "$1" > "$MOCK_BIN/sudo"; chmod +x "$MOCK_BIN/sudo"; }
mock_curl()  { printf '#!/usr/bin/env bash\necho %s\nexit 0\n' "$1" > "$MOCK_BIN/curl"; chmod +x "$MOCK_BIN/curl"; }

setup_step; mock_sudo 0; mock_curl 200
PATH="$MOCK_BIN:$PATH" "$TMP/step.run.sh" > "$TMP/step.out" 2>&1; rc=$?
[ "$rc" -eq 0 ]; check "happy path -> step exits 0 (got $rc)" $?
grep -q 'local readiness OK' "$TMP/step.out"; check "local 8090 readiness smoke runs before external smoke" $?
grep -q 'swapped; live SHA=' "$TMP/step.out"; check "atomic swap preserved" $?
ls -d "$TMP/crm-app"/dist-prod.bak-* >/dev/null 2>&1; check "rollback backup still created" $?

setup_step; mock_sudo 1; mock_curl 200
PATH="$MOCK_BIN:$PATH" "$TMP/step.run.sh" > "$TMP/step.out" 2>&1; rc=$?
[ "$rc" -ne 0 ]; check "REGRESSION GUARD: refresh failure -> step exits non-zero (got $rc)" $?
grep -q 'container refreshed' "$TMP/step.out" && bad "failed refresh must not report success" "printed 'container refreshed'" \
  || ok "failed refresh does not report success"

setup_step; mock_sudo 0; mock_curl 502
PATH="$MOCK_BIN:$PATH" "$TMP/step.run.sh" > "$TMP/step.out" 2>&1; rc=$?
[ "$rc" -ne 0 ]; check "local readiness failure -> step exits non-zero (got $rc)" $?

# Prune failure must stay non-fatal and must not mask success.
setup_step; mock_sudo 0; mock_curl 200
printf '#!/usr/bin/env bash\nexit 1\n' > "$MOCK_BIN/xargs"; chmod +x "$MOCK_BIN/xargs"
PATH="$MOCK_BIN:$PATH" "$TMP/step.run.sh" > "$TMP/step.out" 2>&1; rc=$?
[ "$rc" -eq 0 ]; check "prune failure -> logged, deploy still succeeds (got $rc)" $?
grep -q 'prune partial' "$TMP/step.out"; check "prune failure is logged" $?
rm -f "$MOCK_BIN/xargs"

# The old masking construct must be gone for good.
if grep -q "|| echo '(prune partial" "$WORKFLOW" && grep -q 'sudo -n /usr/bin/docker restart' "$WORKFLOW"; then
  bad "old masking && chain removed" "still present"
else
  ok "old masking && chain removed"
fi
grep -q 'sudo -n /usr/local/sbin/crmlite-web-refresh' "$WORKFLOW"; check "workflow calls the wrapper" $?
grep -q 'docker restart crmlite-web' "$WORKFLOW" && bad "workflow no longer uses docker restart" "still present" \
  || ok "workflow no longer uses docker restart"

printf '\n==== %d passed, %d failed ====\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
