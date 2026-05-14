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

type MetaDoc = {
  _meta?: { schema_version?: number; regenerated_at?: string };
};

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
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [pd, bd, sd, hd, ld, rm, fr, pr, ho, ri, md, as] = await Promise.all([
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

      <HealthOverview health={health} />
      <ActiveSessionsCard doc={activeSessions} />
      <LanesOverview lanes={lanes} />
      <RecentMergesCard doc={recentMerges} />
      <BlockersOverview blockers={blockers} />
      <ActiveIncidentsCard incidents={activeIncidents} />
      <OwnerGatesCard gates={ownerGates} />
      <ProcessesCard doc={processes} />
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

function ActiveSessionsCard({ doc }: { doc: ActiveSessionsDoc | null }) {
  if (!doc) return null;
  const active = doc.active ?? [];
  const recent = doc.recent_completed ?? [];
  const registryStale = doc._meta?.registry_stale === true;
  if (active.length === 0 && recent.length === 0 && !doc._meta?.error) return null;

  const headColor = active.length > 0 && !registryStale ? "#166534" : "#737373";
  const bg = active.length > 0 && !registryStale ? "#f0fdf4" : "#fafafa";
  const border = active.length > 0 && !registryStale ? "#bbf7d0" : "#e5e5e5";

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

      {doc._meta?.error && (
        <div style={{ ...subLine, color: "#991b1b", marginBottom: 6 }}>
          שגיאת מקור: {doc._meta.error}
        </div>
      )}

      {active.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px 0", display: "grid", gap: 8 }}>
          {active.map((s) => {
            const stale = s.lifecycle === "stale";
            return (
              <li
                key={s.id}
                style={{
                  fontSize: 13,
                  color: "#404040",
                  borderInlineStart: `3px solid ${stale ? "#f59e0b" : "#22c55e"}`,
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
              </li>
            );
          })}
        </ul>
      )}

      {recent.length > 0 && (
        <>
          <div style={sectionLabel}>סשנים אחרונים</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {recent.slice(0, 5).map((s) => (
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
              </li>
            ))}
          </ul>
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
