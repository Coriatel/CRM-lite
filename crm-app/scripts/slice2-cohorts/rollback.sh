#!/usr/bin/env bash
# Slice #2 rollback — drops cohort_members and cohorts.
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

echo "This will drop the slice2 cohort tables in this order:"
echo "  1. DROP TABLE cohort_members       (CASCADE FK from cohorts; SET NULL FK from cohorts.lead_teacher_id is incidental)"
echo "  2. DROP TABLE cohorts              (no inbound FKs remain after step 1)"
echo "  3. DELETE from directus_collections / directus_fields / directus_relations"
echo
echo "Pre-flight pg_dump? (Highly recommended if rows exist.)"
echo "  sudo docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} -t cohorts -t cohort_members > /tmp/slice2-pre-rollback.dump"
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

# 1. Drop Postgres tables (cohort_members first → cohorts)
echo "→ DROP TABLE IF EXISTS cohort_members"
psql_exec "DROP TABLE IF EXISTS cohort_members;"
echo "→ DROP TABLE IF EXISTS cohorts"
psql_exec "DROP TABLE IF EXISTS cohorts;"

# 2. Clean Directus metadata (REST API; idempotent)
directus_delete() {
    local path="$1"
    curl -fsS -X DELETE \
        -H "Authorization: Bearer ${DIRECTUS_ADMIN_TOKEN}" \
        "${DIRECTUS_URL}${path}" \
        >/dev/null 2>&1 || true
}

echo "→ DELETE Directus metadata for cohort_members"
directus_delete "/relations/cohort_members/cohort_id"
directus_delete "/relations/cohort_members/contact_id"
directus_delete "/collections/cohort_members"

echo "→ DELETE Directus metadata for cohorts"
directus_delete "/relations/cohorts/lead_teacher_id"
directus_delete "/collections/cohorts"

# 3. Refresh schema cache
echo "→ POST /utils/cache/clear"
curl -fsS -X POST \
    -H "Authorization: Bearer ${DIRECTUS_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "${DIRECTUS_URL}/utils/cache/clear" \
    >/dev/null 2>&1 || true

echo
echo "=== ROLLBACK COMPLETE ==="
echo "Verify: GET /collections/cohorts → HTTP 404"
