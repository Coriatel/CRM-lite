import type { SystemMap, SystemNode } from "./systemApi";
import { consequence, nodeStatus, title, W, type Model } from "./model";

// The owner's open decisions (OWNER_QUESTIONS.json, published inside the map as `questions`), mockup v4d "decide".
export interface OwnerQ { n?: number; group?: string; text_he: string; default_he?: string; reason_he?: string; evidence?: string; node_ids?: string[]; decided_today?: string[]; decided?: unknown; status?: string; answer?: unknown }

const KSHORT: Record<string, string> = { site: "אתר", container: "קונטיינר", timer: "משימה מתוזמנת", "user-timer": "משימה מתוזמנת", workflow: "תהליך אוטומטי", script: "סקריפט" };
const PLURAL: Record<string, [string, boolean]> = { "משימה מתוזמנת": ["משימות אוטומטיות", true], "תהליך אוטומטי": ["תהליכים אוטומטיים", false], קונטיינר: ["קונטיינרים", false], אתר: ["כתובות", true], סקריפט: ["סקריפטים", false] };

/** null when the map does not carry the questions (producer not publishing them yet). */
export function allQs(map: SystemMap | null | undefined): OwnerQ[] | null {
  return Array.isArray(map?.questions) ? (map!.questions as OwnerQ[]) : null;
}

const done = (q: OwnerQ) => !!(q.decided || q.status === "decided" || q.answer) || (!!q.node_ids?.length && (q.decided_today?.length ?? 0) >= q.node_ids.length);
export const openQs = (map: SystemMap | null | undefined) => (allQs(map) || []).filter((q) => !done(q));

export const qLeft = (q: OwnerQ, m: Model): SystemNode[] =>
  (q.node_ids || []).filter((i) => !(q.decided_today || []).includes(i)).map((i) => m.N[i]).filter(Boolean);

export const qFor = (map: SystemMap | null | undefined, id: string) => openQs(map).find((q) => (q.node_ids || []).includes(id));

const liveIn = (n: SystemNode, m: Model) => (m.inbound[n.id] || []).filter((f) => m.N[f]?.state === "works").length;

/** What is at stake, in words: the consequence first, the technical question only in the fold. */
export function qConsequence(q: OwnerQ, m: Model): string {
  const left = qLeft(q, m);
  if (!left.length) return q.text_he;
  if (left.length === 1) {
    const n = left[0];
    return `${title(n)}: ${consequence(n, m) || W[nodeStatus(n).k]}. ${liveIn(n, m) ? "משהו פעיל תלוי בו." : "שום דבר אחר לא תלוי בו."}`;
  }
  const deps = left.reduce((a, n) => a + liveIn(n, m), 0);
  const depTxt = deps ? `${deps === 1 ? "דבר פעיל אחד מצביע" : `${deps} דברים פעילים מצביעים`} עליהם.` : "שום דבר פעיל לא תלוי בהם.";
  const st0 = left[0].state, same = left.every((n) => n.state === st0);
  const kinds = [...new Set(left.map((n) => KSHORT[n.kind] || n.kind))];
  const [word, fem] = (kinds.length === 1 && PLURAL[kinds[0]]) || ["דברים", false];
  const how = ({ "off on purpose": fem ? "כבויות" : "כבויים", stale: fem ? "מופעלות אבל כמעט לא רצו" : "מופעלים אבל כמעט לא רצו", unknown: fem ? "פועלות בלי בדיקה שמודדת אותן" : "פועלים בלי בדיקה שמודדת אותם", works: fem ? "פועלות" : "פועלים" } as Record<string, string>)[same ? st0 || "" : ""] || "במצבים שונים";
  return `${left.length} ${word} ${how}. ${depTxt}`;
}

/** For the sub-tab: undefined hides it (the map carries no questions yet), a number is its badge. */
export const qCount = (map: SystemMap | null | undefined) => (allQs(map) ? openQs(map).length : undefined);
