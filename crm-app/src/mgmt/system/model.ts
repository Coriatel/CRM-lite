import type { SystemMap, SystemNode } from "./systemApi";

// The same reading of the map as the approved mockup (v4d), so the built screens say the same things.
export type StatusK = "ok" | "care" | "down" | "maint" | "off" | "priv" | "unk";
export const W: Record<StatusK, string> = { ok: "עובד", care: "עובד, צריך טיפול", down: "לא עובד עכשיו", maint: "תחזוקה", off: "כבוי בכוונה", priv: "פרטי בכוונה", unk: "לא ידוע" };

export interface Group { id: string; name_he: string; purpose_he?: string; node_ids?: string[]; component_ids?: string[] }
export interface Model { nodes: SystemNode[]; N: Record<string, SystemNode>; groups: Group[]; inbound: Record<string, string[]>; gen: string | null; lanes: Record<string, string> }

// Owner decision 12.11: the accounting addresses are private on purpose, not failing.
const PRIVATE_BY_OWNER: Record<string, string> = { "site:heshbon.merkazneshama.co.il": "12.11", "site:heshbonot.merkazneshama.co.il": "12.11" };

export function buildModel(map: SystemMap): Model {
  const nodes = map.nodes.map((n) => (PRIVATE_BY_OWNER[n.id] && n.state === "failing" ? { ...n, state: "private on purpose", _owner_note: `פרטית בכוונה (החלטת בעלים ${PRIVATE_BY_OWNER[n.id]})` } : n));
  const N = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const inbound: Record<string, string[]> = {};
  for (const e of map.edges) (inbound[e.to] ||= []).push(e.from);
  return { nodes, N, groups: (map.groups as Group[]) || [], inbound, gen: map._meta?.generated_at ?? null, lanes: (map.lane_labels as Record<string, string>) || {} };
}

export function nodeStatus(n: SystemNode): { k: StatusK; note?: string } {
  const s = n.state;
  if (s === "works") return { k: "ok" };
  if (s === "maintenance") return { k: "maint" };
  if (s === "failing" || s === "not running") return { k: "down" };
  if (s === "off on purpose") return /internal/.test(String((n.exposure_decision as { value?: string })?.value || "")) ? { k: "priv" } : { k: "off" };
  if (s === "private on purpose") return { k: "priv" };
  if (s === "stale") return { k: "unk", note: "מופעל, אבל כמעט לא רץ" };
  return { k: "unk", note: n.kind === "external" ? "שירות חיצוני: לא נבדק מכאן" : "אין בדיקה שמודדת אותו" };
}

export const isProblem = (n: SystemNode) => n.state === "failing" || (n.state === "not running" && n.verdict === "needed");
export const isAuto = (n: SystemNode) => ["workflow", "timer", "user-timer", "script"].includes(n.kind);

export function title(n: SystemNode): string {
  let t = String(n.title_he || n.purpose_he || "");
  if (n.purpose_source === "guess") t = t.replace(/\s*\(.*$/, "");
  t = t.replace(/\s*\(סוגי צעדים:.*\)$/, "").replace(/^שירות חיצוני: /, "");
  return t || n.name;
}

export function consequence(n: SystemNode, m: Model): string {
  const s = n.state;
  if (s === "failing") return n.kind === "site" ? "לא נפתח" : `הריצה האחרונה נכשלה${n.last_run_at ? ` (${when(n.last_run_at as string, m.gen)})` : ""}`;
  if (s === "not running") return n.verdict === "needed" ? "לא רץ, ומישהו צריך אותו" : "לא רץ";
  if (s === "stale") return "מופעל, אבל כמעט לא רץ";
  if (s === "unknown") return nodeStatus(n).note || "";
  if (n._owner_note) return String(n._owner_note);
  if (s === "off on purpose") return (m.inbound[n.id] || []).some((f) => m.N[f]?.state === "works") ? "כבוי, ומשהו פעיל עדיין מצביע עליו" : "כבוי; שום דבר פעיל לא תלוי בו";
  if (s === "works" && /נכשל/.test(String(n.last_result || ""))) return "הריצה האחרונה נכשלה";
  return "";
}

export const whose = (n: SystemNode) => String(n.owner_label_he || "לא ידוע");

export function groupStatus(g: Group, m: Model): { k: "ok" | "care" | "down"; p: SystemNode[] } {
  const p = (g.node_ids || g.component_ids || []).map((id) => m.N[id]).filter(Boolean).filter(isProblem);
  if (!p.length) return { k: "ok", p };
  return { k: p.some((n) => n.kind === "site") ? "down" : "care", p };
}

/** The home screen's lists, in the mockup's order: what is broken, what waits for a decision, what is not checked. */
export function homeLists(m: Model) {
  const probs = m.nodes.filter((n) => isProblem(n) || (n.state === "not running" && n.kind !== "site" && n.verdict !== "candidate to retire" && !n.decided));
  const parked = m.nodes.filter((n) => n.state === "not running" && !probs.includes(n));
  const unk = m.nodes.filter((n) => nodeStatus(n).k === "unk").length;
  const offAuto = m.nodes.filter((n) => nodeStatus(n).k === "off" && isAuto(n));
  const offNeeded = offAuto.filter((n) => (m.inbound[n.id] || []).some((f) => m.N[f]?.state === "works")).length;
  const offOther = m.nodes.filter((n) => nodeStatus(n).k === "off").length - offAuto.length;
  const groups = m.groups.map((g) => ({ g, s: groupStatus(g, m) }));
  const bad = groups.filter((x) => x.s.k !== "ok");
  return { probs, parked, unk, offAuto: offAuto.length, offNeeded, offOther, groups: [...bad, ...groups.filter((x) => x.s.k === "ok")], badGroups: bad.length };
}

const TZ = "Asia/Jerusalem";
const fD = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "numeric" });
const fY = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
const fT = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** A time in words relative to the scan (היום / אתמול / date), as the mockup says it; "לא ידוע" when there is none. */
export function when(iso: string | null | undefined, gen: string | null): string {
  if (!iso) return "לא ידוע";
  const d = new Date(iso);
  if (isNaN(+d)) return String(iso);
  const g = gen ? new Date(gen) : new Date();
  if (g.getFullYear() !== d.getFullYear()) return fY.format(d);
  const day = fD.format(d);
  const p = day === fD.format(g) ? "היום" : day === fD.format(new Date(+g - 864e5)) ? "אתמול" : day === fD.format(new Date(+g + 864e5)) ? "מחר" : day;
  return /^\d{4}-\d\d-\d\d$/.test(iso) ? p : `${p} ${fT.format(d)}`;
}

export const lastGood = (n: SystemNode) => (n.last_ok as string | undefined) || (n.state === "works" ? (n.last_checked as string | undefined) : null) || null;
