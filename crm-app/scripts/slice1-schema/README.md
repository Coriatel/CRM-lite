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

## Atomicity (Slice #2)

`setContactStage()` is **audit-first with compensating delete**:

1. POST `stage_transitions` (audit row, marks intent)
2. PATCH `contacts.lifecycle_stage_id`
3. If the PATCH fails, DELETE the audit row and throw `StageChangeFailedError`.
   If the DELETE also fails, the audit row is left orphaned but visible.

**Invariant:** a contact's `lifecycle_stage_id` never changes without a
corresponding `stage_transitions` row also being persisted. The reverse
(orphaned audit row with no contact change) IS possible under rare double
failure, but is observable rather than silent.

To find orphan audit rows — i.e. each contact's *latest* stage_transitions
row whose `to_stage_id` does not match the contact's current
`lifecycle_stage_id`. Earlier transitions for the same contact are not
orphans; only the most recent one is load-bearing.

```sql
WITH latest AS (
  SELECT DISTINCT ON (contact_id)
         id, contact_id, to_stage_id, transitioned_at
  FROM   stage_transitions
  ORDER  BY contact_id, transitioned_at DESC
)
SELECT l.id              AS audit_id,
       l.contact_id,
       l.to_stage_id     AS audit_to_stage,
       c.lifecycle_stage_id AS contact_stage,
       l.transitioned_at
FROM   latest l
JOIN   contacts c ON c.id = l.contact_id
WHERE  c.lifecycle_stage_id IS DISTINCT FROM l.to_stage_id;
```

In steady state this query returns 0 rows. Non-zero = orphan audit rows
left behind by a double-failure (PATCH failed, compensating DELETE also
failed). Investigate, then either re-apply the stage to the contact or
delete the audit row, depending on which side reflects user intent.

**Future hardening (Slice #3+):** move audit creation into a Directus Flow
keyed on `contacts.update` so the audit is wrapped in the same DB transaction
as the contact change. The client then becomes a thin wrapper.
