#!/usr/bin/env bash
# Install/refresh the hardened secretsd system service.
#
# NOT RUN BY THE BUILDER SESSION. This script is the release artifact: every
# non-interactive step is automated here so the owner's manual part is one sudo
# invocation, not a checklist of twelve.
#
# It is idempotent and it never touches secret material: it does not create,
# read, print, or move a key or a value. The key is generated ONCE, separately,
# by the owner (see OWNER-RUNBOOK.md), because a key that an install script can
# regenerate is a key that a re-run can destroy.

set -euo pipefail

SERVICE_USER=crmsecrets
STATE_DIR=/var/lib/crm-secrets
CONF_DIR=/etc/crm-secrets
RUNTIME_ROOT=/opt/crm-secrets
RELEASE_DIR="${RUNTIME_ROOT}/releases"
CURRENT_LINK="${RUNTIME_ROOT}/current"
UNIT=/etc/systemd/system/secretsd.service

SOURCE_TREE="${1:-}"
if [ -z "${SOURCE_TREE}" ] || [ ! -d "${SOURCE_TREE}/crm-app/scripts/secrets" ]; then
  echo "usage: $0 /path/to/checked-out/repo" >&2
  exit 64
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root (sudo)" >&2
  exit 1
fi

echo "== 1. service identity =="
# No login shell, no home directory to leave a dotfile in, no password.
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
  echo "created ${SERVICE_USER}"
else
  echo "${SERVICE_USER} already exists"
fi

echo "== 2. directories =="
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 0700 "${STATE_DIR}"
install -d -o root -g "${SERVICE_USER}" -m 0750 "${CONF_DIR}"
install -d -o root -g root -m 0755 "${RUNTIME_ROOT}" "${RELEASE_DIR}"

echo "== 3. release =="
STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
DEST="${RELEASE_DIR}/${STAMP}"
mkdir -p "${DEST}"
# Code only. The store lives in STATE_DIR and is never inside a release.
cp -a "${SOURCE_TREE}/crm-app" "${DEST}/"
chown -R root:root "${DEST}"
chmod -R go-w "${DEST}"
ln -sfn "${DEST}" "${CURRENT_LINK}"
echo "current -> ${DEST}"

echo "== 4. unit =="
install -o root -g root -m 0644 "${SOURCE_TREE}/ops/secrets/secretsd.service" "${UNIT}"
systemctl daemon-reload

echo "== 5. preflight =="
if [ ! -s "${CONF_DIR}/secretsd.env" ]; then
  echo "MISSING ${CONF_DIR}/secretsd.env — see OWNER-RUNBOOK.md step 2. Not starting." >&2
  exit 2
fi
# shellcheck disable=SC1090
KEY_PATH="$(sed -n 's/^SECRET_KEY_FILE=//p' "${CONF_DIR}/secretsd.env" | tail -1)"
if [ -z "${KEY_PATH}" ] || [ ! -f "${KEY_PATH}" ]; then
  echo "MISSING encryption key (SECRET_KEY_FILE) — see OWNER-RUNBOOK.md step 1. Not starting." >&2
  exit 3
fi
# Assert custody without ever reading the contents.
KEY_MODE="$(stat -c %a "${KEY_PATH}")"
KEY_OWNER="$(stat -c %U "${KEY_PATH}")"
if [ "${KEY_MODE}" != "400" ] || [ "${KEY_OWNER}" != "${SERVICE_USER}" ]; then
  echo "key must be 0400 and owned by ${SERVICE_USER} (found ${KEY_MODE} ${KEY_OWNER})" >&2
  exit 4
fi

echo "== 6. start =="
systemctl enable --now secretsd
sleep 2
systemctl is-active --quiet secretsd || { journalctl -u secretsd -n 20 --no-pager; exit 5; }

echo "== 7. verify =="
ss -ltn | grep -q '127.0.0.1:8091' || { echo "not listening on loopback"; exit 6; }
CODE="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8091/api/secrets || true)"
[ "${CODE}" = "401" ] || { echo "expected 401 unauthenticated, got ${CODE}"; exit 7; }

echo "== 8. materializer =="
# secrets-materialize deploys a REGISTERED secret to a FIXED allowlisted file so a
# consumer that can only read an env file (not the API) can use it. It never accepts
# a secret name or a destination path from the caller — only a deployment id that the
# owner declared in the allowlist. It reads secret material; it never emits it.
install -o root -g root -m 0700 \
  "${SOURCE_TREE}/ops/secrets/secrets-materialize" /usr/local/sbin/secrets-materialize

# Seed the allowlist ONLY if absent — never clobber the owner's live deployments.
# This file holds names and destinations. It must never contain a secret value.
if [ ! -e "${STATE_DIR}/deploy-targets.json" ]; then
  install -o root -g root -m 0600 \
    "${SOURCE_TREE}/ops/secrets/deploy-targets.example.json" \
    "${STATE_DIR}/deploy-targets.json"
  echo "seeded ${STATE_DIR}/deploy-targets.json from example — review it before use"
else
  echo "${STATE_DIR}/deploy-targets.json already present — left untouched"
fi
[ "$(stat -c '%U:%G %a' "${STATE_DIR}/deploy-targets.json")" = "root:root 600" ] \
  || { echo "allowlist must be root:root 0600" >&2; exit 8; }

echo "OK — secretsd active as ${SERVICE_USER}, loopback only, unauthenticated 401."
echo "materializer installed: /usr/local/sbin/secrets-materialize"
echo "previous release (rollback target): $(ls -1dt "${RELEASE_DIR}"/*/ | sed -n 2p || echo none)"
