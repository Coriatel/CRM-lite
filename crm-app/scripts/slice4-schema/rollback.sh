#!/usr/bin/env bash
# Slice #4 rollback. Drops approvals + automation_runs.
# DESTRUCTIVE. Run pg_dump first (see README.md).
set -euo pipefail

: "${DB_CONTAINER:=hycrm-directus-db}"
: "${DB_USER:=hycrm}"
: "${DB_NAME:=hycrm}"
: "${DIRECTUS_URL:=}"
: "${DIRECTUS_ADMIN_TOKEN:=}"

echo "WARNING: This will drop approvals + automation_runs and their Directus metadata."
echo "         Pre-flight: sudo docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} \\"
echo "                        -t approvals -t automation_runs > /tmp/slice4-pre.dump"
read -rp "Continue? (yes/NO): " ans
[[ "$ans" == "yes" ]] || { echo "aborted"; exit 1; }

# Direct SQL — drops are atomic and deterministic when REST is unavailable.
# DROP TABLE CASCADE bypasses the RESTRICT FKs for the rollback path.
# Directus system-table cleanup is ordered child-first (relations → fields → collections)
# per Codex round-2 (not trusting arbitrary delete order across system FKs).
sudo docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
DROP TABLE IF EXISTS approvals       CASCADE;
DROP TABLE IF EXISTS automation_runs CASCADE;

DELETE FROM directus_relations
  WHERE one_collection  IN ('approvals','automation_runs')
     OR many_collection IN ('approvals','automation_runs');

DELETE FROM directus_fields
  WHERE collection IN ('approvals','automation_runs');

DELETE FROM directus_collections
  WHERE collection IN ('approvals','automation_runs');
SQL

# Codex round-2: rollback must also clear the Directus schema cache,
# not just print instructions. Skip silently if env vars absent.
if [[ -n "$DIRECTUS_URL" && -n "$DIRECTUS_ADMIN_TOKEN" ]]; then
  echo "Clearing Directus schema cache…"
  http_code=$(curl -s -o /tmp/slice4-cacheclear.body -w "%{http_code}" \
    -X POST "${DIRECTUS_URL}/utils/cache/clear" \
    -H "Authorization: Bearer ${DIRECTUS_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{}')
  echo "  cache clear: HTTP ${http_code}"
  if [[ "$http_code" -ge 400 ]]; then
    echo "  body: $(cat /tmp/slice4-cacheclear.body)"
    echo "  Restart Directus manually."
    exit 1
  fi
else
  echo "DIRECTUS_URL/DIRECTUS_ADMIN_TOKEN unset — restart Directus or POST /utils/cache/clear manually."
fi
