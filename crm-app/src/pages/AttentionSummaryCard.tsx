import type { CSSProperties } from "react";
import {
  type Blocker,
  type DependenciesDoc,
  type FreshnessDoc,
  type ProcessesDoc,
  type QueueRoutesDoc,
  type RuntimeIssuesDoc,
  type WorkflowsDoc,
  type PushIsolationSnapshot,
  type OrchestratorIntegrityDoc,
  actionableProcesses,
  classifyPushIsolationForOperator,
  classifyRuntimeIssuesForOperator,
  dependenciesSummary,
  openRuntimeIssues,
  stalenessEntries,
  summarizeOrchestratorIntegrity,
  workflowsAttention,
} from "./OpsPage";

// Top-of-page synthesis: aggregates already-loaded ops projections into one
// "what requires attention now?" surface. Consumer-only — no new producers,
// no schema changes. Pure function for testability; component is thin.

export type AttentionCategoryKey =
  | "owner_required"
  | "escalate"
  | "autonomous_ready"
  | "stale"
  | "blockers";

export type AttentionSeverity = "info" | "watch" | "action";

export type AttentionCategory = {
  key: AttentionCategoryKey;
  label: string;
  count: number;
  severity: AttentionSeverity;
  topReason: string | null;
  hasData: boolean;
};

export type AttentionSummaryResult = {
  categories: AttentionCategory[];
  totalAttentionCount: number;
  hasAnyAttention: boolean;
  hasAnyData: boolean;
};

export type AttentionSummaryInput = {
  ownerGates: string[];
  activeIncidents: string[];
  blockers: Blocker[];
  freshness: FreshnessDoc | null;
  runtimeIssues: RuntimeIssuesDoc | null;
  pushIsolation: PushIsolationSnapshot | null;
  processes: ProcessesDoc | null;
  dependencies: DependenciesDoc | null;
  workflows: WorkflowsDoc | null;
  orchestratorIntegrity: OrchestratorIntegrityDoc | null;
  queueRoutes: QueueRoutesDoc | null;
};

const STALE_HOURS_THRESHOLD = 6;

function shortenName(file: string | null | undefined): string {
  if (!file) return "—";
  const tail = file.split("/").pop() ?? file;
  return tail.replace(/\.(json|md)$/, "");
}

export function attentionSummary(
  input: AttentionSummaryInput,
): AttentionSummaryResult {
  const {
    ownerGates,
    activeIncidents,
    blockers,
    freshness,
    runtimeIssues,
    pushIsolation,
    processes,
    dependencies,
    workflows,
    orchestratorIntegrity,
    queueRoutes,
  } = input;

  // Detect "have we seen any inputs at all?" — every doc null/empty = no data
  const hasAnyData =
    (ownerGates && ownerGates.length > 0) ||
    (activeIncidents && activeIncidents.length > 0) ||
    (blockers && blockers.length > 0) ||
    freshness !== null ||
    runtimeIssues !== null ||
    pushIsolation !== null ||
    processes !== null ||
    dependencies !== null ||
    workflows !== null ||
    orchestratorIntegrity !== null ||
    queueRoutes !== null;

  // Owner-required: explicit owner gates + active incidents + routed-owner queue items.
  const routeOwner = queueRoutes?.summary?.owner ?? 0;
  const ownerCount = ownerGates.length + activeIncidents.length + routeOwner;
  let ownerReason: string | null = null;
  if (activeIncidents.length > 0) {
    ownerReason = `אירוע פעיל: ${activeIncidents[0]}`;
  } else if (ownerGates.length > 0) {
    ownerReason = `דורש בעלים: ${ownerGates[0]}`;
  } else if (routeOwner > 0) {
    ownerReason = `${routeOwner} פריט בתור עם החלטת בעלים`;
  }

  // Escalate: routed-escalate queue items + high-severity runtime issues.
  // Same "no false-zero on missing producer" rule as autonomous/stale.
  const hasEscalateData = runtimeIssues !== null || queueRoutes !== null;
  const issuesOpen = openRuntimeIssues(runtimeIssues);
  const issuesView = classifyRuntimeIssuesForOperator(issuesOpen);
  const highIssues = issuesView?.highCount ?? 0;
  const routeEscalate = queueRoutes?.summary?.escalate ?? 0;
  const escalateCount = routeEscalate + highIssues;
  let escalateReason: string | null = null;
  if (!hasEscalateData) {
    escalateReason = "אין נתוני runtime/queue — בדוק את המקורות";
  } else if (highIssues > 0) {
    escalateReason = `${highIssues} תקלת runtime חמורה`;
  } else if (routeEscalate > 0) {
    escalateReason = `${routeEscalate} פריט להסלמה`;
  }

  // Autonomous-ready: routed-autonomous queue items. When the routes producer
  // failed we must NOT surface "0" as if all work were owner-only — silent
  // false-zero on a missing producer is exactly the lie this surface exists
  // to prevent.
  const hasRoutes = queueRoutes !== null;
  const routeAutonomous = queueRoutes?.summary?.autonomous ?? 0;
  const autonomousReason = !hasRoutes
    ? "אין נתוני ניתוב — בדוק queue_routes.json"
    : routeAutonomous > 0
      ? `${routeAutonomous} פריט מוכן לביצוע אוטונומי`
      : null;

  // Stale: data sources that haven't been refreshed in ≥6h. When the
  // freshness producer failed we must NOT render an empty info cell that
  // reads as "all fresh" — surface that the source itself is missing.
  const hasFreshness = freshness !== null;
  const stale = stalenessEntries(freshness, STALE_HOURS_THRESHOLD);
  const staleCount = stale.length;
  const staleReason = !hasFreshness
    ? "אין freshness.json — לא ניתן לדעת אם המקורות עדכניים"
    : staleCount > 0
      ? `ותיק ${stale[0].hours} שע' (${shortenName(stale[0].name)})`
      : null;

  // Blockers: active blockers + dependencies failing + workflows failing +
  // actionable processes + push-isolation action + orchestrator integrity red.
  const depSummary = dependenciesSummary(dependencies);
  const wfAttention = workflowsAttention(workflows);
  const actionableProcs = actionableProcesses(processes);
  const pushView = classifyPushIsolationForOperator(pushIsolation);
  const integrity = summarizeOrchestratorIntegrity(orchestratorIntegrity);
  const integrityRed = integrity?.status === "red" ? 1 : 0;
  const pushAction = pushView.severity === "action" ? 1 : 0;
  const blockerCount =
    blockers.length +
    depSummary.failingChecks +
    depSummary.errors +
    wfAttention.failing.length +
    actionableProcs.length +
    pushAction +
    integrityRed;
  let blockerReason: string | null = null;
  if (blockers.length > 0) {
    blockerReason = blockers[0].summary;
  } else if (wfAttention.failing.length > 0) {
    blockerReason = `Workflow כושל: ${wfAttention.failing[0].name ?? wfAttention.failing[0].workflow_key}`;
  } else if (depSummary.failingChecks > 0) {
    blockerReason = `${depSummary.failingChecks} תלות עם כשל בבדיקות`;
  } else if (depSummary.errors > 0) {
    blockerReason = `${depSummary.errors} שגיאה באיסוף תלויות`;
  } else if (actionableProcs.length > 0) {
    blockerReason = `תהליך לבדיקה: PID ${actionableProcs[0].pid}`;
  } else if (integrityRed > 0) {
    blockerReason = integrity?.reasons?.[0] ?? "Orchestrator integrity: red";
  } else if (pushAction > 0) {
    blockerReason = pushView.headline;
  }

  // Severity per category — "action" only when count>0 and category implies blocking.
  const ownerSev: AttentionSeverity = ownerCount > 0 ? "action" : "info";
  const escalateSev: AttentionSeverity = !hasEscalateData
    ? "watch"
    : highIssues > 0 || routeEscalate > 0
      ? "action"
      : "info";
  // watch when producer missing, so the reason cell isn't drowned in info-grey.
  const autonomousSev: AttentionSeverity = !hasRoutes
    ? "watch"
    : routeAutonomous > 0
      ? "watch"
      : "info";
  const staleSev: AttentionSeverity = !hasFreshness
    ? "watch"
    : staleCount > 0 && (stale[0]?.hours ?? 0) >= 48
      ? "action"
      : staleCount > 0
        ? "watch"
        : "info";
  const blockerSev: AttentionSeverity = blockerCount > 0 ? "action" : "info";

  const categories: AttentionCategory[] = [
    {
      key: "owner_required",
      label: "דורש בעלים",
      count: ownerCount,
      severity: ownerSev,
      topReason: ownerReason,
      hasData: true,
    },
    {
      key: "escalate",
      label: "להסלמה",
      count: escalateCount,
      severity: escalateSev,
      topReason: escalateReason,
      hasData: runtimeIssues !== null || queueRoutes !== null,
    },
    {
      key: "autonomous_ready",
      label: "מוכן לביצוע אוטונומי",
      count: routeAutonomous,
      severity: autonomousSev,
      topReason: autonomousReason,
      hasData: queueRoutes !== null,
    },
    {
      key: "stale",
      label: "נתונים מתיישנים",
      count: staleCount,
      severity: staleSev,
      topReason: staleReason,
      hasData: freshness !== null,
    },
    {
      key: "blockers",
      label: "חוסמים פעילים",
      count: blockerCount,
      severity: blockerSev,
      topReason: blockerReason,
      hasData: true,
    },
  ];

  const totalAttentionCount = categories.reduce(
    (s, c) => s + (c.severity === "info" ? 0 : c.count),
    0,
  );
  const hasAnyAttention = categories.some(
    (c) => c.severity !== "info" && c.count > 0,
  );

  return {
    categories,
    totalAttentionCount,
    hasAnyAttention,
    hasAnyData,
  };
}

const card: CSSProperties = {
  border: "1px solid #d4d4d8",
  background: "#fafafa",
  borderRadius: 10,
  padding: 12,
  marginBottom: 14,
};

const cardHead: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  fontWeight: 600,
  fontSize: 14,
  marginBottom: 10,
  color: "#27272a",
};

const cardSubhead: CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: "#71717a",
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

const sevStyle: Record<AttentionSeverity, CSSProperties> = {
  info: { background: "#f4f4f5", borderColor: "#e4e4e7", color: "#3f3f46" },
  // amber palette mirrors StalenessBanner; red mirrors ActiveIncidentsCard.
  watch: { background: "#fffbeb", borderColor: "#fde68a", color: "#78350f" },
  action: { background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" },
};

const cellBase: CSSProperties = {
  border: "1px solid",
  borderRadius: 8,
  padding: "8px 10px",
};

const cellTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  fontSize: 13,
  fontWeight: 600,
};

const cellCount: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
};

const cellReason: CSSProperties = {
  fontSize: 11,
  marginTop: 4,
  opacity: 0.85,
};

const emptyState: CSSProperties = {
  fontSize: 13,
  color: "#52525b",
  textAlign: "center" as const,
  padding: "4px 0 2px",
};

export function AttentionSummaryCard(props: AttentionSummaryInput) {
  const summary = attentionSummary(props);

  if (!summary.hasAnyData) {
    return (
      <section
        aria-label="סיכום קשב"
        data-testid="attention-summary-card"
        style={card}
      >
        <div style={cardHead}>
          <span>סיכום קשב</span>
          <span style={cardSubhead} data-testid="attention-summary-empty-state">
            אין נתונים זמינים — בדוק את <code>/ops-data</code>
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="סיכום קשב"
      data-testid="attention-summary-card"
      style={card}
    >
      <div style={cardHead}>
        <span>סיכום קשב</span>
        <span style={cardSubhead} data-testid="attention-summary-total">
          {summary.hasAnyAttention
            ? `${summary.totalAttentionCount} פריט${summary.totalAttentionCount === 1 ? "" : "ים"} דורש${summary.totalAttentionCount === 1 ? "" : "ים"} תשומת לב עכשיו`
            : "אין פריט דורש תשומת לב כרגע"}
        </span>
      </div>
      <ul style={{ ...grid, listStyle: "none", padding: 0, margin: 0 }}>
        {summary.categories.map((c) => {
          const sev = sevStyle[c.severity];
          return (
            <li
              key={c.key}
              data-testid={`attention-summary-${c.key}`}
              style={{ ...cellBase, ...sev }}
            >
              <div style={cellTop}>
                <span>{c.label}</span>
                <span
                  style={cellCount}
                  data-testid={`attention-summary-${c.key}-count`}
                >
                  {c.hasData ? c.count : "—"}
                </span>
              </div>
              {c.topReason && (
                <div
                  style={cellReason}
                  data-testid={`attention-summary-${c.key}-reason`}
                >
                  {c.topReason}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!summary.hasAnyAttention && (
        <div style={emptyState} data-testid="attention-summary-clear">
          ✓ כל המקורות בטווח התקין
        </div>
      )}
    </section>
  );
}

