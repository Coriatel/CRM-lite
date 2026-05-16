# Slice #6 schema — `attention_items` (PROPOSAL — NOT APPLIED)

Owner-gated proposal for promoting the `/today` Daily Attention surface from
**read-only projection** to a **persisted, owner-editable** list.

**Status:** PROPOSAL ONLY. No Directus schema or production data has been changed.
The `apply.py` in this directory is hard-wired to `--dry-run`; it prints
intended actions and never calls Directus or Postgres.

Follows the convention of `slice4-schema/` and `slice5-cohorts/`.

---

## Why

Today `useAmutaAttention` projects items live from existing CRM data
(`getFollowUpCandidates` + `getContacts({neverCalled})`). The owner has no way to:

- **pin** an item ("keep showing this even after follow-up date passes")
- **dismiss / snooze** an item ("acknowledged, hide for N days")
- **manually add** an item that has no CRM correlate
  (e.g. "Rav needs to decide on cohort opening")
- **reassign** an item between Elron / Rav / system
- **annotate** an item with a private note

All of these need persistence. A new collection is the smallest reversible way
to add it without touching `contacts` columns.

---

## Proposed collection: `attention_items`

| field | type | notes |
|---|---|---|
| `id` | uuid PK | Directus default |
| `title` | string, required | Hebrew, ≤140 chars |
| `owner` | enum, required | `elron` \| `rav` \| `system` |
| `urgency` | enum, required | `low` \| `normal` \| `high` \| `critical` |
| `status` | enum, required | `open` \| `blocked` \| `waiting` \| `stale` \| `done` |
| `domain` | enum, required | `people` \| `lessons` \| `tasks` \| `content` \| `finance` \| `automation` \| `runtime` |
| `next_action` | text, required | one-line action sentence |
| `href` | string, nullable | internal route, e.g. `/people` |
| `source` | enum, required | `manual` \| `projection` \| `import` |
| `source_ref` | string, nullable | for `projection`: stable key, e.g. `followup:<contact_id>` (matches the existing `AttentionItem.id` shape — see `amutaAttentionProjection.ts`) |
| `pinned` | boolean, default false | overrides projection regeneration |
| `snoozed_until` | timestamptz, nullable | hide until this time; null = visible |
| `dismissed_at` | timestamptz, nullable | non-null = hidden permanently (soft delete) |
| `note` | text, nullable | private operator note |
| `created_by` | string (directus user uuid) | Directus default |
| `created_at` | timestamptz | Directus default |
| `updated_at` | timestamptz | Directus default |

### Constraints / indexes

- **Uniqueness:** partial unique index on `(source, source_ref)` WHERE `source_ref IS NOT NULL`
  — prevents duplicate projection upserts.
- **Check:** `CHECK (snoozed_until IS NULL OR snoozed_until > created_at)`.
- **Indexes:**
  - `btree (owner, dismissed_at, snoozed_until)` — main `/today` query.
  - `btree (source, source_ref)` — projection upsert lookup.

### Ownership model

- **manual** items: created by Elron via UI → `source='manual'`, `source_ref=NULL`.
- **projection** items: upserted by a background sync (or by the existing
  `useAmutaAttention` hook on first read) keyed by `(source='projection', source_ref)`.
  When the projection rule no longer matches (e.g. follow-up actioned), the
  corresponding `attention_item` is auto-dismissed (`dismissed_at = now()`) unless
  `pinned = true`.
- **import** items: reserved for future batch imports (e.g. annual planning sheet).

---

## Seed strategy (after owner approval — NOT yet executed)

1. Run the current projection once (`loadAmutaAttentionProjection()` output).
2. For each item, upsert by `(source='projection', source_ref=item.id)`.
3. Items already in the table with same key → update mutable fields only
   (`title`, `urgency`, `status`, `next_action`); do NOT overwrite `pinned`,
   `snoozed_until`, `dismissed_at`, `note`.
4. Items in the table with `source='projection'` whose `source_ref` is no longer
   produced by the projection → set `dismissed_at = now()` UNLESS `pinned=true`.

Seed is a separate script (`seed_from_projection.py`) — also defaults to
dry-run and requires `--apply` to mutate.

---

## Read API / UI changes (after schema applies)

- `useAmutaAttention` gains a second loader path: prefer `attention_items` over
  `loadAmutaAttentionProjection` when the collection is non-empty for the
  current user. Mock fallback stays as last resort.
- New small affordances on each card in `/today`:
  - 📌 pin
  - 💤 snooze 24h / 7d
  - ✕ dismiss
- New `+` button to add a manual item (modal: title, owner, urgency, domain, next_action).
- Refresh button (PR #65) re-runs the same query; no behavior change.

These UI changes are a **separate slice**, not part of this proposal.

---

## Risks

| risk | mitigation |
|---|---|
| Projection drift overwriting operator state | Upsert preserves `pinned`, `snoozed_until`, `dismissed_at`, `note`. |
| Soft-delete bloat | Add a 90-day hard-delete cron (separate slice, post-monitoring). |
| Privacy — items may name people | Same Directus admin/role policy as `contacts`. No public-facing exposure. The `/today` route is already auth-gated. |
| `source_ref` collisions across projection rule changes | Versioned source values (`projection_v1`, `projection_v2`) when rules change shape; v1 ships as-is. |
| Schema apply concurrent with Lane B activity | Lane B is read-side on `/ops`; no overlap with `attention_items`. Snapshot via `pg_dump` before apply (see Rollback). |

---

## Rollback plan

Pre-flight (mandatory):

```bash
sudo docker exec hycrm-directus-db pg_dump -U hycrm -d hycrm \
    -t attention_items > /tmp/slice6-pre.dump
```

Rollback (drops collection + Directus metadata):

```bash
# See rollback.sh.draft in this directory.
DIRECTUS_URL=http://localhost:18055 DIRECTUS_ADMIN_TOKEN=<token> \
  bash rollback.sh.draft
```

Code rollback (if UI ships before schema is rolled back):

```bash
git revert <slice6-ui-merge-sha> && git push origin main
```

The existing read-only projection continues to work even if `attention_items`
is dropped, because `useAmutaAttention` keeps the projection path as fallback.

---

## Dry-run

```bash
cd crm-app/scripts/slice6-attention-items
python3 apply.py            # prints intended actions; no network calls
python3 apply.py --apply    # blocked — prints "PROPOSAL ONLY" and exits 2
```

Output documents the exact Directus REST calls and SQL statements that the
real `apply.py` (written after approval) would execute.

---

## Owner approval required

**Exact question for owner:**

> Approve creating Directus collection `attention_items` with the 14 fields,
> 3 enums, 1 partial unique index, 1 CHECK constraint, and 2 btree indexes
> documented above — to be applied manually by you in production after `pg_dump`
> baseline. Approves only the schema; the seed script and UI changes are
> separate slices that ship behind this gate.

Answer expected: `approve` / `revise <what>` / `reject`.

---

## Phases after approval

1. **6a — schema:** write the real `apply.py` (mirroring `slice4-schema/apply.py`
   conventions), `rollback.sh`, `validate.py`. Owner runs `apply.py` in prod.
2. **6b — seed:** ship `seed_from_projection.py`; run once.
3. **6c — read-through:** wire `useAmutaAttention` to prefer `attention_items`;
   keep projection + mock as fallbacks.
4. **6d — UI write:** pin / snooze / dismiss / add-manual affordances on `/today`.
5. **6e — cleanup cron:** 90-day hard-delete of dismissed items.

Each phase is independently reversible. Stop after any phase if signal is unclear.

---

## Provenance

- Drafted in elron session, 2026-05-16, on `docs/attention-items-proposal` branch.
- Followed pattern from `slice4-schema/` (approvals) and `slice5-cohorts/` (cohorts).
- Not Codex-reviewed yet — owner may request a Codex pass before approval.
- No Lane B / ops-vault paths touched by this proposal.
