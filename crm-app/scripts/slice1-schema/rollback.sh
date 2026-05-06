#!/usr/bin/env bash
# Slice #1 rollback. Drops the new collections + the FK column.
# DESTRUCTIVE. Run pg_dump first (see ../slice1-schema/README.md).
set -euo pipefail

: "${DB_CONTAINER:=hycrm-directus-db}"
: "${DB_USER:=hycrm}"
: "${DB_NAME:=hycrm}"

echo "WARNING: This will drop lifecycle_stages, stage_transitions, and contacts.lifecycle_stage_id."
read -rp "Continue? (yes/NO): " ans
[[ "$ans" == "yes" ]] || { echo "aborted"; exit 1; }

# Direct SQL — Directus REST collection delete cascades fields/relations,
# but using SQL keeps rollback deterministic when REST is unavailable.
sudo docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<'SQL'
DROP TABLE IF EXISTS stage_transitions CASCADE;
ALTER TABLE contacts DROP COLUMN IF EXISTS lifecycle_stage_id;
DROP TABLE IF EXISTS lifecycle_stages CASCADE;
DELETE FROM directus_collections WHERE collection IN ('stage_transitions','lifecycle_stages');
DELETE FROM directus_fields     WHERE collection = 'contacts' AND field = 'lifecycle_stage_id';
DELETE FROM directus_fields     WHERE collection IN ('stage_transitions','lifecycle_stages');
DELETE FROM directus_relations  WHERE one_collection IN ('stage_transitions','lifecycle_stages')
                                  OR many_collection IN ('stage_transitions','lifecycle_stages')
                                  OR (many_collection = 'contacts' AND many_field = 'lifecycle_stage_id');
SQL

echo "Restart Directus or POST /utils/cache/clear so the schema cache reflects the drop."
