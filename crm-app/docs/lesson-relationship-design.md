# Lesson ↔ Person Relationship — Design Note

**Status:** Design note only. No schema, no code, no Directus mutation, no UI in this document.
**Purpose:** Define the product/data meaning of a "lesson relationship" for MN-OS so a future implementation slice can add schema and UI without guessing.
**Audience:** Owner (product decisions) + the future implementation slice.
**Author lane:** Campaign A — Rabbi Operator Runtime, A3 (person surface). Companion to the shipped `/people/:id` page (PR #149) and the `/schedule` agenda (PR #148).

---

## 1. What counts as a lesson

A **lesson** (שיעור) is a single, identifiable teaching unit delivered by the Rabbi that a person can be related to. It is the *thing attended/watched*, not the curriculum.

A lesson has, at minimum:
- a **title** (e.g., "פרשת בהר — קניין הארץ"),
- a **delivery mode**: `live`, `recorded`, or `hybrid` (live + recording published after),
- an optional **scheduled time** (`live`/`hybrid` have one; a pure `recorded` shiur may have only a publish date),
- an optional **recording URL** (present once published),
- an optional **series label** (free-text grouping, e.g., "סדרת גמרא ב'") — *grouping only in v1, see non-goals*.

**Boundary clarifications:**
- A lesson is **one occurrence**, not a recurring series. A weekly shiur produces *many* lesson rows, one per session. (A "series/course" entity that tracks progress across lessons is explicitly deferred — §7.)
- A lesson is **not** a `call_queue` item, **not** an `attention_item`, and **not** a calendar meeting. Those are operator work artifacts; a lesson is a teaching event that *generates* such artifacts.
- The Rabbi is implicitly the teacher in v1 (single-teacher amuta). A `teacher` field is not modeled until multi-teacher is real.

## 2. What counts as a person's relationship to a lesson

A **relationship** is an *edge* between one **person** (an existing `contacts` row) and one **lesson**, capturing that person's engagement with it. It is a **join entity** (working name: `lesson_participation`), not a field on either side.

Properties of the edge:
- many-to-many: one person ↔ many lessons; one lesson ↔ many people;
- carries a **status** (§3), timestamps, an optional **note**, a **source** (`manual` / `import` / `automation`), and an optional **needs-follow-up** signal;
- is **distinct from "assigned to"** (ownership) and from "donor/campaign status" — it is purely *engagement/attendance*.

The person side **reuses the existing `contacts` collection** — no new person model. This is what makes `/people/:id` (PR #149) the natural display home.

## 3. Relationship statuses

Two-part model: a **primary engagement status** (the person's relationship to the lesson) plus an **orthogonal `needs_follow_up` flag** (operator intent). Keeping follow-up orthogonal avoids the classic trap where "needs follow-up" overwrites the factual "missed/attended" state.

**Primary status enum** (proposed Hebrew labels in parentheses — confirm in §8):

| status | meaning | typical source |
|---|---|---|
| `invited` (מוזמן) | expected/added to the lesson's people, no engagement yet | manual / import |
| `registered` (נרשם) | confirmed intent to attend (optional; skip if no registration flow) | manual / automation |
| `attended` (נכח) | present at a live/hybrid session | manual / import |
| `missed` (החמיץ) | was invited/registered but did not attend | manual / derived |
| `watched_recording` (צפה בהקלטה) | engaged asynchronously with the recording | manual / import |
| `completed` (השלים) | finished — meaningful for multi-part/assigned learning; for a flat lesson, treat as a stronger "attended/watched" | manual |

**Orthogonal flag:**
- `needs_follow_up` (דורש מעקב) — boolean, set by operator or by a rule (e.g., auto-true when `missed`). Drives the follow-up bridge (§6). *This is why "needs follow-up" appears in the brief's status list but is modeled as a flag, not a status.*

**Allowed transitions (guidance, not enforced in v1):**
```
invited ──▶ registered ──▶ attended ──▶ completed
   │            │             │
   │            └──▶ missed    └──▶ (stays attended)
   └──▶ missed ──▶ watched_recording ──▶ completed
missed/registered ──▶ watched_recording   (caught up async)
any ──▶ needs_follow_up=true/false        (flag, independent of status)
```
Transitions are advisory; v1 stores whatever status an operator/import sets. Enforcement is a later concern.

## 4. Rabbi / operator use cases

1. **Per-lesson roster:** for a given lesson, who was invited, who attended, who missed.
2. **Per-person history:** on `/people/:id`, see this person's lessons and statuses over time ("attended 6 of last 8").
3. **At-risk detection:** people who `missed` the last N lessons → proactive outreach.
4. **No-show recovery:** `registered` but `missed` → reminder / "we missed you" message.
5. **Async nurture:** `watched_recording` (engaged but not live) → encourage live attendance.
6. **Follow-up generation:** any edge with `needs_follow_up=true` (or `missed`) becomes a scheduled call in the existing queue (§6) — so lesson follow-ups land in the `/schedule` and `/calls-today` surfaces already shipped.
7. **Engagement reporting (dashboard):** attendance trend per lesson/series, most-engaged people, at-risk count.

## 5. Minimal future schema proposal — **PROPOSAL ONLY (do not implement from this note)**

> ⚠️ This section is a sketch to anchor a future *approved* schema slice. It is **not** a migration, is **not** authoritative, and must be reviewed before any Directus change. No rollback is defined here because nothing is being changed here.

**Collection `lessons`** (proposed)

| field | type | notes |
|---|---|---|
| `id` | uuid (pk) | |
| `title` | string | required |
| `delivery_mode` | enum(`live`,`recorded`,`hybrid`) | required |
| `scheduled_at` | datetime | nullable (pure recorded may lack it) |
| `recording_url` | string | nullable |
| `series_label` | string | nullable, free-text grouping (v1) |
| `created_at`/`updated_at` | datetime | standard |

**Collection `lesson_participation`** (proposed join)

| field | type | notes |
|---|---|---|
| `id` | uuid (pk) | |
| `lesson_id` | m2o → `lessons` | required |
| `contact_id` | m2o → `contacts` | required — reuses existing people |
| `status` | enum (§3) | required |
| `needs_follow_up` | boolean | default false |
| `engaged_at` | datetime | nullable (when attended/watched) |
| `note` | text | nullable |
| `source` | enum(`manual`,`import`,`automation`) | default `manual` |
| `created_at`/`updated_at` | datetime | standard |

**Suggested indexes:** `lesson_participation(contact_id)`, `lesson_participation(lesson_id)`, `lesson_participation(status)`, unique `(lesson_id, contact_id)` to prevent duplicate edges.

**Data-entry origin for v1:** Directus admin (manual rows) or CSV import — **no custom write UI required for the first slice**. This keeps the first slice read-only on the app side.

## 6. How this connects to existing surfaces

- **Attention queue (`attention_items`):** already exposes a `domain: "lessons"` enum value. Lesson signals (e.g., "5 people missed אתמול's shiur") can be **projected** into attention items with `href` pointing at `/people/:id` (or a future `/lessons/:id`). No new attention mechanism needed — reuse the existing one.
- **Follow-up queue (`call_queue`):** the **bridge**. A `lesson_participation` with `needs_follow_up=true` (or `status=missed`) maps cleanly to a `call_queue` row with a `scheduled_date`. That row then flows **into the already-shipped `/schedule` agenda (PR #148) and `/calls-today`** with zero new queue code — lesson follow-ups become ordinary scheduled calls.
- **People page (`/people/:id`, PR #149):** the display home. Add a **read-only "שיעורים" section** listing the person's participation history (status + date). The page already exists and is the deep-link target.
- **Rabbi dashboard:** aggregate cards (attendance trend, at-risk count, most-engaged) consuming `lesson_participation`. Mirrors the existing dashboard card grammar.

This is the key architectural point: **lessons reuse the runtime that already exists** (contacts, call_queue, attention_items, the person page, the schedule). The only genuinely new substrate is the two collections in §5.

## 7. Non-goals (explicit)

- **Not an LMS.** No video hosting, streaming, transcoding, or playback tracking. `recording_url` is just a link out.
- **No automated attendance capture** (Zoom/YouTube/webhook integrations) in v1 — attendance is manual or imported. (Automation is a later `source=automation` path.)
- **No series/course progress engine** in v1 — `series_label` is a free-text grouping only; cross-lesson completion/curriculum is deferred.
- **No per-lesson billing or payments.**
- **No new credentials / OAuth / external APIs.**
- **No write UI** in the first slice — data enters via Directus admin / import.
- **Does not touch the active care lane** (`crm-app/scripts/slice7-care/*`).
- **No new person model** — attendees are existing contacts.

## 8. Open owner decisions

1. **Lesson scope in v1:** live events, recordings, or both? (Sets `delivery_mode` defaults and whether `scheduled_at` is usually present.)
2. **Registration step:** do we need `registered`, or is `invited → attended/missed` enough? (Drop `registered` if there's no registration flow.)
3. **`completed` semantics:** per-lesson, or only meaningful once series/courses exist? (May defer the status entirely.)
4. **Attendance origin:** manual operator entry, CSV import, or future automation? (Drives `source` usage and the first slice's import vs. admin-entry choice.)
5. **Attendee identity:** must every attendee be an existing contact, or can a lesson have non-contact attendees? (Determines FK strictness; recommend contacts-only for v1.)
6. **Hebrew terminology:** confirm the status labels in §3 (מוזמן / נרשם / נכח / החמיץ / צפה בהקלטה / השלים / דורש מעקב).
7. **`needs_follow_up` auto-rule:** should `missed` auto-set `needs_follow_up=true`, or is it always manual?
8. **Lesson detail page:** is a `/lessons/:id` roster view in scope soon, or is the person-page section sufficient for v1? (Affects attention `href` targets.)

## 9. Recommended smallest future implementation slice (after approval)

A **tracer-bullet vertical** — thinnest end-to-end that proves the model, all read-only on the app side:

1. **Schema (gated on §5 approval):** create `lessons` + `lesson_participation` with the §5 fields. Document a rollback (drop the two collections) before applying — this is the one authority-gated step.
2. **Seed data:** a handful of lessons + participations entered via **Directus admin** (no custom write UI).
3. **Read surface:** add a **read-only "שיעורים" section** to the existing `/people/:id` page showing the person's participation history (status + date), via a small `useLessonParticipation(contactId)` hook mirroring `usePerson`. No writes, no mutations.

**Explicitly deferred to later slices:** write/edit UI, the follow-up→`call_queue` bridge (§6), attention-item projection, dashboard aggregates, and any `/lessons/:id` roster page.

**Why this slice:** it validates the join model and the person-page integration against real data with the least risk, reuses shipped substrate, and crosses exactly one authority gate (the schema creation) — which §8's answers de-risk first.
