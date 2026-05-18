# Slice #5 schema — `tasks` (canonical action primitive, post-decision wave)

Status: DRAFT — do not run against production until owner+Codex review.
Authority: per `/srv/ops-vault/proposals/tasks-schema-proposal.md`.
Owner decision: `/srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/tasks-vs-call-queue.md` (Option B, decided 2026-05-18).

## Contents

```
slice5-tasks/
├── README.md                          ← you are here
├── apply.py                           ← idempotent Directus admin-API migration (schema)
├── validate.py                        ← read-only assertions
├── rollback.sh                        ← interactive drop (call_queue is NEVER dropped)
└── migrate_call_queue_to_tasks.py     ← one-shot data migration (separate from schema)
```

## Schema (v0)

`tasks` is a NEW Directus collection that supersedes `call_queue` as the canonical "pending action" primitive. `call_queue` is retained read-only as a legacy table.

### `tasks`

| Field                    | Type      | Constraints                                                   | Default |
|--------------------------|-----------|---------------------------------------------------------------|---------|
| `id`                     | uuid      | PK                                                            | gen_random_uuid() |
| `kind`                   | enum      | not null (14 values — see Kind enum below)                    | `call`  |
| `subject_contact_id`     | uuid      | nullable, FK → contacts.id ON DELETE SET NULL                 | null    |
| `assignee_id`            | uuid      | nullable, FK → contacts.id ON DELETE SET NULL                 | null    |
| `due_at`                 | timestamp | nullable                                                      | null    |
| `status`                 | enum      | not null: open / done / snoozed / canceled                    | open    |
| `priority`               | integer   | not null (1 urgent … 5 low)                                   | 2       |
| `outcome`                | text      | nullable (free-text once status flips to done/canceled)       | null    |
| `related_lesson_id`      | uuid      | nullable, FK → lessons.id ON DELETE SET NULL                  | null    |
| `related_payment_id`     | uuid      | nullable, FK → payments.id ON DELETE SET NULL                 | null    |
| `related_care_report_id` | uuid      | nullable, FK → care_reports.id ON DELETE SET NULL             | null    |
| `related_cohort_id`      | uuid      | nullable, FK → cohorts.id ON DELETE SET NULL                  | null    |
| `notes`                  | text      | nullable (admin-only; also carries migration audit refs)      | null    |
| `created_at`             | timestamp | Directus date-created                                         | now()   |
| `updated_at`             | timestamp | Directus date-updated                                         | —       |
| `created_by`             | uuid      | Directus user-created                                         | —       |

Indexes:
- btree on `(status, due_at)` — "open tasks due today"
- btree on `(assignee_id, status)` — rabbi/leader scoped views
- btree on `(subject_contact_id)` — "tasks about this person"
- btree on `(related_care_report_id)` — care-report → derived-tasks traversal

Display template: `{{kind}}: {{subject_contact_id.full_name}} — {{status}}`.
Hebrew label: `משימות`.

### Kind enum (operator-clarified semantics)

Per proposal §C3. **UI labels must use participation-not-collection framing** — see `operational-model.md §12.5`.

| Value                   | UI label (Hebrew)              | Notes                                       |
|-------------------------|--------------------------------|---------------------------------------------|
| `call`                  | שיחת טלפון                    | Default for migrated `call_queue` rows      |
| `followup`              | מעקב                           | Generic "check in on X"                     |
| `care_action`           | פעולת חיזוק                    | Action arising from a care report           |
| `rabbi_action`          | משימת הרב                      | Rabbi-assigned action                       |
| `admin`                 | משימה אדמיניסטרטיבית           | Back-office work                            |
| `lesson_logistics`      | לוגיסטיקת שיעור                | Confirm rabbi, send Meet link, etc.         |
| `contribution_followup` | מעקב תרומה / תשלום             | **never** "debt collection" framing         |
| `support_needed`        | אפשר תמיכה / סבסוד             | System suggests subsidy may be appropriate  |
| `sponsorship_subsidy`   | סבסוד / חסות                   | Someone is offered or offers support        |
| `receipt_needed`        | חסר קבלה                       | Receipt-issuance gap                        |
| `compliance_task`       | משימת ניהול תקין               | Nihul takin / רשם העמותות obligations       |
| `donor_admin`           | אדמין תורם                     | Thank-you, monthly report, donor-side ops   |
| `rent_utility`          | שכר דירה / חשבונות             | Rent, utility, rabbi-support tracking       |
| `technical_project`     | משימה טכנית                    | Pipeline, infra, project work               |

### `call_queue` retention

`call_queue` is NOT dropped. After cutover:
- `apply.py` strips write permissions for `crm-app` role on `call_queue` (read-only legacy).
- A separate, optional slice (`slice5-tasks-drop-legacy`) can drop `call_queue` weeks later or never.

## FK dependency handling

Some related collections may not exist yet:
- `cohorts` — depends on slice2-cohorts landing first.
- `lessons` — may exist already; verified by `apply.py`.
- `payments` — exists (Takbull integration).
- `care_reports` — does NOT exist yet (separate proposal).

For each related FK, `apply.py`:
- If target collection exists → create FK constraint.
- If target missing → create column WITHOUT FK constraint; log a TODO line for the future enable-FK slice.

This way `tasks` ships immediately even if some dependent schemas haven't landed.

## Migration (call_queue → tasks one-shot)

`migrate_call_queue_to_tasks.py` is a SEPARATE script from `apply.py`. Run order:

1. `apply.py` (schema only — creates `tasks` collection)
2. `validate.py` (confirms schema)
3. `migrate_call_queue_to_tasks.py` (data — moves `call_queue` open rows to `tasks`)
4. Lane A opens the cutover PR (`useCallsToday` reads `tasks` instead of `call_queue`)
5. Owner merges cutover PR
6. (Optional, later) drop `call_queue` in a separate slice

The data migration is re-runnable: it skips rows already in `tasks` (detected via `notes LIKE '%call_queue:<id>%'`).

## Run order (DO NOT EXECUTE — gated on owner+Codex review)

```bash
# 1. Pre-flight: snapshot baseline (call_queue and any tasks rows)
sudo docker exec hycrm-directus-db pg_dump -U hycrm -d hycrm \
    -t tasks -t call_queue 2>/dev/null > /tmp/slice5-pre.dump

# 2. Apply schema
DIRECTUS_URL=http://localhost:18055 \
DIRECTUS_ADMIN_TOKEN=<admin-token> \
  python3 apply.py

# 3. Validate
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... python3 validate.py

# 4. Data migration (dry-run first, then real)
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... python3 migrate_call_queue_to_tasks.py --dry-run
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... python3 migrate_call_queue_to_tasks.py

# 5. Validate post-migration row count
# (Compare migrated count to call_queue pending count)

# 6. Rollback (drops tasks; call_queue is NEVER touched by this rollback)
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... bash rollback.sh
```

## Idempotency contract

- `apply.py` skips existing collection, fields, relations, indexes — safe to re-run.
- `migrate_call_queue_to_tasks.py` skips rows already migrated (detected via audit note).
- `rollback.sh` is interactive — requires explicit confirmation.

## Acceptance criteria (post-apply)

1. `tasks` collection exists (`GET /collections/tasks` → 200).
2. All 15 columns present in Postgres.
3. Indexes present: `idx_tasks_status_due`, `idx_tasks_assignee_status`, `idx_tasks_subject_contact`, `idx_tasks_care_report`.
4. FKs with `ON DELETE SET NULL` semantics for: `subject_contact_id`, `assignee_id`, `related_lesson_id`, `related_payment_id`, `related_care_report_id`, `related_cohort_id` (where target collections exist).
5. `GET /items/tasks` → `{"data": []}` (before migration).
6. After migration: `tasks.kind='call' AND status='open'` count matches `call_queue.status='pending'` count.
7. `call_queue` write permissions stripped from `crm-app` role (read-only legacy).

`validate.py` asserts (1)–(4); post-migration counts are confirmed manually.

## Out of scope (separate slices)

- Lane A cutover (`useCallsToday`/`useCallQueue` rewrite — separate PR).
- Directus Flow for task status changes → timeline_events (slice5-flow).
- `tasks` UI surface (rabbi page, /tasks list — Lane A).
- Drop `call_queue` (slice5-tasks-drop-legacy — separate gate).
- Subset/expansion of `kind` enum (Lane B follow-up if 14 values prove unwieldy).
