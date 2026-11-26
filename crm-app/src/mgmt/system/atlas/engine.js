// The System atlas, ported from the owner-reviewed standalone mockup (26.11): plain DOM + canvas, no dependencies.
// This file is now the source; DOM lookups are scoped to `root`, so it can sit beside the React System screens.
// Data comes only from the caller (GET /api/system/map); the sample workflow steps are labelled as sample in the UI.
/* eslint-disable */
const MARKUP = "<header>\n  <div class=\"ttl\"><h1>אטלס המערכת</h1><span id=\"asof\"></span>\n    <button id=\"exit\" aria-label=\"סגירת האטלס\">סגירה</button><button id=\"back\" aria-label=\"חזרה למצב הקודם\"><svg class=\"ic\" viewBox=\"0 0 24 24\"><path d=\"M9 6l6 6-6 6\"/></svg>חזרה</button></div>\n  <div class=\"seg\" role=\"group\" aria-label=\"תצוגה\">\n    <button data-v=\"0\" aria-pressed=\"true\">בית</button>\n    <button data-v=\"A\" aria-pressed=\"false\">מפה שטוחה</button>\n    <button data-v=\"B\" aria-pressed=\"false\">כוכבים 3D</button>\n    <button data-v=\"C\" aria-pressed=\"false\">אטלס 3D</button>\n    <button data-v=\"T\" aria-pressed=\"false\">טבלת רכיבים</button>\n    <button data-v=\"W\" aria-pressed=\"false\">תהליכים</button>\n    <button data-v=\"R\" aria-pressed=\"false\">דוח תקלות</button>\n  </div>\n</header>\n<nav class=\"lensbar\" id=\"lensbar\" aria-label=\"חתך\" hidden></nav>\n<main class=\"atl-main\">\n  <section class=\"view on\" id=\"v0\" aria-label=\"בית\"></section>\n  <section class=\"view\" id=\"vmap\" aria-label=\"מפה\">\n    <div class=\"tools\">\n      <label class=\"search\"><svg class=\"ic\" viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"6\"/><path d=\"M20 20l-4.5-4.5\"/></svg><input id=\"q\" type=\"search\" placeholder=\"חיפוש\" aria-label=\"חיפוש במפה\" autocomplete=\"off\"></label>\n      <div class=\"scope\" id=\"scope\" role=\"group\" aria-label=\"היקף התצוגה\">\n        <button data-s=\"item\">רכיב</button><button data-s=\"chain\">רצף</button><button data-s=\"all\">הכול</button>\n      </div>\n      <ul class=\"results\" id=\"res\" hidden></ul>\n    </div>\n    <div class=\"stage\" id=\"stage\">\n      <canvas id=\"cv\" aria-label=\"מפת המערכת\"></canvas>\n      <div class=\"labels\" id=\"labels\"></div>\n      <div class=\"ov\" id=\"legend\" hidden></div>\n      <button class=\"ov ovbtn\" id=\"recenter\">מרכז</button>\n      <button class=\"ov ovbtn\" id=\"camtg\" aria-expanded=\"false\">מצלמה</button>\n      <div class=\"ov\" id=\"campanel\" hidden></div>\n      <button class=\"ov ovbtn\" id=\"offtg\" aria-pressed=\"false\"></button>\n      <div class=\"ov\" id=\"hint\"></div>\n    </div>\n  </section>\n  <section id=\"vx\" aria-label=\"רשימה\"></section>\n</main>\n<section id=\"sheet\" aria-label=\"פרטים\"></section>";

export function mountAtlas(root, D0, opts = {}) {
root.innerHTML = MARKUP;
// ---------- data and words (shared by every view) ----------
const D = structuredClone(D0);
D.generated_at = D.generated_at || D._meta?.generated_at || null;
D.findings = D.findings || [];
const G = {}; D.groups.forEach((g) => (G[g.id] = { ...g, nodes: [] }));
D.nodes = D.nodes.filter((n) => G[n.group]);
const N = {}; D.nodes.forEach((n) => (N[n.id] = n));
// the owner decided these are private on purpose (id -> date); a failing check on them is not a fault (as model.ts)
const PRIV = opts.privateIds || {};
D.nodes.forEach((n) => { if (PRIV[n.id] && n.state === "failing") { n.state = "private on purpose"; n._priv = PRIV[n.id]; } });
// new since the last scan: per-node flag, or the producer's list of new ids (both optional)
const NEWIDS = new Set(D._meta?.new_ids || []), GONE = D._meta?.gone_ids || [];
const isNew = (n) => n.is_new === true || NEWIDS.has(n.id);
const newTag = (n) => (isNew(n) ? ` <span class="tag new">חדש</span>` : "");
// a site's address: {url} from the scan, or a bare host
const siteUrl = (n) => { const a = n.address; const u = typeof a === "string" ? a : a && a.url; if (!u) return null; return /^https?:\/\//.test(u) ? u : "https://" + u; };
const siteHost = (u) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
D.nodes.forEach((n) => G[n.group] && G[n.group].nodes.push(n));
// the scan lists some relationships several times (one per route); draw and list each once
const E = []; { const seen = new Set(); D.edges.forEach((e) => { const k = e.from + "|" + e.to + "|" + e.rel; if (!seen.has(k) && N[e.from] && N[e.to]) { seen.add(k); E.push(e); } }); }
const OUT = {}, IN = {};
E.forEach((e) => { (OUT[e.from] ||= []).push(e); (IN[e.to] ||= []).push(e); });
const ST = { works: ["עובד", "ok"], failing: ["נכשל", "bad"], "not running": ["לא רץ", "bad"], stale: ["כמעט לא רץ", "warn"], unknown: ["לא נבדק", "unk"], "private on purpose": ["פרטי בכוונה", "off"], "off on purpose": ["כבוי בכוונה", "off"] };
const SRANK = { failing: 0, "not running": 0, stale: 1, unknown: 2, works: 3, "private on purpose": 4, "off on purpose": 4 };
const LIGHT = { red: ["תקלה", "bad"], yellow: ["דורש תשומת לב", "warn"], green: ["תקין", "ok"] };
const KIND = { site: "אתר", container: "קונטיינר", timer: "משימה מתוזמנת", "user-timer": "משימה מתוזמנת", service: "שירות רקע", workflow: "תהליך אוטומטי", script: "סקריפט", external: "שירות חיצוני", disk: "דיסק", machine: "מחשב", gpu: "כרטיס מסך", "network-entry": "כניסת רשת", "person-env": "סביבה אישית", "env-service": "שירות בסביבה אישית" };
const VERB = { calls: ["משתמש ב", "משתמשים בו"], reports_to_owner: ["מדווח לבעלים דרך", "מעביר דיווח של"], exposed_via: ["נגיש דרך", "מעביר תנועה אל"], depends_on: ["תלוי ב", "תלוי בו"], runs_on: ["רץ על", "מריץ את"], feeds: ["מזין את", "מוזן מ"] };
const COL = { ok: "#6fae78", bad: "#ff8a75", warn: "#f0a04b", unk: "#9fb0ba", off: "#5d717b" };
const LCOL = { red: "#ff8a75", yellow: "#f0a04b" };
const PROBLEM = new Set(["failing", "not running", "stale"]);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const el = (id) => root.querySelector(`[id="${id}"]`);
const stOf = (n) => ST[n.state] || ["לא ידוע", "unk"];
const stHtml = ([w, k]) => `<span class="st st-${k}"><i></i>${w}</span>`;
function label(n, max = 30) {
  let t = n.purpose_he || n.name;
  if (/^אתר בתחום|^תהליך בתחום|^משימה בתחום/.test(t)) t = n.name;
  t = t.split(/\s\(|;|\.\s/)[0].trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
const gWord = (g) => LIGHT[g.light] || ["", "unk"];
const gShort = (g) => (g.light === "yellow" ? ["לטיפול", "warn"] : gWord(g));
const sortNodes = (a, b) => (SRANK[a.state] - SRANK[b.state]) || label(a).localeCompare(label(b), "he");
const RANK = { red: 0, yellow: 1, green: 2 };
const probs = (g) => g.nodes.filter((n) => PROBLEM.has(n.state));
const GROUPS = Object.values(G).sort((a, b) => RANK[a.light] - RANK[b.light] || probs(b).length - probs(a).length || b.nodes.length - a.nodes.length);

// times: the scan mixes ISO, "YYYY-MM-DD hh:mm:ss+00" and date-only; zone-less values are read as UTC (see report)
function toDate(s) {
  if (!s) return null;
  let t = String(s).trim().replace(" ", "T");
  if (/^\d{4}-\d\d-\d\d$/.test(t)) return { dateOnly: new Date(t + "T12:00:00Z") };
  if (/[+-]\d\d$/.test(t)) t += ":00";
  if (/T\d\d:\d\d/.test(t) && !/(Z|[+-]\d\d:\d\d)$/.test(t)) t += "Z";
  const d = new Date(t);
  return isNaN(d) ? null : d;
}
const PARTS = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function tParts(s) {
  const d = toDate(s);
  if (!d) return s ? [String(s), ""] : null;
  const p = {}; PARTS.formatToParts(d.dateOnly || d).forEach((x) => (p[x.type] = x.value));
  return [`${p.day}.${p.month}`, d.dateOnly ? "" : `${p.hour}:${p.minute}`];
}
const fmtTime = (s) => { const p = tParts(s); return p ? `${p[0]}${p[1] ? " " + p[1] : ""}` : "לא ידוע"; };
const tVal = (s) => { const d = toDate(s); return d ? +(d.dateOnly || d) : -Infinity; };

// ---------- one stable layout for every map: groups as circles, components on a sunflower inside ----------
const GR = (id) => 34 + 10 * Math.sqrt(G[id].nodes.length);
const P = (() => {
  const ids = D.groups.map((g) => g.id), W = {};
  E.forEach((e) => { const a = N[e.from].group, b = N[e.to].group; if (a && b && a !== b) { const k = a < b ? a + "|" + b : b + "|" + a; W[k] = (W[k] || 0) + 1; } });
  const p = {}; ids.forEach((id, i) => { const t = (i / ids.length) * 2 * Math.PI; p[id] = { x: 420 * Math.cos(t), y: 420 * Math.sin(t) }; });
  for (let it = 0; it < 500; it++) {
    for (const k in W) { const [a, b] = k.split("|"), dx = p[b].x - p[a].x, dy = p[b].y - p[a].y, d = Math.hypot(dx, dy) || 1, f = 0.004 * Math.min(W[k], 8) * (d - (GR(a) + GR(b) + 70)) / d; p[a].x += dx * f; p[a].y += dy * f; p[b].x -= dx * f; p[b].y -= dy * f; }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j], dx = p[b].x - p[a].x, dy = p[b].y - p[a].y, d = Math.hypot(dx, dy) || 1, min = GR(a) + GR(b) + 70;
      if (d < min) { const s = (min - d) / 2 / d; p[a].x -= dx * s; p[a].y -= dy * s; p[b].x += dx * s; p[b].y += dy * s; }
    }
    ids.forEach((id) => { p[id].x *= 0.995; p[id].y *= 0.995; });
  }
  ids.forEach((id) => {
    const ns = [...G[id].nodes].sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
    ns.forEach((n, k) => { const ang = k * 2.39996, rad = 9 * Math.sqrt(k + 0.6); n._x = p[id].x + rad * Math.cos(ang); n._y = p[id].y + rad * Math.sin(ang); });
  });
  return p;
})();
const GW = {}; E.forEach((e) => { const a = N[e.from].group, b = N[e.to].group; if (a !== b) { const k = a < b ? a + "|" + b : b + "|" + a; GW[k] = (GW[k] || 0) + 1; } });
// five families (the owner's grouping): colour on every map, and the floors of the star view
const FAMS = {
  "לימוד ותוכן": ["lessons-transcription", "lesson-summaries", "itaruta-library", "nekuda", "itra", "video"],
  "קשר והפצה": ["distribution", "whatsapp", "crm", "public-sites"],
  "ניהול וכספים": ["cockpit", "finance", "flow-apps", "owner-reports"],
  "סוכנים ואוטומציה": ["nai", "automation", "mnos-agents", "learning"],
  "תשתית ותפעול": ["infra", "backups", "monitoring", "deploy-ci"],
};
const FCOL = { "לימוד ותוכן": "#82d8b8", "קשר והפצה": "#90bedc", "ניהול וכספים": "#f2c38f", "סוכנים ואוטומציה": "#c7b2ec", "תשתית ותפעול": "#8ce0df" };
const family = (g) => Object.keys(FAMS).find((k) => FAMS[k].includes(g));
const hash = (id) => { const s = Array.from(id).reduce((a, b) => (Math.imul(a, 31) + b.charCodeAt(0)) | 0, 17); return ((s % 211) + 211) % 211 - 105; };
const GZ = (gid) => (Object.keys(FAMS).indexOf(family(gid)) - 2) * 150 + hash(gid) * 0.25;

// ---------- processes (curated in the owner's example) and two sample workflows with steps ----------
const CAPS = {
  lesson: { title: "פרסום שיעור", desc: "מהקליטה ב־Drive עד להצגת השיעור ללומדים ולדיווח בוואטסאפ.", anchor: "windmill:flow:f/media_pipeline/lesson_pipeline_v2",
    fields: ["windmill:schedule:f/media_pipeline/schedule_drive_poller", "windmill:flow:f/media_pipeline/lesson_pipeline_v2", "site:nekuda.merkazneshama.co.il", "ext:whatsapp"] },
  gift: { title: "קליטת תרומות", desc: "מהעמוד הציבורי, דרך הסליקה והאוטומציה, עד ל־CRM ולהנהלת החשבונות.", anchor: "n8n:takbul-webhook-001",
    fields: ["site:give.merkazneshama.co.il", "ext:takbull", "n8n:takbul-webhook-001", "container:hycrm-directus", "container:heshbonot"] },
  ai: { title: "תשובה בנשמה AI", desc: "מהממשק, למאגר המקורות ולשירות המודל.", anchor: "site:agent.konena.com",
    fields: ["site:agent.konena.com", "sys-unit:mayenotecha-api", "container:mayenotecha-db", "ext:anthropic"] },
};
Object.values(CAPS).forEach((c) => (c.fields = c.fields.filter((id) => N[id])));
for (const k of Object.keys(CAPS)) if (!N[CAPS[k].anchor] || CAPS[k].fields.length < 2) delete CAPS[k];
const capEdges = (c) => E.filter((e) => c.fields.includes(e.from) && c.fields.includes(e.to));
const capsOf = (id) => Object.entries(CAPS).filter(([, c]) => c.fields.includes(id));
const T0 = (h, m) => `2026-11-26T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
const SAMPLE = {
  "windmill:flow:f/media_pipeline/lesson_pipeline_v2": { engine: "windmill", chk: T0(7, 0), steps: [
    { name: "נמצאה הקלטה חדשה ב־Drive", out: "ok", on: true, at: T0(4, 0), node: "windmill:schedule:f/media_pipeline/schedule_drive_poller" },
    { name: "הורדת ההקלטה לשרת", out: "ok", on: true, at: T0(4, 2), node: "ext:google-drive" },
    { name: "תמלול על כרטיס המסך", out: "ok", on: true, at: T0(4, 31) },
    { split: "יש בהקלטה וידאו?", branches: [
      { label: "כן: וידאו", steps: [{ name: "העלאה ל־Vimeo", out: "ok", on: true, at: T0(4, 40), node: "ext:vimeo" }] },
      { label: "לא: שמע בלבד", steps: [{ name: "שמירה כשמע בלבד", out: "skip", on: true }] }] },
    { name: "כתיבת סיכום השיעור", out: "bad", on: true, at: T0(4, 52), why: "הסיכום חזר ריק" },
    { name: "בדיקת הסיכום", out: "notrun", on: true },
    { name: "פרסום השיעור בנקודה שלי", out: "notrun", on: true, node: "site:nekuda.merkazneshama.co.il" },
    { name: "דיווח לבעלים בוואטסאפ", out: "unk", on: true, node: "ext:whatsapp", why: "אין עדות ריצה לשלב הזה" }] },
  "n8n:takbul-webhook-001": { engine: "n8n", chk: T0(7, 0), steps: [
    { name: "הודעה מתקבול על תשלום", out: "ok", on: true, at: T0(6, 14), node: "ext:takbull" },
    { name: "בדיקת החתימה והסכום", out: "ok", on: true, at: T0(6, 14) },
    { split: "תרומה חדשה או עדכון?", branches: [
      { label: "תרומה חדשה", steps: [{ name: "יצירת תרומה ב־CRM", out: "ok", on: true, at: T0(6, 15), node: "container:hycrm-directus" }] },
      { label: "עדכון תרומה קיימת", steps: [{ name: "עדכון התרומה ב־CRM", out: "unk", on: true, why: "לא נמצאה ריצה של הענף הזה" }] }] },
    { name: "רישום בהנהלת החשבונות", out: "bad", on: true, at: T0(6, 15), node: "container:heshbonot", why: "החשבונות לא קיבלו את הרשומה" },
    { name: "מייל תודה לתורם", out: "off", on: false }] },
};
for (const k of Object.keys(SAMPLE)) if (!N[k]) delete SAMPLE[k];
const OUTW = { ok: ["עבד", "ok"], bad: ["נכשל", "bad"], unk: ["לא ידוע", "unk"], skip: ["דולג: הענף לא נבחר", "off"], notrun: ["לא הגיע: נעצר קודם", "warn"], off: ["כבוי בהגדרה", "off"] };
const flatSteps = (steps) => steps.flatMap((s) => (s.split ? s.branches.flatMap((b) => b.steps) : [s]));
const sampleOf = (id) => Object.entries(SAMPLE).filter(([, w]) => flatSteps(w.steps).some((s) => s.node === id)).map(([wid]) => wid);
const WINDMILL = "https://windmill.konena.com/";
const isWindmill = (id) => id.startsWith("windmill:");

// ---------- lenses: which slice of the system the table and the maps show ----------
const LENS = {
  all: { t: "הכול", kinds: null },
  auto: { t: "אוטומציות", kinds: ["workflow", "timer", "user-timer"] },
  code: { t: "סקריפטים", kinds: ["script"] },
  infra: { t: "תשתית", kinds: ["machine", "disk", "gpu", "network-entry", "service", "container", "env-service"] },
  access: { t: "ממשקים", long: "אתרים וממשקים", kinds: ["site", "person-env", "external"] },
  sites: { t: "אתרים", kinds: ["site"] },
  proc: { t: "תהליכים", caps: true },
  new: { t: "חדש", long: "רכיבים חדשים מאז הסריקה הקודמת", fresh: true },
};
const CAPN = new Set(Object.values(CAPS).flatMap((c) => c.fields));
const inLens = (n, l = S.lens) => (l === "proc" ? CAPN.has(n.id) : l === "new" ? isNew(n) : !LENS[l].kinds || LENS[l].kinds.includes(n.kind));

// ---------- one shared state: view, lens, selection, scope, direction; Back restores it with the camera ----------
const S = { V: "0", lens: "all", sel: null, scope: "item", dir: "both", steps: null, tgroup: "", links: null, edge: null };
const HIST = [];
let lastMap = "C", showOff = false, sheetBig = false, colorMode = "fam", camOpen = false;
const HCOL = { red: "#c4553f", yellow: "#c98a3a", green: "#56707a" };
const CAM0 = { A: { angle: 0, tilt: 0, zoom: 1, x: 0, y: 0 }, B: { angle: -20, tilt: 38, zoom: 1, x: 0, y: 0 }, C: { angle: 10, tilt: 42, zoom: 1, x: 0, y: 0 } };
const cams = JSON.parse(JSON.stringify(CAM0));
const isMap = (v) => v === "A" || v === "B" || v === "C";
const snap = () => ({ ...S, cam: isMap(S.V) ? { ...cams[S.V] } : null });
const effScope = () => (!S.sel ? "all" : S.sel.t === "g" && S.scope === "chain" ? "item" : S.scope);
function go(p, push = true) {
  const before = snap(), key = (o) => JSON.stringify([o.V, o.lens, o.sel, o.scope, o.dir, o.steps, o.tgroup, o.links, o.edge]);
  const next = { ...S, ...p };
  if (key(next) === key(S)) return render();
  if (push) HIST.push(before);
  const refocus = JSON.stringify([next.sel, next.scope, next.dir, next.lens]) !== JSON.stringify([S.sel, S.scope, S.dir, S.lens]);
  Object.assign(S, next);
  if (refocus) for (const k of "ABC") Object.assign(cams[k], { zoom: 1, x: 0, y: 0 });
  if (isMap(S.V)) lastMap = S.V;
  render();
}
function back() {
  const s = HIST.pop(); if (!s) return;
  const { cam, ...rest } = s;
  Object.assign(S, rest);
  if (cam) Object.assign(cams[S.V], cam);
  if (isMap(S.V)) lastMap = S.V;
  render();
}

// ---------- relationships, neighbourhood and dependency chain ----------
const okOff = (id) => showOff || N[id].state !== "off on purpose" || (S.sel && S.sel.id === id);
const nbrs = (id) => new Set([...(OUT[id] || []).map((e) => e.to), ...(IN[id] || []).map((e) => e.from)]);
// dependency direction, normalised: "a needs b". calls/depends_on/runs_on point from the one that needs; feeds points to it.
const CHAIN_REL = new Set(["calls", "feeds", "depends_on", "runs_on"]);
const NEEDS = {}, NEEDED = {};
E.forEach((e) => { if (!CHAIN_REL.has(e.rel)) return; const [a, b] = e.rel === "feeds" ? [e.to, e.from] : [e.from, e.to]; (NEEDS[a] ||= []).push({ to: b, e }); (NEEDED[b] ||= []).push({ to: a, e }); });
function chainOf(id, dir = "both") {
  const nodes = new Set([id]), edges = new Set(), needs = new Set(), by = new Set();
  const walk = (M, bag) => {
    let front = [id], hop = 0; const seen = new Set([id]);
    while (front.length && hop < 6 && nodes.size < 140) {
      hop++; const next = [];
      for (const x of front) for (const { to, e } of M[x] || []) {
        if (!okOff(to)) continue;
        edges.add(e);
        if (seen.has(to)) continue;
        seen.add(to); next.push(to); nodes.add(to); bag.add(to);
      }
      front = next;
    }
  };
  if (dir !== "by") walk(NEEDS, needs);
  if (dir !== "needs") walk(NEEDED, by);
  return { nodes, edges: [...edges], needs, by };
}
// what the current lens + selection + scope puts on the map, and what the camera must fit
function scopeSet() {
  const r = { nodes: new Set(), edges: [], frame: "groups", chain: null }, sel = S.sel, sc = effScope();
  const lensDots = () => {
    if (S.lens === "all") return;
    D.nodes.forEach((n) => inLens(n) && okOff(n.id) && r.nodes.add(n.id));
    if (S.lens === "proc") r.edges.push(...Object.values(CAPS).flatMap(capEdges));
  };
  const nodeItem = (id) => {
    r.nodes.add(id); nbrs(id).forEach((x) => okOff(x) && r.nodes.add(x));
    r.edges = E.filter((e) => (e.from === id || e.to === id) && r.nodes.has(e.from) && r.nodes.has(e.to));
    r.frame = [...r.nodes];
  };
  if (!sel || sc === "all") {
    lensDots();
    if (sel && sel.t === "n") r.nodes.add(sel.id);
    if (sel && sel.t === "c") { CAPS[sel.id].fields.forEach((x) => r.nodes.add(x)); r.edges.push(...capEdges(CAPS[sel.id])); }
    return r;
  }
  if (sel.t === "g") {
    G[sel.id].nodes.forEach((n) => (S.lens === "all" || inLens(n)) && okOff(n.id) && r.nodes.add(n.id));
    r.edges = E.filter((e) => r.nodes.has(e.from) && r.nodes.has(e.to));
    r.frame = ["g:" + sel.id, ...r.nodes];
    return r;
  }
  if (sel.t === "c") {
    const c = CAPS[sel.id];
    if (sc === "item") { nodeItem(c.anchor); return r; }
    c.fields.forEach((x) => r.nodes.add(x)); r.edges = capEdges(c); r.frame = [...c.fields]; r.chain = { needs: new Set(), by: new Set(), cap: true };
    return r;
  }
  if (sc === "item") { nodeItem(sel.id); return r; }
  const ch = chainOf(sel.id, S.dir);
  r.nodes = ch.nodes; r.edges = ch.edges; r.frame = [...ch.nodes]; r.chain = ch;
  return r;
}

// ---------- the map: one canvas, three cameras (flat, stars on family floors, tilted atlas) ----------
const cv = el("cv"), LAYER = el("labels");
let ctx = null;
let HIT = [], CUR = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function paint() {
  if (!isMap(S.V)) return;
  ctx ||= cv.getContext("2d");
  if (!ctx) return;
  const mode = S.V, c = cams[mode], host = el("stage"), W = host.clientWidth, H = host.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#112d3a"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#24434f"; for (let y = 10; y < H; y += 20) for (let x = 10; x < W; x += 20) ctx.fillRect(x, y, 1, 1);
  const R = scopeSet(); CUR = R;
  const sc = effScope(), sel = S.sel;
  const INV = new Set();
  if (sel) { if (sel.t === "g") INV.add(sel.id); else if (sel.t === "n") INV.add(N[sel.id].group); if (sc !== "all") R.nodes.forEach((id) => INV.add(N[id].group)); }
  R.inv = INV;
  const k = mode === "B" ? 0.38 : 1;
  const pts = new Map();
  D.groups.forEach((g) => pts.set("g:" + g.id, { x: P[g.id].x, y: P[g.id].y, z: mode === "B" ? GZ(g.id) : 0, g }));
  R.nodes.forEach((id) => { const n = N[id], g = P[n.group]; pts.set(id, mode === "B" ? { x: g.x + (n._x - g.x) * 0.55, y: g.y + (n._y - g.y) * 0.55, z: GZ(n.group) + hash(id) * 0.22, n } : { x: n._x, y: n._y, z: mode === "C" ? 8 : 0, n }); });
  const fk = R.frame === "groups" ? D.groups.map((g) => "g:" + g.id) : R.frame;
  const fp = fk.map((x) => pts.get(x)).filter(Boolean);
  const cen = fp.reduce((a, p) => ({ x: a.x + p.x / fp.length, y: a.y + p.y / fp.length, z: a.z + p.z / fp.length }), { x: 0, y: 0, z: 0 });
  const an = (c.angle * Math.PI) / 180, ti = (c.tilt * Math.PI) / 180, ca = Math.cos(an), sa = Math.sin(an), ct = Math.cos(ti), st = Math.sin(ti);
  const rot = (p) => {
    const X = p.x - cen.x, Y = p.y - cen.y, Z = p.z - cen.z, u = X * ca - Y * sa, v = X * sa + Y * ca;
    const dz = v * st + Z * ct, f = mode === "A" ? 1 : clamp(1500 / (1500 - dz), 0.6, 1.7);
    return { u: u * f, v: (v * ct - Z * st) * f, dz, f };
  };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  fp.forEach((p) => { const q = rot(p), rr = p.g ? GR(p.g.id) * q.f * k : 10; x0 = Math.min(x0, q.u - rr); x1 = Math.max(x1, q.u + rr); y0 = Math.min(y0, q.v - rr); y1 = Math.max(y1, q.v + rr); });
  const bw = Math.max(x1 - x0, 55), bh = Math.max(y1 - y0, 55);
  const TOP = 66, BOT = 58, cy0 = TOP + (H - TOP - BOT) / 2;
  const scale = Math.min((W - 40) / bw, (H - TOP - BOT) / bh, 6) * c.zoom, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const scr = (p) => { const q = rot(p); return { x: W / 2 + c.x + (q.u - mx) * scale, y: cy0 + c.y + (q.v - my) * scale, dz: q.dz, f: q.f }; };
  R.scr = scr; R.pts = pts;
  HIT = [];
  const dimG = (g) => !!sel && !INV.has(g.id);
  // groups, far first
  [...pts.values()].filter((p) => p.g).map((p) => ({ p, s: scr(p) })).sort((a, b) => a.s.dz - b.s.dz).forEach(({ p, s }) => {
    const g = p.g, r = Math.max(6, GR(g.id) * scale * s.f * k), flat = mode === "C" ? Math.max(0.3, ct) : 1;
    if (mode === "C") { ctx.beginPath(); ctx.ellipse(s.x, s.y + 6, r, r * flat, 0, 0, 7); ctx.fillStyle = "#081a22"; ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * flat, 0, 0, 7);
    ctx.globalAlpha = dimG(g) ? 0.22 : sel && sc !== "all" ? 0.42 : 0.8;
    ctx.fillStyle = colorMode === "health" ? HCOL[g.light] : FCOL[family(g.id)] || "#ced9d9"; ctx.fill(); ctx.globalAlpha = 1;
    if (sel && sel.t === "g" && sel.id === g.id) { ctx.lineWidth = 2.5; ctx.strokeStyle = "#f3fffa"; ctx.stroke(); }
    else if (LCOL[g.light] && !dimG(g)) { ctx.lineWidth = 2; ctx.strokeStyle = LCOL[g.light]; ctx.stroke(); }
    ctx.lineWidth = 1;
    HIT.push({ x: s.x, y: s.y, r, g: g.id });
  });
  // relationships
  if (!sel && S.lens === "all") for (const key of Object.keys(GW)) {
    const [a, b] = key.split("|"), s1 = scr(pts.get("g:" + a)), s2 = scr(pts.get("g:" + b));
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.strokeStyle = "#2f5260"; ctx.lineWidth = Math.min(3, 0.6 + GW[key] / 6); ctx.stroke(); ctx.lineWidth = 1;
  }
  const hot = !!R.chain || (sel && sel.t === "n" && sc === "item");
  R.edges.forEach((e) => {
    const p1 = pts.get(e.from), p2 = pts.get(e.to); if (!p1 || !p2) return;
    const a = scr(p1), b = scr(p2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = e.state === "failing" ? "#ff8a75" : hot ? "#8cf0cb" : "#7fa9ae";
    ctx.lineWidth = hot ? 1.6 : 1; ctx.setLineDash(e.confidence === "high" ? [] : [5, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > 26) { // arrow in the data's direction
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, mx2 = a.x + ux * L * 0.62, my2 = a.y + uy * L * 0.62;
      ctx.beginPath(); ctx.moveTo(mx2 + ux * 5, my2 + uy * 5); ctx.lineTo(mx2 - ux * 4 - uy * 4, my2 - uy * 4 + ux * 4); ctx.lineTo(mx2 - ux * 4 + uy * 4, my2 - uy * 4 - ux * 4); ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }
  });
  // components, far first
  [...pts.entries()].filter(([, p]) => p.n).map(([id, p]) => ({ id, p, s: scr(p) })).sort((a, b) => a.s.dz - b.s.dz).forEach(({ id, p, s }) => {
    const f = sel && sel.t === "n" && sel.id === id, r = f ? 8 : sc === "all" ? 3.5 : R.chain ? 5.5 : 4.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.fillStyle = COL[stOf(p.n)[1]]; ctx.fill();
    if (f) { ctx.lineWidth = 2.5; ctx.strokeStyle = "#f3fffa"; ctx.stroke(); ctx.lineWidth = 1; }
    HIT.push({ x: s.x, y: s.y, r: Math.max(r, 14), n: id });
  });
  drawLegend(R);
  placeLabels(R);
  syncCam();
}
// screen-space Hebrew labels: greedy, most important first, no overlaps, tappable
function labelItems(R) {
  const items = [], sel = S.sel, sc = effScope(), nb = sel && sel.t === "n" ? nbrs(sel.id) : new Set();
  const focusG = sel ? (sel.t === "g" ? sel.id : sel.t === "n" ? N[sel.id].group : null) : null;
  D.groups.forEach((g) => {
    const exc = g.light !== "green", inv = R.inv.has(g.id), focused = g.id === focusG && sc === "item" && sel.t === "g";
    if (sel && sc !== "all" && !inv) return;
    items.push({ key: "g:" + g.id, id: g.id, k: "g", top: focused, text: g.name_he, st: exc ? gShort(g) : null,
      pri: focused ? 50 : sel && sc !== "all" ? (inv ? 4 : 1) : g.id === focusG ? 45 : exc ? 22 - RANK[g.light] : 16, dim: !!sel && !inv });
  });
  R.nodes.forEach((id) => {
    const n = N[id], f = !!sel && sel.t === "n" && sel.id === id, pr = PROBLEM.has(n.state);
    if (sc === "all" && !f && !pr && S.lens !== "proc" && !(S.lens === "new" || (S.lens === "sites" && R.nodes.size < 30))) return;
    items.push({ key: id, id, k: "n", text: (isNew(n) ? "חדש · " : "") + label(n, 24), st: pr || f ? stOf(n) : null, f, pri: f ? 100 : nb.has(id) ? 30 : sc === "all" ? (S.lens === "new" ? 40 : 12) : pr ? 20 : R.chain ? 14 : 6 });
  });
  if (S.lens === "proc" && sc === "all") Object.entries(CAPS).forEach(([cid, c]) => items.push({ key: c.anchor, id: cid, k: "c", text: "תהליך: " + c.title, pri: 60, dy: -30 }));
  return items.sort((a, b) => b.pri - a.pri);
}
function placeLabels(R) {
  const W = LAYER.clientWidth, H = LAYER.clientHeight, html = [], L0 = LAYER.getBoundingClientRect();
  const placed = ["legend", "recenter", "camtg", "offtg", "campanel"].map(el).filter((o) => !o.hidden).map((o) => { const b = o.getBoundingClientRect(); return { l: b.left - L0.left - 3, r: b.right - L0.left + 3, t: b.top - L0.top - 3, b: b.bottom - L0.top + 3 }; });
  for (const it of labelItems(R)) {
    const p0 = R.pts.get(it.key); if (!p0) continue;
    const p = R.scr(it.top ? { ...p0, y: p0.y - GR(it.id) * (S.V === "B" ? 0.38 : 0.92) } : p0);
    if (p.x < -40 || p.y < 0 || p.x > W + 40 || p.y > H) continue;
    const w = it.text.length * 7.4 + (it.st ? it.st[0].length * 7 + 20 : 0) + 16, h = 26;
    const tries = it.dy ? [it.dy, -it.dy, 0] : it.k === "g" ? [0, 30, -30, 60, -60] : it.f || it.pri >= 20 ? [0, -28, 28] : [0];
    let r = null;
    for (const dy of tries) {
      const c = { l: p.x - w / 2, r: p.x + w / 2, t: p.y + dy - h / 2 - (it.k === "n" ? 14 : 0), b: p.y + dy + h / 2 - (it.k === "n" ? 14 : 0) };
      if (c.l < 2) { c.r += 2 - c.l; c.l = 2; }
      if (c.r > W - 2) { c.l -= c.r - W + 2; c.r = W - 2; }
      if (c.l < 2 || c.t < 0 || c.b > H) continue;
      if (placed.some((q) => c.l < q.r && q.l < c.r && c.t < q.b && q.t < c.b)) continue;
      r = c; break;
    }
    if (!r) continue;
    placed.push(r);
    html.push(`<div class="lb${it.k === "g" ? " g" : it.k === "c" ? " c" : ""}${it.f ? " f" : ""}${it.dim ? " dim" : ""}" data-k="${it.k}" data-id="${esc(it.id)}" style="left:${((r.l + r.r) / 2).toFixed(1)}px;top:${((r.t + r.b) / 2).toFixed(1)}px">${esc(it.text)}${it.st ? stHtml(it.st) : ""}</div>`);
    if (html.length > 40) break;
  }
  LAYER.innerHTML = html.join("");
}
function pick(k, id) {
  if (k === "g") go({ sel: { t: "g", id }, scope: "item" });
  else if (k === "c") go({ sel: { t: "c", id }, scope: "chain" });
  else go({ sel: { t: "n", id }, scope: S.scope === "all" || !S.sel ? "item" : S.scope });
}
function drawLegend(R) {
  const lg = el("legend"), sc = effScope(), sel = S.sel;
  let h = "";
  if (R.chain && R.chain.cap) h = `<b>תהליך ${esc(CAPS[sel.id].title)}</b> · ${R.nodes.size} רכיבים, לפי הסדר שנבחר ידנית`;
  else if (R.chain) h = `<b>תלויות</b> לפי קשרים רשומים, לא סדר הפעלה<br>${R.chain.needs.size} שהוא תלוי בהם · ${R.chain.by.size} שתלויים בו`;
  else if (sel && sel.t === "n" && sc === "item") h = `<b>רכיב</b> וקשריו הישירים (${R.nodes.size - 1})`;
  else if (sel && sel.t === "g" && sc === "item") h = `<b>${esc(G[sel.id].name_he)}</b> · ${R.nodes.size} ${S.lens === "all" ? "רכיבים" : "בחתך " + LENS[S.lens].t}`;
  else if (S.lens === "proc") h = `<b>תהליכים</b> · ${Object.keys(CAPS).length} תהליכים לדוגמה; נגיעה בשם פותחת את הרצף`;
  else if (S.lens === "new") h = R.nodes.size ? `<b>חדש</b> · ${R.nodes.size} רכיבים חדשים מאז הסריקה הקודמת` : `<b>חדש</b> · אין רכיבים חדשים השבוע`;
  else if (S.lens !== "all") h = `<b>${LENS[S.lens].t}</b> · ${R.nodes.size} נקודות לפי מצב; שמות רק לתקלות`;
  lg.hidden = !h; lg.innerHTML = h;
  el("hint").textContent = sel ? "" : S.V === "A" ? "גרירה להזזה · צביטה להגדלה" : "גרירה לסיבוב · צביטה להגדלה";
}
// gestures: tap selects; drag pans (flat) or orbits (3D); pinch zooms; two fingers pan
(() => {
  const pointers = new Map(), st = el("stage"); let drag = null, pinch = 0, mid = null;
  st.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ovbtn")) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); st.setPointerCapture(e.pointerId);
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, total: 0, lb: e.target.closest(".lb") }; else if (drag) drag.total = 99;
  });
  st.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !isMap(S.V)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = cams[S.V];
    if (pointers.size === 2) {
      const [a, b] = pointers.values(), d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch && d > 1) c.zoom = clamp(c.zoom * d / pinch, 0.5, 8);
      if (mid) { c.x += m.x - mid.x; c.y += m.y - mid.y; }
      pinch = d; mid = m;
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.total += Math.hypot(dx, dy);
      if (drag.total < 7) return;
      if (S.V === "A" || e.shiftKey) { c.x += dx; c.y += dy; }
      else { c.angle = ((c.angle + dx * 0.5 + 540) % 360) - 180; c.tilt = clamp(c.tilt + dy * 0.3, 0, 72); }
    }
    paint();
  });
  const end = (e) => {
    pointers.delete(e.pointerId); pinch = 0; mid = null;
    if (drag && drag.total < 7 && e.type === "pointerup" && drag.lb) pick(drag.lb.dataset.k, drag.lb.dataset.id);
    else if (drag && drag.total < 7 && e.type === "pointerup") {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const nodeHit = [...HIT].reverse().find((h) => h.n && Math.hypot(h.x - x, h.y - y) < h.r);
      const gHit = [...HIT].reverse().find((h) => h.g && Math.hypot(h.x - x, h.y - y) < Math.max(14, h.r));
      if (nodeHit) pick("n", nodeHit.n); else if (gHit) pick("g", gHit.g);
    }
    if (!pointers.size) drag = null;
  };
  st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end);
  st.addEventListener("wheel", (e) => { e.preventDefault(); const c = cams[S.V]; c.zoom = clamp(c.zoom * Math.exp(-e.deltaY * 0.001), 0.5, 8); paint(); }, { passive: false });
})();
el("recenter").addEventListener("click", () => { Object.assign(cams[S.V], CAM0[S.V]); paint(); });
function drawCam() {
  const cp = el("campanel"), c = cams[S.V];
  cp.hidden = !camOpen; el("camtg").setAttribute("aria-expanded", String(camOpen));
  if (!camOpen) return;
  const sl = (id, t, min, max, step, v) => `<label>${t}<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><output id="${id}o"></output></label>`;
  const g = S.sel ? (S.sel.t === "g" ? S.sel.id : S.sel.t === "n" ? N[S.sel.id].group : "") : "";
  cp.innerHTML = `<div class="cph">מצלמה ותצוגה<button class="ibtn" data-camclose aria-label="סגירה">סגירה</button></div>
    ${sl("cz", "מרחק", 0.5, 6, 0.05, c.zoom)}${S.V === "A" ? "" : sl("ca", "זווית", -180, 180, 1, c.angle) + sl("ct", "הטיה", 0, 72, 1, c.tilt)}
    <div class="two">צבע התחומים: <button class="btn" data-colm="fam" aria-pressed="${colorMode === "fam"}">לפי משפחה</button><button class="btn" data-colm="health" aria-pressed="${colorMode === "health"}">לפי מצב</button></div>
    <select id="cgo" aria-label="מעבר לתחום"><option value="">מעבר לתחום…</option>${D.groups.map((x) => `<option value="${x.id}"${x.id === g ? " selected" : ""}>${esc(x.name_he)}</option>`).join("")}</select>
    <button class="btn" data-camreset>איפוס המצלמה</button>`;
  syncCam();
}
function syncCam() {
  if (!camOpen || !isMap(S.V)) return;
  const c = cams[S.V];
  [["cz", "zoom", (v) => "×" + v.toFixed(1)], ["ca", "angle", (v) => Math.round(v) + "°"], ["ct", "tilt", (v) => Math.round(v) + "°"]].forEach(([id, k, f]) => { const i = el(id); if (i) { i.value = c[k]; el(id + "o").textContent = f(c[k]); } });
}
el("camtg").addEventListener("click", () => { camOpen = !camOpen; drawCam(); paint(); });
el("campanel").addEventListener("input", (e) => {
  const k = { cz: "zoom", ca: "angle", ct: "tilt" }[e.target.id]; if (!k) return;
  cams[S.V][k] = Number(e.target.value); paint();
});
el("campanel").addEventListener("change", (e) => { if (e.target.id === "cgo" && e.target.value) go({ sel: { t: "g", id: e.target.value }, scope: "item" }); });
el("campanel").addEventListener("click", (e) => {
  if (e.target.closest("[data-camclose]")) { camOpen = false; drawCam(); paint(); return; }
  if (e.target.closest("[data-camreset]")) { Object.assign(cams[S.V], CAM0[S.V]); paint(); return; }
  const cm = e.target.closest("[data-colm]"); if (cm) { colorMode = cm.dataset.colm; drawCam(); paint(); }
});
["pointerdown", "wheel"].forEach((t) => el("campanel").addEventListener(t, (e) => e.stopPropagation()));
const offN = D.nodes.filter((n) => n.state === "off on purpose").length;
function drawOff() { const b = el("offtg"); b.setAttribute("aria-pressed", String(showOff)); b.innerHTML = `כבויים בכוונה: ${showOff ? "מוצגים" : "מוסתרים"} <span class="num">(${offN})</span>`; }
el("offtg").addEventListener("click", () => { showOff = !showOff; drawOff(); render(); });
const RO = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => paint());
if (RO) RO.observe(el("stage"));

// ---------- search ----------
const q = el("q"), res = el("res");
q.addEventListener("input", () => {
  const s = q.value.trim().toLowerCase();
  if (!s) { res.hidden = true; return; }
  const hits = [];
  D.groups.forEach((g) => g.name_he.toLowerCase().includes(s) && hits.push({ k: "g", id: g.id, t: g.name_he, sub: `תחום · ${G[g.id].nodes.length} רכיבים`, st: gWord(G[g.id]) }));
  Object.entries(CAPS).forEach(([cid, c]) => c.title.includes(s) && hits.push({ k: "c", id: cid, t: c.title, sub: `תהליך · ${c.fields.length} רכיבים`, st: capSt(c) }));
  D.nodes.forEach((n) => { if (hits.length < 40 && [n.name, n.purpose_he, n.id, n.short_id].join(" ").toLowerCase().includes(s)) hits.push({ k: "n", id: n.id, t: label(n), nw: isNew(n), sub: `${G[n.group]?.name_he || ""} · ${n.name}`, st: stOf(n) }); });
  res.innerHTML = hits.slice(0, 8).map((h, i) => `<li><button data-i="${i}"><span>${esc(h.t)}${h.nw ? ' <span class="tag new">חדש</span>' : ""} ${stHtml(h.st)}</span><small>${esc(h.sub)}</small></button></li>`).join("") || `<li><button disabled><small>לא נמצא</small></button></li>`;
  res._hits = hits; res.hidden = false;
});
res.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const h = res._hits[+b.dataset.i]; res.hidden = true; q.value = ""; q.blur();
  go({ sel: { t: h.k, id: h.id }, scope: h.k === "c" ? "chain" : "item" });
});

// ---------- bottom sheet: what it is, its status in words, times, chain, every relationship as a row ----------
const sheet = el("sheet");
const capSt = (c) => stOf([...c.fields].map((id) => N[id]).sort(sortNodes)[0]);
const edgeWord = (e) => ST[e.state]?.[0] || "לא אומת";
const confidence = (e) => ({ high: "גבוה", medium: "בינוני", low: "נמוך" })[e.confidence] || "לא ידוע";
const timesLine = (n) => `<p class="times num">נבדק ${fmtTime(n.last_checked)} · פעיל לאחרונה ${n.last_active ? fmtTime(n.last_active) : "לא ידוע"}</p>`;
function relRows(id) {
  const rows = [];
  (OUT[id] || []).forEach((e) => rows.push({ to: e.to, v: VERB[e.rel]?.[0] || e.rel, w: e.purpose_he, e }));
  (IN[id] || []).forEach((e) => rows.push({ to: e.from, v: VERB[e.rel]?.[1] || e.rel, w: e.purpose_he, e }));
  return rows.sort((a, b) => sortNodes(N[a.to], N[b.to]));
}
const nodeRow = (n, pre = "", extra = "") => `<li><button data-go="${esc(n.id)}"><span>${pre}<span class="t">${esc(label(n))}</span></span>${stHtml(stOf(n))}<span class="w">${extra || `${esc(KIND[n.kind] || n.kind)} · <bdi class="ltr">${esc(n.name)}</bdi>`}</span></button></li>`;
function drawSheet() {
  const on = isMap(S.V) && !!S.sel;
  sheet.className = on ? "on" + (sheetBig ? " big" : "") : "";
  if (!on) { sheet.innerHTML = ""; return; }
  const sel = S.sel, sc = effScope();
  const head = (title, meta) => `<div class="sh"><div class="shr"><h2>${title}</h2><button class="ibtn" data-big aria-label="${sheetBig ? "הקטנה" : "הרחבה"}">${sheetBig ? "פחות" : "עוד"}</button><button class="ibtn" data-close aria-label="סגירה"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="meta">${meta}</div></div>`;
  let h = "";
  if (sel.t === "g") {
    const g = G[sel.id], ns = g.nodes.filter((n) => okOff(n.id)).sort(sortNodes), hidden = g.nodes.length - ns.length;
    h = head(esc(g.name_he), `${stHtml(gWord(g))}<span class="num">${g.nodes.length} רכיבים · ${probs(g).length} בעיות</span>`) +
      `<div class="body"><p>${esc(g.purpose_he)}</p>${why(g.id).map((f) => `<p><b>למה ${esc(gWord(g)[0])}:</b> ${esc(f.what)}</p>`).join("")}</div>
      <div class="acts"><button class="btn" data-table-group="${esc(g.id)}">טבלת התחום</button></div>
      <h3>הרכיבים, הבעיות קודם${hidden ? ` (${hidden} כבויים בכוונה מוסתרים)` : ""}</h3><ul class="rel">${ns.map((n) => nodeRow(n)).join("")}</ul>`;
  } else if (sel.t === "c") {
    const c = CAPS[sel.id];
    h = head(esc(c.title), `${stHtml(capSt(c))}<span>תהליך · ${c.fields.length} רכיבים</span>`) +
      `<div class="body"><p>${esc(c.desc)}</p></div><p class="note">הסדר נבחר ידנית לדוגמה. המצב של כל רכיב אמיתי מהסריקה.</p>
      <div class="acts"><button class="btn pri" data-steps="cap:${sel.id}">מההתחלה עד הסוף</button><button class="btn" data-capmap="${sel.id}">כל היכולת במפה</button></div>
      <h3>הרכיבים לפי הסדר</h3><ul class="rel">${c.fields.map((id, i) => nodeRow(N[id], `<span class="v num">${i + 1}.</span> `)).join("")}</ul>`;
  } else {
    const n = N[sel.id], rows = relRows(n.id), need = chainOf(n.id, "needs"), by = chainOf(n.id, "by");
    const su = n.kind === "site" ? siteUrl(n) : null;
    const member = [...capsOf(n.id).map(([cid, c]) => `<button class="btn" data-steps="cap:${cid}">תהליך: ${esc(c.title)}</button>`),
      `<button class="btn" data-links="${esc(n.id)}">הרצף והקשרים</button>`,
      ...(SAMPLE[n.id] ? [`<button class="btn pri" data-steps="${esc(n.id)}">השלבים מההתחלה עד הסוף</button>`] : []),
      ...sampleOf(n.id).filter((w) => w !== n.id).map((w) => `<button class="btn" data-steps="${esc(w)}">שלב ב־${esc(label(N[w], 26))}</button>`),
      ...(isWindmill(n.id) ? [`<a class="btn" href="${WINDMILL}" target="_blank" rel="noopener noreferrer">פתח ב־Windmill</a>`] : []),
      ...(su ? [`<a class="btn" href="${esc(su)}" target="_blank" rel="noopener noreferrer">פתיחת האתר <bdi class="ltr">${esc(siteHost(su))}</bdi></a>`] : [])];
    const d = (v, t, cnt) => `<button class="btn" data-dir="${v}" aria-pressed="${sc === "chain" && S.dir === v}">${t} <span class="num">(${cnt})</span></button>`;
    h = head(esc(label(n, 44)) + newTag(n), `${stHtml(stOf(n))}<span>${esc(KIND[n.kind] || n.kind)}</span><span>· מרכז נשמה › ${esc(family(n.group) || "")} › ${esc(G[n.group]?.name_he || "")}</span>`) +
      `<div class="body"><p>${esc(n.purpose_he)}</p>${timesLine(n)}<p class="tech"><bdi class="ltr">${esc(n.name)}</bdi></p>${n.evidence ? `<details><summary>מה הסריקה ראתה</summary><bdi class="ltr">${esc(n.evidence)}</bdi></details>` : ""}</div>
      ${member.length ? `<div class="acts">${member.join("")}</div>` : ""}
      <h3>תלויות (לפי קשרים רשומים, לא סדר הפעלה)</h3>
      <div class="acts">${d("needs", "במה הוא תלוי", need.nodes.size - 1)}${d("by", "מי תלוי בו", by.nodes.size - 1)}${d("both", "שניהם", need.nodes.size + by.nodes.size - 2)}</div>
      <h3>${rows.length ? `קשרים ישירים (${rows.length}) · נגיעה עוברת אליו` : "אין קשר ישיר רשום"}</h3>
      <ul class="rel">${rows.map((r) => { const t = N[r.to]; return nodeRow(t, `<span class="v">${esc(r.v)}</span> `, `${t.group !== n.group ? `בתחום ${esc(G[t.group]?.name_he || "")} · ` : ""}הקשר: ${esc(edgeWord(r.e))} · ביטחון ${confidence(r.e)}`); }).join("")}</ul>`;
  }
  sheet.innerHTML = h;
  sheet.scrollTop = 0;
}
sheet.addEventListener("click", (e) => {
  if (e.target.closest("[data-big]")) { sheetBig = !sheetBig; drawSheet(); paint(); return; }
  if (e.target.closest("[data-close]")) { go(S.sel.t === "n" ? { sel: { t: "g", id: N[S.sel.id].group }, scope: "item" } : { sel: null, scope: "item" }); return; }
  const st = e.target.closest("[data-steps]"); if (st) { go({ V: "S", steps: st.dataset.steps }); return; }
  const lk = e.target.closest("[data-links]"); if (lk) { go({ V: "X", links: lk.dataset.links, edge: null }); return; }
  const dr = e.target.closest("[data-dir]"); if (dr) { go({ scope: "chain", dir: dr.dataset.dir }); return; }
  const tg = e.target.closest("[data-table-group]"); if (tg) { go({ V: "T", lens: "all", tgroup: tg.dataset.tableGroup }); return; }
  const b = e.target.closest("[data-go]"); if (b) { go({ sel: { t: "n", id: b.dataset.go }, scope: S.scope === "all" ? "item" : S.sel.t === "g" ? "item" : S.scope }); }
});
el("scope").addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (b && !b.disabled) go({ scope: b.dataset.s }); });

// ---------- home: status totals, urgent findings first, then the 22 groups (exceptions first) ----------
const KSEV = { broken: "bad", "chronic-red": "bad", watch: "warn", stale: "stale" };
const KACT = { bad: "לבדוק למה נכשל ולתקן", warn: "לבדוק ולטפל", stale: "לבדוק אם עדיין נחוץ; אם לא, לכבות בכוונה" };
// a finding about a component reads like the rest of the atlas: its Hebrew title, state and group, from the map itself
const FIND = D.findings.map((f, i) => {
  const n = f.node && N[f.node], sev0 = KSEV[f.kind] || "meta", base = { i, kind: f.kind, proof: f.text };
  if (n) {
    // the owner's decision or a component off on purpose is never urgent, whatever the finding's kind says
    const quiet = PRIV[n.id] || n.state === "off on purpose", sev = quiet ? "priv" : sev0;
    const act = f.act_he || (PRIV[n.id] ? `פרטי בכוונה לפי החלטה מ־${PRIV[n.id]}` : quiet ? "כבוי בכוונה; לא תקלה" : KACT[sev] || "לבדוק את הממצא");
    return { ...base, sev, n, what: label(n, 60), act, g: n.group };
  }
  if (f.what_he) return { ...base, sev: sev0, what: f.what_he, act: f.act_he || "לבדוק את הממצא", g: G[f.group] ? f.group : "" };
  return { ...base, sev: sev0, raw: true, what: f.text, act: "", g: "" };
});
const why = (gid) => FIND.filter((f) => f.g === gid && (f.sev === "bad" || f.sev === "warn"));
function home() {
  const c = (s) => D.nodes.filter((n) => n.state === s).length;
  const gl = (l) => D.groups.filter((g) => g.light === l).length;
  const ok = FIND.filter((f) => !f.raw), raw = FIND.filter((f) => f.raw), priv = FIND.filter((f) => f.sev === "priv");
  const urgent = ok.filter((f) => f.sev === "bad" || f.sev === "warn"), stale = ok.filter((f) => f.sev === "stale"), meta = ok.filter((f) => f.sev === "meta");
  const SEVW = { bad: ["דחוף", "st-bad"], warn: ["לשים לב", "st-warn"], stale: ["לא רץ כמצופה", "st-warn"], meta: ["ידיעה", "st-unk"] };
  const nLine = (f) => (f.n ? `${stHtml(stOf(f.n))} ${f.n.failing_since ? `<span class="num">מאז ${fmtTime(f.n.failing_since)}</span> · ` : ""}` : "");
  const fRow = (f) => `<li><button class="row" aria-expanded="false" data-x="f${f.i}"><span class="a">${esc(f.what)}${f.n ? newTag(f.n) : ""}</span><span class="tag ${f.sev === "bad" ? "st-bad" : "st-warn"}">${f.sev === "bad" ? "דחוף" : "לשים לב"}</span><span class="b">${nLine(f)}${f.g ? esc(G[f.g].name_he) + " · " : ""}מה לעשות: ${esc(f.act)}</span></button>
    <div class="det" id="f${f.i}" hidden><dl><dt>מה מושפע</dt><dd>${f.g ? esc(G[f.g].name_he) : "המערכת כולה"}</dd><dt>מה מוכיח</dt><dd><div class="proof">${esc(f.proof)}</div></dd><dt>נבדק</dt><dd class="num">${fmtTime(f.n ? f.n.last_checked || D.generated_at : D.generated_at)}</dd></dl>${f.n ? `<div class="btns"><button class="btn pri" data-opennode="${esc(f.n.id)}">לפתוח את הרכיב במפה</button><button class="btn" data-open="${f.g}">התחום שלו</button></div>` : f.g ? `<div class="btns"><button class="btn pri" data-open="${f.g}">לפתוח את התחום באטלס</button></div>` : ""}</div></li>`;
  const listRow = (id, title, tag, arr) => `<li><button class="row" aria-expanded="false" data-x="${id}"><span class="a">${title}</span>${tag}<span class="b">${esc(arr[0].act)}</span></button>
    <div class="det" id="${id}" hidden><ul class="mini">${arr.map((f) => `<li>${f.n ? stHtml(stOf(f.n)) : ""}<span>${esc(f.what)}${f.g && f.n ? ` <span class="nm">· ${esc(G[f.g].name_he)}</span>` : ""}</span></li>`).join("")}</ul><div class="btns"><button class="btn pri" data-lens-table="auto">לטבלת האוטומציות</button></div></div></li>`;
  const gRow = (g) => {
    const p = probs(g), u = g.nodes.filter((n) => n.state === "unknown").length;
    return `<li><button class="row" aria-expanded="false" data-x="g-${g.id}"><span class="a">${esc(g.name_he)}</span>${stHtml(gWord(g))}<span class="b num">${g.nodes.length} רכיבים · ${p.length} בעיות · ${u} לא נבדקו</span></button>
    <div class="det" id="g-${g.id}" hidden><p style="margin:0">${esc(g.purpose_he)}</p>${why(g.id).map((f) => `<p style="margin:0"><b>למה:</b> ${esc(f.what)}</p>`).join("")}${p.length ? `<ul class="mini">${p.map((n) => `<li>${stHtml(stOf(n))}<span>${esc(label(n))}</span></li>`).join("")}</ul>` : `<span style="color:var(--soft)">אין רכיב שנכשל או לא רץ. נבדק ${fmtTime(D.generated_at)}.</span>`}
    <div class="btns"><button class="btn pri" data-open="${g.id}">לפתוח באטלס</button><button class="btn" data-open="${g.id}" data-in="A">במפה השטוחה</button></div></div></li>`;
  };
  el("v0").innerHTML = `
    <h2 class="sec">מצב עכשיו</h2>
    <div class="panel totals">
      <div class="bad"><b>${c("failing") + c("not running")}</b><span>נכשלים או לא רצים</span></div>
      <div class="warn"><b>${c("stale")}</b><span>כמעט לא רצים</span></div>
      <div><b>${c("unknown")}</b><span>לא נבדקים</span></div>
      <div class="bad"><b>${gl("red")}</b><span>תחומים בתקלה</span></div>
      <div class="warn"><b>${gl("yellow")}</b><span>דורשים תשומת לב</span></div>
      <div><b>${gl("green")}</b><span>תחומים תקינים</span></div>
    </div>
    <p class="asof num">${c("works")} רכיבים עובדים · ${c("off on purpose")} כבויים בכוונה · נבדק ${fmtTime(D.generated_at)}</p>
    <h2 class="sec">דחוף עכשיו <span class="n num">${urgent.length}</span></h2>
    <ul class="panel rows">${urgent.sort((a, b) => (a.sev === "bad" ? 0 : 1) - (b.sev === "bad" ? 0 : 1)).map(fRow).join("")}
      ${stale.length ? listRow("fstale", `${stale.length} תהליכים לא רצו כמצופה`, `<span class="tag st-warn">לשים לב</span>`, stale) : ""}</ul>
    <h2 class="sec">${D.groups.length} תחומים <span class="n">החריגים קודם</span></h2>
    <ul class="panel rows">${GROUPS.map(gRow).join("")}</ul>
    <h2 class="sec">על הסריקה עצמה <span class="n num">${meta.length + priv.length + raw.length}</span></h2>
    <ul class="panel rows">${priv.length ? `<li><button class="row" aria-expanded="false" data-x="fpriv"><span class="a">${priv.length} פרטיים או כבויים בכוונה, לא תקלה</span><span class="tag st-unk">החלטה</span><span class="b">${esc(priv[0].act)}</span></button>
      <div class="det" id="fpriv" hidden><ul class="mini">${priv.map((f) => `<li>${stHtml(stOf(f.n))}<span>${esc(f.what)}</span></li>`).join("")}</ul></div></li>` : ""}
      ${raw.length ? `<li><button class="row" aria-expanded="false" data-x="fraw"><span class="a">${raw.length} ממצאים בנוסח הסריקה</span><span class="tag st-unk">לא מתורגם</span><span class="b">ממצאים בלי רכיב במפה; הטקסט כפי שהסורק כתב אותו</span></button>
      <div class="det" id="fraw" hidden><ul class="mini">${raw.map((f) => `<li><span class="tag ${(SEVW[f.sev] || SEVW.meta)[1]}">${(SEVW[f.sev] || SEVW.meta)[0]}</span><span class="proof" dir="auto">${esc(f.proof)}</span></li>`).join("")}</ul></div></li>` : ""}
      ${meta.map((f) => `<li><button class="row" aria-expanded="false" data-x="f${f.i}"><span class="a" dir="auto">${esc(f.what)}</span><span class="tag st-unk">ידיעה</span><span class="b">${esc(f.act)}</span></button><div class="det" id="f${f.i}" hidden><div class="proof">${esc(f.proof)}</div></div></li>`).join("")}</ul>`;
}
el("v0").addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]");
  if (o) { go({ V: o.dataset.in || "C", sel: { t: "g", id: o.dataset.open }, scope: "item" }); return; }
  const on = e.target.closest("[data-opennode]"); if (on) { go({ V: lastMap, sel: { t: "n", id: on.dataset.opennode }, scope: "item" }); return; }
  const lt = e.target.closest("[data-lens-table]"); if (lt) { go({ V: "T", lens: lt.dataset.lensTable, tgroup: "" }); return; }
  const r = e.target.closest("[data-x]"); if (!r) return;
  const d = el(r.dataset.x), open = r.getAttribute("aria-expanded") === "true";
  r.setAttribute("aria-expanded", String(!open)); d.hidden = open;
});

// ---------- tables: one per lens, sortable, exceptions first; a row opens the item on the map ----------
const TB = { q: "", exc: false, k: "st", asc: true, limit: 80 };
function tableRows(report) {
  if (!report && S.lens === "proc") return Object.entries(CAPS).map(([cid, c]) => {
    const ns = c.fields.map((id) => N[id]), worst = [...ns].sort(sortNodes)[0];
    return { cap: cid, name: c.title, sub: `תהליך · ${ns.length} רכיבים`, state: worst.state, st: stOf(worst),
      chk: ns.map((n) => n.last_checked).sort((a, b) => tVal(b) - tVal(a))[0], act: ns.map((n) => n.last_active).filter(Boolean).sort((a, b) => tVal(b) - tVal(a))[0] };
  });
  return D.nodes.filter((n) => (report ? PROBLEM.has(n.state) : inLens(n)) && (!S.tgroup || n.group === S.tgroup))
    .map((n) => ({ id: n.id, name: label(n, 80), sub: `${KIND[n.kind] || n.kind} · ${G[n.group].name_he}`, tech: n.short_id || "", state: n.state, st: stOf(n), chk: n.last_checked, act: n.last_active, grp: G[n.group].name_he, url: n.kind === "site" ? siteUrl(n) : null, ev: report ? n.evidence : "", n }));
}
function renderTable(report) {
  let rows = tableRows(report);
  const s = TB.q.trim().toLowerCase();
  if (s) rows = rows.filter((r) => [r.name, r.sub, r.id, r.tech, r.n?.name].join(" ").toLowerCase().includes(s));
  if (TB.exc && !report) rows = rows.filter((r) => SRANK[r.state] <= 2);
  const dir = TB.asc ? 1 : -1;
  const sites = !report && S.lens === "sites";
  const cmp = { grp: (a, b) => a.grp.localeCompare(b.grp, "he"), name: (a, b) => a.name.localeCompare(b.name, "he"), st: (a, b) => SRANK[a.state] - SRANK[b.state], chk: (a, b) => tVal(b.chk) - tVal(a.chk), act: (a, b) => tVal(b.act) - tVal(a.act) }[TB.k];
  rows.sort((a, b) => cmp(a, b) * dir || SRANK[a.state] - SRANK[b.state] || a.name.localeCompare(b.name, "he"));
  const selId = S.sel ? S.sel.id : null;
  const th = (k, t) => `<th${TB.k === k ? ` aria-sort="${TB.asc ? "ascending" : "descending"}"` : ""}><button data-sort="${k}">${t}${TB.k === k ? (TB.asc ? " ▾" : " ▴") : ""}</button></th>`;
  const tcell = (v) => { const p = tParts(v); return p ? `<td class="t">${esc(p[0])}<small>${esc(p[1])}</small></td>` : `<td class="t"><small>לא ידוע</small></td>`; };
  const lensT = report ? "דוח תקלות" : S.lens === "all" ? "כל הרכיבים" : LENS[S.lens].long || LENS[S.lens].t;
  if (!report && S.lens === "new" && !tableRows(false).length) return `<div class="wk"><h2>${lensT}</h2><p class="empty">אין רכיבים חדשים השבוע</p>${GONE.length ? `<p class="lead">הוסרו מאז הסריקה הקודמת: <span class="num">${GONE.length}</span></p>` : ""}</div>`;
  return `<div class="wk"><h2>${lensT}</h2>
    ${!report && S.lens === "new" && GONE.length ? `<details class="far"><summary>הוסרו מאז הסריקה הקודמת · <span class="num">${GONE.length}</span></summary><ul class="mini">${GONE.map((g) => `<li><bdi class="ltr">${esc(g)}</bdi></li>`).join("")}</ul></details>` : ""}
    ${report ? `<p class="lead">רכיבים שנכשלו, אינם רצים או כמעט אינם רצים לפי הסריקה. נגיעה בשורה פותחת אותו במפה.</p>` : S.lens === "proc" ? `<p class="lead">תהליכים שנבחרו ידנית לדוגמה. מצב התהליך הוא המצב החלש של הרכיבים שלו.</p>` : ""}
    <div class="filt"><input id="tq" type="search" placeholder="חיפוש בשם או במזהה" value="${esc(TB.q)}" aria-label="חיפוש בטבלה">${report ? "" : `<button class="btn" id="texc" aria-pressed="${TB.exc}">רק חריגים</button>`}
    ${S.tgroup ? `<button class="chip" id="tgx">תחום: ${esc(G[S.tgroup].name_he)} ✕</button>` : ""}</div>
    <p class="count num">${rows.length} שורות${rows.length > TB.limit ? ` · מוצגות ${TB.limit}` : ""}</p>
    <table class="tb"><colgroup><col><col class="c-st"><col class="c-t"><col class="${sites ? "c-g" : "c-t"}"></colgroup>
    <thead><tr>${th("name", sites ? "שם וכתובת" : "שם")}${th("st", "מצב")}${th("chk", "נבדק")}${sites ? th("grp", "תחום") : th("act", "פעיל לאחרונה")}</tr></thead>
    <tbody>${rows.slice(0, TB.limit).map((r) => `<tr data-row="${esc(r.cap ? "cap:" + r.cap : r.id)}" class="${(r.cap && S.sel?.t === "c" && S.sel.id === r.cap) || (!r.cap && selId === r.id) ? "sel" : ""}">
      <td><span class="nm">${esc(r.name)}${r.n ? newTag(r.n) : ""}</span>${sites && r.url ? `<a class="url" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(siteHost(r.url)).replace(/\./g, ".<wbr>")}</a>` : ""}<span class="sub">${esc(r.sub)}${r.tech ? ` · <bdi class="ltr nw">${esc(r.tech)}</bdi>` : ""}</span>${r.ev ? `<span class="ev">${esc(r.ev)}</span>` : ""}${!r.cap ? `<span class="tagrow"><button class="tag st-unk" data-links="${esc(r.id)}">בקשרים</button>${SAMPLE[r.id] ? ` <button class="tag st-warn" data-steps="${esc(r.id)}">שלבים · דוגמה</button>` : ""}</span>` : ""}${r.cap ? `<span class="tagrow"><button class="tag st-unk" data-steps="cap:${r.cap}">מההתחלה עד הסוף</button></span>` : ""}</td>
      <td>${stHtml(r.st)}</td>${tcell(r.chk)}${sites ? `<td class="g">${esc(r.grp)}</td>` : tcell(r.act)}</tr>`).join("") || `<tr><td colspan="4">לא נמצאו שורות</td></tr>`}</tbody></table>
    ${rows.length > TB.limit ? `<div class="more"><button class="btn" id="tmore">עוד ${Math.min(80, rows.length - TB.limit)}</button></div>` : ""}</div>`;
}

// ---------- steps: a workflow (or a process) from start to end, 2D ----------
function stepsHtml(id) {
  const isCap = id.startsWith("cap:"), c = isCap ? CAPS[id.slice(4)] : null, w = isCap ? null : SAMPLE[id], n = isCap ? N[c.anchor] : N[id];
  const steps = isCap ? c.fields.map((x) => ({ name: label(N[x], 60), node: x, nodeState: true })) : w.steps;
  const flat = flatSteps(steps);
  const card = (s, num, small) => {
    if (s.nodeState) { const m = N[s.node]; return `<div class="card ${stOf(m)[1] === "bad" ? "bad" : ""}"><div class="nm">${esc(s.name)}</div><div class="ln">${stHtml(stOf(m))}<span class="num">נבדק ${fmtTime(m.last_checked)}</span><span class="num">פעיל לאחרונה ${m.last_active ? fmtTime(m.last_active) : "לא ידוע"}</span></div><button class="btn" data-map="${esc(s.node)}">במפה</button></div>`; }
    const o = OUTW[s.out];
    return `<div class="card ${s.out === "bad" ? "bad" : s.out === "unk" ? "unk" : ""}"><div class="nm">${esc(s.name)}</div>
      <div class="ln">${stHtml(o)}<span>${s.on ? "פעיל" : "כבוי"}</span>${s.at ? `<span class="num">רץ ${fmtTime(s.at)}</span>` : ""}<span class="num">נבדק ${fmtTime(w.chk)}</span></div>
      ${s.why ? `<div class="why">${esc(s.why)}</div>` : ""}${s.node && N[s.node] ? `<button class="btn" data-map="${esc(s.node)}">${small ? "במפה" : "הרכיב במפה"}</button>` : ""}</div>`;
  };
  let i = 0;
  const li = steps.map((s) => {
    if (s.split) {
      i++;
      return `<li class="stp split"><span class="dot st-unk num">${i}</span><div class="card"><div class="nm">פיצול: ${esc(s.split)}</div>
        <div class="br">${s.branches.map((b) => `<div><div class="bl">${esc(b.label)}</div>${b.steps.map((x) => card(x, 0, true)).join("")}</div>`).join("")}</div></div></li>`;
    }
    i++;
    const k = s.nodeState ? stOf(N[s.node])[1] : OUTW[s.out][1];
    return `<li class="stp"><span class="dot st-${k} num">${i}</span>${card(s, i)}</li>`;
  }).join("");
  const cnt = (o) => flat.filter((s) => s.out === o).length;
  const sum = isCap ? `${steps.length} רכיבים לפי הסדר` : [`${steps.length} שלבים`, cnt("bad") && `${cnt("bad")} נכשל`, cnt("unk") && `${cnt("unk")} לא ידוע`, cnt("notrun") && `${cnt("notrun")} לא הגיעו`, cnt("skip") && `${cnt("skip")} דולג`, cnt("off") && `${cnt("off")} כבוי`].filter(Boolean).join(" · ");
  return `<div class="wk"><h2>${esc(isCap ? c.title : label(n, 60))}</h2>
    <p class="lead">${isCap ? "תהליך" : `${esc(KIND[n.kind])} · ${esc(G[n.group].name_he)} · <bdi class="ltr">${esc(n.name)}</bdi>`}</p>
    ${isCap ? `<div class="banner">הסדר נבחר ידנית לדוגמה<small>המצב והזמנים של כל רכיב אמיתיים מהסריקה. סדר הרכיבים עוד לא מגיע מנתונים.</small></div>`
      : `<div class="banner">דוגמה — שלבים לא אמיתיים עדיין<small>השלבים, הענפים והתוצאות כאן מומצאים כדי להראות את התצוגה. הרכיב עצמו, המצב שלו בסריקה (${esc(stOf(n)[0])}) והקשרים שלו אמיתיים.</small></div>`}
    <div class="acts"><button class="btn pri" data-chain="${esc(id)}">הצג את הרצף במפה</button>${!isCap && isWindmill(id) ? `<a class="btn" href="${WINDMILL}" target="_blank" rel="noopener noreferrer">פתח ב־Windmill</a>` : ""}</div>
    ${!isCap && w.engine === "windmill" ? `<p class="foot">הקישור פותח את Windmill. מעבר ישיר לתהליך הזה עוד לא נבדק; הנתיב לחיפוש: <bdi class="ltr">${esc(id.split(":").slice(2).join(":"))}</bdi></p>` : ""}
    ${!isCap && w.engine === "n8n" ? `<p class="foot">ל־n8n אין עורך פתוח מבחוץ, לכן אין קישור החוצה. הצפייה בשלבים היא רק כאן.</p>` : ""}
    <p class="sum num">${sum}</p>
    <ol class="tl">${li}</ol>
    <p class="foot">כל שלב מראה: מה התוצאה בריצה האחרונה, אם הוא פעיל בהגדרה, ומתי נבדק. שלב שלא נבחר בענף אינו תקלה.</p></div>`;
}

// ---------- processes page (his "תהליכים" tab): capabilities, sample workflows, all automations ----------
function procHtml() {
  const capRow = ([cid, c]) => `<li><div class="row nob"><span class="a">${esc(c.title)}</span>${stHtml(capSt(c))}<span class="b">${esc(c.desc)} <span class="num">· ${c.fields.length} רכיבים</span></span></div>
    <div class="btns pad"><button class="btn pri" data-steps="cap:${cid}">מההתחלה עד הסוף</button><button class="btn" data-capmap="${cid}">הצג את היכולת במפה</button></div></li>`;
  const wfRow = (id) => { const n = N[id]; return `<li><div class="row nob"><span class="a">${esc(label(n, 60))}</span>${stHtml(stOf(n))}<span class="b">${esc(KIND[n.kind])} · ${esc(G[n.group].name_he)} · <bdi class="ltr">${esc(n.name)}</bdi></span></div>
    <div class="btns pad"><button class="btn pri" data-steps="${esc(id)}">השלבים · דוגמה</button><button class="btn" data-chain="${esc(id)}">הרצף במפה</button><button class="btn" data-links="${esc(id)}">בקשרים</button>${isWindmill(id) ? `<a class="btn" href="${WINDMILL}" target="_blank" rel="noopener noreferrer">פתח ב־Windmill</a>` : ""}</div></li>`; };
  const auto = D.nodes.filter((n) => inLens(n, "auto")), bad = auto.filter((n) => PROBLEM.has(n.state)).length;
  return `<div class="wk"><h2>תהליכים ואוטומציות</h2><p class="lead">יכולת היא רצף של רכיבים שעובדים יחד. מכאן רואים אותה מההתחלה עד הסוף, ועוברים למפה.</p></div>
    <h2 class="sec">יכולות <span class="n">נבחרו ידנית לדוגמה</span></h2><ul class="panel rows">${Object.entries(CAPS).map(capRow).join("")}</ul>
    <h2 class="sec">אוטומציות עם שלבים <span class="n">דוגמה, השלבים עוד לא אמיתיים</span></h2><ul class="panel rows">${Object.keys(SAMPLE).map(wfRow).join("")}</ul>
    <h2 class="sec">כל האוטומציות <span class="n num">${auto.length} · ${bad} בבעיה</span></h2>
    <div class="wk"><button class="btn pri" data-lens-table="auto">לטבלת האוטומציות</button></div>`;
}

// ---------- links view (his component card): incoming and outgoing, direct and along the network, single-edge detail ----------
function layersOf(id, dir) {
  const seen = new Set([id]), out = []; let front = [{ id, via: null }], hop = 0;
  while (front.length && hop < 6 && out.length < 120) {
    hop++; const next = [];
    for (const f of front) for (const e of (dir === "in" ? IN : OUT)[f.id] || []) {
      const peer = dir === "in" ? e.from : e.to;
      if (seen.has(peer)) continue;
      seen.add(peer); next.push({ id: peer, via: f.id }); out.push({ e, peer, hop, via: f.id });
    }
    front = next;
  }
  return out;
}
function linksHtml(id) {
  const n = N[id], up = layersOf(id, "in"), down = layersOf(id, "out"), ed = S.edge != null ? E[S.edge] : null;
  const card = ({ e, peer, hop, via }, dir) => {
    const m = N[peer], verb = VERB[e.rel]?.[dir === "in" ? 0 : 0] || e.rel;
    const rel = dir === "in" ? `${esc(verb)} ${esc(label(N[e.to], 26))}` : `${esc(label(N[e.from], 26))} ${esc(verb)}`;
    return `<li class="lk"><div class="card${stOf(m)[1] === "bad" ? " bad" : ""}${ed === e ? " on" : ""}">
      <button class="vb" data-edge="${E.indexOf(e)}" aria-pressed="${ed === e}">${rel}<small>הקשר: ${esc(edgeWord(e))} · ביטחון ${confidence(e)}</small></button>
      <div class="lkr"><button class="nmb" data-links="${esc(peer)}">${esc(label(m, 50))}</button>${stHtml(stOf(m))}</div>
      <div class="ln">${esc(G[m.group].name_he)} · <span class="num">נבדק ${fmtTime(m.last_checked)}</span>${hop > 1 ? ` · <span class="num">${hop} קשרים מכאן</span>` : ""}</div>
      <div class="btns"><button class="btn" data-map="${esc(peer)}">במפה</button></div></div></li>`;
  };
  const lane = (title, list, dir) => {
    const direct = list.filter((x) => x.hop === 1), far = list.filter((x) => x.hop > 1);
    return `<h3 class="lh">${title} <span class="num">(${direct.length})</span></h3>
      ${direct.length ? `<ul class="lks">${direct.map((x) => card(x, dir)).join("")}</ul>` : `<p class="lead">אין קשר ישיר רשום</p>`}
      ${far.length ? `<details class="far"><summary>לאורך הרשת · <span class="num">${far.length}</span> רכיבים נוספים</summary><ul class="lks">${far.map((x) => card(x, dir)).join("")}</ul></details>` : ""}`;
  };
  return `<div class="wk"><nav class="crumbline" aria-label="מיקום במערכת"><button class="lnk" data-gmap="${esc(n.group)}">מרכז נשמה › ${esc(family(n.group) || "")} › ${esc(G[n.group].name_he)}</button></nav>
    <h2>${esc(label(n, 80))}${newTag(n)}</h2><p class="lead">${stHtml(stOf(n))} · ${esc(KIND[n.kind] || n.kind)} · <bdi class="ltr">${esc(n.name)}</bdi></p>
    <p>${esc(n.purpose_he)}</p><p class="lead num">נבדק ${fmtTime(n.last_checked)} · פעיל לאחרונה ${n.last_active ? fmtTime(n.last_active) : "לא ידוע"}</p>
    ${n.evidence ? `<details class="far"><summary>מה הסריקה ראתה</summary><bdi class="ltr">${esc(n.evidence)}</bdi></details>` : ""}
    <div class="acts"><button class="btn pri" data-chain="${esc(id)}">הרצף במפה</button><button class="btn" data-map="${esc(id)}">במפה</button>${SAMPLE[id] ? `<button class="btn" data-steps="${esc(id)}">השלבים · דוגמה</button>` : ""}${isWindmill(id) ? `<a class="btn" href="${WINDMILL}" target="_blank" rel="noopener noreferrer">פתח ב־Windmill</a>` : ""}</div>
    ${ed ? `<div class="card edge"><div class="nm">הקשר שנבחר</div><p>מ: ${esc(label(N[ed.from], 50))}<br>אל: ${esc(label(N[ed.to], 50))}</p><p>${esc(ed.purpose_he || VERB[ed.rel]?.[0] || ed.rel)}</p>
      <div class="ln">${stHtml(ST[ed.state] || ["לא אומת", "unk"])}<span>ביטחון ${confidence(ed)}</span><span class="num">נבדק ${fmtTime(ed.last_checked)}</span></div><div class="btns"><button class="btn" data-edge="">סגירת הקשר</button></div></div>` : ""}
    ${lane("מה מגיע אליו", up, "in")}
    ${lane("לאן הוא ממשיך", down, "out")}
    <p class="foot">כיוון הקשר הוא כפי שנרשם בסריקה. "לאורך הרשת" הוא כל מה שאפשר להגיע אליו בקשרים רשומים, לא סדר הפעלה.</p></div>`;
}

// ---------- render: one place that shows the state ----------
function lensBar() {
  const cnt = (l) => (l === "proc" ? Object.keys(CAPS).length : D.nodes.filter((n) => inLens(n, l)).length);
  const lb = el("lensbar"), sx = lb.scrollLeft;
  lb.innerHTML = Object.entries(LENS).map(([k, l]) => `<button data-lens="${k}" aria-pressed="${S.lens === k}" title="${l.long || l.t}">${l.t}<small>${cnt(k)}</small></button>`).join("");
  lb.scrollLeft = sx;
}
el("lensbar").addEventListener("click", (e) => { const b = e.target.closest("[data-lens]"); if (b) { b.scrollIntoView?.({ inline: "nearest", block: "nearest" }); go({ lens: b.dataset.lens, tgroup: "" }); } });
function render() {
  const v = S.V;
  for (const b of root.querySelectorAll(".seg button")) b.setAttribute("aria-pressed", String(b.dataset.v === v));
  el("back").disabled = !HIST.length;
  el("lensbar").hidden = !(v === "T" || isMap(v));
  lensBar();
  el("v0").classList.toggle("on", v === "0");
  el("vmap").classList.toggle("on", isMap(v));
  el("vx").classList.toggle("on", "TRSWX".includes(v) && v !== "");
  res.hidden = true;
  if (isMap(v)) {
    const sc = effScope();
    for (const b of el("scope").querySelectorAll("button")) {
      b.disabled = b.dataset.s !== "all" && !S.sel || (b.dataset.s === "chain" && S.sel?.t === "g");
      b.setAttribute("aria-pressed", String(b.dataset.s === sc));
    }
    drawSheet(); drawCam(); paint();
  } else {
    drawSheet(); LAYER.innerHTML = "";
    if (v === "T" || v === "R") { el("vx").innerHTML = renderTable(v === "R"); const r = el("vx").querySelector("tr.sel"); if (r && r.scrollIntoView) r.scrollIntoView({ block: "center" }); else el("vx").scrollTop = 0; }
    if (v === "S") { el("vx").innerHTML = stepsHtml(S.steps); el("vx").scrollTop = 0; }
    if (v === "W") { el("vx").innerHTML = procHtml(); el("vx").scrollTop = 0; }
    if (v === "X") { el("vx").innerHTML = linksHtml(S.links); el("vx").scrollTop = 0; }
  }
}
root.querySelector(".seg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]"); if (!b) return;
  TB.limit = 80;
  go({ V: b.dataset.v });
});
el("back").addEventListener("click", back);
el("vx").addEventListener("click", (e) => {
  if (e.target.closest("a[href]")) return;
  const st = e.target.closest("[data-steps]"); if (st) { go({ V: "S", steps: st.dataset.steps }); return; }
  const lk = e.target.closest("[data-links]"); if (lk) { go({ V: "X", links: lk.dataset.links, edge: null }); return; }
  const ed = e.target.closest("[data-edge]"); if (ed) { go({ edge: ed.dataset.edge === "" ? null : +ed.dataset.edge }); return; }
  const cm = e.target.closest("[data-capmap]"); if (cm) { go({ V: lastMap, sel: { t: "c", id: cm.dataset.capmap }, scope: "chain" }); return; }
  const lt = e.target.closest("[data-lens-table]"); if (lt) { go({ V: "T", lens: lt.dataset.lensTable, tgroup: "" }); return; }
  const gm = e.target.closest("[data-gmap]"); if (gm) { go({ V: lastMap, sel: { t: "g", id: gm.dataset.gmap }, scope: "item" }); return; }
  const so = e.target.closest("[data-sort]"); if (so) { const k = so.dataset.sort; TB.asc = TB.k === k ? !TB.asc : true; TB.k = k; render(); return; }
  if (e.target.closest("#texc")) { TB.exc = !TB.exc; render(); return; }
  if (e.target.closest("#tmore")) { TB.limit += 80; render(); return; }
  if (e.target.closest("#tgx")) { go({ tgroup: "" }); return; }
  const mp = e.target.closest("[data-map]"); if (mp) { go({ V: lastMap, sel: { t: "n", id: mp.dataset.map }, scope: "item" }); return; }
  const ch = e.target.closest("[data-chain]");
  if (ch) { const id = ch.dataset.chain; go(id.startsWith("cap:") ? { V: lastMap, sel: { t: "c", id: id.slice(4) }, scope: "chain" } : { V: lastMap, sel: { t: "n", id }, scope: "chain", dir: "both" }); return; }
  const tr = e.target.closest("tr[data-row]");
  if (tr) { const id = tr.dataset.row; go(id.startsWith("cap:") ? { V: lastMap, sel: { t: "c", id: id.slice(4) }, scope: "chain" } : { V: lastMap, sel: { t: "n", id }, scope: "item" }); }
});
el("vx").addEventListener("input", (e) => {
  if (e.target.id !== "tq") return;
  TB.q = e.target.value; const pos = e.target.selectionStart; render();
  const i = el("tq"); i.focus(); i.setSelectionRange(pos, pos);
});

// ---------- start ----------
el("asof").textContent = `נתונים מ־${fmtTime(D.generated_at)}`;
drawOff(); home(); render();
el("exit").addEventListener("click", () => opts.onExit && opts.onExit());
const API = { go, back, get S() { return S; }, cams, HIST };
root.__atlas = API;
return Object.assign(API, { destroy() { if (RO) RO.disconnect(); delete root.__atlas; root.innerHTML = ""; } });
}
