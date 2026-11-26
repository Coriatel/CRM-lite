import type { SystemNode } from "./systemApi";
import { consequence, isAuto, lastGood, nodeStatus, title, when, whose, W, type Model, type StatusK } from "./model";

// The inventory ("כל מה שיש במערכת") of the approved mockup v4d: saved views, filters, columns, cards.
export const KSHORT: Record<string, string> = { site: "אתר", container: "קונטיינר", timer: "משימה מתוזמנת", "user-timer": "משימה מתוזמנת", service: "שירות רקע", workflow: "תהליך אוטומטי", script: "סקריפט", external: "שירות חיצוני", machine: "מחשב", disk: "דיסק", gpu: "כרטיס מסך", "network-entry": "כניסת רשת", "person-env": "סביבה אישית", "env-service": "שירות בסביבה אישית" };
export const WHOSE = ["המערכת", "הבעלים", "עדי", "הרב", "הילד", "לא ידוע"];
const LANE: Record<string, string> = { "nekuda-mgmt": "ניהול נקודה שלי", "nai-main": "נשמה AI", "estate-control-plane": "תשתית ונכסים", "flow-control-v2": "Flow", "crm-lite-ops": "CRM", "control-tower-owner-view": "מסכי הבעלים", "chagim-simchat-torah": "אתרי החגים", "heshbonot-revive": "חשבונות", itaruta: "אתערותא", "itra-admin": "עיטרא", "mn-os": "MN-OS", "hebrew-stt-library": "תמלול", "control-tower-health": "בדיקות בריאות", "distribution-calendar": "הפצה", "wa-bridge-recovery": "וואטסאפ", lessons: "שיעורים", "management-summary-contract": "דיווחים לבעלים", "history-learning": "למידה מהיסטוריה", "ci-policy": "בדיקות ופריסה" };
export const BY_DOMAIN = "לפי התחום:";
const VERD: Record<string, string> = { needed: "נחוץ", "candidate to retire": "מועמד להפסקה", "owner decides": "מחכה להחלטה שלך" };

const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
export const purpose = (n: SystemNode) => (n.why_he && n.why_he !== n.purpose_he && n.why_he !== title(n) ? String(n.why_he) : "");
function who(v: unknown): string | null {
  if (!v) return null;
  const s = String(v), parts: string[] = [];
  if (/coriat/i.test(s)) parts.push("הבעלים");
  if (/Adi Abinun/i.test(s)) parts.push("עדי (תוכן)");
  const m = s.match(/(devuser[pr]?|elrondev)/i);
  if (m) parts.push(/session|built/i.test(s) || !parts.length ? "סשן Claude" : m[1]);
  return parts.length ? parts.join("; ") : s;
}
export const builtBy = (n: SystemNode) => (obj(n.made_by) ? who(obj(n.made_by)!.value) : who(n.made_by)) || "";
const laneOf = (n: SystemNode) => String((obj(n.owner_lane) ? obj(n.owner_lane)!.lane : n.owner_lane) || "");
export const maintBy = (n: SystemNode, labels: Record<string, string> = {}) => {
  const l = laneOf(n);
  return l && l !== "unknown" ? `סשן ${labels[l] || LANE[l] || l}` : "";
};
export const verdTxt = (n: SystemNode) => String(obj(n.decided)?.decision_he ? `הוחלט: ${obj(n.decided)!.decision_he}` : VERD[String(n.verdict)] || n.verdict || "");
export function checkedBy(s: unknown): string {
  const v = String(s || "");
  if (!v || v === "none") return "";
  if (v === "system-map builder") return "סריקת מפת המערכת";
  if (v.startsWith("ops-public automation_runtime_inventory")) return "מלאי האוטומציות";
  if (v.startsWith("health-check")) return "בדיקת הבריאות הקבועה";
  if (v.startsWith("health capability")) return "בדיקת הבריאות של התחום";
  return "בדיקה אחרת";
}
export const schedTxt = (n: SystemNode) => String(n.schedule_he || (isAuto(n) ? "לא ידוע" : "לא מתוזמן"));
export function lastRunTxt(n: SystemNode, m: Model): string {
  if (!n.last_run_at && !n.last_result) return isAuto(n) ? "לא ידוע" : "לא רץ לבד";
  return `${n.last_run_at ? `${when(n.last_run_at as string, m.gen)} · ` : ""}${n.last_result || "תוצאה לא ידועה"}`;
}

export interface Col { k: string; l: string; v: (n: SystemNode, m: Model) => string; sub?: (n: SystemNode, m: Model) => string; nowrap?: 1 }
export const COLS: Col[] = [
  { k: "name", l: "שם", v: (n) => title(n), sub: (n) => purpose(n) },
  { k: "purpose", l: "מטרה", v: (n) => purpose(n) || (obj(n.serves)?.text_he ? `${BY_DOMAIN} ${obj(n.serves)!.text_he}` : "לא ידוע") },
  { k: "state", l: "מצב", v: (n) => W[nodeStatus(n).k], sub: (n, m) => consequence(n, m) },
  { k: "maint", l: "מתוחזק על ידי", v: (n, m) => maintBy(n, m.lanes) || "לא ידוע" },
  { k: "built", l: "נבנה על ידי", v: (n) => builtBy(n) || "לא ידוע" },
  { k: "checked", l: "נבדק לאחרונה", v: (n, m) => when(n.last_checked as string, m.gen), sub: (n) => checkedBy(n.checked_by), nowrap: 1 },
  { k: "good", l: "עבר בהצלחה לאחרונה", v: (n, m) => when(lastGood(n), m.gen), nowrap: 1 },
  { k: "whose", l: "של מי", v: (n) => whose(n), nowrap: 1 },
  { k: "sched", l: "מתי רץ", v: schedTxt },
  { k: "lastrun", l: "ריצה אחרונה", v: lastRunTxt },
  { k: "uses", l: "משמש את", v: (n, m) => ((m.inbound[n.id] || []).length ? `${(m.inbound[n.id] || []).length} דברים אצלנו` : "לא נמצא שימוש") },
  { k: "kind", l: "סוג", v: (n) => KSHORT[n.kind] || n.kind, nowrap: 1 },
  { k: "url", l: "כתובת", v: (n) => n.name },
];
/** Titles shared by more than one record: those rows also show their technical name, so they can be told apart. */
export function dupTitles(m: Model): Set<string> {
  const c: Record<string, number> = {};
  for (const n of m.nodes) c[title(n)] = (c[title(n)] || 0) + 1;
  return new Set(Object.keys(c).filter((t) => c[t] > 1));
}
export const COL = Object.fromEntries(COLS.map((c) => [c.k, c]));

const SERVER = ["machine", "gpu", "disk", "network-entry", "container", "service", "person-env", "env-service"];
export interface View { id: string; l: string; f: (n: SystemNode) => boolean; d: string[] }
export const VIEWS: View[] = [
  { id: "all", l: "הכול", f: () => true, d: ["name", "purpose", "state", "maint", "built", "checked"] },
  { id: "sites", l: "אתרים וקישורים", f: (n) => n.kind === "site", d: ["name", "url", "state", "whose", "checked"] },
  { id: "auto", l: "רץ אוטומטית", f: isAuto, d: ["name", "state", "sched", "lastrun", "maint", "checked"] },
  { id: "ext", l: "שירותים שאנחנו משתמשים בהם", f: (n) => n.kind === "external", d: ["name", "purpose", "state", "uses", "checked"] },
  { id: "server", l: "השרת", f: (n) => SERVER.includes(n.kind), d: ["name", "purpose", "state", "kind", "whose", "checked"] },
];

export interface Filter { view: string; who: string; st: string; g: string; q: string; sort: string; dir: "asc" | "desc" }
const SO: Record<StatusK, number> = { down: 0, care: 1, unk: 2, ok: 3, maint: 3, priv: 4, off: 5 };

export function matches(n: SystemNode, f: Pick<Filter, "who" | "st" | "g" | "q">): boolean {
  if (f.who && whose(n) !== f.who) return false;
  if (f.st && nodeStatus(n).k !== f.st) return false;
  if (f.g && n.group !== f.g) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (![title(n), n.name, n.short_id || n.id, n.purpose_he, purpose(n)].join(" ").toLowerCase().includes(q)) return false;
  }
  return true;
}

/** Rows for a view + filters: by default the broken first (the mockup's order); a header click sorts by that column. */
export function rowsFor(m: Model, f: Filter): { base: SystemNode[]; rows: SystemNode[] } {
  const view = VIEWS.find((v) => v.id === f.view) || VIEWS[0];
  const base = m.nodes.filter(view.f);
  let rows = base.filter((n) => matches(n, f));
  const c = COL[f.sort];
  rows = c
    ? [...rows].sort((a, b) => c.v(a, m).localeCompare(c.v(b, m), "he", { numeric: true }) * (f.dir === "desc" ? -1 : 1))
    : [...rows].sort((a, b) => SO[nodeStatus(a).k] - SO[nodeStatus(b).k]);
  return { base, rows };
}
