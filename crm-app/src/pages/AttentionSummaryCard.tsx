import { useState, type CSSProperties } from "react";
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
  // Drilldown fields — surfaced when the cell is expanded.
  impact: string;
  nextAction: string | null;
  source: string;
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

  // Drilldown derivation. Each category gets an impact line (why it matters),
  // nextAction (what to do — prefer existing operator-classifier output when
  // present), and source (which producer file(s) feed it). Defaults gracefully
  // when the underlying producer is missing.
  const ownerImpact = "סלייסים שדורשים החלטה לא מתקדמים עד שהבעלים פותר.";
  const ownerNextAction = !ownerCount
    ? null
    : activeIncidents.length > 0
      ? "פתח את לוח האירועים ופתור את האירוע הראשון."
      : ownerGates.length > 0
        ? "פתח את owner_gates ועבור על הגייטים הפתוחים."
        : "פתח את התור ועבור על פריטי owner.";
  const ownerSource = "sessions.json (owner_gates + active_incidents) + queue_routes.json";

  const escalateImpact = "תקלת runtime חמורה עלולה לחסום סשנים אחרים או להציג נתונים שגויים.";
  const escalateNextAction = !hasEscalateData
    ? null
    : (issuesView?.nextAction ?? "סקור את routes שהוגדרו ל־escalate ופתח את הראשון שבהם.");
  const escalateSource = "runtime_issues.json + queue_routes.json";

  const autonomousImpact = "סלייסים מוכנים לביצוע ללא תלות בבעלים. אי־ביצוע = הפסד תפוקה.";
  const autonomousNextAction = !hasRoutes
    ? null
    : routeAutonomous > 0
      ? "הרץ planner/dispatcher — לא נדרשת החלטת בעלים."
      : null;
  const autonomousSource = "queue_routes.json";

  const staleImpact = "תצוגות אחרות עלולות להראות נתונים ישנים, כולל מצב התור והבריאות.";
  const staleOldest = staleCount > 0 ? shortenName(stale[0].name) : null;
  const staleNextAction = !hasFreshness
    ? null
    : staleCount > 0
      ? `הרץ מחדש את ה־producer של ${staleOldest} (הוותיק ביותר) או של ${staleCount} הקבצים הוותיקים.`
      : null;
  const staleSource = "freshness.json";

  const blockerImpact = "פעילות יומיומית עלולה להיתקע: deploys כושלים, תלויות לא נסגרות, תהליכים תקועים.";
  let blockerNextAction: string | null = null;
  if (blockers.length > 0) {
    blockerNextAction = blockers[0].needs
      ? `החסם הראשון צריך: ${blockers[0].needs}`
      : "פתח את החסם הראשון וטפל בו.";
  } else if (wfAttention.failing.length > 0) {
    blockerNextAction = "פתח את Workflows ובדוק את ה־workflow הכושל הראשון.";
  } else if (depSummary.failingChecks > 0) {
    blockerNextAction = "פתח את ה־PR התלוי הראשון עם כשל בדיקה.";
  } else if (depSummary.errors > 0) {
    blockerNextAction = "בדוק את לוג ההפקה של dependencies.json לפי שגיאת ה־_meta הראשונה.";
  } else if (actionableProcs.length > 0) {
    blockerNextAction = "בדוק את התהליך הראשון ב־Processes ושנה את ה־verdict אם נפתר.";
  } else if (integrityRed > 0) {
    blockerNextAction = "פתח את OrchestratorIntegrityCard והרץ recover על הסיבה הראשונה.";
  } else if (pushAction > 0) {
    blockerNextAction = pushView.nextAction;
  }
  const blockerSource =
    "blockers.json + dependencies.json + workflows.json + processes.json + push_isolation.json + orchestrator_integrity.json";

  const categories: AttentionCategory[] = [
    {
      key: "owner_required",
      label: "דורש בעלים",
      count: ownerCount,
      severity: ownerSev,
      topReason: ownerReason,
      hasData: true,
      impact: ownerImpact,
      nextAction: ownerNextAction,
      source: ownerSource,
    },
    {
      key: "escalate",
      label: "להסלמה",
      count: escalateCount,
      severity: escalateSev,
      topReason: escalateReason,
      hasData: runtimeIssues !== null || queueRoutes !== null,
      impact: escalateImpact,
      nextAction: escalateNextAction,
      source: escalateSource,
    },
    {
      key: "autonomous_ready",
      label: "מוכן לביצוע אוטונומי",
      count: routeAutonomous,
      severity: autonomousSev,
      topReason: autonomousReason,
      hasData: queueRoutes !== null,
      impact: autonomousImpact,
      nextAction: autonomousNextAction,
      source: autonomousSource,
    },
    {
      key: "stale",
      label: "נתונים מתיישנים",
      count: staleCount,
      severity: staleSev,
      topReason: staleReason,
      hasData: freshness !== null,
      impact: staleImpact,
      nextAction: staleNextAction,
      source: staleSource,
    },
    {
      key: "blockers",
      label: "חוסמים פעילים",
      count: blockerCount,
      severity: blockerSev,
      topReason: blockerReason,
      hasData: true,
      impact: blockerImpact,
      nextAction: blockerNextAction,
      source: blockerSource,
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

const cellTrigger: CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  cursor: "pointer",
  boxSizing: "border-box",
};

const cellExpanded: CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px dashed currentColor",
  display: "grid",
  gap: 4,
};

const cellExpandedLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  opacity: 0.6,
  textTransform: "uppercase" as const,
};

const cellExpandedValue: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
};

const cellExpandedSource: CSSProperties = {
  fontSize: 11,
  fontFamily: "monospace",
  opacity: 0.7,
};

const emptyState: CSSProperties = {
  fontSize: 13,
  color: "#52525b",
  textAlign: "center" as const,
  padding: "4px 0 2px",
};

export function AttentionSummaryCard(props: AttentionSummaryInput) {
  const summary = attentionSummary(props);
  const [expanded, setExpanded] = useState<Set<AttentionCategoryKey>>(
    () => new Set(),
  );

  function toggle(key: AttentionCategoryKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
          const isExpanded = expanded.has(c.key);
          return (
            <li
              key={c.key}
              data-testid={`attention-summary-${c.key}`}
              style={{ ...cellBase, ...sev }}
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`attention-summary-${c.key}-details`}
                onClick={() => toggle(c.key)}
                data-testid={`attention-summary-${c.key}-toggle`}
                style={cellTrigger}
              >
                <div style={cellTop}>
                  <span>
                    {c.label}{" "}
                    <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </span>
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
              </button>
              {isExpanded && (
                <div
                  id={`attention-summary-${c.key}-details`}
                  data-testid={`attention-summary-${c.key}-details`}
                  style={cellExpanded}
                >
                  <div>
                    <div style={cellExpandedLabel}>השפעה</div>
                    <div
                      style={cellExpandedValue}
                      data-testid={`attention-summary-${c.key}-impact`}
                    >
                      {c.impact}
                    </div>
                  </div>
                  {c.nextAction && (
                    <div>
                      <div style={cellExpandedLabel}>פעולה הבאה</div>
                      <div
                        style={cellExpandedValue}
                        data-testid={`attention-summary-${c.key}-next-action`}
                      >
                        {c.nextAction}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={cellExpandedLabel}>מקור</div>
                    <div
                      style={cellExpandedSource}
                      data-testid={`attention-summary-${c.key}-source`}
                    >
                      {c.source}
                    </div>
                  </div>
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

