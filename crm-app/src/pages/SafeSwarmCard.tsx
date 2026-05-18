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
  return (
    <section
      aria-label="Safe Swarm"
      data-testid="safe-swarm-card"
      data-display-state={isDefault ? "no_source" : status}
      style={{ border: `1px solid ${p.border}`, background: p.bg, borderRadius: 10, padding: 12, marginBottom: 14 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontWeight: 600, fontSize: 14, marginBottom: 8, color: p.head }}>
        <span>Safe Swarm · MN-OS</span>
        <span data-testid="safe-swarm-header-count" style={{ fontSize: 12, fontWeight: 400, color: p.sub }}>
          {headerCount}
        </span>
      </div>

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
