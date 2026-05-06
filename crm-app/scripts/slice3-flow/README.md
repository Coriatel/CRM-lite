# Slice #3 — Directus Flow

`create_flow.py` creates the "Stage transition audit (Slice #3)" Flow in Directus.

Idempotent — safe to re-run; exits early if the Flow already exists.

```bash
export DIRECTUS_URL=https://crm.merkazneshama.co.il
export DIRECTUS_ADMIN_TOKEN=<admin token>
python3 scripts/slice3-flow/create_flow.py
```

The Flow is stored in Directus DB, not in git. Run this script after a
Directus reset or migration to a new instance.

## Rollback

1. Disable or delete the Flow in Directus admin UI (Automate → Flows).
2. Revert the Slice #3 commit on this branch.
   The client `setContactStage()` in the reverted code performs the
   audit-first + compensating-delete logic (Slice #2 behaviour).
