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
type SessionsDoc = { sessions?: SessionRow[]; owner_gates?: string[] };

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

function ageDays(since?: string): number | null {
  if (!since) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(since);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
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
  const [health, setHealth] = useState<HealthDoc | null>(null);
  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [recentMerges, setRecentMerges] = useState<RecentMergesDoc | null>(null);
  const [freshness, setFreshness] = useState<FreshnessDoc | null>(null);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [pd, bd, sd, hd, ld, rm, fr] = await Promise.all([
        fetchJson<ProjectsDoc>("/ops-data/projects.json"),
        fetchJson<BlockersDoc>("/ops-data/blockers.json"),
        fetchJson<SessionsDoc>("/ops-data/session_index.json"),
        fetchJson<HealthDoc>("/ops-data/health.json"),
        fetchJson<LanesDoc>("/ops-data/lanes.json"),
        fetchJson<RecentMergesDoc>("/ops-data/recent_merges.json"),
        fetchJson<FreshnessDoc>("/ops-data/_freshness.json"),
      ]);
      if (cancelled) return;
      if (!pd && !bd && !sd && !hd && !ld && !rm) {
        setLoadError("ops-data unavailable — was the page built without /srv/ops-vault?");
      }
      setProjects(parseProjects(pd));
      setBlockers(bd?.blockers ?? []);
      setSessions(sd?.sessions ?? []);
      setOwnerGates(sd?.owner_gates ?? []);
      setHealth(hd ?? null);
      setLanes(parseLanes(ld));
      setRecentMerges(rm ?? null);
      setFreshness(fr ?? null);
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
    <div dir="rtl" style={pad}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>MN-OS · Ops</h1>
        <div style={{ fontSize: 12, color: "#737373", marginTop: 4 }}>
          קריאה בלבד · מקור: <code>/srv/ops-vault/state</code>
          {lastVerified ? ` · אומת לאחרונה: ${lastVerified}` : ""}
        </div>
      </header>

      {loadError && (
        <div style={errorBox}>{loadError}</div>
      )}

      <StalenessBanner stale={stalenessEntries(freshness, 6)} />

      <HealthOverview health={health} />
      <LanesOverview lanes={lanes} />
      <RecentMergesCard doc={recentMerges} />
      <BlockersOverview blockers={blockers} />
      <OwnerGatesCard gates={ownerGates} />

      {rows.length === 0 && !loadError && (
        <div style={emptyBox}>אין פרויקטים — האם <code>state/projects.json</code> ריק?</div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((p) => {
          const projBlockers = blockersForProject(blockers, p.key);
          const last = lastActivity(sessions, p.key);
          return (
            <li key={p.key} style={card}>
              <div style={cardHead}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{p.key}</span>
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
    </div>
  );
}

function StalenessBanner({ stale }: { stale: StaleEntry[] }) {
  if (stale.length === 0) return null;
  const worst = stale[0].hours;
  const critical = worst >= 48;
  return (
    <section
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
    <section style={overviewCard}>
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

function LanesOverview({ lanes }: { lanes: LaneRow[] }) {
  if (lanes.length === 0) return null;
  return (
    <section style={overviewCard}>
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

function OwnerGatesCard({ gates }: { gates: string[] }) {
  const clean = gates.map(plainifyGate).filter((g) => g.length > 0);
  if (clean.length === 0) return null;
  return (
    <section
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

function SessionsStrip({ sessions }: { sessions: SessionRow[] }) {
  const recent = sessions.slice(0, 10);
  if (recent.length === 0) return null;
  return (
    <section style={{ ...card, marginTop: 14 }}>
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
    <section style={overviewCard}>
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
          return (
            <li key={b.id} style={overviewItem}>
              <div style={{ fontWeight: 500 }}>{b.summary}</div>
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
