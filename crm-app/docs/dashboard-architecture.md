# Operational Dashboard — Architecture Notes (Slice #7 groundwork)

## Goal

Minimal operational view for daily CRM work:
- How many contacts are in each lifecycle stage?
- Who needs follow-up today?
- What stage changes happened recently?

## Service layer (added in Slice #7)

| Function | Returns |
|---|---|
| `getStageStats()` | Count of contacts per stage (including unassigned) |
| `getRecentStageTransitions(limit)` | Latest audit rows across all contacts |
| `getFollowUpCandidates(limit)` | Contacts with follow_up_date ≤ today, non-inactive |

All are read-only, no caching, no WebSocket. Each call is a single Directus REST request.

## Slice #8 plan

Build a `/dashboard` or `/lifecycle` page (or a modal tab) showing:
1. **Stage summary bar** — row of stage name + count badges using `getStageStats()` + lifecycle stage colors
2. **Follow-up list** — compact list from `getFollowUpCandidates()`, tap to open ContactDetailModal
3. **Recent transitions** — last 10 rows from `getRecentStageTransitions()`, with from→to names

Mobile-first, no drag/drop, no charts. Reuse `StageBadge` and existing card styles.

## Constraints

- Do NOT add a WebSocket or polling loop — data is stale by seconds at most.
- Do NOT build drag/drop kanban in Slice #8.
- Do NOT redesign the main contacts list.
- Bundle growth should be minimal (no new chart libraries).
