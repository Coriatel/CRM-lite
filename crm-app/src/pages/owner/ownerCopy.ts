/**
 * Executive copy system (code form). Transforms the developer-grade
 * control_tower_packet.json text into human Hebrew at render time. The packet is
 * producer-owned and cannot be changed from this lane, so humanization happens here.
 * See /home/devuserr/control-tower-ux/EXECUTIVE_COPY_SYSTEM.md for the contract.
 *
 * Rule: never return a raw enum / id / path / key=value to the default view.
 */

export function verdictHe(v?: string): string {
  switch (v) {
    case "OK":
      return "תקין";
    case "DEGRADED":
      return "צריך בדיקה";
    case "READY":
      return "מוכן";
    case "FRESH":
      return "עדכני";
    default:
      return "לא ידוע";
  }
}

export type VerdictTone = "ok" | "warn" | "muted";
export function verdictTone(v?: string): VerdictTone {
  if (v === "OK" || v === "READY" || v === "FRESH") return "ok";
  if (v === "DEGRADED") return "warn";
  return "muted";
}

export function confidenceHe(c?: string): string | null {
  if (c === "FACT") return "ודאי";
  if (c === "INFERENCE") return "הערכה";
  return null;
}

const GATE_KIND_HE: Record<string, string> = {
  session_launch: "אישור הפעלת סשן",
  product_direction: "החלטת כיוון",
  schema_migration: "שינוי מבנה נתונים",
  destructive: "פעולה הרסנית",
  credentials: "סודות / הרשאות",
  budget: "תקציב",
  prod_regression: "תקלה בפרודקשן",
};
export function gateKindHe(kind?: string): string {
  if (!kind) return "דורש החלטה";
  return GATE_KIND_HE[kind] ?? "דורש החלטה";
}

export function gateStatusHe(status?: string): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    new: "חדש",
    new_escalate: "חדש · דחוף",
    parked: "ממתין",
    escalate: "דחוף",
    pending: "ממתין",
  };
  return map[status] ?? "ממתין";
}

export function reversibilityHe(v?: string): string | null {
  if (v === "reversible") return "הפיך";
  if (v === "risky") return "מסוכן";
  if (v === "unknown") return "לא ידוע";
  return null;
}

const ACTION_HE: Record<string, string> = {
  continue: "להמשיך",
  inspect: "לבדוק",
  approve: "לאשר",
  reject: "לדחות",
  answer_false_gate: "לסמן שגוי",
  open_session: "לפתוח עבודה",
  close_ready: "לסגור מוכנים",
};
/** Returns null for unknown verbs — we omit rather than show English. */
export function actionHe(verb?: string): string | null {
  if (!verb) return null;
  return ACTION_HE[verb] ?? null;
}
export function actionsHe(verbs?: string[]): string[] {
  return (verbs ?? []).map(actionHe).filter((v): v is string => v != null);
}

const KV_TOKEN = /\b[a-z_]+=[^\s·]+/gi;
const HEBREW = /[֐-׿]/;

/** Strip key=value scoring tokens; keep only a Hebrew clause if one remains. */
export function humanizeRationale(s?: string): string {
  if (!s) return "";
  const parts = s
    .split("·")
    .map((p) => p.trim())
    .filter((p) => p && !KV_TOKEN.test(p) && HEBREW.test(p));
  return parts.join(" · ");
}

const PATHISH = /[/\\]|\.(py|json|tsx?|sh|mjs)\b/i;
export function looksTechnical(s?: string): boolean {
  if (!s) return false;
  return PATHISH.test(s) || KV_TOKEN.test(s) || /[a-z]+:[a-z0-9_.-]+/i.test(s) || /\breq-[a-z0-9]/i.test(s);
}

/** Collapse a path/command label into a short human noun; long English → truncated. */
export function humanizeLabel(s?: string, max = 60): string {
  if (!s) return "—";
  const lower = s.toLowerCase();
  if (lower.includes("apply") && lower.includes("validate")) return "להחיל שינוי מאושר במערכת";
  if (PATHISH.test(s) || KV_TOKEN.test(s)) {
    // strip path/command noise; if Hebrew survives use it, else generic
    const heb = s.split(/\s+/).filter((w) => HEBREW.test(w)).join(" ");
    if (heb) return truncate(heb, max);
    return "פעולה טכנית במערכת";
  }
  return truncate(s, max);
}

export function humanizeSuggestedAction(s?: string, max = 80): string | null {
  if (!s) return null;
  if (/decision=approved/i.test(s)) return "לאשר את הבקשה";
  if (/decision=rejected/i.test(s)) return "לדחות את הבקשה";
  // strip function-call syntax, take first plain clause
  const cleaned = s.replace(/[a-z_]+\([^)]*\)/gi, "").replace(/\s+/g, " ").trim();
  const firstClause = cleaned.split(/[.;]/)[0]?.trim();
  if (firstClause && HEBREW.test(firstClause)) return truncate(firstClause, max);
  return null;
}

/** Summary line for a gate, humanized; falls back to kind, never to a raw id. */
export function gateSummaryHe(summary?: string, kind?: string, max = 80): string {
  if (summary && HEBREW.test(summary) && !looksTechnical(summary)) return truncate(summary, max);
  if (summary && !looksTechnical(summary)) return truncate(summary, max);
  return gateKindHe(kind);
}

export function fmtClock(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `עודכן ב-${hh}:${mm}`;
}

export function fmtAgeDays(days?: number | null): string | null {
  if (days == null) return null;
  const d = Math.round(days);
  if (d <= 0) return "היום";
  if (d === 1) return "לפני יום";
  return `לפני ${d} ימים`;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}
