// Truth layer for the Control Panel.
//
// The old /ops cockpit rendered several feeds as if live when their writer was
// dead or their content was weeks old (processes.json = 22d, owner_gate_status
// = 5d, …). The lie came from judging freshness by file mtime — a file can be
// rewritten fresh while its CONTENT timestamp / upstream source is stale
// (active_sessions.json carries _meta.source_age_seconds of hours).
//
// So we classify a feed by the WORST of: its own content timestamp
// (generated_at / materialized_at / ts / last_verified), its declared upstream
// age (_meta.source_age_seconds), and the served-file age (_freshness.json).
// A feed that cannot be proven live is never rendered as a live metric.

export type FeedLevel = "live" | "aging" | "stale" | "dead" | "missing";

export interface FeedMeta {
  generated_at?: string;
  materialized_at?: string;
  ts?: string;
  last_verified?: string;
  source_age_seconds?: number;
  advisory?: boolean;
  degraded?: boolean;
  error?: string;
}

export interface FeedFreshness {
  level: FeedLevel;
  /** Effective content age in seconds (worst of content + upstream). null = unknown. */
  ageSeconds: number | null;
  /** Upstream source age if the feed declares one (_meta.source_age_seconds). */
  sourceAgeSeconds: number | null;
  advisory: boolean;
  /** false => the UI MUST NOT present this feed's numbers as current truth. */
  trustworthy: boolean;
  /** Short Hebrew explanation for the freshness pill. */
  reasonHe: string;
}

// Multipliers over the per-feed runtime SLA.
const AGING_FACTOR = 1; // > sla  → aging (still shown, warned)
const STALE_FACTOR = 3; // > 3×sla → stale (metric suppressed)
const DEAD_FACTOR = 20; // > 20×sla → dead  (no live writer)

function parseIsoSeconds(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((nowMs - t) / 1000));
}

function contentTimestamp(meta: FeedMeta | null | undefined): string | undefined {
  if (!meta) return undefined;
  return meta.generated_at ?? meta.materialized_at ?? meta.ts ?? meta.last_verified;
}

export function humanAgeHe(seconds: number | null): string {
  if (seconds === null) return "גיל לא ידוע";
  if (seconds < 90) return "כעת";
  const m = Math.round(seconds / 60);
  if (m < 90) return `לפני ${m} דק'`;
  const h = Math.round(seconds / 3600);
  if (h < 36) return `לפני ${h} שע'`;
  const d = Math.round(seconds / 86400);
  return `לפני ${d} ימים`;
}

export function classifyFeed(opts: {
  present: boolean;
  meta?: FeedMeta | null;
  fileAgeSeconds?: number | null;
  slaSeconds: number;
  nowMs: number;
}): FeedFreshness {
  const { present, meta, fileAgeSeconds = null, slaSeconds, nowMs } = opts;

  if (!present) {
    return {
      level: "missing",
      ageSeconds: null,
      sourceAgeSeconds: null,
      advisory: false,
      trustworthy: false,
      reasonHe: "אין נתונים — המקור חסר",
    };
  }

  const advisory = !!meta?.advisory;
  const sourceAge = typeof meta?.source_age_seconds === "number" ? meta.source_age_seconds : null;
  const contentAge = parseIsoSeconds(contentTimestamp(meta), nowMs);

  // Worst of every age signal we have. If none, we cannot prove freshness.
  const candidates = [contentAge, sourceAge, fileAgeSeconds].filter(
    (x): x is number => typeof x === "number",
  );
  const effectiveAge = candidates.length ? Math.max(...candidates) : null;

  if (meta?.error) {
    return {
      level: "dead",
      ageSeconds: effectiveAge,
      sourceAgeSeconds: sourceAge,
      advisory,
      trustworthy: false,
      reasonHe: `שגיאת מקור · ${humanAgeHe(effectiveAge)}`,
    };
  }

  if (effectiveAge === null) {
    // Present but undateable — cannot be presented as live truth.
    return {
      level: "stale",
      ageSeconds: null,
      sourceAgeSeconds: sourceAge,
      advisory,
      trustworthy: false,
      reasonHe: "גיל לא ידוע — לא ניתן לאמת",
    };
  }

  let level: FeedLevel;
  if (effectiveAge > DEAD_FACTOR * slaSeconds) level = "dead";
  else if (effectiveAge > STALE_FACTOR * slaSeconds) level = "stale";
  else if (effectiveAge > AGING_FACTOR * slaSeconds) level = "aging";
  else level = "live";

  const trustworthy = level === "live" || level === "aging";

  let reasonHe: string;
  switch (level) {
    case "dead":
      reasonHe = `אין כותב חי · ${humanAgeHe(effectiveAge)}`;
      break;
    case "stale":
      reasonHe = `לא עודכן · ${humanAgeHe(effectiveAge)}`;
      break;
    case "aging":
      reasonHe = `מתיישן · ${humanAgeHe(effectiveAge)}`;
      break;
    default:
      reasonHe =
        sourceAge && sourceAge > slaSeconds
          ? `נכתב כעת · מקור ${humanAgeHe(sourceAge)}`
          : `חי · ${humanAgeHe(effectiveAge)}`;
  }
  if (advisory) reasonHe = `ייעוצי · ${reasonHe}`;

  return { level, ageSeconds: effectiveAge, sourceAgeSeconds: sourceAge, advisory, trustworthy, reasonHe };
}

/** Color/label tokens for a freshness level (UI consumes these). */
export const FEED_LEVEL_UI: Record<FeedLevel, { label: string; color: string; bg: string }> = {
  live: { label: "חי", color: "var(--mn-success)", bg: "#ecfdf3" },
  aging: { label: "מתיישן", color: "var(--mn-warning)", bg: "#fffbeb" },
  stale: { label: "לא עדכני", color: "var(--mn-warning)", bg: "#fff7ed" },
  dead: { label: "לא חי", color: "var(--mn-critical)", bg: "#fef2f2" },
  missing: { label: "חסר", color: "var(--mn-critical)", bg: "#fef2f2" },
};
