import { useEffect, useMemo, useState } from "react";
import {
  classifyFeed,
  FEED_LEVEL_UI,
  type FeedFreshness,
  type FeedMeta,
} from "./feedFreshness";

// ── Redesigned MN-OS Control Panel (L1 runtime overview) ───────────────────
// Mobile-first, truth-first. Every tile is judged by classifyFeed: a feed that
// cannot be proven live is shown as NOT-LIVE — its number is never rendered as
// current truth. Staged at /control beside the old /ops until approved.

type Json = Record<string, unknown>;

interface FeedState<T = Json> {
  data: T | null;
  present: boolean;
  fresh: FeedFreshness;
}

const FRESHNESS_URL = "/ops-data/_freshness.json";

// Per-feed runtime SLA (seconds): how old content may be before "not live".
const FEEDS = {
  health: 600,
  automation_runtime_inventory: 3600,
  operational_queue: 1800,
  "runtime-issues": 1800,
  owner_gate_status: 3600,
  blockers: 86400,
  active_sessions: 600,
  processes: 600,
  campaigns: 1800,
  handoffs_index: 3600,
} as const;
type FeedKey = keyof typeof FEEDS;

async function fetchJson<T = Json>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function metaOf(d: Json | null): FeedMeta | null {
  if (!d) return null;
  const m = (d as { _meta?: unknown })._meta;
  return m && typeof m === "object" ? (m as FeedMeta) : (d as FeedMeta);
}

// ── derived, truthful metrics per feed ──────────────────────────────────────
interface Metric {
  value: string; // big number / status
  unit?: string;
  detail?: string; // small subtitle
  severity: "ok" | "warn" | "crit" | "muted";
}

function automationMetric(d: Json | null): Metric {
  const list = (d?.automations as Array<Record<string, unknown>>) ?? [];
  const running = list.filter((a) => {
    const s = String(a.runtime_state ?? "");
    return s === "active" || s === "running" || a.enabled === true;
  }).length;
  const broken = list.filter((a) => {
    const h = String(a.health_status ?? "");
    const s = String(a.runtime_state ?? "");
    return h.startsWith("broken") || s === "errored" || s === "failed";
  }).length;
  return {
    value: String(running),
    unit: `/ ${list.length}`,
    detail: broken > 0 ? `${broken} תקולות` : "ללא תקלות",
    severity: broken > 0 ? "warn" : "ok",
  };
}

function sessionMetric(d: Json | null): Metric {
  const active = (d?.active as unknown[]) ?? [];
  return { value: String(active.length), detail: "סשנים רשומים", severity: active.length ? "ok" : "muted" };
}

function healthMetric(d: Json | null): Metric {
  const eps = (d?.endpoints as Array<{ ok?: boolean; required?: boolean }>) ?? [];
  const ok = eps.filter((e) => e.ok).length;
  const failed = eps.filter((e) => !e.ok).length;
  return {
    value: `${ok}/${eps.length}`,
    detail: failed > 0 ? `${failed} נפל` : "כל השירותים תקינים",
    severity: failed > 0 ? "crit" : "ok",
  };
}

function queueMetric(d: Json | null): Metric {
  const q = (d?.queue as unknown[]) ?? [];
  return { value: String(q.length), detail: "פריטים בתור", severity: q.length > 30 ? "warn" : "ok" };
}

function gateMetric(d: Json | null): Metric {
  const gates = (d?.gates as Array<{ status?: string }>) ?? [];
  const pending = gates.filter((g) => /pend|open|wait/i.test(String(g.status ?? ""))).length;
  return { value: String(pending), detail: "ממתינים לאישור", severity: pending > 0 ? "warn" : "ok" };
}

function processMetric(d: Json | null): Metric {
  const lr = (d?.long_running_processes as unknown[]) ?? [];
  const pm = (d?.pm2_processes as unknown[]) ?? [];
  return { value: String(lr.length + pm.length), detail: "תהליכים שנדגמו", severity: "muted" };
}

function campaignMetric(d: Json | null): Metric {
  const list = (d?.campaigns as Array<{ status?: string }>) ?? [];
  const active = list.filter((c) => /active/i.test(String(c.status ?? ""))).length;
  const blocked = list.filter((c) => /block/i.test(String(c.status ?? ""))).length;
  return { value: String(active), detail: blocked > 0 ? `${blocked} חסומים` : "פעילים", severity: blocked > 0 ? "warn" : "ok" };
}

function issueMetric(d: Json | null): Metric {
  const list = (d?.issues as Array<{ severity?: string }>) ?? [];
  const high = list.filter((i) => /high|crit/i.test(String(i.severity ?? ""))).length;
  return { value: String(list.length), detail: high > 0 ? `${high} חמורות` : "פתוחות", severity: high > 0 ? "warn" : "ok" };
}

function blockerMetric(d: Json | null): Metric {
  const list = (d?.blockers as unknown[]) ?? [];
  return { value: String(list.length), detail: "חסמים פתוחים", severity: list.length > 0 ? "warn" : "ok" };
}

function handoffMetric(d: Json | null): Metric {
  const list = (d?.entries as unknown[]) ?? [];
  return { value: String(list.length), detail: "handoffs אחרונים", severity: "ok" };
}

interface TileDef {
  key: FeedKey;
  title: string;
  metric: (d: Json | null) => Metric;
}

const TILES: TileDef[] = [
  { key: "health", title: "בריאות מערכת", metric: healthMetric },
  { key: "automation_runtime_inventory", title: "אוטומציות", metric: automationMetric },
  { key: "operational_queue", title: "תור פעולות", metric: queueMetric },
  { key: "runtime-issues", title: "תקלות ריצה", metric: issueMetric },
  { key: "owner_gate_status", title: "שערי בעלים", metric: gateMetric },
  { key: "blockers", title: "חסמים", metric: blockerMetric },
  { key: "active_sessions", title: "סשנים פעילים", metric: sessionMetric },
  { key: "processes", title: "תהליכים", metric: processMetric },
  { key: "campaigns", title: "קמפיינים", metric: campaignMetric },
  { key: "handoffs_index", title: "Handoffs", metric: handoffMetric },
];

const SEV_COLOR: Record<Metric["severity"], string> = {
  ok: "var(--mn-success)",
  warn: "var(--mn-warning)",
  crit: "var(--mn-critical)",
  muted: "var(--mn-text-muted)",
};

// ── component ────────────────────────────────────────────────────────────────
export function ControlPanelPage() {
  const [feeds, setFeeds] = useState<Record<string, FeedState> | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<FeedKey | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const now = Date.now();
      const freshDoc = await fetchJson<{ files?: Record<string, { age_seconds?: number }> }>(FRESHNESS_URL);
      const fileAges = freshDoc?.files ?? {};
      const keys = Object.keys(FEEDS) as FeedKey[];
      const docs = await Promise.all(keys.map((k) => fetchJson(`/ops-data/${k}.json`)));
      if (!alive) return;
      const out: Record<string, FeedState> = {};
      keys.forEach((k, i) => {
        const data = docs[i];
        const fileAge = fileAges[`${k}.json`]?.age_seconds ?? null;
        out[k] = {
          data,
          present: data !== null,
          fresh: classifyFeed({
            present: data !== null,
            meta: metaOf(data),
            fileAgeSeconds: fileAge,
            slaSeconds: FEEDS[k],
            nowMs: now,
          }),
        };
      });
      setFeeds(out);
      setRefreshedAt(now);
    }
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const deadFeeds = useMemo(() => {
    if (!feeds) return [] as { title: string; reason: string }[];
    return TILES.filter((t) => !feeds[t.key]?.fresh.trustworthy).map((t) => ({
      title: t.title,
      reason: feeds[t.key]?.fresh.reasonHe ?? "—",
    }));
  }, [feeds]);

  // Operational-flow-first headline: only counts that come from LIVE feeds.
  const attention = useMemo(() => {
    if (!feeds) return 0;
    const live = (k: FeedKey) => (feeds[k]?.fresh.trustworthy ? feeds[k]?.data ?? null : null);
    const h = live("health");
    const failed = ((h?.endpoints as Array<{ ok?: boolean }>) ?? []).filter((e) => !e.ok).length;
    const a = live("automation_runtime_inventory");
    const broken = ((a?.automations as Array<Record<string, unknown>>) ?? []).filter(
      (x) => String(x.health_status ?? "").startsWith("broken") || ["errored", "failed"].includes(String(x.runtime_state ?? "")),
    ).length;
    const g = live("owner_gate_status");
    const pending = ((g?.gates as Array<{ status?: string }>) ?? []).filter((x) => /pend|open|wait/i.test(String(x.status ?? ""))).length;
    const i = live("runtime-issues");
    const high = ((i?.issues as Array<{ severity?: string }>) ?? []).filter((x) => /high|crit/i.test(String(x.severity ?? ""))).length;
    return failed + broken + pending + high;
  }, [feeds]);

  return (
    <div dir="rtl" style={pageStyle}>
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--mn-text-strong)" }}>
            לוח בקרה
          </h1>
          <span style={{ fontSize: 12, color: "var(--mn-text-muted)" }}>
            {refreshedAt ? `רענון ${new Date(refreshedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : "טוען…"}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--mn-text-muted)", marginTop: 2 }}>
          מה רץ עכשיו בשרת · נתון שלא ניתן לאמת מסומן «לא חי»
        </div>
      </header>

      {deadFeeds.length > 0 && (
        <div style={truthBannerStyle} role="status">
          <strong style={{ color: "var(--mn-critical)" }}>⚠ {deadFeeds.length} מקורות לא חיים</strong>
          <span style={{ color: "var(--mn-text-muted)", fontSize: 12.5 }}>
            {" "}
            הנתונים שלהם לא מוצגים כעדכניים: {deadFeeds.map((f) => f.title).join(" · ")}
          </span>
        </div>
      )}

      {feeds && (
        <div style={attentionStyle}>
          {attention > 0 ? (
            <>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--mn-critical)" }}>{attention}</span>
              <span style={{ fontSize: 13.5, color: "var(--mn-text-body)" }}>פריטים דורשים תשומת לב כעת</span>
            </>
          ) : (
            <span style={{ fontSize: 13.5, color: "var(--mn-success)", fontWeight: 600 }}>✓ אין פריטים דחופים במקורות החיים</span>
          )}
        </div>
      )}

      <div style={gridStyle}>
        {!feeds &&
          TILES.map((t) => (
            <div key={t.key} style={{ ...tileStyle, opacity: 0.5 }}>
              <div style={tileTitleStyle}>{t.title}</div>
              <div style={{ fontSize: 28, color: "var(--mn-text-muted)" }}>…</div>
            </div>
          ))}
        {feeds &&
          TILES.map((t) => {
            const fs = feeds[t.key];
            const fresh = fs.fresh;
            const m = t.metric(fs.data);
            const live = fresh.trustworthy;
            const levelUi = FEED_LEVEL_UI[fresh.level];
            const isOpen = expanded === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setExpanded(isOpen ? null : t.key)}
                style={{
                  ...tileStyle,
                  borderInlineStartColor: live ? SEV_COLOR[m.severity] : "var(--mn-critical)",
                  outline: isOpen ? "2px solid var(--mn-brand-teal)" : "none",
                }}
                aria-expanded={isOpen}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span style={tileTitleStyle}>{t.title}</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: levelUi.color,
                      background: levelUi.bg,
                      borderRadius: 999,
                      padding: "2px 7px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {levelUi.label}
                  </span>
                </div>

                {live ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
                    <span style={{ fontSize: 30, fontWeight: 800, color: SEV_COLOR[m.severity], lineHeight: 1 }}>
                      {m.value}
                    </span>
                    {m.unit && <span style={{ fontSize: 14, color: "var(--mn-text-muted)" }}>{m.unit}</span>}
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "var(--mn-critical)", lineHeight: 1.1 }}>
                      לא חי
                    </div>
                    <div style={{ fontSize: 11, color: "var(--mn-text-muted)", marginTop: 2 }}>
                      אחרון: {m.value}
                      {m.unit ? ` ${m.unit}` : ""}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 11.5, color: "var(--mn-text-muted)", marginTop: 6 }}>
                  {live && m.detail ? m.detail : fresh.reasonHe}
                </div>
              </button>
            );
          })}
      </div>

      {feeds && expanded && (
        <DetailPanel feedKey={expanded} state={feeds[expanded]} onClose={() => setExpanded(null)} />
      )}

      <footer style={{ marginTop: 18, fontSize: 11, color: "var(--mn-text-muted)", textAlign: "center" }}>
        מקור: /ops-data · רענון אוטומטי כל 30 שניות · קריאה בלבד
      </footer>
    </div>
  );
}

// ── drill-down detail (progressive disclosure, no dead-end) ──────────────────
function DetailPanel({ feedKey, state, onClose }: { feedKey: FeedKey; state: FeedState; onClose: () => void }) {
  const { data, fresh } = state;
  return (
    <section style={detailStyle} aria-label="פירוט">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color: "var(--mn-text-strong)" }}>{TILES.find((t) => t.key === feedKey)?.title}</strong>
        <button onClick={onClose} style={closeBtnStyle} aria-label="סגור">
          ✕
        </button>
      </div>
      <div style={{ fontSize: 12, color: fresh.trustworthy ? "var(--mn-text-muted)" : "var(--mn-critical)", marginBottom: 10 }}>
        {fresh.reasonHe}
        {fresh.advisory && " · נתון ייעוצי, לא חיווי חי"}
      </div>
      {feedKey === "health" && <HealthRows data={data} />}
      {feedKey === "automation_runtime_inventory" && <AutomationRows data={data} />}
      {feedKey !== "health" && feedKey !== "automation_runtime_inventory" && <GenericRows feedKey={feedKey} data={data} />}
    </section>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ color: "var(--mn-text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ color: color ?? "var(--mn-text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function HealthRows({ data }: { data: Json | null }) {
  const eps = (data?.endpoints as Array<{ name?: string; ok?: boolean; latency_ms?: number; error?: string }>) ?? [];
  if (!eps.length) return <Empty />;
  return (
    <div>
      {eps.map((e, i) => (
        <Row
          key={i}
          label={String(e.name ?? "?")}
          value={e.ok ? `תקין · ${e.latency_ms ?? "?"}ms` : `נפל${e.error ? ` · ${String(e.error).slice(0, 40)}` : ""}`}
          color={e.ok ? "var(--mn-success)" : "var(--mn-critical)"}
        />
      ))}
    </div>
  );
}

function AutomationRows({ data }: { data: Json | null }) {
  const list = (data?.automations as Array<Record<string, unknown>>) ?? [];
  if (!list.length) return <Empty />;
  const byPlatform = list.reduce<Record<string, number>>((acc, a) => {
    const p = String(a.platform ?? "אחר");
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  const broken = list.filter((a) => String(a.health_status ?? "").startsWith("broken") || ["errored", "failed"].includes(String(a.runtime_state ?? "")));
  return (
    <div>
      {Object.entries(byPlatform)
        .sort((a, b) => b[1] - a[1])
        .map(([p, n]) => (
          <Row key={p} label={p} value={`${n}`} />
        ))}
      {broken.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mn-critical)", margin: "10px 0 4px" }}>תקולות</div>
          {broken.slice(0, 8).map((a, i) => (
            <Row key={i} label={String(a.name ?? a.id ?? "?")} value={String(a.health_status ?? a.runtime_state ?? "")} color="var(--mn-critical)" />
          ))}
        </>
      )}
    </div>
  );
}

function GenericRows({ feedKey, data }: { feedKey: FeedKey; data: Json | null }) {
  let rows: string[] = [];
  if (feedKey === "active_sessions") {
    rows = ((data?.active as Array<Record<string, unknown>>) ?? []).map(
      (s) => `${s.lane ?? "?"} · ${s.agent ?? s.model ?? ""} · ${s.current_slice ?? s.terminal_state ?? ""}`,
    );
  } else if (feedKey === "processes") {
    const lr = ((data?.long_running_processes as Array<Record<string, unknown>>) ?? []).map((p) => `pid ${p.pid} · ${p.user} · ${p.verdict ?? p.current_state ?? ""}`);
    const pm = ((data?.pm2_processes as Array<Record<string, unknown>>) ?? []).map((p) => `${p.name} · ${p.status} · ${p.verdict ?? ""}`);
    rows = [...lr, ...pm];
  } else if (feedKey === "owner_gate_status") {
    rows = ((data?.gates as Array<Record<string, unknown>>) ?? []).map((g) => `${g.gate_kind ?? g.gate_id} · ${g.status} · ${String(g.summary ?? "").slice(0, 50)}`);
  } else if (feedKey === "operational_queue") {
    rows = ((data?.queue as Array<Record<string, unknown>>) ?? []).slice(0, 20).map((q) => `${q.type ?? "?"} · ${q.severity ?? ""} · ${String(q.source ?? q.campaign_id ?? "")}`);
  } else if (feedKey === "runtime-issues") {
    rows = ((data?.issues as Array<Record<string, unknown>>) ?? []).map((i) => `${i.severity ?? ""} · ${String(i.title ?? i.id ?? "").slice(0, 60)}`);
  } else if (feedKey === "blockers") {
    rows = ((data?.blockers as Array<Record<string, unknown>>) ?? []).map((b) => `${b.lane ?? "?"} · ${String(b.summary ?? "").slice(0, 60)}`);
  } else if (feedKey === "campaigns") {
    rows = ((data?.campaigns as Array<Record<string, unknown>>) ?? [])
      .filter((c) => /active|block/i.test(String(c.status ?? "")))
      .slice(0, 25)
      .map((c) => `${c.status ?? ""} · ${String(c.id ?? "")}`);
  } else if (feedKey === "handoffs_index") {
    rows = ((data?.entries as Array<Record<string, unknown>>) ?? [])
      .slice(0, 20)
      .map((e) => `${e.lane ?? "?"} · ${String(e.handoff_id ?? e.branch ?? "").slice(0, 50)}`);
  }
  if (!rows.length) return <Empty />;
  return (
    <div>
      {rows.slice(0, 20).map((r, i) => (
        <Row key={i} label={r} value="" />
      ))}
    </div>
  );
}

function Empty() {
  return <div style={{ fontSize: 12.5, color: "var(--mn-text-muted)", padding: "8px 0" }}>אין שורות להצגה.</div>;
}

// ── styles ───────────────────────────────────────────────────────────────────
const pageStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "12px 14px 32px",
  fontFamily: "'Rubik', sans-serif",
  background: "var(--mn-surface-root)",
  minHeight: "100vh",
};
const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  background: "var(--mn-surface-root)",
  paddingBottom: 8,
  borderBottom: "1px solid var(--mn-border-fold)",
};
const truthBannerStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "9px 12px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "var(--mn-radius-card)",
  fontSize: 13,
};
const attentionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 12,
  padding: "8px 12px",
  background: "var(--mn-surface-guidance)",
  border: "1px solid var(--mn-border-fold)",
  borderRadius: "var(--mn-radius-card)",
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 10,
  marginTop: 12,
};
const tileStyle: React.CSSProperties = {
  textAlign: "start",
  display: "flex",
  flexDirection: "column",
  background: "var(--mn-surface-guidance)",
  border: "1px solid var(--mn-border-fold)",
  borderInlineStartWidth: 4,
  borderInlineStartStyle: "solid",
  borderRadius: "var(--mn-radius-card)",
  padding: "12px 13px",
  boxShadow: "var(--mn-shadow-card)",
  cursor: "pointer",
  font: "inherit",
  minHeight: 96,
};
const tileTitleStyle: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "var(--mn-text-strong)" };
const detailStyle: React.CSSProperties = {
  marginTop: 12,
  background: "var(--mn-surface-sheet)",
  border: "1px solid var(--mn-border-fold)",
  borderRadius: "var(--mn-radius-card)",
  padding: "12px 14px",
  boxShadow: "var(--mn-shadow-card)",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 12.5,
  padding: "5px 0",
  borderBottom: "1px solid var(--mn-border-fold)",
};
const closeBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  fontSize: 16,
  cursor: "pointer",
  color: "var(--mn-text-muted)",
  padding: 4,
};

export default ControlPanelPage;
