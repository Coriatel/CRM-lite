# Slice #3 + #4 — Directus Flow

`create_flow.py` creates the "Stage transition audit (Slice #3)" Flow in Directus.

Idempotent — safe to re-run; exits early if the Flow already exists.

```bash
export DIRECTUS_URL=https://crm.merkazneshama.co.il
export DIRECTUS_ADMIN_TOKEN=<admin token>
python3 scripts/slice3-flow/create_flow.py
```

The Flow is stored in Directus DB, not in git. Run this script after a
Directus reset or migration to a new instance.

## Flow chain

```
contacts.update
  → condition        lifecycle_stage_id changed?
  → extract_values   extract contactId + toStageId from trigger (keys[0], payload)
  → fetch_prev_stage read last stage_transitions row for this contact
  → extract_from_stage  fromStageId = prev row's to_stage_id, or null (first transition)
  → write_audit_row  create stage_transitions row with from_stage_id + to_stage_id
```

Slice #3 introduced the Flow and simplified the client to a single PATCH.
Slice #4 added `fetch_prev_stage` + `extract_from_stage` to populate `from_stage_id`.

## Rollback

1. Disable or delete the Flow in Directus admin UI (Automate → Flows).
2. Revert the Slice #3 commit on this branch.
   The client `setContactStage()` in the reverted code performs the
   audit-first + compensating-delete logic (Slice #2 behaviour).
