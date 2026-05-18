#!/usr/bin/env bash
# Slice #5 rollback — drops tasks. call_queue is NEVER touched.
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
echo "  1. DROP TABLE tasks CASCADE  (drops FKs from tasks, no inbound FKs)"
echo "  2. DELETE Directus metadata (collection / fields / relations for tasks)"
echo "  3. Refresh schema cache"
echo
echo "call_queue is NEVER dropped by this rollback (legacy safety table)."
echo "call_queue write permissions remain stripped unless owner restores them manually."
echo
echo "Pre-flight pg_dump? (Highly recommended.)"
echo "  sudo docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} -t tasks > /tmp/slice5-tasks-pre-rollback.dump"
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

echo "→ DROP TABLE IF EXISTS tasks CASCADE"
psql_exec "DROP TABLE IF EXISTS tasks CASCADE;"

directus_delete() {
    local path="$1"
    curl -fsS -X DELETE \
        -H "Authorization: Bearer ${DIRECTUS_ADMIN_TOKEN}" \
        "${DIRECTUS_URL}${path}" \
        >/dev/null 2>&1 || true
}

echo "→ DELETE Directus metadata for tasks"
for f in subject_contact_id assignee_id related_lesson_id related_payment_id related_care_report_id related_cohort_id; do
    directus_delete "/relations/tasks/${f}"
done
directus_delete "/collections/tasks"

echo "→ POST /utils/cache/clear"
curl -fsS -X POST \
    -H "Authorization: Bearer ${DIRECTUS_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "${DIRECTUS_URL}/utils/cache/clear" \
    >/dev/null 2>&1 || true

echo
echo "=== ROLLBACK COMPLETE ==="
echo "Verify: GET /collections/tasks → HTTP 404"
echo "Note: call_queue still has stripped write permissions; restore manually if needed."
