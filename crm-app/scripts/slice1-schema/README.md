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

## Atomicity (Slice #3 — server-side Flow)

Stage transitions are now written **server-side** by a Directus Flow.

- Flow name: `Stage transition audit (Slice #3)`
- Trigger: `event / items.update` on `contacts` collection
- Condition: fires only when `lifecycle_stage_id` is present and non-null in the update payload
- Action: creates a `stage_transitions` row with `trigger_type=flow`

Client (`setContactStage`) issues a single PATCH to `contacts.lifecycle_stage_id`.
The Flow handles audit creation automatically — no client-side POST or rollback logic.

**Invariant:** every change to `contacts.lifecycle_stage_id` produces exactly one
`stage_transitions` row written by the server-side Flow synchronously after the PATCH.
There are no orphan audit rows possible under Slice #3 (Flow either writes or does not).

**Limitation:** `from_stage_id` in Flow-created rows is always `null` because the
`items.update` action trigger does not expose the pre-update value. The chain of
`to_stage_id` values across rows implies the from-stage implicitly. If explicit
`from_stage_id` is needed, Slice #4 can add a Read Data step that fetches the most
recent prior transition before creating the new row.

### Orphan check (steady state = 0 rows)

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

Pre-Slice-#3 rows with `trigger_type='system'` or `'manual'` were written by the
client and may exist; they are not orphans. Only rows where the latest `to_stage_id`
diverges from the contact's current stage are anomalous.
