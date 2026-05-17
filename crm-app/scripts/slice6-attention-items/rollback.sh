#!/usr/bin/env bash
# Slice #6a rollback — drops attention_items.
# DESTRUCTIVE. Refuses to run without BASELINE env var pointing to an
# existing pg_dump file. See README.md §Rollback plan.
set -euo pipefail

: "${DB_CONTAINER:=hycrm-directus-db}"
: "${DB_USER:=hycrm}"
: "${DB_NAME:=hycrm}"
: "${DIRECTUS_URL:=}"
: "${DIRECTUS_ADMIN_TOKEN:=}"
: "${BASELINE:=}"

if [[ -z "${BASELINE}" ]] || [[ ! -s "${BASELINE}" ]]; then
  echo "ERROR: BASELINE env var must point to an existing non-empty pg_dump file." >&2
  echo "       Take baseline first:" >&2
  echo "         sudo docker exec ${DB_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} \\" >&2
  echo "             -t attention_items > /tmp/slice6-rollback-pre.dump" >&2
  echo "         BASELINE=/tmp/slice6-rollback-pre.dump bash rollback.sh" >&2
  exit 2
fi

echo "Baseline: ${BASELINE} ($(stat -c%s "${BASELINE}") bytes)"
echo "WARNING: This will drop attention_items and its Directus metadata."
read -rp "Continue? (yes/NO): " ans
[[ "$ans" == "yes" ]] || { echo "aborted"; exit 1; }

# Child-first cleanup of Directus system tables, then DROP TABLE CASCADE
# in case any straggler FKs remain.
sudo docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
DELETE FROM directus_relations
  WHERE one_collection  = 'attention_items'
     OR many_collection = 'attention_items';

DELETE FROM directus_fields      WHERE collection = 'attention_items';
DELETE FROM directus_collections WHERE collection = 'attention_items';

DROP TABLE IF EXISTS attention_items CASCADE;
SQL

if [[ -n "$DIRECTUS_URL" && -n "$DIRECTUS_ADMIN_TOKEN" ]]; then
  curl -fsS -X POST "$DIRECTUS_URL/utils/cache/clear" \
       -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" || true
fi

echo "attention_items dropped. Run validate.py to confirm (expect failures)."
