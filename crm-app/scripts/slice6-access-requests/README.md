# Slice #6 schema — `access_requests` (auth allowlist, post-decision wave)

Status: DRAFT — do not run against production until owner+Codex review.
Authority: per `/srv/ops-vault/concepts/auth-allowlist-design.md` §3.
Owner decision: `/srv/ops-vault/projects/merkaz-neshama-os/lane-a/decisions/rabbi-auth-strategy.md` (Option A modified — Google OAuth identity-only, allowlist + admin approval).

## Contents

```
slice6-access-requests/
├── README.md          ← you are here
├── apply.py           ← idempotent Directus admin-API migration
├── validate.py        ← read-only assertions
└── rollback.sh        ← drops the collection (interactive)
```

Note: `slice6-attention-items/` (pre-wave numbering) and `slice6-access-requests/` (this slice, new numbering) coexist as sibling directories. They are unrelated.

## Why this exists

Per the rabbi-auth-strategy decision: Google OAuth is identity-only. A successful Google sign-in MUST NOT grant access by itself. Unknown Google users land as `pending` and an `access_requests` row tracks the approval workflow.

The `access_requests` collection records:
- WHO requested access (FK to `directus_users`)
- WHEN they requested
- decision state (`pending` / `approved` / `denied`)
- WHO decided + WHEN
- WHAT role they got on approval (snapshot, for audit)

This collection is the auth allowlist's structured backbone. The notification flow that emails `hello@merkazneshama.co.il` + `Coriatel@gmail.com` is a SEPARATE concern (IV-4 in plan v2) and is NOT part of this slice.

## Schema (v0)

### `access_requests`

| Field                 | Type      | Constraints                                              | Default   |
|-----------------------|-----------|----------------------------------------------------------|-----------|
| `id`                  | uuid      | PK                                                       | gen_random_uuid() |
| `requesting_user_id`  | uuid      | not null, FK → directus_users.id ON DELETE CASCADE       | —         |
| `email`               | string    | not null, ≤320 (denormalized — survives user deletion)   | —         |
| `display_name`        | string    | nullable, ≤200 (Google profile name)                     | null      |
| `requested_at`        | timestamp | not null, Directus date-created                          | now()     |
| `decision`            | enum      | not null: pending / approved / denied                    | pending   |
| `decided_at`          | timestamp | nullable                                                 | null      |
| `decided_by`          | uuid      | nullable, FK → directus_users.id ON DELETE SET NULL      | null      |
| `assigned_role_slug`  | string    | nullable, ≤64 (role name snapshot on approval)           | null      |
| `notes`               | text      | nullable (admin-only context)                            | null      |

Indexes:
- btree on `(decision, requested_at)` — pending-requests queue ordered by age
- unique on `(requesting_user_id)` — exactly one request row per Directus user

Display template: `{{email}} — {{decision}}`.
Hebrew label: `בקשות גישה`.

## Permissions (deliberately deferred)

The auth-allowlist-design §3 spec calls for role-scoped permissions (pending=no access, mentor/coordinator=no access, rabbi=read-own-only, owner/admin=CRUD). This `apply.py` does NOT set permissions because:

1. The Directus roles (`pending`, `mentor`, `coordinator`, `rabbi`, `primary_rabbi`, `owner`) do not yet exist (plan v2 owner-gate item — see Group III in `lane-a-execution-plan-v2-2026-05-18.md`).
2. Setting permissions against non-existent role UUIDs would fail.
3. Directus's default behavior (admin-only access) is the safe v0 state.

A follow-up slice (post-owner-creates-roles) writes the role-scoped permissions. Until then, only Directus admin can read/write `access_requests`. This is intentional: pending Google users land via the OAuth callback and an admin-only collection is created on their behalf via a Directus flow (IV-3, separate slice).

## FK ordering caveat

`directus_users` always exists (Directus core table); no skip-if-target-missing logic needed.

## Run order (DO NOT EXECUTE — gated on owner+Codex review)

```bash
# 1. Pre-flight snapshot (empty until apply runs)
sudo docker exec hycrm-directus-db pg_dump -U hycrm -d hycrm \
    -t access_requests 2>/dev/null > /tmp/slice6-pre.dump

# 2. Apply schema
DIRECTUS_URL=http://localhost:18055 \
DIRECTUS_ADMIN_TOKEN=<admin-token> \
  python3 apply.py

# 3. Validate
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... python3 validate.py

# 4. Rollback (drops the collection; access_requests is the only table)
DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... bash rollback.sh
```

## Idempotency contract

- `apply.py` skips existing collection, fields, relations, indexes — safe to re-run.
- `rollback.sh` is interactive — requires explicit confirmation.

## Acceptance criteria (post-apply)

1. `access_requests` collection exists (`GET /collections/access_requests` → 200).
2. All 10 columns present in Postgres.
3. Index `idx_access_requests_decision_requested` present.
4. Unique index on `(requesting_user_id)` rejects duplicates.
5. FK `access_requests.requesting_user_id` → `directus_users.id` with ON DELETE CASCADE.
6. FK `access_requests.decided_by` → `directus_users.id` with ON DELETE SET NULL.
7. `GET /items/access_requests` → `{"data": []}`.

`validate.py` asserts (1)–(6); (7) is confirmed manually.

## Out of scope (separate slices)

- Directus flow that creates an `access_requests` row when a Google-OAuth user lands (IV-3).
- Email notification flow on new requests (IV-4 — Directus flow or n8n).
- Role-scoped permissions on the collection (post-roles-created slice).
- Frontend `PendingAccessPage` UI (Group II in plan v2).
- Frontend auto-creation of request row on first OAuth landing (IV-3 — Lane A).
