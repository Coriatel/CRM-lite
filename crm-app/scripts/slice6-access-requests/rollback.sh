#!/usr/bin/env bash
# Slice #6 rollback — drops access_requests.
#
# REQUIRES interactive confirmation.
# Pre-flight pg_dump is the caller's responsibility (see README).
#
# Env: DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN, DB_CONTAINER, DB_USER, DB_NAME

set -euo pipefail

: "${DIRECTUS_URL:?set DIRECTUS_URL}"
: "${DIRECTUS_ADMIN_TOKEN:?set DIRECTUS_ADMIN_TOKEN}"
DB_CONTAINER="${DB_CONTAINER:-hycrm-directus-db}"
DB_USER="${DB_USER:-hycrm}"
DB_NAME="${DB_NAME:-hycrm}"

echo "This will:"
echo "  1. DROP TABLE access_requests CASCADE  (drops FKs from access_requests)"
echo "  2. DELETE Directus metadata (collection / fields / relations)"
echo "  3. Refresh schema cache"
echo
echo "directus_users is NEVER dropped (Directus core table)."
echo
echo "Pre-flight pg_dump? (Highly recommended if rows exist.)"
echo "  sudo docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} -t access_requests > /tmp/slice6-access-requests-pre-rollback.dump"
echo
echo "Type exactly 'rollback' to continue:"
read -r confirm
if [[ "$confirm" != "rollback" ]]; then
    echo "Aborted."
    exit 1
fi

psql_exec() {
    sudo docker exec -i "${DB_CONTAINER}" \
        psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "$1"
}

echo "→ DROP TABLE IF EXISTS access_requests CASCADE"
psql_exec "DROP TABLE IF EXISTS access_requests CASCADE;"

directus_delete() {
    local path="$1"
    curl -fsS -X DELETE \
        -H "Authorization: Bearer ${DIRECTUS_ADMIN_TOKEN}" \
        "${DIRECTUS_URL}${path}" \
        >/dev/null 2>&1 || true
}

echo "→ DELETE Directus metadata for access_requests"
directus_delete "/relations/access_requests/requesting_user_id"
directus_delete "/relations/access_requests/decided_by"
directus_delete "/collections/access_requests"

echo "→ POST /utils/cache/clear"
curl -fsS -X POST \
    -H "Authorization: Bearer ${DIRECTUS_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "${DIRECTUS_URL}/utils/cache/clear" \
    >/dev/null 2>&1 || true

echo
echo "=== ROLLBACK COMPLETE ==="
echo "Verify: GET /collections/access_requests → HTTP 404"
