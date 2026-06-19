// Pure owner-cognition helpers: ordering and bucketing that drive the "what needs me
// first" hierarchy. No rendering, no fetch — unit-tested directly.
import type { DecisionCard, PortfolioSystem } from "./decisionTypes";

// Two cards are the same underlying item if their ids match, OR they point at the same
// entity-specific route. The recommendation engine and the queue sometimes id the same
// item differently (e.g. `blocker:X` vs `X`) but share the route `/ops/blockers/X`.
// Generic anchor routes (containing `#`, e.g. `/ops#owner-gates`) are shared by many
// items and must NOT be treated as identity — only specific entity routes count.
export function isSameItem(a: DecisionCard, b: DecisionCard): boolean {
  if (a.id === b.id) return true;
  if (a.route && b.route && a.route === b.route && !a.route.includes("#")) return true;
  return false;
}

const URGENCY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function urgencyRank(u: string): number {
  return URGENCY_RANK[u] ?? 1;
}

// Highest urgency first, then oldest first — the order an owner should act in.
export function sortByPriority(cards: DecisionCard[]): DecisionCard[] {
  return [...cards].sort((a, b) => {
    const r = urgencyRank(String(a.urgency)) - urgencyRank(String(b.urgency));
    if (r !== 0) return r;
    return (b.age_days ?? 0) - (a.age_days ?? 0);
  });
}

// Visual tier for a card — makes critical impossible to confuse with informational.
export type Prominence = "critical" | "important" | "info";
export function prominenceOf(urgency: string): Prominence {
  if (urgency === "high") return "critical";
  if (urgency === "medium") return "important";
  return "info";
}

export type HealthBucket = "healthy" | "warning" | "attention";
export function bucketOf(status: string): HealthBucket {
  if (status === "תקין") return "healthy";
  if (status === "בעבודה") return "warning";
  return "attention"; // דורש אותך / לא ידוע
}

export interface PortfolioRollup {
  healthy: number;
  warning: number;
  attention: number;
  // attention systems first, then warning, then healthy
  ordered: PortfolioSystem[];
}

export function rollupSystems(systems: PortfolioSystem[]): PortfolioRollup {
  const rank: Record<HealthBucket, number> = { attention: 0, warning: 1, healthy: 2 };
  const ordered = [...systems].sort((a, b) => rank[bucketOf(a.status)] - rank[bucketOf(b.status)]);
  return {
    healthy: systems.filter((s) => bucketOf(s.status) === "healthy").length,
    warning: systems.filter((s) => bucketOf(s.status) === "warning").length,
    attention: systems.filter((s) => bucketOf(s.status) === "attention").length,
    ordered,
  };
}
