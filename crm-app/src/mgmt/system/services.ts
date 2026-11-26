import type { SystemNode } from "./systemApi";
import { groupStatus, isProblem, nodeStatus, type Model } from "./model";

// The curated service map of the approved mockup (v4d): named services backed by real records (ids) or a whole domain (g),
// the links between them, and the four outcomes the owner cares about. A link counts as verified only when the map has an edge.
export interface Svc { id: string; o: string; t: string; s: string; ids?: string[]; g?: string; ext?: 1 }
export interface Link { a: string; b: string; l: string; ty: "f" | "u" | "n" | "x"; ok: boolean }
export interface Outcome { id: string; t: string; ok: string; key: string[] }

export const SVC: Svc[] = [
  { id: "rec", o: "lesson", t: "הקלטות השיעורים", s: "Google Drive: שם נשמרת כל הקלטה", ids: ["ext:google-drive"], ext: 1 },
  { id: "pipe", o: "lesson", t: "מסלול השיעור", s: "לוקח הקלטה חדשה ומעביר אותה בשלבים", ids: ["windmill:flow:f/media_pipeline/lesson_pipeline_v2", "windmill:schedule:f/media_pipeline/schedule_drive_poller"] },
  { id: "stt", o: "lesson", t: "תמלול", s: "הופך את הדיבור בשיעור לטקסט", g: "lessons-transcription" },
  { id: "sum", o: "lesson", t: "סיכומים", s: "כותב ובודק סיכום לכל שיעור", g: "lesson-summaries" },
  { id: "lib", o: "lesson", t: "ספריית אתערותא", s: "המאגר של כל השיעורים", g: "itaruta-library" },
  { id: "nek", o: "lesson", t: "נקודה שלי", s: "האתר שבו הלומדים לומדים", g: "nekuda" },
  { id: "vid", o: "lesson", t: "Vimeo ו־YouTube", s: "מנגנים את הווידאו של השיעורים", ids: ["ext:vimeo", "ext:youtube"], ext: 1 },
  { id: "mon", o: "owner", t: "ניטור ובריאות", s: "בודק כל הזמן שהמערכת עובדת", g: "monitoring" },
  { id: "rep", o: "owner", t: "דיווחים אליך", s: "בוקר, שבוע ותקלות", g: "owner-reports" },
  { id: "tg", o: "owner", t: "טלגרם", s: "ערוץ ההתראות אליך", ids: ["ext:telegram"], ext: 1 },
  { id: "wa", o: "owner", t: "וואטסאפ", s: "הודעות אליך ולקבוצות", ids: ["ext:whatsapp"], ext: 1 },
  { id: "nai", o: "ai", t: "נשמה AI", s: "הסוכן שעונה על שאלות", ids: ["site:agent.konena.com", "container:agent-shim-owui-v1"] },
  { id: "may", o: "ai", t: "מעיינותיך", s: "מאגר המקורות שהסוכן מחפש בו", ids: ["sys-unit:mayenotecha-api", "container:mayenotecha-db"] },
  { id: "claude", o: "ai", t: "Claude", s: "מודל השפה שכותב ועונה", ids: ["ext:anthropic"], ext: 1 },
  { id: "give", o: "donation", t: "עמוד התרומה", s: "שם תורמים, גם מתוך נקודה שלי", ids: ["site:give.merkazneshama.co.il", "user-unit:donations"] },
  { id: "tak", o: "donation", t: "תקבול", s: "חברת הסליקה שגובה את התשלום", ids: ["ext:takbull"], ext: 1 },
  { id: "hook", o: "donation", t: "קליטת התשלום", s: "תהליך אוטומטי שרושם כל תשלום", ids: ["n8n:takbul-webhook-001", "n8n:takbul-newinvoice-001"] },
  { id: "crm", o: "donation", t: "רשימת התורמים (CRM)", s: "אנשי הקשר, התורמים והקבלות", ids: ["container:hycrm-directus"] },
  { id: "books", o: "donation", t: "הנהלת החשבונות", s: "הספרים של העמותה", ids: ["container:heshbonot"] },
];
const LINK_DEFS: [string, string, string, Link["ty"]][] = [
  ["rec", "pipe", "שולח הקלטות אל", "f"], ["pipe", "stt", "מעביר לתמלול", "f"], ["stt", "sum", "שולח תמלול אל", "f"], ["sum", "lib", "מפרסם סיכום ב", "f"],
  ["lib", "nek", "מספקת שיעורים ל", "f"], ["pipe", "vid", "מעלה וידאו אל", "f"], ["pipe", "wa", "מודיע בסיום ב", "n"], ["sum", "claude", "כותב בעזרת", "u"],
  ["nai", "claude", "עונה בעזרת", "u"], ["nai", "may", "מחפש מקורות ב", "u"], ["mon", "rep", "מעביר ממצאים אל", "f"], ["rep", "wa", "שולח אליך ב", "u"],
  ["rep", "tg", "שולח אליך ב", "u"], ["nek", "give", "לומדים תורמים דרך", "x"], ["give", "tak", "גובה דרך", "u"], ["tak", "hook", "מודיע על תשלום אל", "f"],
  ["hook", "crm", "רושם קבלה ב", "f"], ["crm", "books", "מעביר לספרים", "f"],
];
export const OUTCOMES: Outcome[] = [
  { id: "lesson", t: "השיעור מגיע ללומדים", ok: "השיעורים זמינים ללומדים", key: ["lib", "nek"] },
  { id: "donation", t: "תרומה הופכת להכנסה", ok: "אפשר לתרום, והתשלום נרשם", key: ["give", "tak"] },
  { id: "ai", t: "שאלה מקבלת תשובה", ok: "נשמה AI עונה על שאלות", key: ["nai"] },
  { id: "owner", t: "תקלה מגיעה אליך", ok: "התראות ודיווחים מגיעים אליך", key: ["rep"] },
];
export const SV: Record<string, Svc> = Object.fromEntries(SVC.map((s) => [s.id, s]));
export const OC: Record<string, Outcome> = Object.fromEntries(OUTCOMES.map((o) => [o.id, o]));

export interface Services { m: Model; sets: Record<string, Set<string>>; links: Link[] }

export function buildServices(m: Model, edges: { from: string; to: string }[]): Services {
  const G = Object.fromEntries(m.groups.map((g) => [g.id, g]));
  const sets: Record<string, Set<string>> = {};
  for (const s of SVC) {
    const ids = s.ids ? s.ids.filter((i) => m.N[i]) : s.g && G[s.g] ? (G[s.g].node_ids || G[s.g].component_ids || []).filter((i) => m.N[i]) : [];
    sets[s.id] = new Set(ids);
  }
  const links = LINK_DEFS.map(([a, b, l, ty]) => ({ a, b, l, ty, ok: edges.some((e) => (sets[a].has(e.from) && sets[b].has(e.to)) || (sets[b].has(e.from) && sets[a].has(e.to))) }));
  return { m, sets, links };
}

export function svcStatus(x: Services, s: Svc): { k: "ok" | "care" | "down" | "unk"; p: SystemNode[] } {
  const g = s.g && x.m.groups.find((gr) => gr.id === s.g);
  if (g) return groupStatus(g, x.m);
  const ns = [...x.sets[s.id]].map((i) => x.m.N[i]);
  const p = ns.filter(isProblem);
  if (p.length) return { k: p.some((n) => n.kind === "site") ? "down" : "care", p };
  return ns.some((n) => nodeStatus(n).k === "ok") ? { k: "ok", p: [] } : { k: "unk", p: [] };
}

export const svcOf = (x: Services, n: SystemNode) => SVC.filter((s) => x.sets[s.id].has(n.id));

// What stops if this service stops: data flows forward (a -> b); a "uses" link spreads backward (b stops -> a stops);
// notifications and the cross-outcome donation link do not spread.
export function downstream(x: Services, id: string): Svc[] {
  const seen = new Set<string>(), q = [id];
  while (q.length) {
    const cur = q.shift()!;
    for (const k of x.links) {
      const nxt = k.ty === "f" && k.a === cur ? k.b : k.ty === "u" && k.b === cur ? k.a : null;
      if (nxt && nxt !== id && !seen.has(nxt)) { seen.add(nxt); q.push(nxt); }
    }
  }
  return [...seen].map((i) => SV[i]);
}
export const outcomesOf = (x: Services, id: string): Outcome[] => [...new Set([SV[id].o, ...downstream(x, id).map((s) => s.o)])].map((o) => OC[o]);

export function outcomeStatus(x: Services, o: Outcome) {
  const ss = SVC.filter((s) => s.o === o.id).map((s) => ({ s, st: svcStatus(x, s) }));
  const down = ss.filter((z) => z.st.k === "down"), care = ss.filter((z) => z.st.k === "care");
  const k: "ok" | "care" | "down" = down.some((z) => o.key.includes(z.s.id)) ? "down" : down.length || care.length ? "care" : "ok";
  return {
    k,
    probs: [...down, ...care].flatMap((z) => z.st.p),
    unkS: ss.filter((z) => z.st.k === "unk").map((z) => z.s),
    unvL: x.links.filter((l) => !l.ok && (SV[l.a].o === o.id || SV[l.b].o === o.id)),
  };
}
