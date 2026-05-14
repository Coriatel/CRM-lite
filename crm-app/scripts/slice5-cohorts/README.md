# Slice #5 schema — `cohorts` + `cohort_members`

Additive only. Backs the `cohorts.json` contract published at
`/srv/ops-vault/state/cohorts.json` for Track 1 consumption.

## Contents

```
slice5-cohorts/
├── README.md
├── apply.py          ← idempotent Directus admin-API migration
├── rollback.py       ← drops both tables (interactive yes/NO)
└── validate.py       ← read-only assertions (exit 0/1)
```

## Run order (NOT executed yet — opens a PR; apply happens after merge)

```bash
# 1. Snapshot baseline
sudo docker exec hycrm-directus-db pg_dump -U hycrm -d hycrm \
    -t cohorts -t cohort_members > /tmp/slice5-pre.dump

# 2. Apply
DIRECTUS_URL=http://localhost:18055 DIRECTUS_ADMIN_TOKEN=<token> python3 apply.py

# 3. Validate (read-only, no test rows)
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... python3 validate.py

# 4. Rollback (only if needed)
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... python3 rollback.py
```

## Notes

- `cohort_members.contact_id` FK is skipped if `contacts` collection doesn't exist at apply time. Re-run apply.py once contacts ship.
- `cohorts.member_count` is a cached integer; the JSON snapshot writer (Track 3 follow-up) keeps it in sync from the `cohort_members` JOIN.
- Per Track 3 standing authority: additive Directus changes are pre-approved, but apply.py runs **only after PR merge** (this is Slice 5 — PR opens this batch, apply waits).
