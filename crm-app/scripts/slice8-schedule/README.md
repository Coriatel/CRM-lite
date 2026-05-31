# slice8-schedule — meetings + reminders (A5)

Additive Directus migration creating the two daily-agenda time-management sources
ratified in `lane-a/decisions/meetings-reminders-schema.md` (Q1–Q6, 2026-05-31).

## ⚠️ NOT YET APPLIED
This script is **authored, not run.** No production schema/database mutation has
occurred. Applying it is a production additive migration — run only with explicit
owner go under the project migration policy.

## What it creates (additive only)
- `meetings`: `title`, `starts_at`, nullable `ends_at`, `location`, `status`
  (`scheduled`/`done`/`cancelled`), `contact_id`, `owner_id`, `notes`, audit fields.
- `reminders`: `title`, `due_at`, `status` (`pending`/`done`/`dismissed`),
  `contact_id`, `owner_id`, `notes`, audit fields.
- FKs: `contact_id` → contacts **ON DELETE SET NULL** (Q6); `owner_id` →
  directus_users **ON DELETE SET NULL**.
- Partial indexes: `meetings(starts_at) WHERE status='scheduled'`,
  `reminders(due_at) WHERE status='pending'` (the hot agenda paths) + owner btrees.

Idempotent (GET-check-then-create); safe to re-run. Seeds no data.

## Run (owner-authorized only)
```bash
DIRECTUS_URL=http://localhost:18055 DIRECTUS_ADMIN_TOKEN=<admin> python3 apply.py
DIRECTUS_URL=http://localhost:18055 DIRECTUS_ADMIN_TOKEN=<admin> python3 validate.py
```

## Rollback (fully additive)
```sql
DROP TABLE IF EXISTS meetings;
DROP TABLE IF EXISTS reminders;
-- (their indexes drop with the tables)
```
No other collection is touched.

## Consumers
`getMeetings` / `getReminders` in `src/services/directus.ts` (owner-scoped via
`owner_id = $CURRENT_USER`) → `meetingToItem` / `reminderToItem` in
`src/data/dailyAgenda.ts` → merged into `fetchDailyAgenda`. The pastoral/private
`notes` field is never requested by the readers and never mapped to the agenda.
