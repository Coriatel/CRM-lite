import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Operational health pulse for /today. Read-only roll-up of four purpose-built feeds —
// service health (health.json), automation health (automation_runtime_inventory.json
// _meta.health_counts), producer health (producer_contract_violations.json), and feed
// freshness (_freshness.json). Adds no producer. Freshness uses a deliberately conservative
// 24h threshold so feeds with mixed cadences (1min … 6h) don't trip false "stale" alarms —
// only genuinely dead producers surface.

const STALE_FEED_THRESHOLD_SECONDS = 24 * 60 * 60;

export type PulseTone = "ok" | "warn" | "bad";
export interface PulseChip {
  key: string;
  label: string;
  value: string;
  tone: PulseTone;
  to?: string;
}

interface HealthDoc {
  ok?: boolean;
  failed?: unknown[];
  endpoints?: { ok?: boolean; required?: boolean }[];
}
interface AutomationInvDoc {
  _meta?: { health_counts?: Record<string, number> };
}
interface ProducerViolationsDoc {
  violation_count?: number;
  status?: string;
}
interface FreshnessDoc {
  files?: Record<string, { age_seconds?: number }>;
}

export interface HealthPulseInputs {
  health: HealthDoc | null;
  automations: AutomationInvDoc | null;
  producers: ProducerViolationsDoc | null;
  freshness: FreshnessDoc | null;
}

export function summarizeHealthPulse(i: HealthPulseInputs): PulseChip[] {
  const chips: PulseChip[] = [];

  // Services
  const endpoints = i.health?.endpoints ?? [];
  const down = endpoints.filter((e) => e.ok === false).length;
  const requiredDown = (i.health?.failed ?? []).length;
  chips.push({
    key: "services",
    label: "שירותים",
    value: `${endpoints.length - down}/${endpoints.length}`,
    tone: requiredDown > 0 ? "bad" : down > 0 ? "warn" : "ok",
  });

  // Automations
  const hc = i.automations?._meta?.health_counts ?? {};
  const failing = (hc.failing ?? 0) + (hc.broken_suspected ?? 0);
  const degraded = (hc.degraded ?? 0) + (hc.stale ?? 0);
  chips.push({
    key: "automations",
    label: "אוטומציות",
    value: failing + degraded > 0 ? `${failing + degraded} לטיפול` : "תקין",
    tone: failing > 0 ? "bad" : degraded > 0 ? "warn" : "ok",
    to: "/ops",
  });

  // Producers
  const v = i.producers?.violation_count ?? 0;
  chips.push({
    key: "producers",
    label: "יצרנים",
    value: v > 0 ? `${v} חריגות` : "תקין",
    tone: v > 0 ? "warn" : "ok",
  });

  // Feed freshness (conservative — only genuinely dead feeds)
  const files = i.freshness?.files ?? {};
  const stale = Object.entries(files).filter(
    ([name, f]) => !name.startsWith("_") && (f?.age_seconds ?? 0) > STALE_FEED_THRESHOLD_SECONDS,
  ).length;
  chips.push({
    key: "feeds",
    label: "פידים",
    value: stale > 0 ? `${stale} מיושנים` : "טריים",
    tone: stale > 0 ? "warn" : "ok",
  });

  return chips;
}

const TONE_COLOR: Record<PulseTone, string> = {
  ok: "var(--mn-brand-teal, #0891b2)",
  warn: "var(--mn-warning, #d97706)",
  bad: "#dc2626",
};

export function HealthPulseRow() {
  const [inputs, setInputs] = useState<HealthPulseInputs | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const get = (f: string) =>
      fetch(`/ops-data/${f}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([
      get("health.json"),
      get("automation_runtime_inventory.json"),
      get("producer_contract_violations.json"),
      get("_freshness.json"),
    ])
      .then(([health, automations, producers, freshness]) => {
        if (alive) setInputs({ health, automations, producers, freshness });
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="today-section">
        <div className="today-empty" role="alert" data-testid="today-health-error">
          לא ניתן לטעון את דופק המערכת כעת. הנתונים לא הומצאו.
        </div>
      </div>
    );
  }
  if (!inputs) {
    return (
      <div className="today-section">
        <div className="today-empty" data-testid="today-health-loading">
          טוען דופק מערכת…
        </div>
      </div>
    );
  }

  const chips = summarizeHealthPulse(inputs);
  return (
    <div className="today-section" data-testid="today-health-pulse">
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        aria-label="דופק תפעולי"
        dir="rtl"
      >
        {chips.map((c) => {
          const style: React.CSSProperties = {
            flex: "1 1 auto",
            minWidth: 70,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #e5e5e5",
            borderInlineStart: `3px solid ${TONE_COLOR[c.tone]}`,
            background: "#fff",
            display: "block",
            textDecoration: "none",
            color: "inherit",
          };
          const inner = (
            <>
              <div style={{ fontSize: 12, color: "#737373" }}>{c.label}</div>
              <strong style={{ fontSize: 14 }}>{c.value}</strong>
            </>
          );
          return c.to ? (
            <Link key={c.key} to={c.to} data-testid={`pulse-${c.key}`} style={style}>
              {inner}
            </Link>
          ) : (
            <div key={c.key} data-testid={`pulse-${c.key}`} style={style}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
