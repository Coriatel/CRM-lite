import { relativeTimeHe } from "./OpsPage";

// Shape contract:
//   /srv/ops-vault/state/safe_swarm.schema.json (v0).
// Public-safe projection of Safe Swarm orchestration runtime state. Read-only,
// secrets-free, payload-free. v0 is structural — `spawn` is permanently
// {available:false, script_path:null} (karpathy §Authority gate #7).

export type SafeSwarmSubstrateSlot = {
  available: boolean;
  script_path: string | null;
};

export type SafeSwarmSubstrate = {
  recommend: SafeSwarmSubstrateSlot;
  claim: SafeSwarmSubstrateSlot;
  materialize: SafeSwarmSubstrateSlot;
  queue_audit: SafeSwarmSubstrateSlot;
  validate_return: SafeSwarmSubstrateSlot;
  validate_next: SafeSwarmSubstrateSlot;
  preflight_collision: SafeSwarmSubstrateSlot;
  spawn: SafeSwarmSubstrateSlot;
};

export type SafeSwarmGate = {
  id: string;
  status: "open" | "blocked" | "proposed" | "observed_violation" | string;
  reason: string;
};

export type SafeSwarmRuntimeHealth = {
  merger_timer_active: boolean | null;
  last_health_ts: string | null;
  last_health_applied: number | null;
  last_health_rejected: number | null;
  last_health_error: string | null;
  spool_depth_after: number | null;
};

export type SafeSwarmQueueSnapshot = {
  queue_present: boolean;
  queue_item_count: number | null;
  routes_present: boolean;
  active_sessions_present: boolean;
  active_session_count: number | null;
};

export type SafeSwarmDoc = {
  _meta?: {
    schema_version?: string;
    writer?: string;
    source?: string;
    generated_at?: string | null;
    generated_default?: boolean;
    note?: string;
  };
  substrate?: Partial<SafeSwarmSubstrate>;
  gates?: SafeSwarmGate[];
  runtime_health?: SafeSwarmRuntimeHealth;
  queue_snapshot?: SafeSwarmQueueSnapshot;
  next_slices?: Array<{ id: string; title: string; blocking: boolean }>;
  health?: { status: "green" | "yellow" | "red"; reasons: string[] };
};

// Ordered substrate keys — all eight v0 primitives, spawn last (permanently false in v0).
export const SAFE_SWARM_SUBSTRATE_KEYS = [
  "recommend",
  "claim",
  "materialize",
  "queue_audit",
  "validate_return",
  "validate_next",
  "preflight_collision",
  "spawn",
] as const;

export function isSafeSwarmDefault(doc: SafeSwarmDoc | null): boolean {
  if (!doc) return true;
  return doc._meta?.generated_default === true;
}

export function safeSwarmAvailableCount(doc: SafeSwarmDoc | null): {
  available: number;
  total: number;
} {
  const sub = (doc?.substrate ?? {}) as Partial<SafeSwarmSubstrate>;
  let available = 0;
  for (const k of SAFE_SWARM_SUBSTRATE_KEYS) {
    if (sub[k]?.available === true) available += 1;
  }
  return { available, total: SAFE_SWARM_SUBSTRATE_KEYS.length };
}

// Stale when generated_at is older than 5 minutes (or absent).
export function isSafeSwarmStale(
  doc: SafeSwarmDoc | null,
  now: Date = new Date(),
  thresholdMs: number = 5 * 60 * 1000,
): boolean {
  const ts = doc?._meta?.generated_at;
  if (!ts) return true;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > thresholdMs;
}

// Operator-facing classification — same #88 contract: severity / headline /
// meaning / nextAction. The existing substrate/runtime/reasons rendering below
// remains as supporting detail; this view answers the operator question first
// ("is the swarm safe to use?") before exposing the technical primitives grid.
export type SafeSwarmCategory =
  | "no_source"
  | "merger_unhealthy"
  | "swarm_red"
  | "stale_projection"
  | "swarm_yellow"
  | "pending_v1"
  | "all_clear"
  | "unknown";

export type SafeSwarmOperatorView = {
  severity: "info" | "watch" | "action";
  topCategory: SafeSwarmCategory;
  categories: SafeSwarmCategory[];
  headline: string;
  meaning: string;
  nextAction: string;
};

const SAFE_SWARM_COPY: Record<
  SafeSwarmCategory,
  { severity: "info" | "watch" | "action"; headline: string; meaning: string; nextAction: string }
> = {
  no_source: {
    severity: "info",
    headline: "מידע ה-Swarm עדיין לא זמין",
    meaning: "טרם נכתבה פרויקציה חיה של safe_swarm.json (ייתכן שהמערכת רק עלתה).",
    nextAction: "אין צורך לפעול; המידע יופיע ברגע שהפרויקציה תיכתב.",
  },
  merger_unhealthy: {
    severity: "action",
    headline: "מתווך הסנכרון של ה-Swarm לא תקין",
    meaning: "השירות שמסנכרן מצב בין סשנים מדווח על תקלה או אינו פעיל. ספאון מקבילי אינו בטוח כרגע.",
    nextAction: "בדוק יומני שירות mn-os-agent-registry-merger ופנה לבעלים אם הבעיה נמשכת.",
  },
  swarm_red: {
    severity: "action",
    headline: "Swarm חסום מספאון",
    meaning: "המערכת זיהתה תנאי שמונע ספאון מקבילי בטוח (gate חסום או מצב אדום).",
    nextAction: "סקור את הסיבות בפרטים הטכניים והעלה לבעלים אם חוסם פעילות.",
  },
  stale_projection: {
    severity: "watch",
    headline: "מידע ה-Swarm לא רוענן לאחרונה",
    meaning: "פרויקציית safe_swarm.json מבוגרת ממה שמצופה (>5 דק׳). התצוגה עשויה לא לשקף את המצב כרגע.",
    nextAction: "רענן את הדף; אם המצב נמשך, בדוק שהכותב פעיל.",
  },
  swarm_yellow: {
    severity: "watch",
    headline: "Swarm פעיל במצב מוגבל",
    meaning: "אחד או יותר מהאינדיקטורים מדווחים על מצב צהוב — אפשר לעבוד, אך עם זהירות מוגברת.",
    nextAction: "סקור את הסיבות בפרטים הטכניים; הימנע מספאון מקבילי נוסף עד שיתבהר.",
  },
  pending_v1: {
    severity: "info",
    headline: "Swarm פעיל בגרסת v0 — ספאון אוטומטי לא זמין עדיין",
    meaning: "ה-substrate הבסיסי תקין אבל פעולת spawn מבוטלת בכוונה לפי מדיניות (Authority gate #7).",
    nextAction: "אין צורך לפעול. spawn אוטומטי יופעל רק לאחר אישור בעלים מפורש.",
  },
  all_clear: {
    severity: "info",
    headline: "Swarm תקין",
    meaning: "כל אינדיקטורי ה-substrate ירוקים.",
    nextAction: "אין צורך לפעול.",
  },
  unknown: {
    severity: "watch",
    headline: "מצב ה-Swarm לא ידוע",
    meaning: "לא הצלחנו לפענח את מצב ה-swarm מהמידע הזמין.",
    nextAction: "רענן את הדף; אם המצב נמשך, בדוק שמסלול /ops-data/safe_swarm.json מגיב.",
  },
};

export function classifySafeSwarmForOperator(
  doc: SafeSwarmDoc | null,
  now: Date = new Date(),
): SafeSwarmOperatorView {
  const cats: SafeSwarmCategory[] = [];
  if (!doc || isSafeSwarmDefault(doc)) {
    cats.push("no_source");
  } else {
    const rh = doc.runtime_health;
    if (rh && (rh.merger_timer_active === false || (rh.last_health_error ?? null) !== null)) {
      cats.push("merger_unhealthy");
    }
    const status = doc.health?.status;
    if (status === "red") cats.push("swarm_red");
    if (isSafeSwarmStale(doc, now)) cats.push("stale_projection");
    if (status === "yellow" && !cats.includes("swarm_red")) cats.push("swarm_yellow");
    if (cats.length === 0) {
      const spawnAvailable = doc.substrate?.spawn?.available === true;
      if (status === "green" && !spawnAvailable) cats.push("pending_v1");
      else if (status === "green") cats.push("all_clear");
      else cats.push("unknown");
    }
  }
  const topCategory = cats[0];
  const copy = SAFE_SWARM_COPY[topCategory];
  return {
    severity: copy.severity,
    topCategory,
    categories: cats,
    headline: copy.headline,
    meaning: copy.meaning,
    nextAction: copy.nextAction,
  };
}

const PALETTE = {
  green: { bg: "#f0fdf4", border: "#bbf7d0", head: "#166534", sub: "#15803d" },
  yellow: { bg: "#fffbeb", border: "#fde68a", head: "#78350f", sub: "#92400e" },
  red: { bg: "#fef2f2", border: "#fecaca", head: "#991b1b", sub: "#b91c1c" },
};

export function SafeSwarmCard({ doc }: { doc: SafeSwarmDoc | null }) {
  const isDefault = isSafeSwarmDefault(doc);
  const status: "green" | "yellow" | "red" = doc?.health?.status ?? "red";
  const p = PALETTE[status];
  const { available, total } = safeSwarmAvailableCount(doc);
  const reasons = doc?.health?.reasons ?? [];
  const runtime = doc?.runtime_health;
  const queue = doc?.queue_snapshot;
  const stale = isSafeSwarmStale(doc);
  const generatedAt = doc?._meta?.generated_at ?? null;
  const headerCount = isDefault
    ? "projection not yet generated"
    : `${available}/${total} substrate · spawn=false`;
  const view = classifySafeSwarmForOperator(doc);
  const severityLabel =
    view.severity === "action" ? "דורש פעולה" : view.severity === "watch" ? "במעקב" : "תקין";
  const severityBg =
    view.severity === "action" ? "#dc2626" : view.severity === "watch" ? "#a16207" : "#525252";
  return (
    <section
      aria-label="Safe Swarm"
      data-testid="safe-swarm-card"
      data-display-state={isDefault ? "no_source" : status}
      style={{ border: `1px solid ${p.border}`, background: p.bg, borderRadius: 10, padding: 12, marginBottom: 14 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontWeight: 600, fontSize: 14, marginBottom: 8, color: p.head }}>
        <span>
          <span
            data-testid="safe-swarm-operator-severity"
            style={{
              background: severityBg,
              color: "#fff",
              borderRadius: 999,
              padding: "1px 6px",
              fontSize: 10,
              marginInlineEnd: 6,
            }}
          >
            {severityLabel}
          </span>
          Safe Swarm · MN-OS
        </span>
        <span data-testid="safe-swarm-header-count" style={{ fontSize: 12, fontWeight: 400, color: p.sub }}>
          {headerCount}
        </span>
      </div>

      <div
        data-testid="safe-swarm-operator-headline"
        style={{ fontSize: 14, fontWeight: 600, color: p.head, marginBottom: 4 }}
      >
        {view.headline}
      </div>
      <p
        data-testid="safe-swarm-operator-meaning"
        style={{ fontSize: 13, color: "#404040", margin: "0 0 6px 0", lineHeight: 1.4 }}
      >
        <span style={{ fontWeight: 600 }}>מה זה אומר: </span>
        {view.meaning}
      </p>
      <p
        data-testid="safe-swarm-operator-next-action"
        style={{ fontSize: 13, color: "#404040", margin: "0 0 8px 0", lineHeight: 1.4 }}
      >
        <span style={{ fontWeight: 600 }}>מה ניתן לעשות: </span>
        {view.nextAction}
      </p>

      {isDefault && (
        <div data-testid="safe-swarm-empty" style={{ fontSize: 12, color: p.head, lineHeight: 1.5 }}>
          projection not yet generated — fixture or live writer is absent. The substrate grid below is dimmed until{" "}
          <code style={{ fontSize: 11 }}>safe_swarm.json</code> arrives.
        </div>
      )}

      <ul
        data-testid="safe-swarm-substrate"
        data-dim={isDefault ? "true" : "false"}
        style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, fontSize: 12, color: p.head, opacity: isDefault ? 0.55 : 1 }}
      >
        {SAFE_SWARM_SUBSTRATE_KEYS.map((k) => {
          const slot = (doc?.substrate as Partial<SafeSwarmSubstrate> | undefined)?.[k];
          const ok = slot?.available === true;
          return (
            <li
              key={k}
              data-testid={`safe-swarm-primitive-${k}`}
              data-available={ok ? "true" : "false"}
              style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
            >
              <code style={{ fontSize: 11 }}>{k}</code>
              <span style={{ color: ok ? "#15803d" : "#a3a3a3" }}>{ok ? "available" : "unavailable"}</span>
            </li>
          );
        })}
      </ul>

      {!isDefault && status !== "green" && reasons.length > 0 && (
        <ul
          data-testid="safe-swarm-reasons"
          style={{ listStyle: "disc inside", padding: 0, margin: "8px 0 0", fontSize: 12, color: p.sub }}
        >
          {reasons.map((r, i) => (
            <li key={`${i}-${r}`}>{r}</li>
          ))}
        </ul>
      )}

      <div
        data-testid="safe-swarm-counts"
        style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12, color: p.head }}
      >
        <SafeSwarmCount label="queue items" value={queue?.queue_item_count} />
        <SafeSwarmCount label="active sessions" value={queue?.active_session_count} />
      </div>

      <div
        data-testid="safe-swarm-runtime"
        style={{ marginTop: 8, fontSize: 12, color: p.head, lineHeight: 1.5 }}
      >
        <div data-testid="safe-swarm-merger-timer">
          merger timer:{" "}
          <strong>
            {runtime?.merger_timer_active === true
              ? "active"
              : runtime?.merger_timer_active === false
                ? "inactive"
                : "unknown"}
          </strong>
        </div>
        <div>
          last merger health:{" "}
          {runtime?.last_health_ts ? (
            <span>
              {relativeTimeHe(runtime.last_health_ts)} · applied={runtime?.last_health_applied ?? "—"} · rejected=
              {runtime?.last_health_rejected ?? "—"}
            </span>
          ) : (
            <span style={{ color: "#a3a3a3" }}>never</span>
          )}
        </div>
        {runtime?.last_health_error ? (
          <div data-testid="safe-swarm-merger-error" style={{ color: p.sub }}>
            last error: <code style={{ fontSize: 11 }}>{runtime.last_health_error}</code>
          </div>
        ) : null}
      </div>

      <div
        data-testid="safe-swarm-freshness"
        style={{ marginTop: 8, fontSize: 12, color: stale ? "#b45309" : p.sub }}
      >
        {generatedAt
          ? `generated: ${relativeTimeHe(generatedAt)}${stale ? " · stale (>5min)" : ""}`
          : "generated: unknown"}
      </div>
    </section>
  );
}

function SafeSwarmCount({ label, value }: { label: string; value: number | null | undefined }) {
  const display = value === null || value === undefined ? "—" : String(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 2px", borderRadius: 6, background: "rgba(0,0,0,0.04)" }}>
      <span style={{ fontWeight: 600, fontSize: 16 }}>{display}</span>
      <span style={{ fontSize: 10 }}>{label}</span>
    </div>
  );
}
