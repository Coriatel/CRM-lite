# Reconciliation & Roadmap — MN-OS / RPOS UX Reconstruction

> **Campaign:** Lane 1 — Design Runtime / UX Reconstruction.
> **Companion:** `UI_RUNTIME_INVENTORY.md` (the factual snapshot).
> **Author basis:** Lane A (elron), 2026-06-01. Reconciles the campaign brief against the pre-existing MN-OS UX canon.

---

## 1 — The central finding (reframe the campaign)

The campaign brief was written as if the system has **no product frame** and needs reconstruction from scratch. That premise is **partially incorrect** — and correcting it is the most valuable thing this session can do.

**A complete, owner-delivered, canonical MN-OS UX runtime already exists** (filed 2026-05-24, owner-delivered as `mn_os_ux_runtime_package-2.zip`):

| Canon artifact | Covers which campaign deliverable |
|---|---|
| `concepts/mn-os-ux-runtime-v1.md` | Product principles, PRD principles, anti-patterns (Phases 3, 6) |
| `concepts/mn-os-ux-operational-architecture.md` | Screen map, IA (L1–L4), routing model, systems inventory, slice packets (Phases 1, 2, 4, 5, 8) |
| `concepts/mn-os-ux-workflow-page-grammar.md` | The 5-section L3 grammar (Phase 5, 7) |
| `concepts/mn-os-ux-master-session-prompt.md` | Product framing, lane scope (Phase 2, 3) |
| `projects/mn-os-ux-runtime.md` | Anchor, authority, first-slice (Phase 8) |
| `skills/operational-ux/SKILL.md` | The design-runtime skill (Phase: skill activation) |

The campaign's own hard rules already anticipated this: *"Do not create a parallel design system if design tokens exist"* and *"Do not create a new skill unless a trigger seam gap is proven."* The brief even predicted the outcome: *"Possible outcome: operational-ux is enough, but needs a design-reconstruction section."*

**Therefore the anti-rediscovery reconciliation gate applies (Category 1–4 = RECONCILE, not BUILD).** Generating 10 fresh parallel artifacts (PRODUCT_MAP, OPS_RPOS_PRD, INFORMATION_ARCHITECTURE, SCREEN_ARCHITECTURE…) would duplicate canon and violate the brief. Instead, the real work is:

> **Reconcile the advancing code against the frozen canon, and act on the drift.**

---

## 2 — What changed since the canon was frozen (the actual gap)

The canon screen map is dated **2026-05-24** and lists 11 live routes + 6 *proposed* L3 pages. Reality on `origin/main` (2026-06-01) is ~25 commits further along:

| Canon said (2026-05-24) | Reality (2026-06-01) |
|---|---|
| `/ops/issues/:id` SHIPPED; 5 L3 pages *proposed* | **4 L3 pages live** (issues, blockers, gates, workflows) + automations in-flight |
| "rule-of-3: don't extract a shell yet" | **past rule-of-3**; `opsCard` grammar extraction begun (#142) |
| `OpsPage.tsx` ~4098 LOC | **5860 LOC, ~28 cards** |
| `/today` = donor card + badge | `/today` = deterministic **GlobalNextAction** + StaleChip + attention buckets |
| Rabbi = `/rabbi` queue | **Rabbi Control Center** (#167) — a whole new scheduling surface |

**Conclusion:** The system is not behind its design — it is **ahead of its documented design**, and accreting faster than the canon tracks. The "construction site" feeling is *canon drift + `/ops` density + CRM-shaped navigation*, not missing architecture.

---

## 3 — The real, prioritized problems (from `UI_RUNTIME_INVENTORY.md §6`)

| # | Problem | Severity | Type |
|---|---|---|---|
| P1 | `/ops` = 28-card flat scroll, no hierarchy, 86% dead-end cards, actionable cards at the bottom | **High** | reorganization |
| P2 | Navigation still tells a CRM story; OS surfaces buried in MoreSheet | **High** | reorganization |
| P3 | `/people` (L2 hub) invisible in nav | Medium | bug-class nav gap |
| P4 | Three "homes" (`/today` / `/dashboard` / `/ops`) → "where do I start?" | Medium | IA clarification |
| P5 | Product framing still partly "CRM-lite" not "Merkaz Neshama OPS" | Medium | framing |
| P6 | Tokens exist but ~80% bypassed by inline styles | Low (debt) | consistency |
| P7 | Canon screen map stale vs reality | Medium | doc drift |

---

## 4 — Roadmap (small, reversible, owner-gated where needed)

> **Shipped status (2026-06-01 session, owner "continue to the end"):**
> - **Slice 0 ✅ MERGED** — canon screen-map refresh (ops-vault PR #286, `0ba7835`).
> - **Slice 4 ✅ MERGED** — framing rename CRM Phone → "מרכז נשמה — OPS" (crm-lite PR #169, `0482008`).
> - **Slice 1 ✅ MERGED** — `/ops` collapsible sections, actionable-first (crm-lite PR #170, `e2dd9e2`).
> - **Slice 2 ✅ MERGED** — `/ops` surfaced in bottom nav, duplicate `/dashboard` demoted to MoreSheet (crm-lite PR #171, `e5c7edf`).
> - **Remaining:** Slice 3 (largely subsumed by Slice 2), Slice 5 (new L3 pages — large, focused sessions), Slice 6 (token sweep — last). Full bottom-nav IA composition is an owner product-direction call.

Ordered by **value / cost / reversibility**. Each is a Lane-A slice; none is a rewrite. The brief's "do not start CSS / component rewrites first" rule is honored — every early slice is *structure*, not paint.

### Slice 0 — Refresh the canon screen map *(this campaign, low cost)*
Update `mn-os-ux-operational-architecture.md §1` to reflect the 4 live L3 pages, the 5860-LOC `/ops`, and the new surfaces. **Removes P7.** Reversible (doc edit). *Recommend doing this before any code slice so the canon leads, not lags.*

### Slice 1 — `/ops` sectioning (no card removed) *(addresses P1)*
Group the 28 cards into **collapsible sections by audience/job** — e.g. `נדרש עכשיו` (queue/gates/attention/blockers) · `אוטומציות ומשימות` (workflows/automations/processes) · `בריאות מערכת` (health/integrity/producer/sessions/continuity). Reorder so actionable sections are top. **No card deleted, no data touched** — pure render-grouping. Reversible. *This is the single highest-leverage slice and the recommended first implementation.*

### Slice 2 — Promote `/ops` + fix `/people` in nav *(addresses P2, P3)*
Add `/people` to the bottom nav (it's whitelisted but missing). Decide `/ops` nav promotion vs a 5th tab. Smallest reversible nav change. Owner may want input on tab set (reversible either way → state choice, proceed).

### Slice 3 — Resolve the "three homes" *(addresses P4)*
Demote `/dashboard` to an explicitly-labeled "campaign" view (or fold into `/today` drill-down). Keep `/today` as canonical L1. Reversible (route/label change).

### Slice 4 — Product framing pass *(addresses P5)*
Rename surface framing from "CRM-lite" → "Merkaz Neshama OPS" in titles/headers/manifest where user-visible. **No route changes, no data changes, preserve all URLs.** Reversible. *Good candidate for the brief's "first safe slice" (navigation shell / product rename) once the dirty tree clears.*

### Slice 5 — Wire dead-end `/ops` cards to L3 *(addresses P1 deeper)*
Now that the L3 pattern is proven 4×, convert high-value dead-end cards (OperationalQueue, ActiveSessions, Blockers) into `<Link>`s to new L3 pages, reusing the extracted `opsCard`/workflow grammar. One card per slice. Reversible (additive routes).

### Slice 6 — Token adoption sweep *(addresses P6, last)*
Replace inline style objects with `tokens.css` vars, surface by surface. Pure consistency. Lowest priority; explicitly **after** structure per the brief.

### Deferred (need owner / external critic)
- Visual system / Gemini-Stitch critic pass (Phase 6/7) — only after IA slices land; external critic as *critic not source* per brief.
- `/ops` card consolidation (the suspected overlaps in inventory §2c) — needs owner call on which to merge.
- New L2 domains (`/finance`, `/lessons`, `/content`) — wait for a concrete operator request (canon §6 honest-gap).

---

## 5 — Skill-activation check (campaign requirement)

**Question:** When Claude is asked to do UI/UX work on these surfaces, does it reliably reach the design canon?

**Answer: YES — the trigger seam is wired and current.**

- `operational-ux` skill exists, is **auto-loaded** for crm-lite UX work, and **routes to all canon** (`mn-os-ux-runtime-v1`, workflow-page-grammar, master-session-prompt, operational-architecture) + adds contracts + anti-patterns + the Lane-A authority gate.
- It was reached automatically this session before any design reasoning.
- The 4 live L3 pages were all built *through* this canon (PR #119→#136), proving the seam carries into execution.

**Verdict: do NOT create a new `operational-ui-reconstruction` skill.** No trigger-seam gap exists — Claude does not drift, skip, or mis-sequence without one; it reached and applied the canon unprompted. Per the brief's own rule ("a new skill is justified only if Claude may drift without it"), the bar is not met.

**One minimal repair recommended (not a new skill):** the canon's screen map drifts because nothing forces a re-measurement when code ships. Add a short *"Reconciliation cadence"* note to `operational-ux/SKILL.md` or the architecture doc: *"Before proposing a UX slice, diff the live route table (`App.tsx`) against `operational-architecture.md §1`; if drifted, refresh §1 first."* That makes Slice 0 self-triggering and prevents the exact staleness this session found. (Owner-gated only if propagated cross-user; single-user/single-host edit rides standard authority.)

---

## 6 — What this session did / did not do

**Did:** Phase 0 preflight, Phase 1 fresh runtime inventory (reconciled against canon), the reconciliation reframe, the prioritized roadmap, the skill-activation verdict. Pure additive docs in an isolated worktree.

**Did NOT (by design / safety):**
- No product-code edits — implementation (Phase 9) blocked by the **dirty shared main tree** (uncommitted `/ops/automations` + `slice7-care` schema-apply work from a ~2-day-old session) and a pending owner-gated schema apply. Will not stash/reset/overwrite parallel work.
- No 10 parallel artifacts — reconciled into canon instead (anti-rediscovery gate).
- No new skill — no trigger-seam gap.
- No visual/CSS work — structure-before-paint per brief.

**Requires owner:**
- Visual review of live surfaces on a phone (CLI cannot authenticate the deployed app).
- Decision on `/ops` card consolidations (§2c overlaps).
- Decision on the bottom-nav tab set (Slice 2).

**Next implementation slice (when dirty tree clears):** Slice 0 (canon refresh) then Slice 1 (`/ops` sectioning) — the highest-leverage, fully-reversible structural change.

## 7 — Reversibility

Both docs are pure additions in worktree `design/mn-os-reconstruction-inventory` (off `origin/main`). Rollback: remove the worktree/branch, or `git revert` if ever merged. No runtime, schema, or production touched.
