import { useEffect, useState } from "react";

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

type Blocker = {
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

type FreshnessDoc = {
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

type ProcessesDoc = {
  _meta?: { last_verified?: string; advisory?: boolean; note?: string };
  long_running_processes?: ProcessRow[];
};

// Filter out processes already resolved — only surface what still needs owner attention.
export function actionableProcesses(doc: ProcessesDoc | null): ProcessRow[] {
  const all = doc?.long_running_processes ?? [];
  return all.filter((p) => p.verdict && p.verdict !== "RESOLVED_NO_ACTION");
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

type DependenciesDoc = {
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

type WorkflowsDoc = {
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

type RuntimeIssue = {
  id: string;
  file?: string | null;
  title?: string | null;
  date?: string | null;
  severity?: string | null;
  disposition?: string | null;
  reporter?: string | null;
};

type RuntimeIssuesDoc = {
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

// Collapse the schema's 5-level severity onto the OpsPage 4-level SeverityLevel
// for visual reuse (critical → high; info → low). Keep the schema enum on the
// data side; only fold at render time.
export function severityFromQueue(s: OperationalQueueSeverity): SeverityLevel {
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low" || s === "info") return "low";
  return "unknown";
}

type StaleEntry = { name: string; hours: number };

function stalenessEntries(
  f: FreshnessDoc | null,
  thresholdHours: number,
): StaleEntry[] {
  if (!f?.files) return [];
  return Object.entries(f.files)
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

function ageDays(since?: string, now: Date = new Date()): number | null {
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
  const [meta, setMeta] = useState<MetaDoc | null>(null);
  const [activeSessions, setActiveSessions] = useState<ActiveSessionsDoc | null>(null);
  const [dependencies, setDependencies] = useState<DependenciesDoc | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowsDoc | null>(null);
  const [pushIsolation, setPushIsolation] = useState<PushIsolationSnapshot | null>(null);
  const [runtimeContinuity, setRuntimeContinuity] =
    useState<RuntimeContinuityDoc | null>(null);
  const [operationalQueue, setOperationalQueue] =
    useState<OperationalQueueDoc | null>(null);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [pd, bd, sd, hd, ld, rm, fr, pr, ho, ri, md, as, dp, wf, pi, rc, oq] = await Promise.all([
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

      <OperationalQueueCard doc={operationalQueue} />
      <HealthOverview health={health} />
      <ActiveSessionsCard doc={activeSessions} />
      <DependenciesCard doc={dependencies} />
      <WorkflowsCard doc={workflows} />
      <LanesOverview lanes={lanes} />
      <RecentMergesCard doc={recentMerges} />
      <BlockersOverview blockers={blockers} />
      <ActiveIncidentsCard incidents={activeIncidents} />
      <OwnerGatesCard gates={ownerGates} />
      <ProcessesCard doc={processes} />
      <PushIsolationCard snap={pushIsolation} />
      <RuntimeContinuityMetricsCard doc={runtimeContinuity} />
      <RuntimeContinuityCard doc={handoffs} />
      <HandoffsCard doc={handoffs} />
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
      aria-label="נתונים מתיישנים"
      style={{
        ...overviewCard,
        background: critical ? "#fef2f2" : "#fffbeb",
        borderColor: critical ? "#fecaca" : "#fde68a",
        marginBottom: 12,
      }}
    >
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
  if (summary.total === 0 && errs.length === 0) return null;

  const headColor = summary.failingChecks > 0 ? "#991b1b" : summary.open > 0 ? "#1d4ed8" : "#737373";
  const bg = summary.failingChecks > 0 ? "#fef2f2" : summary.open > 0 ? "#eff6ff" : "#fafafa";
  const border = summary.failingChecks > 0 ? "#fecaca" : summary.open > 0 ? "#bfdbfe" : "#e5e5e5";
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
          תלויות PR · {summary.open === 0 ? "אין פתוחות" : `${summary.open} פתוח${summary.open === 1 ? "ה" : "ות"}`}
        </span>
        <span style={{ ...overviewCount, color: headColor }}>
          {summary.resolved} נפתרו{summary.failingChecks > 0 ? ` · ${summary.failingChecks} עם כשל בדיקה` : ""}
        </span>
      </div>

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
  if (att.failing.length === 0 && att.stale.length === 0) return null;

  const hasProdCritFail = att.productionCriticalFailing > 0;
  const headColor = hasProdCritFail ? "#991b1b" : att.failing.length > 0 ? "#b91c1c" : "#a16207";
  const bg = hasProdCritFail ? "#fef2f2" : att.failing.length > 0 ? "#fef2f2" : "#fefce8";
  const border = hasProdCritFail ? "#fecaca" : att.failing.length > 0 ? "#fecaca" : "#fde68a";

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
          תזרימים · {att.failing.length === 0 ? "אין כשלים" : `${att.failing.length} בכשל`}
          {att.stale.length > 0 ? ` · ${att.stale.length} ללא ידוע` : ""}
        </span>
        <span style={{ ...overviewCount, color: headColor }}>
          {hasProdCritFail
            ? `${att.productionCriticalFailing} קריטי לפרודקשן`
            : `${att.healthy} תקינים · ${att.disabled} מושבתים · ${att.deprecated} מיושנים`}
        </span>
      </div>

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
function plainifyGate(s: string): string {
  return s
    .replace(/~~([^~]+)~~/g, "")        // drop strikethrough segments entirely (resolved)
    .replace(/\*\*([^*]+)\*\*/g, "$1")  // unwrap bold
    .replace(/`([^`]+)`/g, "$1")        // unwrap inline code
    .replace(/\s+/g, " ")
    .trim();
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
  const lowCoverage = cov !== null && cov < 50;
  const warn = stale || lowCoverage;
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
      style={{
        ...overviewCard,
        background: warn ? "#fffbeb" : "#f8fafc",
        borderColor: warn ? "#fde68a" : "#e2e8f0",
      }}
    >
      <div style={{ ...overviewHead, color: warn ? "#92400e" : "#334155" }}>
        <span>בידוד פוש · snapshot</span>
        <span style={{ ...overviewCount, color: warn ? "#b45309" : "#475569" }}>
          {cov === null ? "?" : `${cov.toFixed(0)}%`}
        </span>
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 4,
          fontSize: 13,
          color: warn ? "#78350f" : "#334155",
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
  const clean = gates.map(plainifyGate).filter((g) => g.length > 0);
  if (clean.length === 0) return null;
  return (
    <section
      aria-label="החלטות שממתינות לבעלים"
      style={{
        ...overviewCard,
        background: "#fffbeb",
        borderColor: "#fde68a",
      }}
    >
      <div style={{ ...overviewHead, color: "#92400e" }}>
        <span>החלטות שממתינות לבעלים</span>
        <span style={{ ...overviewCount, color: "#b45309" }}>{clean.length}</span>
      </div>
      <ul style={{ listStyle: "disc inside", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {clean.map((g, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              color: "#78350f",
              lineHeight: 1.45,
            }}
          >
            {g}
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
  if (rows.length === 0) return null;
  return (
    <section
      aria-label="תהליכים ארוכי-טווח"
      style={{
        ...overviewCard,
        background: "#fafafa",
        borderColor: "#e5e5e5",
      }}
    >
      <div style={{ ...overviewHead, color: "#404040" }}>
        <span>תהליכים ארוכי-טווח · ייעוץ</span>
        <span style={{ ...overviewCount, color: "#525252" }}>{rows.length}</span>
      </div>
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
                >
                  {p.verdict}
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
  return (
    <section
      aria-label="תקלות runtime פתוחות"
      style={{
        ...overviewCard,
        background: "#fffbeb",
        borderColor: "#fde68a",
      }}
    >
      <div style={{ ...overviewHead, color: "#92400e" }}>
        <span>תקלות runtime פתוחות · ייעוץ</span>
        <span style={{ ...overviewCount, color: "#b45309" }}>{rows.length}</span>
      </div>
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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 500 }}>{i.title ?? i.id}</span>
                <span
                  style={{
                    ...pill,
                    background: severityPillBg[lvl],
                    color: severityPillFg[lvl],
                  }}
                >
                  {lvl}
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

function OperationalQueueRow({ item }: { item: OperationalQueueItem }) {
  const lvl = severityFromQueue(item.severity);
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
        <span style={{ display: "inline-flex", gap: 6 }}>
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

function OperationalQueueCard({ doc }: { doc: OperationalQueueDoc | null }) {
  const { actionable, awaitingOwner, total } = operationalQueueGroups(doc);
  if (total === 0) return null;
  return (
    <section
      aria-label="תור תפעולי"
      style={{
        ...overviewCard,
        background: "#f5f3ff",
        borderColor: "#ddd6fe",
      }}
    >
      <div style={{ ...overviewHead, color: "#5b21b6" }}>
        <span>תור תפעולי · MN-OS</span>
        <span style={{ ...overviewCount, color: "#6d28d9" }}>{total}</span>
      </div>
      <div style={{ fontSize: 11, color: "#6d28d9", marginBottom: 6 }}>
        {actionable.length} זמינים לעיבוד · {awaitingOwner.length} ממתינים ל-owner
      </div>
      {actionable.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5b21b6", marginTop: 4 }}>
            זמינים לעיבוד
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {actionable.slice(0, 20).map((i) => (
              <OperationalQueueRow key={i.id} item={i} />
            ))}
          </ul>
        </>
      )}
      {awaitingOwner.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#92400e",
              marginTop: 10,
              borderTop: "1px dashed #fde68a",
              paddingTop: 6,
            }}
          >
            ממתינים ל-owner
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {awaitingOwner.slice(0, 20).map((i) => (
              <OperationalQueueRow key={i.id} item={i} />
            ))}
          </ul>
        </>
      )}
    </section>
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
    <section aria-label="חסמים פעילים" style={overviewCard}>
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
              <div style={{ fontWeight: 500, color: tint?.fg ?? "#171717" }}>{b.summary}</div>
              <div style={subLine}>
                {b.lane ? `מסלול ${b.lane}` : ""}
                {b.since ? ` · מאז ${b.since}` : ""}
                {d != null ? ` · ${d} ימים` : ""}
              </div>
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
