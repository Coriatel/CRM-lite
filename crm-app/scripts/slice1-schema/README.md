# Slice #1 schema — lifecycle stages

What it adds (purely additive — no existing data is mutated):

1. `lifecycle_stages` — lookup table for journey stages.
2. `stage_transitions` — audit log of every stage change.
3. `contacts.lifecycle_stage_id` — nullable FK → `lifecycle_stages` (existing rows: NULL).
4. Two btree indexes: `contacts(lifecycle_stage_id)` and `stage_transitions(contact_id, transitioned_at DESC)`.
5. Nine seed stages (awareness → graduate, plus dormant / do_not_contact).

## Apply

Pre-flight (mandatory): back up the contacts table.

```bash
TS=$(date +%Y%m%d_%H%M%S)
sudo docker exec hycrm-directus-db bash -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t contacts' \
  > /tmp/contacts_pre_slice1_${TS}.sql
```

Then apply:

```bash
export DIRECTUS_URL="https://crm.merkazneshama.co.il"
export DIRECTUS_ADMIN_TOKEN="..."   # admin-grade static token (do NOT commit)
python3 scripts/slice1-schema/apply.py
```

The script is idempotent — re-running skips existing collections / fields / relations / seed rows.

After applying, the Directus schema cache is flushed via `/utils/cache/clear`. If
the new `lifecycle_stage_id` field still does not appear in the API after a
minute, restart the Directus container.

## Validate

`scripts/slice1-schema/validate.py` exercises the full path:

1. Reads `contacts.lifecycle_stage_id` field metadata.
2. Reads the 9 seed stages.
3. Picks (or creates) `test_slice1_dummy` contact.
4. PATCHes its `lifecycle_stage_id` to the `lead` stage.
5. POSTs a matching `stage_transitions` row.
6. Reads the contact back with the FK resolved.
7. Filters contacts by stage and reports p95 latency.
8. Reads the transition history.

All checks must pass before considering Slice #1 done.

## Rollback

```bash
scripts/slice1-schema/rollback.sh
```

Destructive — backup first. The script drops both new tables, the FK column,
and the corresponding `directus_collections` / `directus_fields` /
`directus_relations` rows. After it runs, flush the Directus schema cache
or restart the container.

## Atomicity caveat

`setContactStage()` performs two sequential REST calls (PATCH the contact, then
POST a `stage_transitions` row). They are **not** atomic — if the audit POST
fails after the PATCH succeeds, the contact will have a new stage with no
transition row. Slice #2 will close this gap (Directus flow or reconciliation
job). Until then, treat the audit log as best-effort.
