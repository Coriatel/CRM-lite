import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SafeSwarmCard, type SafeSwarmDoc } from "./SafeSwarmCard";
import { AttentionSummaryCard, BackToAttentionSummaryLink } from "./AttentionSummaryCard";
import {
  AttentionSynthesisCard,
  type AttentionSynthesisDoc,
} from "../components/ops/AttentionSynthesisCard";
import { HybridBlockersCard } from "../components/ops/HybridBlockersCard";

type ProjectRow = {
  key: string;
  repo?: string;
  canonical_path?: string;
  production?: boolean;
  production_url?: string | null;
  status?: string;
  phase?: string;
  owner_gate?: string[];
};

export type Blocker = {
  id: string;
  lane?: string;
  summary: string;
  needs?: string;
  since?: string;
  ref?: string;
};

type SessionRow = {
  file: string;
  date: string;
  projects?: string[];
};

type ProjectsDoc = Record<string, unknown> & {
  _meta?: { last_verified?: string };
};

type BlockersDoc = { blockers?: Blocker[] };
type SessionsDoc = { sessions?: SessionRow[]; owner_gates?: string[]; active_incidents?: string[] };

type HealthEndpoint = {
  name: string;
  url?: string;
  ok: boolean;
  status?: number;
  latency_ms?: number;
  required?: boolean;
  error?: string | null;
};

type LaneRow = {
  key: string;
  title?: string;
  primary_user?: string;
  doc?: string;
};

type LanesDoc = Record<string, unknown>;

type RecentMerge = {
  number: number;
  title: string;
  mergedAt: string;
  login: string;
  url: string;
};

type RecentMergesDoc = {
  _meta?: { fetched_at?: string; repo?: string; error?: string };
  merges?: RecentMerge[];
};

export type FreshnessDoc = {
  ts?: string;
  files?: Record<string, { mtime: string; age_seconds: number }>;
};

type ProcessRow = {
  pid: number;
  user?: string;
  command?: string;
  elapsed?: string;
  listening_on?: string;
  cwd?: string;
  verdict?: string;
  evidence?: string;
  report_state?: string;
  current_state?: string;
};

export type ProcessesDoc = {
  _meta?: { last_verified?: string; advisory?: boolean; note?: string };
  long_running_processes?: ProcessRow[];
};

// Filter out processes already resolved — only surface what still needs owner attention.
export function actionableProcesses(doc: ProcessesDoc | null): ProcessRow[] {
  const all = doc?.long_running_processes ?? [];
  return all.filter((p) => p.verdict && p.verdict !== "RESOLVED_NO_ACTION");
}

// Hebrew label for each known verdict — translated for the per-row pill so
// the operator doesn't have to read the producer's English enum.
export const PROCESS_VERDICT_LABEL_HE: Record<string, string> = {
  KILL_LIKELY_SAFE: "מועמד לסגירה",
  NEEDS_ATTACH: "צריך בדיקה",
  OWNER_DECISION: "החלטת בעלים",
  IGNORE_OR_DELETE: "ניקוי רקע",
  KEEP: "להשאיר",
};

export type ProcessesOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory: "kill_candidates" | "needs_attach_or_owner" | "background_only";
  headline: string;
  meaning: string;
  nextAction: string;
  killCount: number;
  attachCount: number;
  ownerDecisionCount: number;
  ignoreCount: number;
  keepCount: number;
  total: number;
};

// Pure classifier mirroring the #88/#89 contract — turns "N actionable
// long-running processes" into operator copy (is it safe / what does it
// mean / what can I do). Card hides itself when actionableProcesses === 0,
// so the classifier returns null only for that no-data case.
export function classifyProcessesForOperator(
  rows: ProcessRow[],
): ProcessesOperatorView | null {
  if (rows.length === 0) return null;
  let killCount = 0;
  let attachCount = 0;
  let ownerDecisionCount = 0;
  let ignoreCount = 0;
  let keepCount = 0;
  for (const r of rows) {
    switch (r.verdict) {
      case "KILL_LIKELY_SAFE":
        killCount++;
        break;
      case "NEEDS_ATTACH":
        attachCount++;
        break;
      case "OWNER_DECISION":
        ownerDecisionCount++;
        break;
      case "IGNORE_OR_DELETE":
        ignoreCount++;
        break;
      case "KEEP":
        keepCount++;
        break;
    }
  }
  let topCategory: ProcessesOperatorView["topCategory"];
  let severity: ProcessesOperatorView["severity"];
  let headline: string;
  let meaning: string;
  let nextAction: string;
  if (killCount > 0) {
    topCategory = "kill_candidates";
    severity = "action";
    headline = `תהליכים מועמדים לסגירה (${killCount})`;
    meaning =
      "מצאנו תהליך אחד או יותר שכבר לא צריך לרוץ ובטוח לסגור אותו. כל עוד הוא חי, הוא תופס משאבים על השרת.";
    nextAction =
      "סקור את הרשימה לפי סדר; אם הפקודה נראית הגיונית לסגירה — בצע kill ל־pid המתאים.";
  } else if (attachCount + ownerDecisionCount > 0) {
    topCategory = "needs_attach_or_owner";
    severity = "watch";
    headline = `תהליכים שדורשים בדיקה (${attachCount + ownerDecisionCount})`;
    meaning =
      "אין תהליך שברור שאפשר לסגור, אבל יש תהליכים שלא ברור אם להמשיך לתת להם לרוץ. הם לא חוסמים עבודה כרגע.";
    nextAction =
      "כשנוח — פתח את התהליך, וודא שהוא עדיין מבצע משהו רצוי, ואז סמן KEEP או KILL_LIKELY_SAFE.";
  } else {
    topCategory = "background_only";
    severity = "info";
    headline = `תהליכים ארוכים ברקע (${rows.length})`;
    meaning =
      "יש תהליכים שרצים זמן רב, אבל כולם מסומנים כ־keep או ניקוי רקע. אין מה לעשות מיד.";
    nextAction =
      "ניתן לדלג; הרשימה כאן בשביל הסבר־רקע אם תרצה לקצץ ניקוי רקע ידנית.";
  }
  return {
    severity,
    topCategory,
    headline,
    meaning,
    nextAction,
    killCount,
    attachCount,
    ownerDecisionCount,
    ignoreCount,
    keepCount,
    total: rows.length,
  };
}

export type PushIsolationSnapshot = {
  ts?: string;
  head?: string;
  window_commits?: number;
  trailed?: number;
  untrailed?: number;
  coverage_pct?: number;
  untrailed_by_author?: Record<string, number>;
  distinct_session_ids?: number;
};

// Anything older than this is "stale" — snapshot writer runs every few minutes.
export const PUSH_ISOLATION_STALE_HOURS = 2;

export function pushIsolationAgeHours(
  snap: PushIsolationSnapshot | null,
  now: Date = new Date(),
): number | null {
  if (!snap?.ts) return null;
  const t = Date.parse(snap.ts);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

export function isPushIsolationStale(
  snap: PushIsolationSnapshot | null,
  now: Date = new Date(),
): boolean {
  const age = pushIsolationAgeHours(snap, now);
  return age === null || age > PUSH_ISOLATION_STALE_HOURS;
}

export function hasPushIsolationSnapshot(snap: PushIsolationSnapshot | null): boolean {
  return !!snap && typeof snap.ts === "string" && snap.ts.length > 0;
}

// Operator-facing classification: turn the push-isolation snapshot into the
// three signals a daily operator needs — "is push-trailer coverage healthy?",
// "what does it mean?", "what should I do?". Mirrors #88/#89/#91/#92 pattern.
export type PushIsolationCategory =
  | "no_snapshot"
  | "stale_snapshot"
  | "low_coverage"
  | "partial_coverage"
  | "all_clear";

export type PushIsolationOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory: PushIsolationCategory;
  headline: string;
  meaning: string;
  nextAction: string;
};

const PUSH_ISOLATION_COPY: Record<
  PushIsolationCategory,
  { severity: "info" | "watch" | "action"; headline: string; meaning: string; nextAction: string }
> = {
  no_snapshot: {
    severity: "watch",
    headline: "אין נתוני בידוד פוש",
    meaning: "המערכת לא מצאה snapshot של בידוד פוש. ייתכן שהכותב לא פעיל.",
    nextAction: "בדוק שמסלול /ops-data/push-isolation-latest.json מתעדכן ושהשירות שכותב אותו רץ.",
  },
  stale_snapshot: {
    severity: "watch",
    headline: "נתוני בידוד הפוש לא רעננו לאחרונה",
    meaning: "ה-snapshot ישן מעבר לסף (2 שעות). ייתכן שהמדדים כאן לא משקפים פושים אחרונים.",
    nextAction: "בדוק שהכותב של push-isolation-latest.json פעיל; אין דחיפות אם זה חלון תחזוקה.",
  },
  low_coverage: {
    severity: "action",
    headline: "רוב הפושים האחרונים חסרים סימון בידוד session",
    meaning:
      "פחות מ-50% מהקומיטים בחלון האחרון נושאים trailer של בידוד. סשנים מקבילים עלולים לדרוס זה את עבודתו של זה.",
    nextAction:
      "סקור את רשימת ה-untrailed לפי מחבר; ודא שה-hook המקומי או ה-CI מכפה את ה-trailer לפני push.",
  },
  partial_coverage: {
    severity: "watch",
    headline: "חלק מהפושים האחרונים חסרים סימון בידוד session",
    meaning: "רוב הפושים מסומנים תקין, אבל יש סשנים שעדיין דוחפים בלי trailer של בידוד.",
    nextAction: "סקור את רשימת ה-untrailed לפי מחבר ובדוק אם הסשנים הללו צריכים לעדכן את ה-hook שלהם.",
  },
  all_clear: {
    severity: "info",
    headline: "בידוד פוש תקין",
    meaning: "כל הקומיטים בחלון האחרון נושאים trailer של בידוד session.",
    nextAction: "אין צורך לפעול.",
  },
};

export function classifyPushIsolationForOperator(
  snap: PushIsolationSnapshot | null,
  now: Date = new Date(),
): PushIsolationOperatorView {
  let topCategory: PushIsolationCategory;
  if (!hasPushIsolationSnapshot(snap)) {
    topCategory = "no_snapshot";
  } else if (isPushIsolationStale(snap, now)) {
    topCategory = "stale_snapshot";
  } else {
    const cov = typeof snap?.coverage_pct === "number" ? snap.coverage_pct : null;
    if (cov === null) {
      topCategory = "no_snapshot";
    } else if (cov < 50) {
      topCategory = "low_coverage";
    } else if (cov < 100) {
      topCategory = "partial_coverage";
    } else {
      topCategory = "all_clear";
    }
  }
  const copy = PUSH_ISOLATION_COPY[topCategory];
  return {
    severity: copy.severity,
    topCategory,
    headline: copy.headline,
    meaning: copy.meaning,
    nextAction: copy.nextAction,
  };
}

export type OrchestratorIntegrityDoc = {
  _meta?: { generated_at?: string; generated_default?: boolean; writer?: string; source?: string };
  registry?: {
    canonical_readable?: boolean;
    canonical_age_seconds?: number | null;
    heartbeat_ttl_seconds?: number;
    canonical_stale?: boolean;
    fallback_used?: boolean;
  };
  sessions?: {
    active_count?: number;
    stale_count?: number;
    ownerless_count?: number;
    ownerless_stale_count?: number;
    stale_ids?: string[];
  };
  merger?: {
    timer_active?: boolean;
    last_health_age_seconds?: number | null;
    last_error?: string | null;
    spool_depth_after?: number;
    merger_healthy?: boolean;
  };
  projection_drift?: {
    meta_manifest_stale?: boolean;
    drift_threshold_seconds?: number;
    drifted_files?: { file: string; delta_seconds: number }[];
  };
  runtime_issues?: {
    open_count?: number;
    by_severity?: Record<string, number>;
  };
  safe_parallelism?: { confidence?: "high" | "degraded" | "unknown"; reasons?: string[] };
  integrity_status?: { status?: "green" | "yellow" | "red"; reasons?: string[] };
};

// producer_contract_violations.json — the runtime's self-audit of which state
// projections have a live producer and which have drifted past their TTL. This is
// the root-cause layer behind the per-card freshness badges: a card is stale
// because the projection feeding it has no producer or its writer went quiet.
export type ProducerViolation = {
  code?: string;
  writer?: string;
  projection?: string;
  age_seconds?: number;
  threshold_seconds?: number;
  severity?: string;
  detail?: string;
};
export type ProducerViolationsDoc = {
  generated_at?: string;
  manifest_writers?: number;
  violation_count?: number;
  by_severity?: { error?: number; warn?: number; info?: number };
  by_code?: Record<string, number>;
  violations?: ProducerViolation[];
  status?: string;
};

export type ProducerHealthSummary = {
  writers: number;
  total: number;
  error: number;
  warn: number;
  info: number;
  actionable: ProducerViolation[];
  withoutProducer: ProducerViolation[];
};

// Pure summarizer extracted for unit testing. Defensive against the {} default
// envelope written when the vault projection is absent at build time.
export function summarizeProducerHealth(
  doc: ProducerViolationsDoc | null,
): ProducerHealthSummary | null {
  if (!doc) return null;
  const violations = Array.isArray(doc.violations) ? doc.violations : [];
  const sev = doc.by_severity ?? {};
  return {
    writers: doc.manifest_writers ?? 0,
    total: doc.violation_count ?? violations.length,
    error: sev.error ?? 0,
    warn: sev.warn ?? 0,
    info: sev.info ?? 0,
    actionable: violations.filter(
      (v) => v.severity === "error" || v.severity === "warn",
    ),
    withoutProducer: violations.filter(
      (v) => v.code === "PROJECTION_WITHOUT_PRODUCER",
    ),
  };
}

export type OrchestratorIntegritySummary = {
  status: "green" | "yellow" | "red" | "unknown";
  confidence: "high" | "degraded" | "unknown";
  reasons: string[];
  staleSessions: number;
  ownerlessStaleSessions: number;
  driftedFiles: number;
  mergerHealthy: boolean;
  fallbackUsed: boolean;
  highSeverityIssues: number;
};

// Pure summarizer extracted for unit testing. Defensive against missing
// nested fields — every consumer field is optional in OrchestratorIntegrityDoc.
export function summarizeOrchestratorIntegrity(
  doc: OrchestratorIntegrityDoc | null,
): OrchestratorIntegritySummary | null {
  if (!doc) return null;
  const status = doc.integrity_status?.status ?? "unknown";
  const confidence = doc.safe_parallelism?.confidence ?? "unknown";
  const sev = doc.runtime_issues?.by_severity ?? {};
  return {
    status,
    confidence,
    reasons: (doc.integrity_status?.reasons ?? []).slice(0, 6),
    staleSessions: doc.sessions?.stale_count ?? 0,
    ownerlessStaleSessions: doc.sessions?.ownerless_stale_count ?? 0,
    driftedFiles: (doc.projection_drift?.drifted_files ?? []).length,
    mergerHealthy: doc.merger?.merger_healthy ?? false,
    fallbackUsed: doc.registry?.fallback_used ?? false,
    highSeverityIssues: (sev.high ?? 0) + (sev.critical ?? 0),
  };
}

// Operator-facing classification: turn the technical summary into the three
// signals a daily operator actually needs — "is it safe?", "what does it
// mean?", "what should I do?". Pure function so the mapping is unit-testable
// and the rendering component stays thin.
export type IntegrityCategory =
  | "merger_unhealthy"
  | "high_severity_issue"
  | "orphan_session"
  | "stale_projection"
  | "missing_canonical_source"
  | "degraded_confidence"
  | "safe_degraded"
  | "all_clear"
  | "unknown";

export type IntegrityOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory: IntegrityCategory;
  categories: IntegrityCategory[];
  headline: string;
  meaning: string;
  nextAction: string;
};

const INTEGRITY_COPY: Record<
  IntegrityCategory,
  { severity: "info" | "watch" | "action"; headline: string; meaning: string; nextAction: string }
> = {
  merger_unhealthy: {
    severity: "action",
    headline: "מתווך הסנכרון לא תקין",
    meaning: "השירות שמסנכרן מצב בין סשנים מדווח על תקלה. נתונים חדשים עלולים לא להתעדכן.",
    nextAction: "בדוק יומני שירות mn-os-agent-registry-merger ופנה לבעלים אם הבעיה נמשכת.",
  },
  high_severity_issue: {
    severity: "action",
    headline: "תקלה פתוחה דורשת טיפול",
    meaning: "תקלת runtime ברמת חומרה גבוהה פתוחה במערכת.",
    nextAction: "פתח את רשימת התקלות הפתוחות וטפל לפי סדר חומרה.",
  },
  orphan_session: {
    severity: "watch",
    headline: "סשן יתום ברקע",
    meaning: "קיים סשן שלא דיווח על חיים זמן מה ואין לו בעלים פעיל. בדרך כלל לא מסוכן, אבל יכול להחזיק משאבים.",
    nextAction: "בדוק אם הסשן עדיין רץ; אם לא — הוא ינוקה אוטומטית בתוך 7 ימים.",
  },
  stale_projection: {
    severity: "watch",
    headline: "מידע מסוים לא עודכן לאחרונה",
    meaning: "המערכת מזהה שחלק מהקבצים שמציגים מצב לא רעננו במשך זמן ארוך. ניתן להמשיך לעבוד, אך חלק מהמידע ב-/ops עשוי להיות לא עדכני.",
    nextAction: "בדוק אם קיימים סשנים פעילים או שירותים שלא סונכרנו; אין דחיפות מיידית.",
  },
  missing_canonical_source: {
    severity: "watch",
    headline: "מקור המידע הראשי לא נגיש",
    meaning: "לא הצלחנו לקרוא את מאגר הסשנים הקנוני. המערכת משתמשת בעותק נגזר במקום.",
    nextAction: "התצוגה עדיין מהימנה לרוב הצרכים; פנה לבעלים אם המצב נמשך מעבר לכמה שעות.",
  },
  degraded_confidence: {
    severity: "watch",
    headline: "המערכת פעילה במצב מוגבל",
    meaning: "ביטחון המקבילות ירוד — מספר אותות חלקיים מצטברים יחד.",
    nextAction: "ניתן להמשיך לעבוד; הימנע מהפעלת סשנים מקבילים נוספים עד שהמצב יתייצב.",
  },
  safe_degraded: {
    severity: "info",
    headline: "המערכת פעילה — קריאה מעותק נגזר",
    meaning: "המקור הראשי לא נגיש אבל העותק הנגזר מעודכן והשירותים תקינים. אפשר להמשיך לעבוד כרגיל.",
    nextAction: "אין צורך לפעול. מעקב פסיבי בלבד.",
  },
  all_clear: {
    severity: "info",
    headline: "המערכת תקינה",
    meaning: "כל האותות ירוקים.",
    nextAction: "אין צורך לפעול.",
  },
  unknown: {
    severity: "watch",
    headline: "מצב המערכת לא ידוע",
    meaning: "נתוני שלמות התזמורת לא זמינים כרגע.",
    nextAction: "רענן את הדף; אם המצב נמשך, בדוק שמסלול /ops-data מגיב.",
  },
};

export function classifyIntegrityForOperator(
  sum: OrchestratorIntegritySummary | null,
): IntegrityOperatorView | null {
  if (!sum) return null;
  const cats: IntegrityCategory[] = [];
  if (!sum.mergerHealthy && sum.status !== "unknown") cats.push("merger_unhealthy");
  if (sum.highSeverityIssues > 0) cats.push("high_severity_issue");
  if (sum.ownerlessStaleSessions > 0) cats.push("orphan_session");
  if (sum.driftedFiles > 0) cats.push("stale_projection");
  if (sum.fallbackUsed) {
    // "safe_degraded" is the calmer label when the only issue is that we
    // fell back to the derived projection, the merger is fine, and nothing
    // else is screaming. Otherwise call it what it is: source missing.
    const onlyFallback =
      sum.mergerHealthy && sum.driftedFiles === 0 && sum.highSeverityIssues === 0 &&
      sum.ownerlessStaleSessions === 0;
    cats.push(onlyFallback ? "safe_degraded" : "missing_canonical_source");
  }
  if (cats.length === 0) {
    if (sum.status === "green" && sum.confidence === "high") cats.push("all_clear");
    else if (sum.status === "unknown" && sum.confidence === "unknown") cats.push("unknown");
    else if (sum.confidence === "degraded") cats.push("degraded_confidence");
    else cats.push("unknown");
  }
  const topCategory = cats[0];
  const copy = INTEGRITY_COPY[topCategory];
  return {
    severity: copy.severity,
    topCategory,
    categories: cats,
    headline: copy.headline,
    meaning: copy.meaning,
    nextAction: copy.nextAction,
  };
}

type ActiveSession = {
  id: string;
  lane?: string | null;
  project?: string | null;
  agent?: string | null;
  model?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  terminal_state?: string | null;
  current_slice?: string | null;
  slices_completed?: number | null;
  pr?: string | null;
  next?: string | null;
  lifecycle?: "active" | "stale" | "completed" | null;
  owned_paths_globs?: string[] | null;
};

type ActiveSessionsDoc = {
  _meta?: {
    ts?: string;
    source_mtime?: string;
    source_age_seconds?: number;
    heartbeat_ttl_seconds?: number;
    registry_stale?: boolean;
    error?: string;
  };
  active?: ActiveSession[];
  recent_completed?: ActiveSession[];
};

type DependencyChecks = {
  pass?: number;
  fail?: number;
  pending?: number;
  total?: number;
};

type Dependency = {
  dependency_id: string;
  type?: string;
  repo?: string;
  pr_number?: number;
  title?: string;
  state?: string;
  merge_state?: string | null;
  checks_summary?: DependencyChecks;
  head_ref?: string | null;
  base_ref?: string | null;
  touched_files?: string[];
  resolved?: boolean;
  last_checked_at?: string;
};

export type DependenciesDoc = {
  _meta?: {
    schema_version?: number;
    generated_at?: string;
    generator?: string;
    repos?: string[];
    tracked_prs?: string[];
    errors?: string[];
  };
  dependencies?: Dependency[];
};

export function dependenciesSummary(doc: DependenciesDoc | null): {
  open: number;
  resolved: number;
  total: number;
  errors: number;
  failingChecks: number;
} {
  const deps = doc?.dependencies ?? [];
  let open = 0;
  let resolved = 0;
  let failingChecks = 0;
  for (const d of deps) {
    if (d.resolved) resolved += 1;
    else open += 1;
    if ((d.checks_summary?.fail ?? 0) > 0 && !d.resolved) failingChecks += 1;
  }
  return {
    open,
    resolved,
    total: deps.length,
    errors: doc?._meta?.errors?.length ?? 0,
    failingChecks,
  };
}

export type DependenciesOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory:
    | "collection_errors"
    | "failing_checks"
    | "open_only"
    | "all_resolved";
  headline: string;
  meaning: string;
  nextAction: string;
  open: number;
  resolved: number;
  failingChecks: number;
  errors: number;
};

// Pure classifier mirroring the #88/#89 contract — turns the dependencies
// summary into operator copy (is it safe / what does it mean / what can
// I do). Returns null only when the card hides itself (no deps + no
// collection errors).
export function classifyDependenciesForOperator(
  summary: ReturnType<typeof dependenciesSummary>,
): DependenciesOperatorView | null {
  const { open, resolved, failingChecks, errors, total } = summary;
  if (total === 0 && errors === 0) return null;
  let topCategory: DependenciesOperatorView["topCategory"];
  let severity: DependenciesOperatorView["severity"];
  let headline: string;
  let meaning: string;
  let nextAction: string;
  if (errors > 0) {
    topCategory = "collection_errors";
    severity = "action";
    headline = `שגיאות באיסוף תלויות (${errors})`;
    meaning =
      "המעקב אחרי PR תלוי לא הצליח לקרוא ממקור אחד או יותר. הספירה הנוכחית עלולה להיות לא מלאה.";
    nextAction =
      "בדוק את לוג ההפקה של dependencies.json לפי שגיאת ה־_meta הראשונה, ואחר־כך הרץ שוב.";
  } else if (failingChecks > 0) {
    topCategory = "failing_checks";
    severity = "action";
    headline = `תלויות עם כשל בבדיקות (${failingChecks})`;
    meaning =
      "PR אחד או יותר שתלוי עליהם slice הבא נכשל ב־CI. אסור לבסס עליהם merge עד שיתוקנו.";
    nextAction =
      "פתח את ה־PR הראשון עם כשל בדיקה, התחל מה־first failing check ותקן אותה לפני שעוברים הלאה.";
  } else if (open > 0) {
    topCategory = "open_only";
    severity = "watch";
    headline = `תלויות פתוחות במעקב (${open})`;
    meaning =
      "יש PR אחד או יותר במצב פתוח שאנחנו מחכים להם. ה־CI שלהם ירוק; אין מה לעשות חוץ ממעקב.";
    nextAction =
      "אפשר להמשיך לעבוד; ה־poll יתעדכן ויעדכן את הסטטוס כשהם יתמזגו.";
  } else {
    topCategory = "all_resolved";
    severity = "info";
    headline = `כל התלויות נסגרו (${resolved})`;
    meaning =
      "כל ה־PR שעקבנו אחריהם נסגרו ואין כשלים גלויים. הסליסים שתלויים בהם משוחררים.";
    nextAction =
      "אין צורך בפעולה; ניתן להתחיל את ה־slice שהיה תלוי בהם.";
  }
  return {
    severity,
    topCategory,
    headline,
    meaning,
    nextAction,
    open,
    resolved,
    failingChecks,
    errors,
  };
}

type MetaDoc = {
  _meta?: { schema_version?: number; regenerated_at?: string };
};

type Workflow = {
  workflow_key: string;
  name?: string;
  source_system?: string;
  enabled?: boolean | string;
  owner?: string;
  criticality?: string;
  environment?: string;
  health?: string;
  trigger_type?: string;
  trigger_detail?: string;
  last_run_at?: string;
  last_success_at?: string;
  last_failure_at?: string;
  last_checked_at?: string;
  notes?: string;
};

export type WorkflowsDoc = {
  _meta?: {
    schema_version?: number;
    generated_at?: string;
    source?: string;
    generator?: string;
    row_count?: number;
  };
  workflows?: Workflow[];
};

// Workflow health values we treat as "actively wrong" (failing now or recently broken).
// Per concepts/mn-os-runtime-state.md: failing/broken_confirmed = STOP; broken_suspected = WARN.
const FAILING_HEALTH = new Set(["failing", "broken_confirmed", "broken_suspected"]);
// "Stale" = enabled but the registry's snapshot says we don't actually know its state.
// Surfaced separately because the operator action is "go re-verify", not "go fix".
const STALE_HEALTH = new Set(["stale", "unknown"]);

function isEnabled(w: Workflow): boolean {
  // CSV → JSON converter emits booleans for true/false; defensive against string passthrough.
  if (w.enabled === true) return true;
  if (w.enabled === false) return false;
  return (w.enabled ?? "").toString().toLowerCase() === "true";
}

export function workflowsAttention(doc: WorkflowsDoc | null): {
  failing: Workflow[];
  stale: Workflow[];
  productionCriticalFailing: number;
  disabled: number;
  deprecated: number;
  healthy: number;
  total: number;
} {
  const rows = doc?.workflows ?? [];
  const failing: Workflow[] = [];
  const stale: Workflow[] = [];
  let prodCritFail = 0;
  let disabled = 0;
  let deprecated = 0;
  let healthy = 0;
  for (const w of rows) {
    const h = (w.health ?? "").toLowerCase();
    if (h === "deprecated") {
      deprecated += 1;
      continue;
    }
    if (h === "disabled" || !isEnabled(w)) {
      disabled += 1;
      continue;
    }
    if (FAILING_HEALTH.has(h)) {
      failing.push(w);
      if ((w.criticality ?? "").toLowerCase() === "production_critical") prodCritFail += 1;
      continue;
    }
    if (STALE_HEALTH.has(h)) {
      stale.push(w);
      continue;
    }
    if (h === "healthy") healthy += 1;
  }
  // Sort failing rows by criticality (prod_critical first) then by key
  const critRank: Record<string, number> = {
    production_critical: 0,
    important: 1,
    normal: 2,
    low: 3,
    unknown: 4,
  };
  failing.sort((a, b) => {
    const r = (critRank[(a.criticality ?? "").toLowerCase()] ?? 5) - (critRank[(b.criticality ?? "").toLowerCase()] ?? 5);
    if (r !== 0) return r;
    return a.workflow_key.localeCompare(b.workflow_key);
  });
  stale.sort((a, b) => a.workflow_key.localeCompare(b.workflow_key));
  return {
    failing,
    stale,
    productionCriticalFailing: prodCritFail,
    disabled,
    deprecated,
    healthy,
    total: rows.length,
  };
}

export type WorkflowsOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory:
    | "prod_critical_failing"
    | "failing_only"
    | "stale_only";
  headline: string;
  meaning: string;
  nextAction: string;
  failingCount: number;
  staleCount: number;
  productionCriticalFailing: number;
};

// Pure classifier mirroring the #88/#89 contract — turns "N failing / N stale
// workflows" into operator copy (is it safe / what does it mean / what can
// I do). WorkflowsCard hides itself when failing.length + stale.length === 0,
// so the classifier returns null only for that no-attention case.
export function classifyWorkflowsForOperator(
  att: ReturnType<typeof workflowsAttention>,
): WorkflowsOperatorView | null {
  const failingCount = att.failing.length;
  const staleCount = att.stale.length;
  if (failingCount === 0 && staleCount === 0) return null;
  const prodCrit = att.productionCriticalFailing;
  let topCategory: WorkflowsOperatorView["topCategory"];
  let severity: WorkflowsOperatorView["severity"];
  let headline: string;
  let meaning: string;
  let nextAction: string;
  if (prodCrit > 0) {
    topCategory = "prod_critical_failing";
    severity = "action";
    headline = `תזרים קריטי לפרודקשן נכשל (${prodCrit})`;
    meaning =
      "לפחות תזרים אחד שמסומן כקריטי לפרודקשן נמצא במצב כשל. סביר שיש פגיעה בפעולות שמשתמשים תלויים בהן.";
    nextAction =
      "פתח את התזרים הקריטי ברשימה, בדוק את הריצה האחרונה, וטפל בכשל לפני שעוברים לפריט הבא.";
  } else if (failingCount > 0) {
    topCategory = "failing_only";
    severity = "action";
    headline = `תזרימים בכשל (${failingCount})`;
    meaning =
      "תזרימים פעילים נכשלו אך אין כשל בתזרים שסומן קריטי לפרודקשן. הפעולה הרגילה שלהם לא רצה כרגע.";
    nextAction =
      "עבור על התזרימים שנכשלו לפי סדר חומרת ה־criticality וטפל בהם — אפשר לרוץ עד תחתית הרשימה.";
  } else {
    topCategory = "stale_only";
    severity = "watch";
    headline = `תזרימים במצב לא ידוע (${staleCount})`;
    meaning =
      "אין כשלים פעילים, אבל יש תזרימים שלא דיווחו בריאות לאחרונה. ייתכן שהם רצים, וייתכן שהם תקועים בשקט.";
    nextAction =
      "סקור את הרשימה כשנוח כדי לוודא שהם רצים בפועל; ניתן להמשיך לעבוד בינתיים.";
  }
  return {
    severity,
    topCategory,
    headline,
    meaning,
    nextAction,
    failingCount,
    staleCount,
    productionCriticalFailing: prodCrit,
  };
}

// Verifier status enum from build-handoffs-index --include-verifier.
// drift/error are owner-actionable; ok/ancestor/not_applicable/missing_state are not.
export type VerifierStatus =
  | "ok"
  | "ancestor"
  | "drift"
  | "missing_state"
  | "not_applicable"
  | "error";

type HandoffEntry = {
  // Canonical fields across schema versions:
  handoff_path?: string;
  path?: string;
  user?: string;
  written_at?: string;
  mtime?: string;
  repo_path?: string | null;
  branch?: string | null;
  head?: string | null;
  scope?: string | null;
  verifier_status?: VerifierStatus | null;
  verifier_message?: string | null;
  verifier_ahead_n?: number | null;
  verified?: boolean;
  // terminal_state is emitted by build-handoffs-index when the source file
  // declares `type:` inside a ```yaml stop_reason``` block, OR by the
  // agent_registry projection. Values seen in the wild:
  // SHIPPED, BLOCKED, HANDOFF, HANDOFF_READY, ABANDONED_SAFELY, CHECKPOINT,
  // CLEAN_SLICE_BOUNDARY, CLEAN_INVARIANT_BOUNDARY, USER_CLEAR_BEFORE_RESUME.
  terminal_state?: string | null;
};

type HandoffsIndexDoc = {
  _meta?: { ts?: string; count?: number };
  generated_at?: string;
  index_version?: number | string;
  entries?: HandoffEntry[];
  handoffs?: HandoffEntry[];
};

// Surface handoffs whose verifier reported drift/error — the only states that
// actually need owner attention (stale head, malformed yaml, verifier crash).
// Falls back to legacy verified=false when verifier_status absent.
export function actionableHandoffs(doc: HandoffsIndexDoc | null): HandoffEntry[] {
  const all = doc?.entries ?? doc?.handoffs ?? [];
  return all
    .filter((h) => {
      if (h.verifier_status) {
        return h.verifier_status === "drift" || h.verifier_status === "error";
      }
      return h.verified === false;
    })
    .sort((a, b) => {
      const ta = b.written_at ?? b.mtime ?? "";
      const tb = a.written_at ?? a.mtime ?? "";
      return ta.localeCompare(tb);
    });
}

export function handoffDisplayPath(h: HandoffEntry): string {
  const p = h.handoff_path ?? h.path ?? "";
  return p.replace(/^\/home\/([^/]+)\/work\/handoffs\//, "$1/").replace(/^\/home\/([^/]+)\//, "$1/");
}

export type TerminalBucket =
  | "shipped"
  | "handoff_pending"
  | "blocked"
  | "checkpoint"
  | "abandoned"
  | "other"
  | "unknown";

export type RuntimeContinuitySummary = {
  total: number;
  ok: number; // ok + ancestor — verifier is happy
  drift: number;
  error: number;
  missing: number; // missing_state or not_applicable
  unknown: number; // verifier_status absent (legacy or unverified entry)
  latestWrittenAt: string | null;
  health: "ok" | "warn" | "fail" | "empty";
  terminalBuckets: Record<TerminalBucket, number>;
  terminalDeclared: number; // count with any non-null terminal_state
  latestPerBucket: Partial<Record<TerminalBucket, string>>; // ISO timestamp per bucket
};

// Map a raw terminal_state string from handoffs_index into a coarse UI bucket.
// Conservative: unknown values fall into "other" (not "unknown") so they remain
// visible — "unknown" is reserved for entries with no terminal_state at all.
export function bucketTerminalState(s: string | null | undefined): TerminalBucket {
  if (s == null || s === "") return "unknown";
  const u = s.toUpperCase().replace(/[\s-]+/g, "_");
  if (u === "SHIPPED") return "shipped";
  if (u === "HANDOFF" || u === "HANDOFF_READY") return "handoff_pending";
  if (u === "BLOCKED") return "blocked";
  if (u === "ABANDONED_SAFELY" || u === "ABANDONED") return "abandoned";
  if (
    u === "CHECKPOINT" ||
    u === "CLEAN_SLICE_BOUNDARY" ||
    u === "CLEAN_INVARIANT_BOUNDARY"
  ) {
    return "checkpoint";
  }
  return "other";
}

// Roll up handoff verifier states into a single mobile-friendly health view.
// "warn" if any drift; "fail" if any error (error dominates warn).
export function runtimeContinuitySummary(
  doc: HandoffsIndexDoc | null,
): RuntimeContinuitySummary {
  const all = doc?.entries ?? doc?.handoffs ?? [];
  let ok = 0;
  let drift = 0;
  let error = 0;
  let missing = 0;
  let unknown = 0;
  let latest: string | null = null;
  for (const h of all) {
    const s = h.verifier_status;
    if (s === "ok" || s === "ancestor") ok++;
    else if (s === "drift") drift++;
    else if (s === "error") error++;
    else if (s === "missing_state" || s === "not_applicable") missing++;
    else unknown++;
    const t = h.written_at ?? h.mtime ?? null;
    if (t && (latest === null || t > latest)) latest = t;
  }
  const total = all.length;
  const health: RuntimeContinuitySummary["health"] =
    total === 0 ? "empty" : error > 0 ? "fail" : drift > 0 ? "warn" : "ok";
  const terminalBuckets: Record<TerminalBucket, number> = {
    shipped: 0,
    handoff_pending: 0,
    blocked: 0,
    checkpoint: 0,
    abandoned: 0,
    other: 0,
    unknown: 0,
  };
  let terminalDeclared = 0;
  const latestPerBucket: Partial<Record<TerminalBucket, string>> = {};
  for (const h of all) {
    const b = bucketTerminalState(h.terminal_state);
    terminalBuckets[b]++;
    if (b !== "unknown") terminalDeclared++;
    const t = h.written_at ?? h.mtime ?? null;
    if (t) {
      const cur = latestPerBucket[b];
      if (cur == null || t > cur) latestPerBucket[b] = t;
    }
  }
  return {
    total,
    ok,
    drift,
    error,
    missing,
    unknown,
    latestWrittenAt: latest,
    health,
    terminalBuckets,
    terminalDeclared,
    latestPerBucket,
  };
}

// Aggregated runtime continuity projection emitted by
// /srv/ops-vault/automation-registry/scripts/project_runtime_continuity.py.
// Direct counts from continuity-events/*.jsonl, not derived from handoffs_index.
export type RuntimeContinuityDoc = {
  _meta?: {
    ts?: string;
    window_days?: number;
    events_scanned?: number;
    files_scanned?: number;
  };
  totals?: {
    sessions?: number;
    continuation_decisions?: number;
    stops?: number;
    owner_gates?: number;
    shipped?: number;
    handoffs?: number;
  };
  stops_by_reason?: Record<string, number>;
  owner_gates_by_type?: Record<string, number>;
  possible_false_stops?: Array<{
    session_id?: string;
    ts?: string;
    reason?: string;
    metric_cited?: boolean;
  }>;
};

export type RuntimeContinuityMetrics = {
  windowDays: number;
  sessions: number;
  continuations: number;
  stops: number;
  ownerGates: number;
  shipped: number;
  possibleFalseStops: number;
  topStopReason: { reason: string; count: number } | null;
  topOwnerGateType: { type: string; count: number } | null;
  generatedAt: string | null;
  hasData: boolean;
};

export function runtimeContinuityMetrics(
  doc: RuntimeContinuityDoc | null,
): RuntimeContinuityMetrics {
  const t = doc?.totals ?? {};
  const stopsBy = doc?.stops_by_reason ?? {};
  const gatesBy = doc?.owner_gates_by_type ?? {};
  const topEntry = (
    rec: Record<string, number>,
  ): [string, number] | null => {
    let best: [string, number] | null = null;
    for (const [k, v] of Object.entries(rec)) {
      if (!best || v > best[1]) best = [k, v];
    }
    return best;
  };
  const topStop = topEntry(stopsBy);
  const topGate = topEntry(gatesBy);
  const sessions = t.sessions ?? 0;
  const continuations = t.continuation_decisions ?? 0;
  const stops = t.stops ?? 0;
  const ownerGates = t.owner_gates ?? 0;
  const shipped = t.shipped ?? 0;
  const possibleFalseStops = doc?.possible_false_stops?.length ?? 0;
  return {
    windowDays: doc?._meta?.window_days ?? 7,
    sessions,
    continuations,
    stops,
    ownerGates,
    shipped,
    possibleFalseStops,
    topStopReason: topStop ? { reason: topStop[0], count: topStop[1] } : null,
    topOwnerGateType: topGate ? { type: topGate[0], count: topGate[1] } : null,
    generatedAt: doc?._meta?.ts ?? null,
    hasData:
      sessions + continuations + stops + ownerGates + shipped > 0 ||
      possibleFalseStops > 0,
  };
}

export type RuntimeIssue = {
  id: string;
  file?: string | null;
  title?: string | null;
  date?: string | null;
  severity?: string | null;
  disposition?: string | null;
  reporter?: string | null;
};

export type RuntimeIssuesDoc = {
  _meta?: { schema_version?: number; last_verified?: string; advisory?: boolean };
  issues?: RuntimeIssue[];
};

export type SeverityLevel = "high" | "medium" | "low" | "unknown";

// severity is free-form ("medium — does not block execution"); parse the prefix word.
export function parseSeverity(s?: string | null): SeverityLevel {
  if (!s) return "unknown";
  const head = s.trim().toLowerCase().split(/[\s\-——(:]/, 1)[0];
  if (head === "high" || head === "critical") return "high";
  if (head === "medium" || head === "med") return "medium";
  if (head === "low") return "low";
  return "unknown";
}

// Issues with disposition that explicitly closes them are hidden; everything
// else is surfaced (advisory cards stay loud until owner closes them).
export function openRuntimeIssues(doc: RuntimeIssuesDoc | null): RuntimeIssue[] {
  const all = doc?.issues ?? [];
  const order: Record<SeverityLevel, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
  return all
    .filter((i) => {
      const d = (i.disposition ?? "").toLowerCase();
      return !d.startsWith("resolved") && !d.startsWith("closed") && !d.startsWith("wontfix");
    })
    .slice()
    .sort((a, b) => {
      const sa = order[parseSeverity(a.severity)];
      const sb = order[parseSeverity(b.severity)];
      if (sa !== sb) return sa - sb;
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
}

// Operator-readable severity label for the per-row pill. The raw English
// severity words leak the producer schema into the operator surface; rendering
// Hebrew matches the rest of the card's voice.
export const SEVERITY_LABEL_HE: Record<SeverityLevel, string> = {
  high: "חמורה",
  medium: "בינונית",
  low: "נמוכה",
  unknown: "לא ידוע",
};

export type RuntimeIssuesOperatorView = {
  severity: "info" | "watch" | "action";
  headline: string;
  meaning: string;
  nextAction: string;
  openCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  unknownCount: number;
};

// Pure classifier mirroring the #88 contract — turns "N open runtime issues
// by severity" into the three operator signals (is it safe / what does it
// mean / what can I do). Card hides itself when openCount === 0, so the
// classifier returns null only for the explicit no-data case.
export function classifyRuntimeIssuesForOperator(
  rows: RuntimeIssue[],
): RuntimeIssuesOperatorView | null {
  if (rows.length === 0) return null;
  let highCount = 0, mediumCount = 0, lowCount = 0, unknownCount = 0;
  for (const r of rows) {
    const s = parseSeverity(r.severity);
    if (s === "high") highCount++;
    else if (s === "medium") mediumCount++;
    else if (s === "low") lowCount++;
    else unknownCount++;
  }
  const openCount = rows.length;
  let severity: "info" | "watch" | "action";
  let headline: string;
  let meaning: string;
  let nextAction: string;
  if (highCount > 0) {
    severity = "action";
    headline = `תקלות חמורות פתוחות (${highCount})`;
    meaning = "לפחות תקלת runtime אחת ברמת חומרה גבוהה דורשת בדיקה. עלולה לחסום סשנים או לפגוע באמינות התצוגה.";
    nextAction = "פתח את הרשימה לפי סדר חומרה וטפל בתקלה החמורה ביותר ראשונה.";
  } else if (mediumCount > 0) {
    severity = "watch";
    headline = `תקלות פתוחות לטיפול (${openCount})`;
    meaning = "אין תקלות חוסמות, אבל קיימות תקלות ברמה בינונית שמחכות להחלטה (להעלות חומרה, להוריד או לסגור).";
    nextAction = "סקור את הרשימה כשנוח; ניתן להמשיך לעבוד בינתיים.";
  } else {
    severity = "info";
    headline = `ייעוצים פתוחים ברקע (${openCount})`;
    meaning = "כל התקלות הפתוחות הן ייעוץ ברמה נמוכה — לא חוסמות פעילות.";
    nextAction = "אפשר לסקור כשנוח; חלקן ייסגרו אוטומטית כשהסיבה תיעלם.";
  }
  return {
    severity, headline, meaning, nextAction,
    openCount, highCount, mediumCount, lowCount, unknownCount,
  };
}

// Operational queue — unified routable view across runtime producers.
// Schema: /srv/ops-vault/state/queue_item.schema.json
// Contract: /srv/ops-vault/concepts/operational-queue.md
export type OperationalQueueSeverity = "info" | "low" | "medium" | "high" | "critical";
export type OperationalQueueType =
  | "runtime_issue"
  | "blocker"
  | "degraded_workflow"
  | "failed_endpoint"
  | "failed_unit"
  | "false_stop"
  | "owner_gate"
  | "stale_projection"
  | "verifier_failure"
  | "handoff_ready"
  | "blocked_session";

export type OperationalQueueItem = {
  id: string;
  type: OperationalQueueType;
  severity: OperationalQueueSeverity;
  lane?: string | null;
  source: { producer: string; ref: string; url?: string | null };
  created_at: string;
  freshness: "fresh" | "stale" | "unknown";
  retryable: boolean;
  owner_gate: boolean;
  owner_gate_kind?: string | null;
  continuation_candidate: boolean;
  blocker_type?: string | null;
  suggested_action: string;
  assigned_agent?: string | null;
  session_reference?: string | null;
  repo_path?: string | null;
  reversibility: "reversible" | "risky" | "irreversible" | "unknown";
  operational_priority: number;
  summary: string;
};

export type OperationalQueueDoc = {
  _meta?: {
    schema_version?: number;
    materialized_at?: string;
    producers?: string[];
    item_count?: number;
  };
  queue?: OperationalQueueItem[];
};

export type QueueRouteDecision = "autonomous" | "owner" | "escalate" | "defer";
export type QueueRoute = { decision: QueueRouteDecision; reason: string; since?: string };
export type QueueRoutesDoc = {
  _meta?: {
    schema_version?: number;
    routed_at?: string;
    source_queue?: string;
    item_count?: number;
  };
  summary?: Record<QueueRouteDecision, number>;
  routes?: Record<string, QueueRoute>;
};

// Execution-receipt projection — schema:
// /srv/ops-vault/state/queue_receipt.schema.json
// Read-only consumer view: only the fields the card surfaces.
export type QueueReceiptOutcome =
  | "planned"
  | "started"
  | "succeeded"
  | "failed"
  | "aborted"
  | "skipped";

export type QueueReceipt = {
  id?: string;
  item_id: string;
  outcome: QueueReceiptOutcome;
  retry_count: number;
  dry_run: boolean;
  started_at?: string | null;
  finished_at?: string | null;
  notes?: string;
};

// queue_plan.json / queue_receipts.json wire shape — accept either
// {receipts:[...]} (what the planner emits) or a bare array (forward-compat
// with a simpler future writer). Anything else is treated as empty.
export type QueueReceiptDoc =
  | { _meta?: Record<string, unknown>; receipts?: QueueReceipt[] }
  | QueueReceipt[]
  | null;

export function parseReceipts(doc: QueueReceiptDoc): QueueReceipt[] {
  if (!doc) return [];
  const arr = Array.isArray(doc) ? doc : doc.receipts;
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (r): r is QueueReceipt =>
      !!r && typeof r === "object" && typeof r.item_id === "string" && typeof r.outcome === "string",
  );
}

// Per item, pick the most-recent non-planned receipt (executor took action).
// Tie-breaker: highest retry_count, then finished_at, then started_at.
export function latestReceiptByItemId(
  receipts: QueueReceipt[],
): Record<string, QueueReceipt> {
  const out: Record<string, QueueReceipt> = {};
  for (const r of receipts) {
    if (r.outcome === "planned") continue;
    const cur = out[r.item_id];
    if (!cur) {
      out[r.item_id] = r;
      continue;
    }
    const score = (x: QueueReceipt) =>
      `${String(x.retry_count).padStart(6, "0")}|${x.finished_at ?? ""}|${x.started_at ?? ""}`;
    if (score(r) > score(cur)) out[r.item_id] = r;
  }
  return out;
}

// Planned receipts are dry-run proposals (one per autonomous item). The card
// shows the count + a per-item indicator, so consumers want both.
export function plannedReceiptItemIds(receipts: QueueReceipt[]): Set<string> {
  const out = new Set<string>();
  for (const r of receipts) {
    if (r.outcome === "planned") out.add(r.item_id);
  }
  return out;
}

export type ExecutionStatusCounts = {
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
};

// Shape contract:
//   ops-vault projects/merkaz-neshama-os/lane-a/management-cockpit-v0.md §4
// Operator-facing projection on top of the operational queue. v0 is structural,
// not content-bearing: no PII, no donor names, no amounts.
export type ManagementCockpitGroupStatus = "defined" | "active" | "paused" | "archived";

export type ManagementCockpitQueueMembership = {
  mode?: "not_configured" | "wired" | string;
};

export type ManagementCockpitGroup = {
  id: string;
  display_name: string;
  status?: ManagementCockpitGroupStatus;
  summary?: ManagementCockpitSummary;
  last_activity_at?: string | null;
  queue_membership?: ManagementCockpitQueueMembership;
  operator?: string;
};

export type ManagementCockpitInboxItem = {
  id: string;
  group_id: string;
  lifecycle:
    | "new"
    | "assigned"
    | "in_progress"
    | "waiting_on_owner"
    | "waiting_on_rabbi"
    | "blocked"
    | "done";
  urgency_band?: "today" | "this_week" | "later";
  gate_role?: "owner" | "rabbi" | null;
  summary_text?: string;
  ingest_ts?: string;
};

export type ManagementCockpitSummary = {
  groups: number;
  open_items: number;
  blocked: number;
  needs_owner: number;
  needs_rabbi: number;
};

export type ManagementCockpitDoc = {
  _meta?: {
    schema_version?: string;
    source?: string;
    writer?: string;
    source_missing?: boolean;
    generated_default?: boolean;
    automation_active?: boolean;
    executor_active?: boolean;
    generated_at?: string | null;
    updated_at?: string | null;
    note?: string;
  };
  groups?: ManagementCockpitGroup[];
  inbox?: ManagementCockpitInboxItem[];
  owner_gates?: ManagementCockpitInboxItem[];
  summary?: ManagementCockpitSummary;
};

// Three truthful display states for the cockpit. "no_source" is the §4.2
// default-envelope case (writer hasn't run or file is missing). "defined_no_queue"
// is the current production state: owner-defined groups exist, but no real queue
// is wired and automation is off — so per-group counts are vacuous zeros. "live"
// means at least one group has a wired queue OR automation is active, so the
// summary/group counts are real signals.
export type ManagementCockpitDisplayState = "no_source" | "defined_no_queue" | "live";

// Honesty rule per contract §4.2: if no writer has produced the file, the card
// must render the "no data yet" state. Returns true when the doc is missing,
// flagged generated_default, or has source_missing.
export function isManagementCockpitDefault(doc: ManagementCockpitDoc | null): boolean {
  if (!doc) return true;
  if (doc._meta?.source_missing === true) return true;
  if (doc._meta?.generated_default === true) return true;
  return false;
}

// Returns true when the group's queue_membership.mode is anything other than
// the explicit "not_configured" sentinel. Absent queue_membership is treated as
// "legacy/unknown — preserve prior counts display"; only the explicit
// not_configured sentinel suppresses counts as vacuous.
export function isManagementCockpitGroupQueueConnected(
  g: ManagementCockpitGroup | undefined | null,
): boolean {
  if (!g) return false;
  return g.queue_membership?.mode !== "not_configured";
}

export function managementCockpitDisplayState(
  doc: ManagementCockpitDoc | null,
): ManagementCockpitDisplayState {
  if (isManagementCockpitDefault(doc)) return "no_source";
  if (doc?._meta?.automation_active === true) return "live";
  if (doc?._meta?.executor_active === true) return "live";
  const groups = doc?.groups ?? [];
  if (groups.length === 0) return "live";
  const allExplicitlyNotConfigured = groups.every(
    (g) => g.queue_membership?.mode === "not_configured",
  );
  return allExplicitlyNotConfigured ? "defined_no_queue" : "live";
}

// Renders the cockpit's last write timestamp as a Hebrew phrase, e.g.
// "מעודכן: לפני 2 שע'". Returns null when generated_at is missing or
// unparseable so the caller can skip rendering. The producer
// (build-management-cockpit.py per envelope §4.1) sets _meta.generated_at on
// every emit; _meta.updated_at tracks queue activity (not yet meaningful with
// no real queue wired). generated_at is the only freshness signal an operator
// can act on today.
export function formatManagementCockpitFreshness(
  doc: ManagementCockpitDoc | null,
  now: Date = new Date(),
): string | null {
  const ts = doc?._meta?.generated_at;
  if (!ts) return null;
  if (Number.isNaN(new Date(ts).getTime())) return null;
  return `מעודכן: ${relativeTimeHe(ts, now)}`;
}

export function managementCockpitSummary(
  doc: ManagementCockpitDoc | null,
): ManagementCockpitSummary {
  const s = doc?.summary;
  return {
    groups: s?.groups ?? 0,
    open_items: s?.open_items ?? 0,
    blocked: s?.blocked ?? 0,
    needs_owner: s?.needs_owner ?? 0,
    needs_rabbi: s?.needs_rabbi ?? 0,
  };
}

// "blocked" in the UI maps to schema outcome "aborted" — schema vocab is the
// agent's perspective (the attempt was aborted), UI vocab is the item's
// perspective (it is blocked from progress). Keep this mapping in one place.
export function executionStatusCounts(
  receipts: QueueReceipt[],
): ExecutionStatusCounts {
  const c: ExecutionStatusCounts = { succeeded: 0, failed: 0, blocked: 0, skipped: 0 };
  for (const r of receipts) {
    if (r.outcome === "succeeded") c.succeeded += 1;
    else if (r.outcome === "failed") c.failed += 1;
    else if (r.outcome === "aborted") c.blocked += 1;
    else if (r.outcome === "skipped") c.skipped += 1;
  }
  return c;
}

// Per concepts/operational-queue.md §Remaining slices: retry_count >= 3 on a
// failed attempt means the router would defer this item (max retries reached).
export function isMaxRetries(r: QueueReceipt | undefined): boolean {
  return !!r && r.outcome === "failed" && r.retry_count >= 3;
}

export type OperationalQueueGroups = {
  actionable: OperationalQueueItem[];
  awaitingOwner: OperationalQueueItem[];
  total: number;
};

// Split the queue into actionable (no owner gate) vs awaiting-owner. Within
// each bucket, sort by operational_priority desc (the materializer already
// emits this order, but defending the consumer makes the surface robust to
// future projection changes). Stale items drop to the bottom of their bucket.
export function operationalQueueGroups(
  doc: OperationalQueueDoc | null,
): OperationalQueueGroups {
  const all = doc?.queue ?? [];
  const sortFn = (a: OperationalQueueItem, b: OperationalQueueItem) => {
    const aStale = a.freshness === "stale" ? 1 : 0;
    const bStale = b.freshness === "stale" ? 1 : 0;
    if (aStale !== bStale) return aStale - bStale;
    if (b.operational_priority !== a.operational_priority) {
      return b.operational_priority - a.operational_priority;
    }
    return a.id.localeCompare(b.id);
  };
  const actionable = all.filter((i) => !i.owner_gate).slice().sort(sortFn);
  const awaitingOwner = all.filter((i) => i.owner_gate).slice().sort(sortFn);
  return { actionable, awaitingOwner, total: all.length };
}

// Operator-facing classifier for the operational queue — same #88/#89/#91
// contract. Folds (groups, execution-receipt counts) into a single
// severity/headline/meaning/nextAction view. Pure; no rendering coupling.
export type OperationalQueueCategory =
  | "failures_present"
  | "owner_only"
  | "awaiting_owner_majority"
  | "large_backlog"
  | "actionable_ready"
  | "queue_quiet"
  | "empty";

export type OperationalQueueOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory: OperationalQueueCategory;
  categories: OperationalQueueCategory[];
  headline: string;
  meaning: string;
  nextAction: string;
};

export type OperationalQueueClassifyInput = {
  groups: OperationalQueueGroups;
  failedCount?: number;
  blockedCount?: number;
  awaitingOwnerThreshold?: number;
  largeBacklogThreshold?: number;
};

export function classifyOperationalQueueForOperator(
  input: OperationalQueueClassifyInput,
): OperationalQueueOperatorView {
  const { groups } = input;
  const failedCount = input.failedCount ?? 0;
  const blockedCount = input.blockedCount ?? 0;
  const awaitingOwnerThreshold = input.awaitingOwnerThreshold ?? 5;
  const largeBacklogThreshold = input.largeBacklogThreshold ?? 20;
  const cats: OperationalQueueCategory[] = [];
  if (groups.total === 0) cats.push("empty");
  else {
    if (failedCount + blockedCount > 0) cats.push("failures_present");
    if (groups.actionable.length === 0 && groups.awaitingOwner.length > 0) cats.push("owner_only");
    if (
      groups.awaitingOwner.length > groups.actionable.length &&
      groups.awaitingOwner.length > awaitingOwnerThreshold
    ) {
      cats.push("awaiting_owner_majority");
    }
    if (groups.total > largeBacklogThreshold) cats.push("large_backlog");
    if (cats.length === 0 && groups.actionable.length > 0) cats.push("actionable_ready");
    if (cats.length === 0) cats.push("queue_quiet");
  }
  const topCategory = cats[0];
  const total = groups.total;
  const actionableN = groups.actionable.length;
  const awaitingN = groups.awaitingOwner.length;
  let severity: "info" | "watch" | "action";
  let headline: string;
  let meaning: string;
  let nextAction: string;
  switch (topCategory) {
    case "failures_present":
      severity = "action";
      headline = `כשלים בתור (${failedCount + blockedCount})`;
      meaning = "פעולה אחת או יותר נכשלה או נחסמה. ייתכן צורך בהתערבות לפני שהתור ימשיך לזרום.";
      nextAction = "סקור את הקבלות (receipts) של הפעולות שנכשלו והחלט אם לנסות שוב או להעלות לבעלים.";
      break;
    case "owner_only":
      severity = "watch";
      headline = `כל הפריטים מחכים לבעלים (${awaitingN})`;
      meaning = "אין פריטים זמינים לעיבוד אוטונומי כרגע — כולם דורשים אישור.";
      nextAction = "פתח את רשימת ה-owner gates והחלט אילו לאשר, לדחות או לסגור.";
      break;
    case "awaiting_owner_majority":
      severity = "watch";
      headline = `רוב התור מחכה לבעלים (${awaitingN}/${total})`;
      meaning = "התור מתחיל להצטבר על owner gates ולא זורם בקצב רגיל.";
      nextAction = "סגור כמה owner gates כדי לפתוח את הצוואר.";
      break;
    case "large_backlog":
      severity = "watch";
      headline = `גודש בתור (${total} פריטים)`;
      meaning = "התור מכיל יותר פריטים ממה שמצופה למצב יציב; ייתכן שכותב פולט מהר מהקצב המעבד.";
      nextAction = "בדוק אם יש כשלים חוסמים או אם יש להגדיל ספאון מאושר; אין דחיפות אם אין כשלים.";
      break;
    case "actionable_ready":
      severity = "info";
      headline = `פריטים מוכנים לעיבוד (${actionableN})`;
      meaning = "התור פעיל ויש פריטים זמינים לעיבוד אוטונומי.";
      nextAction = "ניתן להמשיך לעבוד; המעבד יבחר את הפריטים לפי priority.";
      break;
    case "empty":
      severity = "info";
      headline = "התור ריק";
      meaning = "אין פריטים פתוחים בתור התפעולי.";
      nextAction = "אין צורך לפעול.";
      break;
    case "queue_quiet":
    default:
      severity = "info";
      headline = "התור שקט";
      meaning = "אין פריטים זמינים לעיבוד ולא נצברו owner gates.";
      nextAction = "אין צורך לפעול.";
      break;
  }
  return { severity, topCategory, categories: cats, headline, meaning, nextAction };
}

// Collapse the schema's 5-level severity onto the OpsPage 4-level SeverityLevel
// for visual reuse (critical → high; info → low). Keep the schema enum on the
// data side; only fold at render time.
export function severityFromQueue(s: OperationalQueueSeverity): SeverityLevel {
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low" || s === "info") return "low";
  return "unknown";
}

export type StaleEntry = { name: string; hours: number };

// Owner-edited config files with no automated writer, per
// /srv/ops-vault/scripts/regenerate-state-meta.py MANUAL_CONFIG. These
// naturally age over time and must NOT be surfaced as "stale" by the
// freshness banner or attention synthesis — the freshness signal is meaningful
// only for files emitted by a writer/derived producer.
export const MANUAL_CONFIG_FILES = new Set([
  "blockers.json",
  "cohorts.json",
  "dependencies.json",
  "lanes.json",
  "operational_graph.json",
  "processes.json",
  "projects.json",
  "services.json",
]);

export function stalenessEntries(
  f: FreshnessDoc | null,
  thresholdHours: number,
): StaleEntry[] {
  if (!f?.files) return [];
  return Object.entries(f.files)
    .filter(([name]) => !MANUAL_CONFIG_FILES.has(name))
    .map(([name, v]) => ({
      name,
      hours: Math.floor((v?.age_seconds ?? 0) / 3600),
    }))
    .filter((x) => x.hours >= thresholdHours)
    .sort((a, b) => b.hours - a.hours);
}

export function relativeTimeHe(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMin = Math.round((now.getTime() - t) / 60000);
  if (diffMin < 1) return "עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק'`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `לפני ${diffHr} שע'`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `לפני ${diffDay} ימים`;
  return iso.substring(0, 10);
}

function parseLanes(doc: LanesDoc | null): LaneRow[] {
  if (!doc) return [];
  const out: LaneRow[] = [];
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith("_")) continue;
    if (typeof v !== "object" || v === null) continue;
    const l = v as Record<string, unknown>;
    out.push({
      key: k,
      title: l.title as string | undefined,
      primary_user: l.primary_user as string | undefined,
      doc: l.doc as string | undefined,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

type HealthDoc = {
  ts?: string;
  host?: string;
  ok?: boolean;
  failed?: string[];
  endpoints?: HealthEndpoint[];
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function parseProjects(doc: ProjectsDoc | null): ProjectRow[] {
  if (!doc) return [];
  const out: ProjectRow[] = [];
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith("_")) continue;
    if (typeof v !== "object" || v === null) continue;
    const p = v as Record<string, unknown>;
    out.push({
      key: k,
      repo: p.repo as string | undefined,
      canonical_path: p.canonical_path as string | undefined,
      production: p.production as boolean | undefined,
      production_url: p.production_url as string | null | undefined,
      status: p.status as string | undefined,
      phase: p.phase as string | undefined,
      owner_gate: (p.owner_gate as string[] | undefined) ?? [],
    });
  }
  return out;
}

function blockersForProject(all: Blocker[], projectKey: string): Blocker[] {
  return all.filter((b) => b.id.startsWith(projectKey));
}

function lastActivity(
  sessions: SessionRow[],
  projectKey: string,
): SessionRow | null {
  for (const s of sessions) {
    if (s.projects?.includes(projectKey)) return s;
  }
  return null;
}

export function ageDays(since?: string, now: Date = new Date()): number | null {
  if (!since) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(since);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

// Drift tiers for _meta.last_verified — how stale a truth file is.
// ≤3d fresh, 4–7d soft, 8–14d amber, >14d red, missing → none.
export type DriftLevel = "fresh" | "soft" | "amber" | "red" | "none";
export function driftLevel(days: number | null): DriftLevel {
  if (days == null) return "none";
  if (days <= 3) return "fresh";
  if (days <= 7) return "soft";
  if (days <= 14) return "amber";
  return "red";
}

// Age tiers for blocker/gate rows. ≤7d default, 8–30d warn, >30d critical.
export type AgeLevel = "ok" | "warn" | "critical";
export function ageLevel(days: number | null): AgeLevel {
  if (days == null || days <= 7) return "ok";
  if (days <= 30) return "warn";
  return "critical";
}

// Per-card freshness tier from the _freshness.json mtime ledger (age in seconds of
// a card's backing projection). <6h fresh, 6–48h aging, >48h stale, missing unknown.
// Drives a local "this card's source has gone quiet" warning so no card silently
// renders stale producer output.
export type CardFreshLevel = "fresh" | "aging" | "stale" | "unknown";
export function cardFreshLevel(ageSeconds: number | null | undefined): CardFreshLevel {
  if (ageSeconds == null) return "unknown";
  const hours = ageSeconds / 3600;
  if (hours < 6) return "fresh";
  if (hours < 48) return "aging";
  return "stale";
}

const statusColor: Record<string, string> = {
  active: "#22c55e",
  dormant: "#a3a3a3",
  archived: "#737373",
};

export function OpsPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [ownerGates, setOwnerGates] = useState<string[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthDoc | null>(null);
  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [recentMerges, setRecentMerges] = useState<RecentMergesDoc | null>(null);
  const [freshness, setFreshness] = useState<FreshnessDoc | null>(null);
  const [processes, setProcesses] = useState<ProcessesDoc | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffsIndexDoc | null>(null);
  const [runtimeIssues, setRuntimeIssues] = useState<RuntimeIssuesDoc | null>(null);
  const [attentionSynthesis, setAttentionSynthesis] =
    useState<AttentionSynthesisDoc | null>(null);
  const [meta, setMeta] = useState<MetaDoc | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSessionsDoc | null>(null);
  const [dependencies, setDependencies] = useState<DependenciesDoc | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowsDoc | null>(null);
  const [pushIsolation, setPushIsolation] = useState<PushIsolationSnapshot | null>(null);
  const [runtimeContinuity, setRuntimeContinuity] =
    useState<RuntimeContinuityDoc | null>(null);
  const [operationalQueue, setOperationalQueue] =
    useState<OperationalQueueDoc | null>(null);
  const [queueRoutes, setQueueRoutes] = useState<QueueRoutesDoc | null>(null);
  const [queuePlan, setQueuePlan] = useState<QueueReceiptDoc>(null);
  const [queueReceipts, setQueueReceipts] = useState<QueueReceiptDoc>(null);
  const [managementCockpit, setManagementCockpit] =
    useState<ManagementCockpitDoc | null>(null);
  const [safeSwarm, setSafeSwarm] = useState<SafeSwarmDoc | null>(null);
  const [orchestratorIntegrity, setOrchestratorIntegrity] =
    useState<OrchestratorIntegrityDoc | null>(null);
  const [producerHealth, setProducerHealth] =
    useState<ProducerViolationsDoc | null>(null);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [pd, bd, sd, hd, ld, rm, fr, pr, ho, ri, md, as, dp, wf, pi, rc, oq, qr, qp, qrc, mc, ss, oi, pcv, ats] = await Promise.all([
        fetchJson<ProjectsDoc>("/ops-data/projects.json"),
        fetchJson<BlockersDoc>("/ops-data/blockers.json"),
        fetchJson<SessionsDoc>("/ops-data/session_index.json"),
        fetchJson<HealthDoc>("/ops-data/health.json"),
        fetchJson<LanesDoc>("/ops-data/lanes.json"),
        fetchJson<RecentMergesDoc>("/ops-data/recent_merges.json"),
        fetchJson<FreshnessDoc>("/ops-data/_freshness.json"),
        fetchJson<ProcessesDoc>("/ops-data/processes.json"),
        fetchJson<HandoffsIndexDoc>("/ops-data/handoffs_index.json"),
        fetchJson<RuntimeIssuesDoc>("/ops-data/runtime-issues.json"),
        fetchJson<MetaDoc>("/ops-data/_meta.json"),
        fetchJson<ActiveSessionsDoc>("/ops-data/active_sessions.json"),
        fetchJson<DependenciesDoc>("/ops-data/dependencies.json"),
        fetchJson<WorkflowsDoc>("/ops-data/workflows.json"),
        fetchJson<PushIsolationSnapshot>("/ops-data/push-isolation-latest.json"),
        fetchJson<RuntimeContinuityDoc>("/ops-data/runtime-continuity.json"),
        fetchJson<OperationalQueueDoc>("/ops-data/operational_queue.json"),
        fetchJson<QueueRoutesDoc>("/ops-data/queue_routes.json"),
        fetchJson<QueueReceiptDoc>("/ops-data/queue_plan.json"),
        fetchJson<QueueReceiptDoc>("/ops-data/queue_receipts.json"),
        fetchJson<ManagementCockpitDoc>("/ops-data/management_cockpit.json"),
        fetchJson<SafeSwarmDoc>("/ops-data/safe_swarm.json"),
        fetchJson<OrchestratorIntegrityDoc>("/ops-data/orchestrator_integrity.json"),
        fetchJson<ProducerViolationsDoc>("/ops-data/producer_contract_violations.json"),
        fetchJson<AttentionSynthesisDoc>("/ops-data/attention_synthesis.json"),
      ]);
      if (cancelled) return;
      if (!pd && !bd && !sd && !hd && !ld && !rm) {
        setLoadError("ops-data unavailable — was the page built without /srv/ops-vault?");
      }
      setProjects(parseProjects(pd));
      setBlockers(bd?.blockers ?? []);
      setSessions(sd?.sessions ?? []);
      setOwnerGates(sd?.owner_gates ?? []);
      setActiveIncidents(sd?.active_incidents ?? []);
      setHealth(hd ?? null);
      setLanes(parseLanes(ld));
      setRecentMerges(rm ?? null);
      setFreshness(fr ?? null);
      setProcesses(pr ?? null);
      setHandoffs(ho ?? null);
      setRuntimeIssues(ri ?? null);
      setMeta(md ?? null);
      setActiveSessions(as ?? null);
      setDependencies(dp ?? null);
      setWorkflows(wf ?? null);
      setPushIsolation(hasPushIsolationSnapshot(pi) ? pi : null);
      setRuntimeContinuity(rc ?? null);
      setOperationalQueue(oq ?? null);
      setQueueRoutes(qr ?? null);
      setQueuePlan(qp ?? null);
      setQueueReceipts(qrc ?? null);
      setManagementCockpit(mc ?? null);
      setSafeSwarm(ss ?? null);
      setOrchestratorIntegrity(oi ?? null);
      setProducerHealth(pcv ?? null);
      setAttentionSynthesis(ats ?? null);
      setLastVerified(pd?._meta?.last_verified ?? null);
    };
    load();
    // Live refresh: re-fetch all /ops-data every 60s. Caddy serves these directly from
    // /srv/ops-vault/state, so edits to CURRENT.md / blockers.json / regen of session_index
    // appear on the page within a minute — no rebuild/deploy needed.
    const id = window.setInterval(() => {
      load();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (projects === null && !loadError) {
    return (
      <div style={pad}>
        <div className="spinner" />
      </div>
    );
  }

  const rows = (projects ?? []).sort((a, b) => {
    if (a.status === b.status) return a.key.localeCompare(b.key);
    if (a.status === "active") return -1;
    if (b.status === "active") return 1;
    return 0;
  });

  return (
    <main id="main-content" dir="rtl" style={pad} aria-labelledby="ops-page-title">
      <header style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h1 id="ops-page-title" style={{ fontSize: 20, margin: 0 }}>MN-OS · Ops</h1>
          <LastRefreshBadge regeneratedAt={meta?._meta?.regenerated_at} />
        </div>
        <div style={{ fontSize: 12, color: "#737373", marginTop: 4 }}>
          קריאה בלבד · מקור: <code>/srv/ops-vault/state</code>
          {lastVerified ? ` · אומת לאחרונה: ${lastVerified}` : ""}
        </div>
      </header>

      {loadError && (
        <div role="alert" style={errorBox}>{loadError}</div>
      )}

      <StalenessBanner stale={stalenessEntries(freshness, 6)} />

      <AttentionSummaryCard
        ownerGates={ownerGates}
        activeIncidents={activeIncidents}
        blockers={blockers}
        freshness={freshness}
        runtimeIssues={runtimeIssues}
        pushIsolation={pushIsolation}
        processes={processes}
        dependencies={dependencies}
        workflows={workflows}
        orchestratorIntegrity={orchestratorIntegrity}
        queueRoutes={queueRoutes}
      />

      <CardFreshnessBadge file="attention_synthesis.json" freshness={freshness} />
      <AttentionSynthesisCard doc={attentionSynthesis} />

      <CardFreshnessBadge file="runtime_governance_debt.json" freshness={freshness} />
      <HybridBlockersCard doc={attentionSynthesis} />

      <CardFreshnessBadge file="operational_queue.json" freshness={freshness} />
      <OperationalQueueCard
        doc={operationalQueue}
        routes={queueRoutes}
        plan={queuePlan}
        receipts={queueReceipts}
      />
      <ManagementCockpitCard doc={managementCockpit} />
      <CardFreshnessBadge file="safe_swarm.json" freshness={freshness} />
      <SafeSwarmCard doc={safeSwarm} />
      <CardFreshnessBadge file="orchestrator_integrity.json" freshness={freshness} />
      <OrchestratorIntegrityCard doc={orchestratorIntegrity} />
      <CardFreshnessBadge file="producer_contract_violations.json" freshness={freshness} />
      <ProducerHealthCard doc={producerHealth} />
      <CardFreshnessBadge file="health.json" freshness={freshness} />
      <HealthOverview health={health} />
      <CardFreshnessBadge file="active_sessions.json" freshness={freshness} />
      <ActiveSessionsCard doc={activeSessions} />
      <DependenciesCard doc={dependencies} />
      <CardFreshnessBadge file="workflows.json" freshness={freshness} />
      <WorkflowsCard doc={workflows} />
      <LanesOverview lanes={lanes} />
      <CardFreshnessBadge file="recent_merges.json" freshness={freshness} />
      <RecentMergesCard doc={recentMerges} />
      <BlockersOverview blockers={blockers} />
      <CardFreshnessBadge file="session_index.json" freshness={freshness} />
      <ActiveIncidentsCard incidents={activeIncidents} />
      <CardFreshnessBadge file="session_index.json" freshness={freshness} />
      <OwnerGatesCard gates={ownerGates} />
      <ProcessesCard doc={processes} />
      <PushIsolationCard snap={pushIsolation} />
      <CardFreshnessBadge file="runtime-continuity.json" freshness={freshness} />
      <RuntimeContinuityMetricsCard doc={runtimeContinuity} />
      <CardFreshnessBadge file="handoffs_index.json" freshness={freshness} />
      <RuntimeContinuityCard doc={handoffs} />
      <HandoffsCard doc={handoffs} />
      <CardFreshnessBadge file="runtime-issues.json" freshness={freshness} />
      <RuntimeIssuesCard doc={runtimeIssues} />

      {rows.length === 0 && !loadError && (
        <div style={emptyBox}>אין פרויקטים — האם <code>state/projects.json</code> ריק?</div>
      )}

      <ul aria-label="פרויקטים" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((p) => {
          const projBlockers = blockersForProject(blockers, p.key);
          const last = lastActivity(sessions, p.key);
          return (
            <li key={p.key} style={card}>
              <div style={cardHead}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{p.key}</span>
                  <DriftBadge lastVerified={lastVerified} />
                </span>
                <span
                  style={{
                    ...pill,
                    background: statusColor[p.status ?? ""] ?? "#525252",
                  }}
                >
                  {p.status ?? "—"}
                </span>
              </div>
              {p.phase && (
                <div style={metaLine}>שלב: <b>{p.phase}</b></div>
              )}
              {p.production_url && (
                <div style={metaLine}>
                  פרודקשן: <a href={p.production_url} target="_blank" rel="noreferrer">{p.production_url}</a>
                </div>
              )}
              <div style={sectionLabel}>חסמים פעילים ({projBlockers.length})</div>
              {projBlockers.length === 0 ? (
                <div style={emptyInline}>—</div>
              ) : (
                <ul style={blockerList}>
                  {projBlockers.map((b) => (
                    <li key={b.id} style={blockerItem}>
                      <div style={{ fontWeight: 500 }}>{b.summary}</div>
                      {b.needs && (
                        <div style={subLine}>צריך: {b.needs}</div>
                      )}
                      <div style={subLine}>
                        {b.lane ? `מסלול ${b.lane}` : ""}
                        {b.since ? ` · מאז ${b.since}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div style={sectionLabel}>פעילות אחרונה</div>
              {last ? (
                <div style={subLine}>
                  {last.date} · <code style={{ fontSize: 11 }}>{last.file}</code>
                </div>
              ) : (
                <div style={emptyInline}>אין מפגש שמתויג לפרויקט הזה</div>
              )}
            </li>
          );
        })}
      </ul>
      <SessionsStrip sessions={sessions} />
    </main>
  );
}

function StalenessBanner({ stale }: { stale: StaleEntry[] }) {
  if (stale.length === 0) return null;
  const worst = stale[0].hours;
  const critical = worst >= 48;
  return (
    <section
      id="ops-card-staleness"
      tabIndex={-1}
      aria-label="נתונים מתיישנים"
      style={{
        ...overviewCard,
        background: critical ? "#fef2f2" : "#fffbeb",
        borderColor: critical ? "#fecaca" : "#fde68a",
        marginBottom: 12,
      }}
    >
      <BackToAttentionSummaryLink />
      <div style={{ ...overviewHead, color: critical ? "#991b1b" : "#78350f" }}>
        <span>נתונים מתיישנים</span>
        <span
          style={{
            ...overviewCount,
            color: critical ? "#b91c1c" : "#92400e",
          }}
        >
          {stale.length} קבצים · ותיק ביותר {worst} שע'
        </span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 3 }}>
        {stale.map((s) => (
          <li
            key={s.name}
            style={{
              fontSize: 12,
              color: critical ? "#7f1d1d" : "#78350f",
              fontFamily: "monospace",
            }}
          >
            {s.name.replace(/\.json$/, "")} · {s.hours} שע'
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentMergesCard({ doc }: { doc: RecentMergesDoc | null }) {
  if (doc === null) return null;
  const merges = doc.merges ?? [];
  return (
    <section aria-label="שופץ לאחרונה" style={overviewCard}>
      <div style={overviewHead}>
        <span>שופץ לאחרונה</span>
        <span style={overviewCount}>{merges.length}</span>
      </div>
      {merges.length === 0 ? (
        <div style={{ fontSize: 13, color: "#737373" }}>
          {doc._meta?.error
            ? `שגיאת fetch: ${doc._meta.error.substring(0, 80)}`
            : "אין מיזוגים אחרונים"}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {merges.map((m) => (
            <li key={m.number} style={{ fontSize: 13, color: "#404040" }}>
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#1d4ed8", textDecoration: "none" }}
              >
                #{m.number}
              </a>{" "}
              <span style={{ color: "#171717" }}>{m.title}</span>
              <div style={{ fontSize: 11, color: "#737373", marginTop: 2 }}>
                {relativeTimeHe(m.mergedAt)} · {m.login}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function shortenSlice(s: string | null | undefined): string {
  if (!s) return "—";
  // Strip parenthetical commentary that bloats the slice label.
  const trimmed = s.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return trimmed.length > 60 ? trimmed.substring(0, 57) + "…" : trimmed;
}

// Mobile-readable summary of a session's declared owned-path globs. Returns "" when
// nothing is claimed (legacy entries get empty string and the row hides the line).
// Strips parenthetical commentary that preflight_collision_check.py tolerates.
// Joins inline when short; otherwise shows the first glob + "+N" overflow count.
export function formatOwnedPaths(
  globs: readonly string[] | null | undefined,
  maxChars = 48,
): string {
  if (!globs || globs.length === 0) return "";
  const cleaned = globs
    .map((g) => g.split(" (")[0].trim())
    .filter((g) => g.length > 0);
  if (cleaned.length === 0) return "";
  const joined = cleaned.join(" · ");
  if (joined.length <= maxChars) return joined;
  const first = cleaned[0];
  const rest = cleaned.length - 1;
  if (first.length > maxChars) {
    return first.slice(0, maxChars - 1) + "…";
  }
  return rest > 0 ? `${first} · +${rest}` : first;
}

// Approximate glob overlap: returns true when two glob patterns can both match
// some concrete path. We strip trailing /** or /* wildcards and any segment
// containing * to derive a "literal prefix"; two globs overlap iff one prefix
// extends the other (or they are equal). Conservative — may warn on a glob
// pair that doesn't truly collide, but does NOT miss real overlaps for the
// dir-prefix patterns the path-ownership protocol actually uses in practice
// (e.g. "src/pages/**" vs "src/pages/OpsPage.tsx").
export function globsOverlap(a: string, b: string): boolean {
  const literalPrefix = (g: string): string => {
    const clean = g.split(" (")[0].trim();
    if (clean.length === 0) return "";
    const parts = clean.split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (p.includes("*")) break;
      out.push(p);
    }
    return out.join("/");
  };
  const pa = literalPrefix(a);
  const pb = literalPrefix(b);
  if (pa.length === 0 || pb.length === 0) return false;
  // Segment-aware prefix check so "foo" does not match "foobar".
  const isPrefix = (s: string, prefix: string): boolean =>
    s === prefix || s.startsWith(prefix + "/");
  return isPrefix(pa, pb) || isPrefix(pb, pa);
}

export type SessionCollision = {
  a: string;
  b: string;
  overlaps: { aGlob: string; bGlob: string }[];
};

// Pairs of active sessions whose declared owned_paths_globs may collide.
// Pure; symmetric (each pair appears once with the lexicographically smaller
// id as `a`). Sessions with no owned_paths_globs contribute no collisions.
export function detectActiveCollisions(
  active: readonly ActiveSession[] | null | undefined,
): SessionCollision[] {
  if (!active || active.length < 2) return [];
  const collisions: SessionCollision[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const sa = active[i];
      const sb = active[j];
      const ga = sa.owned_paths_globs ?? [];
      const gb = sb.owned_paths_globs ?? [];
      if (ga.length === 0 || gb.length === 0) continue;
      const overlaps: { aGlob: string; bGlob: string }[] = [];
      for (const x of ga) {
        for (const y of gb) {
          if (globsOverlap(x, y)) overlaps.push({ aGlob: x, bGlob: y });
        }
      }
      if (overlaps.length > 0) {
        const [low, high] = sa.id < sb.id ? [sa, sb] : [sb, sa];
        collisions.push({ a: low.id, b: high.id, overlaps });
      }
    }
  }
  return collisions;
}

// Flatten collision overlap pairs into a deduped, length-capped list for the
// banner. Dedup key is the sorted (aGlob, bGlob) tuple, so the same pair
// surfacing from multiple session collisions is rendered once. Parenthetical
// commentary is stripped to match formatOwnedPaths conventions.
export function topCollisionPairs(
  collisions: readonly SessionCollision[],
  max = 2,
): { aGlob: string; bGlob: string }[] {
  const seen = new Set<string>();
  const out: { aGlob: string; bGlob: string }[] = [];
  const clean = (g: string) => g.split(" (")[0].trim();
  for (const c of collisions) {
    for (const o of c.overlaps) {
      const a = clean(o.aGlob);
      const b = clean(o.bGlob);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const key = `${lo} ${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ aGlob: lo, bGlob: hi });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// Human-readable Hebrew heartbeat age for the ActiveSessionsCard freshness line.
// null/undefined/non-positive → "". <60s → "טרי". minutes → "לפני N דק׳". hours → "לפני N שע׳".
export function heartbeatAgeLabelHe(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return "טרי";
  if (seconds < 3600) return `לפני ${Math.floor(seconds / 60)} דק׳`;
  if (seconds < 86400) return `לפני ${Math.floor(seconds / 3600)} שע׳`;
  return `לפני ${Math.floor(seconds / 86400)} ימים`;
}

function ActiveSessionsCard({ doc }: { doc: ActiveSessionsDoc | null }) {
  if (!doc) return null;
  const active = doc.active ?? [];
  const recent = doc.recent_completed ?? [];
  const registryStale = doc._meta?.registry_stale === true;
  if (active.length === 0 && recent.length === 0 && !doc._meta?.error) return null;

  const collisions = detectActiveCollisions(active);
  const collidingIds = new Set<string>();
  for (const c of collisions) {
    collidingIds.add(c.a);
    collidingIds.add(c.b);
  }
  const hasCollision = collisions.length > 0;

  const headColor = hasCollision
    ? "#b45309"
    : active.length > 0 && !registryStale
      ? "#166534"
      : "#737373";
  const bg = hasCollision
    ? "#fffbeb"
    : active.length > 0 && !registryStale
      ? "#f0fdf4"
      : "#fafafa";
  const border = hasCollision
    ? "#fde68a"
    : active.length > 0 && !registryStale
      ? "#bbf7d0"
      : "#e5e5e5";

  return (
    <section
      aria-label="סשנים פעילים"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: headColor }}>
        <span>סשני סוכן · {active.length === 0 ? "אין פעילים" : `${active.length} פעיל${active.length === 1 ? "" : "ים"}`}</span>
        <span style={{ ...overviewCount, color: headColor }}>
          {registryStale ? "פנקס לא מעודכן · " : ""}
          {recent.length} אחרונים
        </span>
      </div>

      {(() => {
        const age = heartbeatAgeLabelHe(doc._meta?.source_age_seconds ?? null);
        if (!age) return null;
        return (
          <div style={{ ...subLine, color: registryStale ? "#b45309" : "#737373", marginBottom: 6 }}>
            פעימה: {age}
          </div>
        );
      })()}

      {doc._meta?.error && (
        <div style={{ ...subLine, color: "#991b1b", marginBottom: 6 }}>
          שגיאת מקור: {doc._meta.error}
        </div>
      )}

      {hasCollision && (() => {
        const pairs = topCollisionPairs(collisions, 2);
        return (
          <div
            role="alert"
            style={{
              ...subLine,
              color: "#92400e",
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: 4,
              padding: "6px 8px",
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            <div>
              ⚠️ התנגשות נתיבים: {collisions.length} זוג{collisions.length === 1 ? "" : "ות"}
            </div>
            {pairs.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "4px 0 0 0",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  fontWeight: 400,
                  display: "grid",
                  gap: 2,
                }}
              >
                {pairs.map((p) => (
                  <li key={`${p.aGlob}↔${p.bGlob}`}>
                    {p.aGlob} ↔ {p.bGlob}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      {active.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px 0", display: "grid", gap: 8 }}>
          {active.map((s) => {
            const stale = s.lifecycle === "stale";
            const colliding = collidingIds.has(s.id);
            const accent = colliding ? "#f59e0b" : stale ? "#f59e0b" : "#22c55e";
            return (
              <li
                key={s.id}
                style={{
                  fontSize: 13,
                  color: "#404040",
                  borderInlineStart: `3px solid ${accent}`,
                  paddingInlineStart: 8,
                }}
              >
                <div style={{ fontWeight: 500 }}>
                  <span
                    style={{
                      ...pill,
                      background: stale ? "#f59e0b" : "#22c55e",
                      marginInlineEnd: 6,
                      fontSize: 10,
                      padding: "1px 6px",
                    }}
                  >
                    {stale ? "stale" : "active"}
                  </span>
                  {colliding && (
                    <span
                      style={{
                        ...pill,
                        background: "#f59e0b",
                        marginInlineEnd: 6,
                        fontSize: 10,
                        padding: "1px 6px",
                      }}
                      title="פרוסה זו חולקת נתיבים עם פרוסה פעילה אחרת"
                    >
                      ⚠ collision
                    </span>
                  )}
                  {s.project ?? s.id}
                  {s.lane ? ` · מסלול ${s.lane}` : ""}
                </div>
                <div style={subLine}>
                  {s.agent ?? "—"}{s.model ? ` · ${s.model}` : ""}
                  {s.started_at ? ` · התחיל ${relativeTimeHe(s.started_at)}` : ""}
                </div>
                {s.current_slice && (
                  <div style={subLine}>פרוסה נוכחית: {shortenSlice(s.current_slice)}</div>
                )}
                {(() => {
                  const owned = formatOwnedPaths(s.owned_paths_globs);
                  if (!owned) return null;
                  return (
                    <div
                      style={{
                        ...subLine,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 11,
                        color: "#525252",
                        direction: "ltr",
                        textAlign: "start",
                      }}
                      title={(s.owned_paths_globs ?? []).join(" · ")}
                    >
                      🔒 {owned}
                    </div>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      )}

      {recent.length > 0 && (
        <>
          <div style={sectionLabel}>סשנים אחרונים</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {recent.slice(0, 5).map((s) => {
              const owned = formatOwnedPaths(s.owned_paths_globs, 56);
              return (
                <li key={s.id} style={{ fontSize: 12, color: "#525252" }}>
                  <span
                    style={{
                      color: s.terminal_state === "SHIPPED" ? "#15803d" : "#737373",
                      fontWeight: 500,
                    }}
                  >
                    {s.terminal_state ?? "—"}
                  </span>{" "}
                  {s.project ?? s.id}
                  {s.lane ? ` · מסלול ${s.lane}` : ""}
                  {s.finished_at ? ` · ${relativeTimeHe(s.finished_at)}` : ""}
                  {owned && (
                    <div
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 10,
                        color: "#737373",
                        direction: "ltr",
                        textAlign: "start",
                        paddingInlineStart: 12,
                        marginTop: 1,
                      }}
                      title={(s.owned_paths_globs ?? []).join(" · ")}
                    >
                      🔒 {owned}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function DependenciesCard({ doc }: { doc: DependenciesDoc | null }) {
  if (!doc) return null;
  const summary = dependenciesSummary(doc);
  const errs = doc._meta?.errors ?? [];
  const view = classifyDependenciesForOperator(summary);
  if (!view) return null;

  const headColor = summary.failingChecks > 0 ? "#991b1b" : summary.open > 0 ? "#1d4ed8" : "#737373";
  const bg = summary.failingChecks > 0 ? "#fef2f2" : summary.open > 0 ? "#eff6ff" : "#fafafa";
  const border = summary.failingChecks > 0 ? "#fecaca" : summary.open > 0 ? "#bfdbfe" : "#e5e5e5";
  const severityPillBgDep =
    view.severity === "action" ? "#dc2626" : view.severity === "watch" ? "#a16207" : "#525252";
  const severityLabelDep =
    view.severity === "action" ? "דורש פעולה" : view.severity === "watch" ? "במעקב" : "ייעוץ";
  const deps = (doc.dependencies ?? []).slice().sort((a, b) => {
    // unresolved first, then by repo + pr_number desc
    if ((a.resolved ?? false) !== (b.resolved ?? false)) return (a.resolved ? 1 : -1);
    const r = (a.repo ?? "").localeCompare(b.repo ?? "");
    if (r !== 0) return r;
    return (b.pr_number ?? 0) - (a.pr_number ?? 0);
  });

  return (
    <section
      aria-label="תלויות PR"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            style={{
              ...pill,
              background: severityPillBgDep,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabelDep}
          </span>
          תלויות PR · {summary.open === 0 ? "אין פתוחות" : `${summary.open} פתוח${summary.open === 1 ? "ה" : "ות"}`}
        </span>
        <span style={{ ...overviewCount, color: headColor }}>
          {summary.resolved} נפתרו{summary.failingChecks > 0 ? ` · ${summary.failingChecks} עם כשל בדיקה` : ""}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: headColor, marginBottom: 4 }}>
        {view.headline}
      </div>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>

      {errs.length > 0 && (
        <div style={{ ...subLine, color: "#991b1b", marginBottom: 6 }}>
          שגיאות איסוף ({errs.length}): {errs[0]}
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {deps.map((d) => {
          const resolved = d.resolved === true;
          const failing = (d.checks_summary?.fail ?? 0) > 0 && !resolved;
          const stateText = (d.state ?? "—").toLowerCase();
          const pillBg = resolved ? "#737373" : failing ? "#dc2626" : "#2563eb";
          const sidebar = resolved ? "#a3a3a3" : failing ? "#dc2626" : "#2563eb";
          const c = d.checks_summary;
          const checks =
            c && (c.total ?? 0) > 0
              ? `בדיקות: ${c.pass ?? 0} עברו · ${c.fail ?? 0} כשלו${(c.pending ?? 0) > 0 ? ` · ${c.pending} ממתינות` : ""}`
              : null;
          return (
            <li
              key={d.dependency_id}
              style={{
                fontSize: 13,
                color: "#404040",
                borderInlineStart: `3px solid ${sidebar}`,
                paddingInlineStart: 8,
              }}
            >
              <div style={{ fontWeight: 500 }}>
                <span
                  style={{
                    ...pill,
                    background: pillBg,
                    marginInlineEnd: 6,
                    fontSize: 10,
                    padding: "1px 6px",
                  }}
                >
                  {stateText}
                </span>
                <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>
                  {d.repo ?? ""}#{d.pr_number ?? "?"}
                </span>
                {d.title ? ` · ${d.title}` : ""}
              </div>
              {checks && <div style={subLine}>{checks}</div>}
              {d.last_checked_at && (
                <div style={subLine}>נבדק {relativeTimeHe(d.last_checked_at)}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WorkflowsCard({ doc }: { doc: WorkflowsDoc | null }) {
  if (!doc) return null;
  const att = workflowsAttention(doc);
  const view = classifyWorkflowsForOperator(att);
  if (!view) return null;

  const hasProdCritFail = att.productionCriticalFailing > 0;
  const headColor = hasProdCritFail ? "#991b1b" : att.failing.length > 0 ? "#b91c1c" : "#a16207";
  const bg = hasProdCritFail ? "#fef2f2" : att.failing.length > 0 ? "#fef2f2" : "#fefce8";
  const border = hasProdCritFail ? "#fecaca" : att.failing.length > 0 ? "#fecaca" : "#fde68a";
  const severityPillBgWf =
    view.severity === "action" ? "#dc2626" : view.severity === "watch" ? "#a16207" : "#525252";
  const severityLabelWf =
    view.severity === "action" ? "דורש פעולה" : view.severity === "watch" ? "במעקב" : "ייעוץ";

  const renderRow = (w: Workflow, kind: "failing" | "stale") => {
    const h = (w.health ?? "").toLowerCase();
    const crit = (w.criticality ?? "").toLowerCase();
    const isProdCrit = crit === "production_critical";
    const sidebar =
      kind === "failing" ? (isProdCrit ? "#dc2626" : "#f97316") : "#eab308";
    const pillBg = kind === "failing" ? "#dc2626" : "#a16207";
    return (
      <li
        key={w.workflow_key}
        style={{
          fontSize: 13,
          color: "#404040",
          borderInlineStart: `3px solid ${sidebar}`,
          paddingInlineStart: 8,
        }}
      >
        <div style={{ fontWeight: 500 }}>
          <span
            style={{
              ...pill,
              background: pillBg,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {h || "—"}
          </span>
          {isProdCrit && (
            <span
              style={{
                ...pill,
                background: "#7c2d12",
                marginInlineEnd: 6,
                fontSize: 10,
                padding: "1px 6px",
              }}
            >
              prod-critical
            </span>
          )}
          <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>{w.workflow_key}</span>
        </div>
        <div style={subLine}>
          {w.name ?? ""}
          {w.source_system ? ` · ${w.source_system}` : ""}
          {w.owner ? ` · ${w.owner}` : ""}
        </div>
        {w.last_failure_at && kind === "failing" && (
          <div style={subLine}>כשל אחרון: {relativeTimeHe(w.last_failure_at)}</div>
        )}
        {w.last_run_at && (
          <div style={subLine}>הרצה אחרונה: {relativeTimeHe(w.last_run_at)}</div>
        )}
      </li>
    );
  };

  return (
    <section
      aria-label="תזרימים שדורשים תשומת לב"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            style={{
              ...pill,
              background: severityPillBgWf,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabelWf}
          </span>
          תזרימים · {att.failing.length === 0 ? "אין כשלים" : `${att.failing.length} בכשל`}
          {att.stale.length > 0 ? ` · ${att.stale.length} ללא ידוע` : ""}
        </span>
        <span style={{ ...overviewCount, color: headColor }}>
          {hasProdCritFail
            ? `${att.productionCriticalFailing} קריטי לפרודקשן`
            : `${att.healthy} תקינים · ${att.disabled} מושבתים · ${att.deprecated} מיושנים`}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: headColor, marginBottom: 4 }}>
        {view.headline}
      </div>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>

      {att.failing.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px 0", display: "grid", gap: 8 }}>
          {att.failing.map((w) => renderRow(w, "failing"))}
        </ul>
      )}

      {att.stale.length > 0 && (
        <>
          <div style={sectionLabel}>מצב לא ידוע</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {att.stale.slice(0, 5).map((w) => renderRow(w, "stale"))}
          </ul>
          {att.stale.length > 5 && (
            <div style={{ ...subLine, marginTop: 4 }}>
              ועוד {att.stale.length - 5}…
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LanesOverview({ lanes }: { lanes: LaneRow[] }) {
  if (lanes.length === 0) return null;
  return (
    <section aria-label="מסלולי עבודה מקבילים" style={overviewCard}>
      <div style={overviewHead}>
        <span>מסלולי עבודה מקבילים</span>
        <span style={overviewCount}>{lanes.length}</span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {lanes.map((l) => (
          <li key={l.key} style={{ fontSize: 13, color: "#404040" }}>
            <b>מסלול {l.key}</b>
            {l.title ? ` · ${l.title}` : ""}
            {l.primary_user ? ` · ${l.primary_user}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Strip markdown emphasis/strikethrough markers so the gate text reads cleanly.
// Raw source is bullet text scraped from CURRENT.md by scripts/build-session-index.sh.
export function plainifyGate(s: string): string {
  return s
    .replace(/~~([^~]+)~~/g, "")        // drop strikethrough segments entirely (resolved)
    .replace(/\*\*([^*]+)\*\*/g, "$1")  // unwrap bold
    .replace(/`([^`]+)`/g, "$1")        // unwrap inline code
    .replace(/\s+/g, " ")
    .trim();
}

// "Active" owner gates = gates whose plainified text is non-empty.
// Fully-resolved entries (everything wrapped in ~~strikethrough~~)
// collapse to "" and are dropped, mirroring the card's filter.
export function activeOwnerGates(gates: string[]): string[] {
  return gates.map(plainifyGate).filter((g) => g.length > 0);
}

export type OwnerGatesOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory: "backlog" | "pending";
  headline: string;
  meaning: string;
  nextAction: string;
  count: number;
};

// Pure classifier mirroring the #88/#89 contract — turns "N owner gates"
// into operator copy. Owner gates are decisions the autonomous loop cannot
// resolve without the owner; the operator's job is to surface them or, if
// they are the owner, work through them in order. Card hides itself when
// activeOwnerGates === 0.
export function classifyOwnerGatesForOperator(
  gates: string[],
): OwnerGatesOperatorView | null {
  const active = activeOwnerGates(gates);
  if (active.length === 0) return null;
  const count = active.length;
  if (count >= 5) {
    return {
      severity: "action",
      topCategory: "backlog",
      count,
      headline: `הצטברו החלטות בעלים (${count})`,
      meaning:
        "מצטברות יותר מ־4 החלטות שדורשות את הבעלים. כל עוד הן פתוחות, סלייסים שתלויים בהן נשארים על המדף.",
      nextAction:
        "אם אתה הבעלים — עבור עליהן בסדר הופעתן; אחרת — קדם אותן לפניו כדי לפתוח את הצוואר.",
    };
  }
  return {
    severity: "watch",
    topCategory: "pending",
    count,
    headline:
      count === 1
        ? "החלטה אחת ממתינה לבעלים"
        : `החלטות ממתינות לבעלים (${count})`,
    meaning:
      "יש החלטות שהלולאה האוטונומית לא יכולה לבחור בהן בלי הבעלים. אין שריפה — פשוט המתנה.",
    nextAction:
      "אפשר להמשיך בעבודה אחרת; כשהבעלים פנוי, להחזיר אותו לרשימה הזו לפי הסדר.",
  };
}

function ActiveIncidentsCard({ incidents }: { incidents: string[] }) {
  const clean = incidents.map(plainifyGate).filter((s) => s.length > 0);
  if (clean.length === 0) return null;
  return (
    <section
      aria-label="אירועים פעילים"
      style={{
        ...overviewCard,
        background: "#fef2f2",
        borderColor: "#fecaca",
      }}
    >
      <div style={{ ...overviewHead, color: "#991b1b" }}>
        <span>אירועים פעילים</span>
        <span style={{ ...overviewCount, color: "#b91c1c" }}>{clean.length}</span>
      </div>
      <ul style={{ listStyle: "disc inside", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {clean.map((s, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              color: "#7f1d1d",
              lineHeight: 1.45,
            }}
          >
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PushIsolationCard({ snap }: { snap: PushIsolationSnapshot | null }) {
  if (!snap) return null;
  const age = pushIsolationAgeHours(snap);
  const stale = isPushIsolationStale(snap);
  const cov = typeof snap.coverage_pct === "number" ? snap.coverage_pct : null;
  const view = classifyPushIsolationForOperator(snap);
  const isAction = view.severity === "action";
  const isWatch = view.severity === "watch";
  const bg = isAction ? "#fef2f2" : isWatch ? "#fffbeb" : "#f8fafc";
  const border = isAction ? "#fecaca" : isWatch ? "#fde68a" : "#e2e8f0";
  const headColor = isAction ? "#991b1b" : isWatch ? "#92400e" : "#334155";
  const countColor = isAction ? "#dc2626" : isWatch ? "#b45309" : "#475569";
  const pillBg = isAction ? "#dc2626" : isWatch ? "#a16207" : "#525252";
  const severityLabel =
    view.severity === "action" ? "דורש פעולה" : view.severity === "watch" ? "במעקב" : "תקין";
  const bodyColor = isAction ? "#7f1d1d" : isWatch ? "#78350f" : "#334155";
  const ageLabel =
    age === null
      ? "?"
      : age < 1
        ? `${Math.round(age * 60)} דק'`
        : `${age.toFixed(1)} שע'`;
  const authors = Object.entries(snap.untrailed_by_author ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return (
    <section
      aria-label="בידוד פוש"
      data-testid="push-isolation-card"
      data-display-state={view.topCategory}
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            data-testid="push-isolation-operator-severity"
            style={{
              ...pill,
              background: pillBg,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabel}
          </span>
          בידוד פוש · snapshot
        </span>
        <span style={{ ...overviewCount, color: countColor }}>
          {cov === null ? "?" : `${cov.toFixed(0)}%`}
        </span>
      </div>
      <div
        data-testid="push-isolation-operator-headline"
        style={{ fontSize: 14, fontWeight: 600, color: headColor, marginBottom: 4 }}
      >
        {view.headline}
      </div>
      <p
        data-testid="push-isolation-operator-meaning"
        style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}
      >
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p
        data-testid="push-isolation-operator-next-action"
        style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}
      >
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 4,
          fontSize: 13,
          color: bodyColor,
          lineHeight: 1.5,
        }}
      >
        <li>
          גיל: <strong>{ageLabel}</strong>
          {stale ? " · מיושן (>2 שע')" : ""}
        </li>
        <li>
          head: <code>{snap.head ?? "?"}</code> · חלון: {snap.window_commits ?? "?"} · trailed:{" "}
          {snap.trailed ?? 0}/{(snap.trailed ?? 0) + (snap.untrailed ?? 0)}
        </li>
        {typeof snap.distinct_session_ids === "number" && (
          <li>sessions מובחנים: {snap.distinct_session_ids}</li>
        )}
        {authors.length > 0 && (
          <li>
            untrailed:{" "}
            {authors.map(([a, n]) => `${a}=${n}`).join(" · ")}
          </li>
        )}
      </ul>
    </section>
  );
}

function OwnerGatesCard({ gates }: { gates: string[] }) {
  const clean = activeOwnerGates(gates);
  const view = classifyOwnerGatesForOperator(gates);
  if (!view) return null;
  const isAction = view.severity === "action";
  const bg = isAction ? "#fef2f2" : "#fffbeb";
  const border = isAction ? "#fecaca" : "#fde68a";
  const headColor = isAction ? "#991b1b" : "#92400e";
  const countColor = isAction ? "#dc2626" : "#b45309";
  const itemColor = isAction ? "#7f1d1d" : "#78350f";
  const severityPillBgGate = isAction ? "#dc2626" : "#a16207";
  const severityLabelGate = isAction ? "דורש פעולה" : "במעקב";
  return (
    <section
      id="ops-card-owner-gates"
      tabIndex={-1}
      aria-label="החלטות שממתינות לבעלים"
      style={{
        ...overviewCard,
        background: bg,
        borderColor: border,
      }}
    >
      <BackToAttentionSummaryLink />
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            style={{
              ...pill,
              background: severityPillBgGate,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabelGate}
          </span>
          החלטות שממתינות לבעלים
        </span>
        <span style={{ ...overviewCount, color: countColor }}>{clean.length}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: headColor, marginBottom: 4 }}>
        {view.headline}
      </div>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>
      <ul style={{ listStyle: "disc inside", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {clean.map((g, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              color: itemColor,
              lineHeight: 1.45,
            }}
          >
            <Link
              to={`/ops/gates/${encodeURIComponent(g)}`}
              data-testid="owner-gate-link"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {g}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const verdictPillBg: Record<string, string> = {
  KILL_LIKELY_SAFE: "#fee2e2",
  NEEDS_ATTACH: "#fef3c7",
};
const verdictPillFg: Record<string, string> = {
  KILL_LIKELY_SAFE: "#991b1b",
  NEEDS_ATTACH: "#92400e",
};

function ProcessesCard({ doc }: { doc: ProcessesDoc | null }) {
  const rows = actionableProcesses(doc);
  const view = classifyProcessesForOperator(rows);
  if (!view) return null;
  const isAction = view.severity === "action";
  const isWatch = view.severity === "watch";
  const bg = isAction ? "#fef2f2" : isWatch ? "#fffbeb" : "#fafafa";
  const border = isAction ? "#fecaca" : isWatch ? "#fde68a" : "#e5e5e5";
  const headColor = isAction ? "#991b1b" : isWatch ? "#92400e" : "#404040";
  const countColor = isAction ? "#dc2626" : isWatch ? "#b45309" : "#525252";
  const severityPillBgProc = isAction ? "#dc2626" : isWatch ? "#a16207" : "#525252";
  const severityLabelProc = isAction ? "דורש פעולה" : isWatch ? "במעקב" : "ייעוץ";
  return (
    <section
      aria-label="תהליכים ארוכי-טווח"
      style={{
        ...overviewCard,
        background: bg,
        borderColor: border,
      }}
    >
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            style={{
              ...pill,
              background: severityPillBgProc,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabelProc}
          </span>
          תהליכים ארוכי-טווח
        </span>
        <span style={{ ...overviewCount, color: countColor }}>{rows.length}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: headColor, marginBottom: 4 }}>
        {view.headline}
      </div>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {rows.map((p) => (
          <li
            key={p.pid}
            style={{
              fontSize: 12,
              color: "#404040",
              borderTop: "1px solid #f5f5f5",
              paddingTop: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span>
                <code style={{ fontSize: 11 }}>{p.user ?? "?"}</code>
                {" · pid "}
                <code style={{ fontSize: 11 }}>{p.pid}</code>
                {p.elapsed ? ` · ${p.elapsed}` : ""}
              </span>
              {p.verdict && (
                <span
                  style={{
                    ...pill,
                    background: verdictPillBg[p.verdict] ?? "#e5e5e5",
                    color: verdictPillFg[p.verdict] ?? "#404040",
                  }}
                  title={p.verdict}
                >
                  {PROCESS_VERDICT_LABEL_HE[p.verdict] ?? p.verdict}
                </span>
              )}
            </div>
            {p.command && (
              <div style={{ ...subLine, fontFamily: "monospace", marginTop: 2 }}>
                {p.command.length > 70 ? p.command.slice(0, 67) + "…" : p.command}
              </div>
            )}
            {p.listening_on && (
              <div style={subLine}>מקשיב: {p.listening_on}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RuntimeContinuityMetricsCard({
  doc,
}: {
  doc: RuntimeContinuityDoc | null;
}) {
  const m = runtimeContinuityMetrics(doc);
  if (!m.hasData) return null;
  const hasFalseStops = m.possibleFalseStops > 0;
  const head = m.ownerGates > 0 ? "#b45309" : "#166534";
  const bg = m.ownerGates > 0 ? "#fffbeb" : "#f0fdf4";
  const border = m.ownerGates > 0 ? "#fde68a" : "#bbf7d0";
  return (
    <section
      aria-label="מדדי רציפות runtime"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: head }}>
        <span>
          מדדי runtime · חלון {m.windowDays} ימים · {m.sessions} sessions
        </span>
        {m.ownerGates > 0 && (
          <span style={{ ...overviewCount, color: head }}>
            {m.ownerGates} owner gate{m.ownerGates === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div style={{ ...subLine, color: "#404040", marginTop: 4 }}>
        ▶ {m.continuations} continuations
        {m.stops > 0 && <> · ⏸ {m.stops} stops</>}
        {m.shipped > 0 && <> · ✅ {m.shipped} shipped</>}
        {hasFalseStops && (
          <>
            {" · "}
            <span style={{ color: "#b45309" }}>
              ⚠ {m.possibleFalseStops} possible false stop
              {m.possibleFalseStops === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>
      {m.topStopReason && m.topStopReason.count > 0 && (
        <div style={{ ...subLine, color: "#404040" }}>
          סיבת stop נפוצה: {m.topStopReason.reason} ({m.topStopReason.count})
        </div>
      )}
      {m.topOwnerGateType && m.topOwnerGateType.count > 0 && (
        <div style={{ ...subLine, color: "#404040" }}>
          owner gate נפוץ: {m.topOwnerGateType.type} ({m.topOwnerGateType.count})
        </div>
      )}
      {m.generatedAt && (
        <div style={{ ...subLine, color: "#737373" }}>
          חישוב אחרון: {relativeTimeHe(m.generatedAt)}
        </div>
      )}
    </section>
  );
}

function RuntimeContinuityCard({ doc }: { doc: HandoffsIndexDoc | null }) {
  const s = runtimeContinuitySummary(doc);
  if (s.health === "empty") return null;
  const head = s.health === "fail" ? "#991b1b" : s.health === "warn" ? "#b45309" : "#166534";
  const bg = s.health === "fail" ? "#fef2f2" : s.health === "warn" ? "#fffbeb" : "#f0fdf4";
  const border = s.health === "fail" ? "#fecaca" : s.health === "warn" ? "#fde68a" : "#bbf7d0";
  return (
    <section
      aria-label="רציפות runtime"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: head }}>
        <span>רציפות runtime · {s.total} handoff{s.total === 1 ? "" : "s"}</span>
        <span style={{ ...overviewCount, color: head }}>
          {s.health === "fail" ? "שגיאה" : s.health === "warn" ? "סחיפה" : "תקין"}
        </span>
      </div>
      <div style={{ ...subLine, color: "#404040", marginTop: 4 }}>
        ✓ {s.ok} תקינים
        {s.drift > 0 && <> · ⚠ {s.drift} drift</>}
        {s.error > 0 && <> · ✗ {s.error} שגיאות</>}
        {s.missing > 0 && <> · ◌ {s.missing} ללא state</>}
        {s.unknown > 0 && <> · ? {s.unknown} לא מאומתים</>}
      </div>
      {s.terminalDeclared > 0 && (
        <div style={{ ...subLine, color: "#404040" }}>
          סטטוסים:
          {s.terminalBuckets.shipped > 0 && <> ✅ {s.terminalBuckets.shipped} הופצו</>}
          {s.terminalBuckets.handoff_pending > 0 && <> · ⏭ {s.terminalBuckets.handoff_pending} ממתינים</>}
          {s.terminalBuckets.blocked > 0 && <> · ⛔ {s.terminalBuckets.blocked} חסומים</>}
          {s.terminalBuckets.checkpoint > 0 && <> · ⏸ {s.terminalBuckets.checkpoint} checkpoint</>}
          {s.terminalBuckets.abandoned > 0 && <> · ◌ {s.terminalBuckets.abandoned} ננטשו</>}
          {s.terminalBuckets.other > 0 && <> · • {s.terminalBuckets.other} אחר</>}
        </div>
      )}
      {s.latestPerBucket.shipped && (
        <div style={{ ...subLine, color: "#166534" }}>
          ✅ הפצה אחרונה: {relativeTimeHe(s.latestPerBucket.shipped)}
        </div>
      )}
      {s.latestPerBucket.blocked && (
        <div style={{ ...subLine, color: "#991b1b" }}>
          ⛔ חסימה אחרונה: {relativeTimeHe(s.latestPerBucket.blocked)}
        </div>
      )}
      {s.latestWrittenAt && (
        <div style={{ ...subLine, color: "#737373" }}>
          handoff אחרון: {relativeTimeHe(s.latestWrittenAt)}
        </div>
      )}
    </section>
  );
}

function HandoffsCard({ doc }: { doc: HandoffsIndexDoc | null }) {
  const rows = actionableHandoffs(doc);
  if (rows.length === 0) return null;
  return (
    <section
      aria-label="handoffs לבדיקה"
      style={{
        ...overviewCard,
        background: "#fef2f2",
        borderColor: "#fecaca",
      }}
    >
      <div style={{ ...overviewHead, color: "#991b1b" }}>
        <span>handoffs לבדיקה · אימות נכשל</span>
        <span style={{ ...overviewCount, color: "#b91c1c" }}>{rows.length}</span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {rows.map((h) => (
          <li
            key={h.handoff_path ?? h.path ?? ""}
            style={{
              fontSize: 12,
              color: "#7f1d1d",
              borderTop: "1px solid #fee2e2",
              paddingTop: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <code style={{ fontSize: 11 }}>{handoffDisplayPath(h)}</code>
              <span
                style={{
                  ...pill,
                  background: "#fecaca",
                  color: "#991b1b",
                }}
              >
                {h.verifier_status ?? "unverified"}
              </span>
            </div>
            {(h.written_at || h.mtime) && (
              <div style={subLine}>עודכן: {relativeTimeHe((h.written_at ?? h.mtime) as string)}</div>
            )}
            {h.verifier_message && (
              <div style={{ ...subLine, fontFamily: "monospace" }}>{h.verifier_message}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const severityPillBg: Record<SeverityLevel, string> = {
  high: "#fecaca",
  medium: "#fde68a",
  low: "#e5e5e5",
  unknown: "#e5e5e5",
};
const severityPillFg: Record<SeverityLevel, string> = {
  high: "#991b1b",
  medium: "#92400e",
  low: "#404040",
  unknown: "#525252",
};

function RuntimeIssuesCard({ doc }: { doc: RuntimeIssuesDoc | null }) {
  const rows = openRuntimeIssues(doc);
  if (rows.length === 0) return null;
  const view = classifyRuntimeIssuesForOperator(rows)!;
  // Visual severity follows operator severity (calm/watch/action), not raw
  // open-count — a long list of low-severity advisories should not look
  // dangerous. Mirrors #88's IntegrityCard pattern.
  const isAction = view.severity === "action";
  const isWatch = view.severity === "watch";
  const bg = isAction ? "#fef2f2" : isWatch ? "#fffbeb" : "#fafafa";
  const border = isAction ? "#fecaca" : isWatch ? "#fde68a" : "#e5e5e5";
  const headColor = isAction ? "#991b1b" : isWatch ? "#92400e" : "#404040";
  const countColor = isAction ? "#dc2626" : isWatch ? "#b45309" : "#525252";
  const pillBg = isAction ? "#dc2626" : isWatch ? "#a16207" : "#525252";
  const severityLabel =
    view.severity === "action" ? "דורש פעולה" : view.severity === "watch" ? "במעקב" : "ייעוץ";
  return (
    <section
      id="ops-card-runtime-issues"
      tabIndex={-1}
      aria-label="תקלות runtime פתוחות"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <BackToAttentionSummaryLink />
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            style={{
              ...pill,
              background: pillBg,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabel}
          </span>
          תקלות runtime פתוחות
        </span>
        <span style={{ ...overviewCount, color: countColor }}>{rows.length}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: headColor, marginBottom: 4 }}>
        {view.headline}
      </div>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {rows.map((i) => {
          const lvl = parseSeverity(i.severity);
          return (
            <li
              key={i.id}
              style={{
                fontSize: 12,
                color: "#78350f",
                borderTop: "1px solid #fef3c7",
                paddingTop: 6,
              }}
            >
              <Link
                to={`/ops/issues/${encodeURIComponent(i.id)}`}
                data-testid="runtime-issue-link"
                style={{
                  display: "block",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 500, textDecoration: "underline" }}>{i.title ?? i.id}</span>
                  <span
                    style={{
                      ...pill,
                      background: severityPillBg[lvl],
                      color: severityPillFg[lvl],
                    }}
                    title={lvl}
                  >
                    {SEVERITY_LABEL_HE[lvl]}
                  </span>
                </div>
                <div style={subLine}>
                  <code style={{ fontSize: 11 }}>{i.id}</code>
                  {i.date ? ` · ${i.date}` : ""}
                  {i.reporter ? ` · ${i.reporter}` : ""}
                </div>
                {i.disposition && (
                  <div style={subLine}>תוכנית: {i.disposition}</div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const queueTypeLabel: Record<OperationalQueueType, string> = {
  runtime_issue: "תקלת runtime",
  blocker: "חוסם",
  degraded_workflow: "תהליך מושבת",
  failed_endpoint: "endpoint נפל",
  failed_unit: "systemd unit",
  false_stop: "false stop",
  owner_gate: "owner gate",
  stale_projection: "פרויקציה ישנה",
  verifier_failure: "verifier כשל",
  handoff_ready: "handoff מוכן",
  blocked_session: "session חסומה",
};

// Pill colors per router decision. AUTO=green (safe to spawn), ESCALATE=amber,
// DEFER=neutral, OWNER omitted since the GATE pill already encodes it.
const routePillStyle: Record<QueueRouteDecision, { bg: string; fg: string; label: string }> = {
  autonomous: { bg: "#dcfce7", fg: "#166534", label: "AUTO" },
  escalate:   { bg: "#fed7aa", fg: "#9a3412", label: "ESCALATE" },
  defer:      { bg: "#e5e7eb", fg: "#374151", label: "DEFER" },
  owner:      { bg: "#fef3c7", fg: "#92400e", label: "OWNER" },
};

// Execution-status pill colors. Mirrors the router pill palette so the two
// rows of chips read as one visual language.
const receiptPillStyle: Record<
  "planned" | "started" | "succeeded" | "failed" | "blocked" | "skipped" | "max_retries",
  { bg: string; fg: string; label: string; title: string }
> = {
  planned:     { bg: "#ede9fe", fg: "#5b21b6", label: "מתוכנן",  title: "dry-run planned" },
  started:     { bg: "#e0e7ff", fg: "#3730a3", label: "רץ",       title: "started" },
  succeeded:   { bg: "#dcfce7", fg: "#166534", label: "הצליח",   title: "succeeded" },
  failed:      { bg: "#fee2e2", fg: "#991b1b", label: "נכשל",     title: "failed" },
  blocked:     { bg: "#fed7aa", fg: "#9a3412", label: "חסום",     title: "aborted" },
  skipped:     { bg: "#e5e7eb", fg: "#374151", label: "דולג",     title: "skipped" },
  max_retries: { bg: "#fecaca", fg: "#7f1d1d", label: "מקסימום ניסיונות", title: "retry_count >= 3" },
};

function outcomeToReceiptKey(o: QueueReceiptOutcome): keyof typeof receiptPillStyle {
  if (o === "aborted") return "blocked";
  if (o === "planned" || o === "started" || o === "succeeded" || o === "failed" || o === "skipped") {
    return o;
  }
  return "skipped";
}

function OperationalQueueRow({
  item,
  route,
  planned,
  latestReceipt,
}: {
  item: OperationalQueueItem;
  route?: QueueRoute;
  planned?: boolean;
  latestReceipt?: QueueReceipt;
}) {
  const lvl = severityFromQueue(item.severity);
  // Suppress the OWNER router pill when the GATE pill already says it,
  // to avoid duplicate visual noise.
  const showRoutePill = route && !(route.decision === "owner" && item.owner_gate);
  const maxRetries = isMaxRetries(latestReceipt);
  const statusKey = latestReceipt ? outcomeToReceiptKey(latestReceipt.outcome) : null;
  return (
    <li
      style={{
        fontSize: 12,
        color: "#1f2937",
        borderTop: "1px solid #e5e7eb",
        paddingTop: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 500 }}>{item.summary}</span>
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {item.owner_gate && (
            <span
              style={{
                ...pill,
                background: "#fef3c7",
                color: "#92400e",
                fontWeight: 600,
              }}
              title={item.owner_gate_kind ?? "owner gate"}
            >
              GATE
            </span>
          )}
          {item.retryable && (
            <span
              style={{ ...pill, background: "#dbeafe", color: "#1e40af" }}
              title="retryable"
            >
              ↻
            </span>
          )}
          {planned && !latestReceipt && (
            <span
              style={{
                ...pill,
                background: receiptPillStyle.planned.bg,
                color: receiptPillStyle.planned.fg,
                fontWeight: 600,
              }}
              title={receiptPillStyle.planned.title}
            >
              {receiptPillStyle.planned.label}
            </span>
          )}
          {statusKey && (
            <span
              style={{
                ...pill,
                background: receiptPillStyle[statusKey].bg,
                color: receiptPillStyle[statusKey].fg,
                fontWeight: 600,
              }}
              title={latestReceipt?.notes || receiptPillStyle[statusKey].title}
            >
              {receiptPillStyle[statusKey].label}
            </span>
          )}
          {maxRetries && (
            <span
              style={{
                ...pill,
                background: receiptPillStyle.max_retries.bg,
                color: receiptPillStyle.max_retries.fg,
                fontWeight: 600,
              }}
              title={receiptPillStyle.max_retries.title}
            >
              {receiptPillStyle.max_retries.label}
            </span>
          )}
          {showRoutePill && route && (
            <span
              style={{
                ...pill,
                background: routePillStyle[route.decision].bg,
                color: routePillStyle[route.decision].fg,
                fontWeight: 600,
              }}
              title={route.reason}
            >
              {routePillStyle[route.decision].label}
            </span>
          )}
          <span
            style={{
              ...pill,
              background: severityPillBg[lvl],
              color: severityPillFg[lvl],
            }}
            title={item.severity}
          >
            P{item.operational_priority}
          </span>
        </span>
      </div>
      <div style={subLine}>
        <code style={{ fontSize: 11 }}>{queueTypeLabel[item.type]}</code>
        {" · "}
        <code style={{ fontSize: 11 }}>{item.source.producer}</code>
        {item.lane ? ` · lane: ${item.lane}` : ""}
        {item.freshness === "stale" ? " · stale" : ""}
      </div>
      {item.suggested_action && (
        <div style={subLine}>{item.suggested_action}</div>
      )}
    </li>
  );
}

export const OWNER_COLLAPSE_THRESHOLD = 5;

function OrchestratorIntegrityCard({ doc }: { doc: OrchestratorIntegrityDoc | null }) {
  const sum = summarizeOrchestratorIntegrity(doc);
  if (!sum) return null;
  // Attention-only: hide when integrity_status=green AND confidence=high. Surfacing
  // a permanent green card adds visual noise without operational signal.
  if (sum.status === "green" && sum.confidence === "high") return null;

  const view = classifyIntegrityForOperator(sum)!;

  // Visual severity is the *operator* severity (calm/watch/action), not the
  // raw integrity_status color. A "red" canonical that resolves to safe_degraded
  // for the operator should not look alarming.
  const isAction = view.severity === "action";
  const isWatch = view.severity === "watch";
  const headColor = isAction ? "#991b1b" : isWatch ? "#a16207" : "#404040";
  const bg = isAction ? "#fef2f2" : isWatch ? "#fefce8" : "#fafafa";
  const border = isAction ? "#fecaca" : isWatch ? "#fde68a" : "#e5e5e5";
  const statusPillBg = isAction ? "#dc2626" : isWatch ? "#a16207" : "#525252";
  const severityLabel =
    view.severity === "action" ? "דורש פעולה" : view.severity === "watch" ? "במעקב" : "תקין";

  return (
    <section
      aria-label="שלמות תזמורת הריצה"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            style={{
              ...pill,
              background: statusPillBg,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabel}
          </span>
          שלמות תזמורת
        </span>
        <span style={{ ...overviewCount, color: headColor }}>
          ביטחון מקבילות: {sum.confidence}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: headColor, marginBottom: 4 }}>
        {view.headline}
      </div>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>
      <div style={{ ...subLine, marginBottom: 6 }}>
        {sum.staleSessions > 0 && (
          <span style={{ marginInlineEnd: 10 }}>סשנים שאיבדו הלב: {sum.staleSessions}</span>
        )}
        {sum.ownerlessStaleSessions > 0 && (
          <span style={{ marginInlineEnd: 10 }}>חשד יתום: {sum.ownerlessStaleSessions}</span>
        )}
        {sum.driftedFiles > 0 && (
          <span style={{ marginInlineEnd: 10 }}>קבצים בסחיפה: {sum.driftedFiles}</span>
        )}
        {!sum.mergerHealthy && (
          <span style={{ marginInlineEnd: 10 }}>מתווך כתיבה: לא תקין</span>
        )}
        {sum.fallbackUsed && (
          <span style={{ marginInlineEnd: 10 }}>קריאה מהפרויקציה הנגזרת</span>
        )}
        {sum.highSeverityIssues > 0 && (
          <span style={{ marginInlineEnd: 10 }}>תקלות חמורות פתוחות: {sum.highSeverityIssues}</span>
        )}
      </div>
      {sum.reasons.length > 0 && (
        <details style={{ fontSize: 12, color: "#525252" }}>
          <summary style={{ cursor: "pointer", color: "#737373", marginBottom: 4 }}>
            פרטים טכניים ({sum.reasons.length})
          </summary>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 2 }}>
            {sum.reasons.map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// Surfaces producer_contract_violations.json — the governance layer behind the
// freshness badges. Attention-only: hidden when the runtime reports zero
// violations. Leads with stale/error writers (actionable), folds the longer
// "projection has no producer" inventory into a details disclosure.
function ProducerHealthCard({ doc }: { doc: ProducerViolationsDoc | null }) {
  const sum = summarizeProducerHealth(doc);
  if (!sum) return null;
  if (sum.total === 0) return null;

  const isAction = sum.error > 0;
  const isWatch = !isAction && sum.warn > 0;
  const headColor = isAction ? "#991b1b" : isWatch ? "#a16207" : "#404040";
  const bg = isAction ? "#fef2f2" : isWatch ? "#fefce8" : "#fafafa";
  const border = isAction ? "#fecaca" : isWatch ? "#fde68a" : "#e5e5e5";
  const pillBg = isAction ? "#dc2626" : isWatch ? "#a16207" : "#525252";
  const severityLabel = isAction ? "דורש פעולה" : isWatch ? "במעקב" : "מידע";

  const fmtAge = (s?: number) =>
    s == null ? "" : s < 3600 ? `${Math.floor(s / 60)} דק'` : s < 86400 ? `${Math.floor(s / 3600)} שע'` : `${Math.floor(s / 86400)} ימים`;

  return (
    <section
      aria-label="בריאות מפיקי הנתונים"
      style={{ ...overviewCard, background: bg, borderColor: border }}
    >
      <div style={{ ...overviewHead, color: headColor }}>
        <span>
          <span
            style={{ ...pill, background: pillBg, marginInlineEnd: 6, fontSize: 10, padding: "1px 6px" }}
          >
            {severityLabel}
          </span>
          בריאות מפיקי הנתונים
        </span>
        <span style={{ ...overviewCount, color: headColor }}>
          {sum.writers} מפיקים · {sum.total} ממצאים
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}>
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {isAction
          ? "מפיק נתונים נכשל — פרויקציה אחת או יותר אינה מתעדכנת."
          : isWatch
            ? "מפיק נתונים חרג מחלון הרענון הצפוי — ייתכן שהנתונים מתיישנים."
            : "פרויקציות ללא מפיק רשום — מתעדכנות ידנית או שאינן חיות."}
      </p>
      {sum.actionable.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px 0", display: "grid", gap: 4 }}>
          {sum.actionable.map((v, i) => (
            <li
              key={i}
              style={{ ...blockerItem, borderInlineStartColor: v.severity === "error" ? "#dc2626" : "#f59e0b" }}
            >
              <div style={{ fontWeight: 500 }}>
                <code style={{ fontSize: 12 }}>{(v.projection ?? "").replace(/^state\//, "")}</code>
                {v.age_seconds != null && <span> · בן {fmtAge(v.age_seconds)}</span>}
              </div>
              {v.writer && <div style={subLine}>מפיק: {v.writer}</div>}
            </li>
          ))}
        </ul>
      )}
      {sum.withoutProducer.length > 0 && (
        <details style={{ fontSize: 12, color: "#525252" }}>
          <summary style={{ cursor: "pointer", color: "#737373", marginBottom: 4 }}>
            פרויקציות ללא מפיק ({sum.withoutProducer.length})
          </summary>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 2 }}>
            {sum.withoutProducer.map((v, i) => (
              <li key={i}>
                · <code style={{ fontSize: 11 }}>{(v.projection ?? "").replace(/^state\//, "")}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function OperationalQueueCard({
  doc,
  routes,
  plan,
  receipts,
}: {
  doc: OperationalQueueDoc | null;
  routes?: QueueRoutesDoc | null;
  plan?: QueueReceiptDoc;
  receipts?: QueueReceiptDoc;
}) {
  const { actionable, awaitingOwner, total } = operationalQueueGroups(doc);
  const collapsible = awaitingOwner.length > OWNER_COLLAPSE_THRESHOLD;
  const [ownerExpanded, setOwnerExpanded] = useState(false);
  if (total === 0) return null;
  const routesMap = routes?.routes ?? {};
  const summary = routes?.summary;
  const plannedIds = plannedReceiptItemIds(parseReceipts(plan ?? null));
  const latestByItem = latestReceiptByItemId(parseReceipts(receipts ?? null));
  const statusCounts = executionStatusCounts(parseReceipts(receipts ?? null));
  const anyStatus =
    statusCounts.succeeded + statusCounts.failed + statusCounts.blocked + statusCounts.skipped > 0;
  const ownerVisible = collapsible && !ownerExpanded
    ? awaitingOwner.slice(0, OWNER_COLLAPSE_THRESHOLD)
    : awaitingOwner.slice(0, 20);
  const ownerHidden = awaitingOwner.length - ownerVisible.length;
  const view = classifyOperationalQueueForOperator({
    groups: { actionable, awaitingOwner, total },
    failedCount: statusCounts.failed,
    blockedCount: statusCounts.blocked,
  });
  const severityLabel =
    view.severity === "action" ? "דורש פעולה" : view.severity === "watch" ? "במעקב" : "תקין";
  const severityBg =
    view.severity === "action" ? "#dc2626" : view.severity === "watch" ? "#a16207" : "#525252";
  return (
    <section
      id="ops-card-operational-queue"
      tabIndex={-1}
      aria-label="תור תפעולי"
      style={{
        ...overviewCard,
        background: "#f5f3ff",
        borderColor: "#ddd6fe",
      }}
    >
      <BackToAttentionSummaryLink />
      <div style={{ ...overviewHead, color: "#5b21b6" }}>
        <span>
          <span
            data-testid="ops-queue-operator-severity"
            style={{
              ...pill,
              background: severityBg,
              marginInlineEnd: 6,
              fontSize: 10,
              padding: "1px 6px",
            }}
          >
            {severityLabel}
          </span>
          תור תפעולי · MN-OS
        </span>
        <span style={{ ...overviewCount, color: "#6d28d9" }}>{total}</span>
      </div>
      <div
        data-testid="ops-queue-operator-headline"
        style={{ fontSize: 14, fontWeight: 600, color: "#5b21b6", marginBottom: 4 }}
      >
        {view.headline}
      </div>
      <p
        data-testid="ops-queue-operator-meaning"
        style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}
      >
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p
        data-testid="ops-queue-operator-next-action"
        style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}
      >
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>
      <div style={{ fontSize: 11, color: "#6d28d9", marginBottom: 6 }}>
        {actionable.length} זמינים לעיבוד · {awaitingOwner.length} ממתינים ל-owner
        {summary && (
          <>
            {" · "}
            <span title="router classifier">
              auto {summary.autonomous ?? 0} · escalate {summary.escalate ?? 0} · defer {summary.defer ?? 0}
            </span>
          </>
        )}
        {plannedIds.size > 0 && (
          <>
            {" · "}
            <span title="dry-run planned receipts">מתוכנן {plannedIds.size}</span>
          </>
        )}
        {anyStatus && (
          <>
            {" · "}
            <span title="execution receipts">
              הצליחו {statusCounts.succeeded} · נכשלו {statusCounts.failed} · חסומים {statusCounts.blocked}
              {statusCounts.skipped > 0 ? ` · דולגו ${statusCounts.skipped}` : ""}
            </span>
          </>
        )}
      </div>
      {actionable.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5b21b6", marginTop: 4 }}>
            זמינים לעיבוד
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {actionable.slice(0, 20).map((i) => (
              <OperationalQueueRow
                key={i.id}
                item={i}
                route={routesMap[i.id]}
                planned={plannedIds.has(i.id)}
                latestReceipt={latestByItem[i.id]}
              />
            ))}
          </ul>
        </>
      )}
      {awaitingOwner.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              fontWeight: 600,
              color: "#92400e",
              marginTop: 10,
              borderTop: "1px dashed #fde68a",
              paddingTop: 6,
            }}
          >
            <span>ממתינים ל-owner ({awaitingOwner.length})</span>
            {collapsible && (
              <button
                type="button"
                onClick={() => setOwnerExpanded((v) => !v)}
                aria-expanded={ownerExpanded}
                aria-controls="ops-owner-gated-list"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#92400e",
                  background: "transparent",
                  border: "1px solid #fde68a",
                  borderRadius: 999,
                  padding: "1px 8px",
                  cursor: "pointer",
                }}
              >
                {ownerExpanded ? "כווץ" : `הצג הכל (${awaitingOwner.length})`}
              </button>
            )}
          </div>
          <ul
            id="ops-owner-gated-list"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}
          >
            {ownerVisible.map((i) => (
              <OperationalQueueRow
                key={i.id}
                item={i}
                route={routesMap[i.id]}
                planned={plannedIds.has(i.id)}
                latestReceipt={latestByItem[i.id]}
              />
            ))}
          </ul>
          {collapsible && !ownerExpanded && ownerHidden > 0 && (
            <div style={{ ...subLine, color: "#92400e", marginTop: 4 }}>
              + {ownerHidden} מוסתרים
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Management cockpit v0 — operator-facing projection.
// Contract: ops-vault projects/merkaz-neshama-os/lane-a/management-cockpit-v0.md
// Always renders (never returns null on empty): the surface must be visible so
// the operator knows the cockpit exists and is honest about its source state.
//
// Three display states (see managementCockpitDisplayState):
//   - no_source: writer hasn't run / file missing / generated_default
//   - defined_no_queue: groups owner-defined but every group has queue_membership.mode=not_configured AND automation/executor off — vacuous zeros suppressed
//   - live: at least one group is queue-wired OR automation/executor is on — counts are real
export function ManagementCockpitCard({ doc }: { doc: ManagementCockpitDoc | null }) {
  const state = managementCockpitDisplayState(doc);
  const summary = managementCockpitSummary(doc);
  const groups = doc?.groups ?? [];
  const ownerGates = doc?.owner_gates ?? [];
  const automationOn = doc?._meta?.automation_active === true;
  const executorOn = doc?._meta?.executor_active === true;
  const freshness = state === "no_source" ? null : formatManagementCockpitFreshness(doc);
  const headerCount =
    state === "no_source"
      ? "אין נתונים עדיין"
      : state === "defined_no_queue"
        ? "תור לא מחובר"
        : `${summary.open_items} פתוחים`;
  return (
    <section
      aria-label="ניהול עמותה"
      data-testid="management-cockpit-card"
      data-display-state={state}
      style={{
        ...overviewCard,
        background: "#f0fdf4",
        borderColor: "#bbf7d0",
      }}
    >
      <div style={{ ...overviewHead, color: "#166534" }}>
        <span>ניהול עמותה · MN-OS</span>
        <span style={{ ...overviewCount, color: "#15803d" }}>{headerCount}</span>
      </div>
      {state === "no_source" && (
        <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.5 }}>
          <strong>הכוכב טרם הופעל.</strong> כותב המידע עדיין לא רץ — אין נתונים להציג.
          {" "}לאחר הפעלת האוטומציה, התצוגה תתעדכן אוטומטית.
          <div style={{ ...subLine, marginTop: 4, color: "#15803d" }}>
            <span data-testid="management-cockpit-source-missing">מצב: ברירת מחדל · אוטומציה: לא פעילה</span>
          </div>
        </div>
      )}
      {state === "defined_no_queue" && (
        <>
          <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.5 }}>
            <strong>קבוצות הוגדרו — תור עדיין לא מחובר.</strong> הספירות הן אפסים מבנייה, לא אמת.
            {" "}כשהתור יחובר לאוטומציה, כאן יופיעו הנתונים האמיתיים.
          </div>
          <div
            data-testid="management-cockpit-runtime-flags"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 8,
              fontSize: 11,
            }}
          >
            <ManagementCockpitFlag label="תור" value="לא מחובר" />
            <ManagementCockpitFlag
              label="אוטומציה"
              value={automationOn ? "פעילה" : "לא פעילה"}
            />
            <ManagementCockpitFlag
              label="Executor"
              value={executorOn ? "פעיל" : "לא פעיל"}
            />
          </div>
          {freshness && (
            <div
              data-testid="management-cockpit-freshness"
              style={{ ...subLine, marginTop: 6, color: "#15803d" }}
            >
              {freshness}
            </div>
          )}
          {groups.length > 0 && (
            <ul
              data-testid="management-cockpit-defined-groups"
              style={{
                listStyle: "none",
                padding: 0,
                margin: "8px 0 0",
                display: "grid",
                gap: 4,
                fontSize: 12,
                color: "#14532d",
              }}
            >
              {groups.slice(0, 10).map((g) => (
                <li
                  key={g.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                >
                  <span>
                    {g.display_name || g.id}
                    {g.operator ? (
                      <span style={{ color: "#15803d", marginInlineStart: 6 }}>
                        · {g.operator}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ color: "#15803d" }}>
                    {managementCockpitGroupStatusLabel(g.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {state === "live" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 6,
              fontSize: 12,
              color: "#166534",
            }}
          >
            <ManagementCockpitMetric label="קבוצות" value={summary.groups} />
            <ManagementCockpitMetric label="פתוחים" value={summary.open_items} />
            <ManagementCockpitMetric label="חסומים" value={summary.blocked} />
            <ManagementCockpitMetric label="ל-owner" value={summary.needs_owner} />
            <ManagementCockpitMetric label="לרב" value={summary.needs_rabbi} />
          </div>
          {freshness && (
            <div
              data-testid="management-cockpit-freshness"
              style={{ ...subLine, marginTop: 6, color: "#15803d" }}
            >
              {freshness}
            </div>
          )}
          {ownerGates.length > 0 && (
            <div
              data-testid="management-cockpit-owner-gates"
              style={{
                marginTop: 8,
                padding: "6px 10px",
                borderRadius: 8,
                background: "#fef9c3",
                borderInlineStart: "3px solid #ca8a04",
                fontSize: 12,
                color: "#713f12",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                data-testid="management-cockpit-owner-gates-count"
                style={{
                  fontWeight: 700,
                  background: "#fde047",
                  borderRadius: 12,
                  padding: "1px 7px",
                  fontSize: 13,
                  color: "#713f12",
                }}
              >
                {ownerGates.length}
              </span>
              <span>דורש אישור בעלים — פריטים ממתינים לטיפולך</span>
            </div>
          )}
          {groups.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "8px 0 0",
                display: "grid",
                gap: 4,
                fontSize: 12,
                color: "#14532d",
              }}
            >
              {groups.slice(0, 10).map((g) => {
                const wired = isManagementCockpitGroupQueueConnected(g);
                return (
                  <li
                    key={g.id}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                  >
                    <span>
                      {g.display_name || g.id}
                      {g.operator ? (
                        <span style={{ color: "#15803d", marginInlineStart: 6 }}>
                          · {g.operator}
                        </span>
                      ) : null}
                    </span>
                    <span style={{ color: "#15803d" }}>
                      {wired
                        ? `${g.summary?.open_items ?? 0} פתוחים · ${g.summary?.blocked ?? 0} חסומים`
                        : `${managementCockpitGroupStatusLabel(g.status)} · אין תור מחובר`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function managementCockpitGroupStatusLabel(
  status: ManagementCockpitGroupStatus | undefined,
): string {
  switch (status) {
    case "active":
      return "פעיל";
    case "paused":
      return "מושהה";
    case "archived":
      return "ארכיון";
    case "defined":
    default:
      return "מוגדר";
  }
}

function ManagementCockpitMetric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "4px 2px",
        borderRadius: 6,
        background: "#dcfce7",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 16, color: "#14532d" }}>{value}</span>
      <span style={{ fontSize: 10, color: "#166534" }}>{label}</span>
    </div>
  );
}

function ManagementCockpitFlag({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 6,
        background: "#dcfce7",
        color: "#14532d",
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function SessionsStrip({ sessions }: { sessions: SessionRow[] }) {
  const recent = sessions.slice(0, 10);
  if (recent.length === 0) return null;
  return (
    <section aria-label="פעילות אחרונה" style={{ ...card, marginTop: 14 }}>
      <div style={sectionLabel}>פעילות אחרונה (10 מפגשים)</div>
      <ol style={{ listStyle: "decimal inside", padding: 0, margin: 0 }}>
        {recent.map((s) => (
          <li key={s.file} style={{ fontSize: 12, color: "#525252", marginBottom: 3 }}>
            <span style={{ color: "#737373" }}>{s.date}</span>
            {" · "}
            <code style={{ fontSize: 11 }}>{s.file.replace(/^sessions\//, "")}</code>
            {s.projects && s.projects.length > 0 && (
              <span style={{ color: "#a3a3a3" }}> · {s.projects.join(", ")}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function HealthOverview({ health }: { health: HealthDoc | null }) {
  if (!health) return null;
  const endpoints = health.endpoints ?? [];
  if (endpoints.length === 0) return null;
  const required = endpoints.filter((e) => e.required);
  const optional = endpoints.filter((e) => !e.required);
  const requiredOk = required.every((e) => e.ok);
  const overallOk = health.ok ?? requiredOk;
  const failed = health.failed ?? endpoints.filter((e) => !e.ok).map((e) => e.name);
  return (
    <section
      aria-label={`שירותים — ${overallOk ? "תקין" : "תקלה"}`}
      style={{
        ...overviewCard,
        background: overallOk ? "#f0fdf4" : "#fef2f2",
        borderColor: overallOk ? "#bbf7d0" : "#fecaca",
      }}
    >
      <div
        style={{
          ...overviewHead,
          color: overallOk ? "#166534" : "#991b1b",
        }}
      >
        <span>שירותים · {overallOk ? "תקין" : "תקלה"}</span>
        <span style={{ ...overviewCount, color: overallOk ? "#15803d" : "#b91c1c" }}>
          {endpoints.filter((e) => e.ok).length}/{endpoints.length}
          {health.ts ? ` · ${health.ts.replace("T", " ").replace("Z", "")}` : ""}
        </span>
      </div>
      {failed.length > 0 && (
        <div style={{ ...subLine, color: "#991b1b", marginBottom: 6 }}>
          נופלים: {failed.join(", ")}
        </div>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {[...required, ...optional].map((e) => (
          <li
            key={e.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: e.ok ? "#404040" : "#991b1b",
            }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: e.ok ? "#22c55e" : "#ef4444",
                  marginInlineEnd: 6,
                }}
              />
              {e.name}
              {e.required ? "" : " (לא חובה)"}
            </span>
            <span style={{ color: "#737373" }}>
              {e.status ?? "—"}
              {typeof e.latency_ms === "number" ? ` · ${e.latency_ms}ms` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BlockersOverview({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) return null;
  const sorted = [...blockers].sort((a, b) => {
    const da = ageDays(a.since);
    const db = ageDays(b.since);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return db - da;
  });
  const top = sorted.slice(0, 10);
  const oldest = sorted.find((b) => ageDays(b.since) != null);
  const oldestDays = oldest ? ageDays(oldest.since) : null;
  return (
    <section id="ops-card-blockers" tabIndex={-1} aria-label="חסמים פעילים" style={overviewCard}>
      <BackToAttentionSummaryLink />
      <div style={overviewHead}>
        <span>חסמים פעילים</span>
        <span style={overviewCount}>
          {blockers.length}
          {oldestDays != null ? ` · ותיק ביותר ${oldestDays} ימים` : ""}
        </span>
      </div>
      <ol style={overviewList}>
        {top.map((b) => {
          const d = ageDays(b.since);
          const lvl = ageLevel(d);
          const tint = agePalette[lvl];
          return (
            <li
              key={b.id}
              style={{
                ...overviewItem,
                borderInlineStart: tint
                  ? `3px solid ${tint.border}`
                  : "3px solid transparent",
                paddingInlineStart: 8,
                background: tint?.bg ?? "transparent",
                borderRadius: 6,
              }}
            >
              <Link
                to={`/ops/blockers/${encodeURIComponent(b.id)}`}
                data-testid="blocker-link"
                style={{ display: "block", color: "inherit", textDecoration: "none" }}
              >
                <div
                  style={{
                    fontWeight: 500,
                    color: tint?.fg ?? "#171717",
                    textDecoration: "underline",
                  }}
                >
                  {b.summary}
                </div>
                <div style={subLine}>
                  {b.lane ? `מסלול ${b.lane}` : ""}
                  {b.since ? ` · מאז ${b.since}` : ""}
                  {d != null ? ` · ${d} ימים` : ""}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      {blockers.length > top.length && (
        <div style={subLine}>+ {blockers.length - top.length} נוספים</div>
      )}
    </section>
  );
}

// Age-color palette for blocker/gate rows. warn (8-30d) and critical (>30d).
const agePalette: Record<AgeLevel, { bg: string; fg: string; border: string } | null> = {
  ok:       null,
  warn:     { bg: "#fffbeb", fg: "#78350f", border: "#f59e0b" },
  critical: { bg: "#fef2f2", fg: "#7f1d1d", border: "#dc2626" },
};

const driftPalette: Record<DriftLevel, { bg: string; fg: string; border: string }> = {
  fresh:    { bg: "#f0fdf4", fg: "#166534", border: "#bbf7d0" },
  soft:     { bg: "#fefce8", fg: "#854d0e", border: "#fde68a" },
  amber:    { bg: "#fffbeb", fg: "#92400e", border: "#fcd34d" },
  red:      { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
  none:     { bg: "#f5f5f5", fg: "#525252", border: "#d4d4d4" },
};

function DriftBadge({ lastVerified }: { lastVerified: string | null }) {
  const days = ageDays(lastVerified ?? undefined);
  const level = driftLevel(days);
  const c = driftPalette[level];
  const label =
    level === "none"
      ? "ללא תיעוד טריות"
      : days === 0
      ? "אומת היום"
      : `אומת לפני ${days}ד'`;
  return (
    <span
      title={lastVerified ? `אומת לאחרונה: ${lastVerified}` : "אין _meta.last_verified"}
      aria-label={label}
      style={{
        fontSize: 11,
        padding: "1px 7px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}

// Local freshness indicator rendered above a producer-backed card. Invisible while
// the source is fresh (no noise in the healthy case); surfaces an amber/red strip
// the moment that card's producer goes quiet, so stale data is never shown silently.
function CardFreshnessBadge({
  file,
  freshness,
}: {
  file: string;
  freshness: FreshnessDoc | null;
}) {
  const age = freshness?.files?.[file]?.age_seconds;
  const level = cardFreshLevel(age);
  if (level === "fresh" || level === "unknown") return null;
  const c = level === "stale" ? driftPalette.red : driftPalette.amber;
  const secs = age ?? 0;
  const label =
    level === "stale"
      ? `מקור הנתונים לא עודכן ${Math.floor(secs / 86400)} ימים — ייתכן שאינו עדכני`
      : `מקור הנתונים עודכן לפני ${Math.floor(secs / 3600)} שע'`;
  return (
    <div
      role="status"
      aria-label={label}
      data-testid="card-freshness"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 500,
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: "3px 9px",
        marginBottom: -6,
      }}
    >
      <span aria-hidden>⚠</span>
      <span>
        {label} · <code>{file.replace(/\.json$/, "")}</code>
      </span>
    </div>
  );
}

function LastRefreshBadge({ regeneratedAt }: { regeneratedAt?: string }) {
  if (!regeneratedAt) return null;
  const ageMin = Math.floor(
    (Date.now() - new Date(regeneratedAt).getTime()) / 60000,
  );
  if (Number.isNaN(ageMin) || ageMin < 0) return null;
  const stale = ageMin >= 60;
  return (
    <span
      title={`רוענן: ${regeneratedAt}`}
      aria-label={`רוענן ${relativeTimeHe(regeneratedAt)}`}
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        background: stale ? "#fef2f2" : "#f0fdf4",
        color: stale ? "#991b1b" : "#166534",
        border: `1px solid ${stale ? "#fecaca" : "#bbf7d0"}`,
        fontWeight: 500,
      }}
    >
      רוענן {relativeTimeHe(regeneratedAt)}
    </span>
  );
}

const pad: React.CSSProperties = {
  padding: 16,
  maxWidth: 760,
  margin: "0 auto",
  color: "var(--color-text, #111)",
};

const card: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
  background: "var(--color-card, #fff)",
};

const cardHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
};

const pill: React.CSSProperties = {
  color: "#fff",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const metaLine: React.CSSProperties = {
  fontSize: 13,
  color: "#404040",
  margin: "2px 0",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "#737373",
  marginTop: 10,
  marginBottom: 4,
};

const blockerList: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
};

const blockerItem: React.CSSProperties = {
  borderInlineStart: "3px solid #f59e0b",
  paddingInlineStart: 8,
  marginBottom: 6,
  fontSize: 13,
};

const subLine: React.CSSProperties = {
  fontSize: 12,
  color: "#525252",
};

const emptyInline: React.CSSProperties = {
  fontSize: 13,
  color: "#a3a3a3",
};

const emptyBox: React.CSSProperties = {
  padding: 16,
  textAlign: "center",
  color: "#737373",
  border: "1px dashed #d4d4d4",
  borderRadius: 10,
};

const overviewCard: React.CSSProperties = {
  border: "1px solid #fde68a",
  background: "#fffbeb",
  borderRadius: 10,
  padding: 12,
  marginBottom: 14,
};

const overviewHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  fontWeight: 600,
  fontSize: 14,
  marginBottom: 8,
  color: "#78350f",
};

const overviewCount: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: "#92400e",
};

const overviewList: React.CSSProperties = {
  listStyle: "decimal inside",
  padding: 0,
  margin: 0,
};

const overviewItem: React.CSSProperties = {
  marginBottom: 6,
  fontSize: 13,
  color: "#404040",
};

const errorBox: React.CSSProperties = {
  padding: 12,
  marginBottom: 12,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 8,
  fontSize: 13,
};
