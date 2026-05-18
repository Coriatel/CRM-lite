# Slice #2 schema — `cohorts` + `cohort_members` (post-decision wave shape)

Status: DRAFT — do not run against production until owner+Codex review the apply.py diff.
Authority: per `/srv/ops-vault/proposals/cohorts-schema-proposal.md` (APPROVED-A-MODIFIED, 2026-05-18).
Binding role enum: `/srv/ops-vault/proposals/cohorts-role-enum-evaluation.md` §4.
Owner decision: `/srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/cohorts-schema-shape.md` (Option A modified).

## Contents

```
slice2-cohorts/
├── README.md          ← you are here
├── apply.py           ← idempotent Directus admin-API migration
├── validate.py        ← read-only assertions (exit 0/1)
└── rollback.sh        ← drops both tables + Directus metadata (interactive)
```

## Schema (v0)

Two purely additive Directus collections; no existing collection is mutated.

### `cohorts`

| Field            | Type    | Constraints                                  | Default      |
|------------------|---------|----------------------------------------------|--------------|
| `id`             | uuid    | PK                                           | gen_random_uuid() |
| `name`           | string  | not null, ≤120                               | —            |
| `slug`           | string  | unique, not null, ≤64 (ASCII only)           | —            |
| `track`          | enum    | not null: women / men / mixed / other        | women        |
| `status`         | enum    | not null: planning / active / closed / canceled | planning  |
| `start_date`     | date    | nullable                                     | null         |
| `target_size`    | integer | nullable, ≥0                                 | null         |
| `lead_teacher_id`| uuid    | nullable, FK → contacts.id ON DELETE SET NULL| null         |
| `location`       | string  | nullable, ≤160                               | null         |
| `notes`          | text    | nullable                                     | null         |
| `created_at`     | timestamp | Directus date-created                      | now()        |
| `updated_at`     | timestamp | Directus date-updated                      | —            |
| `created_by`     | uuid    | Directus user-created                        | —            |

Indexes: `(status, start_date)` btree; `(track)` btree.
Display template: `{{name}} ({{track}}, {{status}})`.
Hebrew label: `קבוצות`.

### `cohort_members`

| Field        | Type      | Constraints                                   | Default     |
|--------------|-----------|-----------------------------------------------|-------------|
| `id`         | uuid      | PK                                            | gen_random_uuid() |
| `cohort_id`  | uuid      | not null, FK → cohorts.id ON DELETE CASCADE   | —           |
| `contact_id` | uuid      | not null, FK → contacts.id ON DELETE RESTRICT | —           |
| `readiness`  | enum      | not null: interested / warm / received_details / confirmed / paid | interested |
| `role`       | enum      | not null: member / student / leader / coordinator / mentor / observer | member |
| `joined_at`  | timestamp | not null                                      | now()       |
| `left_at`    | timestamp | nullable (non-null = historical membership)   | null        |
| `notes`      | text      | nullable                                      | null        |
| `created_at` | timestamp | Directus date-created                         | now()       |
| `updated_at` | timestamp | Directus date-updated                         | —           |
| `created_by` | uuid      | Directus user-created                         | —           |

Indexes:
- Partial unique on `(cohort_id, contact_id) WHERE left_at IS NULL` — at most one active membership per (cohort, contact); rejoin after leave is allowed.
- btree on `(cohort_id, readiness)` — funnel counts.
- btree on `(contact_id) WHERE left_at IS NULL` — "which cohorts is this person currently in?"
- btree on `(cohort_id, joined_at DESC)` — recency listings.

Display template: `{{contact_id.full_name}} — {{readiness}}`.
Hebrew label: `חברי קבוצה`.

## Reconciliation with existing `slice5-cohorts/`

`crm-app/scripts/slice5-cohorts/apply.py` creates a SIMPLER, INCOMPATIBLE `cohorts` + `cohort_members` shape (status enum `draft/active/archived`; no `track`/`readiness`/`role`/`left_at`; full unique index instead of partial; FK semantics CASCADE/RESTRICT differ).

This slice2 apply.py refuses to run if the slice5 shape is detected in the target Directus. The detection probe checks for the presence of `cohorts.member_count` (slice5-only field). The override flag `SLICE2_OVERRIDE_SLICE5=1` is reserved for an explicit owner-approved migration path which is NOT auto-generated — it must be hand-drafted as a separate slice2-migration script after owner+Codex review.

If you intend a fresh apply (no prior slice5 applied in this Directus): run slice2 apply.py directly.

If a prior slice5 applied (cohorts exists with `member_count`): STOP. Owner must decide between (a) `slice5-cohorts/rollback.py` then slice2 apply, or (b) a hand-drafted slice2.1-from-slice5 migration script. Both paths are out of scope for this slice.

## Run order (DO NOT EXECUTE — gated on owner+Codex review)

```bash
# 1. Pre-flight: snapshot baseline (always, even on fresh apply)
sudo docker exec hycrm-directus-db pg_dump -U hycrm -d hycrm \
    -t cohorts -t cohort_members 2>/dev/null > /tmp/slice2-pre.dump
# (will be empty if neither table exists; harmless.)

# 2. Apply (read-only probe runs first; aborts if slice5 detected)
DIRECTUS_URL=http://localhost:18055 \
DIRECTUS_ADMIN_TOKEN=<admin-token> \
  python3 apply.py

# 3. Validate (read-only assertions)
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... python3 validate.py

# 4. Rollback (only if needed)
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... bash rollback.sh
```

## Idempotency contract

- Re-running `apply.py` on an already-slice2-applied Directus is a no-op (each step logs `skip`).
- `cohort_members.contact_id` FK is skipped if `contacts` collection doesn't exist at apply time. Re-run after contacts ship.
- Partial unique index uses `CREATE UNIQUE INDEX IF NOT EXISTS`; safe to re-run.
- Cache clear at the end is idempotent.

## Acceptance criteria (post-apply)

1. Both Directus collections exist and respond to `GET /collections/{name}` with HTTP 200.
2. Postgres tables exist with all proposal §C fields.
3. Partial unique index `uniq_cohort_members_active_pair` present.
4. FK `cohort_members.cohort_id` is `CASCADE`; `cohort_members.contact_id` is `RESTRICT`; `cohorts.lead_teacher_id` is `SET NULL`.
5. GET `/items/cohorts` returns `{"data": []}`.
6. GET `/items/cohort_members` returns `{"data": []}`.

`validate.py` asserts (1)–(4); manual confirmation of (5)–(6) via curl.

## Out of scope (separate slices)

- Directus Flow that emits `timeline_events` on `cohorts.status` / `cohort_members.readiness` changes (proposal §C4 Option α).
- `cohort_staff_assignments` collection for rabbi/teacher assignments (proposal §C2 follow-up; role-enum-evaluation §3).
- Lane A TypeScript surface (`getCohorts`, `getCohortMembers`, etc.) — proposal §G.
- Migration from slice5-cohorts shape (see Reconciliation section above).
- Public read permissions / role-based ACL — owner-gated post-OAuth.
