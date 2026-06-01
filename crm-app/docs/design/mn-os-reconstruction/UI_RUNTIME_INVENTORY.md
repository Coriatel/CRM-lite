# UI Runtime Inventory — MN-OS / RPOS (crm-lite)

> **Campaign:** Lane 1 — Design Runtime / UX Reconstruction.
> **Snapshot basis:** Cataloged from local checkout `736bc8e` (#142) + uncommitted in-flight `/ops/automations` work, 2026-06-01. `origin/main` is already ahead at `25e14ad` (#167, Rabbi Control Center) — the codebase advances across parallel sessions faster than any frozen snapshot. **Structural findings below hold regardless of exact commit; specific counts are ±a few.**
> **Status:** Phase 1 deliverable. Factual catalog + per-surface UX classification. No redesign here.

---

## 0 — How to read this

This is the *what exists now* layer. It is deliberately separate from the *what it should be* layer (the existing canon — see `RECONCILIATION_AND_ROADMAP.md`, which reconciles this snapshot against `/srv/ops-vault/concepts/mn-os-ux-operational-architecture.md`).

Per-surface classification uses the campaign's own vocabulary:

| Tag | Meaning |
|---|---|
| `CLEAR` | Coherent, single job, navigable, actionable |
| `DENSE_BUT_USABLE` | Heavy but works for its operator |
| `MISPLACED` | Lives in the wrong layer / wrong surface |
| `PARTIAL` | Half-built; a real job only partly served |
| `CONSTRUCTION_SITE` | Pile of widgets, no hierarchy, mostly dead-ends |
| `DUPLICATE_SURFACE` | Overlaps another surface's job |
| `HIDDEN_BUT_IMPORTANT` | Reachable by URL, missing from navigation |

---

## 1 — Routes (live in `crm-app/src/App.tsx`)

| Route | Component | Layer | Purpose | Primary data | In primary nav? | UX class |
|---|---|---|---|---|---|---|
| `/auth/callback`, `*`→`LoginPage` | LoginPage | pre-auth | OAuth + email/pw | auth context | n/a | CLEAR |
| `/` | ContactsPage | L2 | Campaign-aware contact list (active project) | Directus | ✅ "אנשי קשר" | DENSE_BUT_USABLE |
| `/dashboard` | DashboardPage | L2 | Campaign stats, lifecycle stages, follow-ups | Directus | ✅ "לוח בקרה" | DUPLICATE_SURFACE |
| `/today` | TodayPage | **L1 (de-facto home)** | Global next action + people/call counts + attention | `global_next_action.json` + Directus | ✅ "היום" | CLEAR |
| `/calls-today` | CallsTodayPage | L3 | Today's call queue (overdue/today/undated) | Directus | ❌ URL-only | HIDDEN_BUT_IMPORTANT |
| `/people` | PeopleHubPage | L2 | Filtered contact hub (follow-up, never-called…) | Directus | ❌ **orphaned** | HIDDEN_BUT_IMPORTANT |
| `/ops` | OpsPage | **L1 (operator/infra)** | Operational control plane — ~22–28 cards | 28 `/ops-data/*.json` | ◐ MoreSheet only | CONSTRUCTION_SITE |
| `/ops/issues/:id` | OpsIssuePage | **L3** | Runtime-issue workflow page | `runtime-issues.json` | (drill-down) | CLEAR |
| `/ops/blockers/:id` | OpsBlockerPage | **L3** | Blocker workflow page | `blockers.json` | (drill-down) | CLEAR |
| `/ops/gates/:id` | OpsGatePage | **L3** | Owner-gate workflow page | gates feed | (drill-down) | CLEAR |
| `/ops/workflows/:workflow_key` | OpsWorkflowPage | **L3** | Workflow/automation health page | `workflows.json` | (drill-down) | CLEAR |
| `/ops/automations/:id` | OpsAutomationPage | **L3** | Automation runtime page | automation inventory | (drill-down) | PARTIAL *(uncommitted, in dirty tree)* |
| `/rabbi` | RabbiQueuePage | L3 | Rabbi attention queue (needsRav) | `amuta_attention.json` | ◐ MoreSheet | PARTIAL *(action buttons disabled)* |
| `/elron` | ElronQueuePage | L3 | Owner attention queue (urgent/stuck/open) | `amuta_attention.json` | ◐ MoreSheet | PARTIAL *(owner-only)* |
| `/call/:contactId` | ActiveCallPage | L4 | In-call workspace | Directus | ❌ URL-only | CLEAR |
| `/import` | ImportPage | L3 | Multi-step Excel import | XLSX + Directus | ❌ URL-only | CLEAR |
| `/settings` | SettingsPage | L4/admin | Project CRUD, tiers, profile | Directus | ◐ MoreSheet | CLEAR |

**Not yet present** (canon proposed, not built): `/ops/queue/:id`, `/ops/sessions/:slug`, `/ops/incidents/:id`, `/entities/contacts/:id`, any `/finance`, `/lessons`, `/content` L2 surfaces. Rabbi Control Center (`/schedule`-class, PR #167) is on `origin/main` but **not** in this local snapshot — confirm separately.

---

## 2 — The `/ops` surface (the construction site)

`OpsPage.tsx` = **5860 LOC**, ~22 card components reading 28 JSON feeds, **rendered as one unbroken vertical scroll. No tabs, no sections, no view-switcher, no role filter.** A freshness banner sits on top.

### 2a — Card → feed → drill-down map

Only **4 of ~28 cards route to an L3 page**; the rest are read-only dead-ends — the precise "dead-end KPI card" anti-pattern named in `mn-os-ux-runtime-v1.md §Anti-Patterns`.

| Card | Routes to L3? |
|---|---|
| RuntimeIssuesCard → `/ops/issues/:id` | ✅ |
| WorkflowsCard → `/ops/workflows/:key` | ✅ |
| OwnerGatesCard → `/ops/gates/:id` | ✅ |
| AutomationInventoryCard → `/ops/automations/:id` | ✅ *(in-flight)* |
| AttentionSummaryCard, AttentionSynthesisCard, HybridBlockersCard, OperationalQueueCard, RuntimeOrchestrationCard, ManagementCockpitCard, SafeSwarmCard, OrchestratorIntegrityCard, ProducerHealthCard, HealthOverview, ActiveSessionsCard, DependenciesCard, LanesOverview, CampaignsCard, ActionLauncherCard, RecentMergesCard, BlockersOverview, ActiveIncidentsCard, OwnerGateQueueCard, ProcessesCard, PushIsolationCard, RuntimeContinuityMetricsCard, RuntimeContinuityCard, HandoffsCard | ❌ dead-end |

### 2b — Render order (= current information hierarchy)

Attention → Synthesis → HybridBlockers → OperationalQueue → RuntimeOrchestration → ManagementCockpit → SafeSwarm → OrchestratorIntegrity → ProducerHealth → Health → ActiveSessions → Dependencies → Workflows → AutomationInventory → Lanes → Campaigns → ActionLauncher → RecentMerges → Blockers → ActiveIncidents → OwnerGates → OwnerGateQueue → Processes → PushIsolation → RuntimeContinuityMetrics → RuntimeContinuity → Handoffs → RuntimeIssues → Projects.

> The single most actionable cards (RuntimeIssues, OwnerGates) sit **near the bottom** of a 28-card scroll. The hierarchy does not reflect operator priority.

### 2c — Suspected overlaps (need owner/Lane-A decision, not auto-merge)

- **Runtime continuity:** `RuntimeContinuityMetricsCard` (metrics feed) + `RuntimeContinuityCard` (handoffs verifier) + `HandoffsCard` (actionable handoffs) — 3 cards, adjacent jobs.
- **Owner gates:** `OwnerGatesCard` (quick list) + `OwnerGateQueueCard` (decisions queue) — 2 cards.
- **Blockers:** `HybridBlockersCard` + `BlockersOverview` — 2 cards.
- **Attention:** `AttentionSummaryCard` + `AttentionSynthesisCard` — 2 cards.

These are *complementary by data* but *competing for the same screen real estate and operator attention*. Consolidation is a real Phase-5 question.

### 2d — `/ops` audience mismatch

`/ops` mixes two audiences in one scroll: **operator** signals (queue, gates, attention, blockers) and **platform-engineer** signals (orchestrator integrity, producer health, push isolation, active sessions, runtime continuity). The canon's L1/L2 split implies these should be different surfaces or grouped sections.

---

## 3 — Navigation shell

- **Chrome:** single bottom-fixed nav, 5 buttons, RTL-aware.
- **Bottom nav:** היום `/today` · אנשי קשר `/` · לוח בקרה `/dashboard` · סינון (drawer) · עוד (MoreSheet).
- **MoreSheet (secondary):** `/dashboard` (dup), `/ops`, `/settings`. (`/rabbi`, `/elron` reachable here per nav config.)
- **Orphaned from all nav (URL-only):** `/calls-today`, `/call/:id`, `/import`, all `/ops/*` drill-downs.
- **Orphaned despite being whitelisted:** `/people` — in `ROUTE_WHITELIST` but **absent from BottomNav**. A whole L2 hub has no nav entry.
- **Route persistence:** `localStorage` LAST_ROUTE restores last route on reload.

**Nav verdict:** The bottom nav optimizes for the *contact-CRM* job (Today / Contacts / Dashboard), while the *operator-OS* job (`/ops` + queues) is buried one tap deeper in MoreSheet, and the *Rabbi/owner queues* deeper still. This is the structural reason the system "feels like a CRM, not an OS": **the navigation still tells a CRM story.**

---

## 4 — Visual system reality

| Dimension | State |
|---|---|
| Styling | **CSS-in-JS inline `style={{}}` ~80%** + a `.card`/`.badge-*`/`.btn-*` layer in `index.css`. No Tailwind / CSS-modules / styled-components. |
| Tokens | ✅ **`src/design/tokens.css`** is a real single source: color (primary `#1a5f7a`, accent `#e07b39`, semantic), spacing 4–32, radius, shadow, focus-ring, z-index, motion. Solid foundation. |
| Token adoption | ❌ **~80% of styling bypasses tokens** via inline objects; card styles duplicated per page; `StaleChip` colors hard-coded in-component; `StageBadge` uses dynamic Directus hex. |
| Shared primitives | `StaleChip` (freshness), `StatusBadge`, `StageBadge`, `EmptyState`, `ErrorBoundary`. No shared `<Card>` wrapper. `opsCard` grammar extraction (PR #142) started but **not found as a centralized module** in this snapshot — likely partial / in dirty tree. |
| RTL | ✅ Global `<html dir="rtl" lang="he">`, Rubik font; scoped `dir="ltr"` for phone/email/code. Correct. |

**Verdict:** Tokens + RTL + primitives are a *mature-enough shell foundation*. The gap is **adoption discipline**, not absence. Per the campaign's hard rule "do not create a parallel design system if design tokens exist" — there is nothing to create; there is consistency to enforce.

---

## 5 — Three "home" surfaces

| Surface | Real job | Audience | Overlap |
|---|---|---|---|
| `/today` | Single next action + daily counts + attention | operator (daily) | — (this is the true L1 home) |
| `/dashboard` | Campaign stats, lifecycle, follow-ups | campaign manager | **underused (MoreSheet-only); attention role already subsumed by `/today`** |
| `/ops` | System runtime control plane | operator + platform-eng | — (distinct job, but mis-located in nav) |

**Not raw data duplication** — but **conceptual ambiguity about "what is home."** `/today` has effectively won as the operator entry; `/dashboard` is a legacy L2 that should either be demoted to a clearly-labeled "campaign" view or folded into `/today`'s drill-downs.

---

## 6 — One-screen summary (the answer to "what is this, really")

The system is **already an operating system in substance** — L1–L4 layering exists, 4 L3 workflow pages are live, tokens/RTL/primitives exist, a deterministic next-action drives `/today`. What's missing is **OS framing in form**:

1. `/ops` is a 28-card flat scroll with no hierarchy and 86% dead-end cards → **the single biggest "construction site."**
2. Navigation still tells a CRM story; the OS surfaces are buried.
3. `/people` (an L2 hub) is invisible in nav.
4. Three "homes" create "where do I start?" ambiguity.
5. Product naming/framing is still partly "CRM-lite," not "Merkaz Neshama OPS."
6. Design tokens exist but are ~80% bypassed.

None of these require a rewrite. All are *reorganization* — which is exactly what the campaign asked for first. The prioritized plan is in `RECONCILIATION_AND_ROADMAP.md`.
