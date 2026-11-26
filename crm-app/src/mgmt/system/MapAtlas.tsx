import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { SystemNode } from "./systemApi";
import { consequence, groupStatus, isProblem, nodeStatus, title, whose, type Group, type Model, type StatusK } from "./model";
import { KSHORT } from "./inventory";
import { OC, OUTCOMES, SV, SVC, type Services, type Svc } from "./services";
import { itemHref } from "./SystemHead";
import { buildFloors, FloorInfo, FloorsView } from "./MapFloors";
import { Bidi, St, Whose } from "./MgmtSystemPage";

// The drawn atlas of the approved mockup (v4d): the system from above as five areas -> the domains of one area -> the components
// of one domain, with four layers over the same picture. Lines are drawn after layout from the real tile boxes, so they fit any width.
export const ZONES = [
  { id: "learn", t: "למידה ותוכן", s: "מההקלטה ועד הלומד", gs: ["lessons-transcription", "lesson-summaries", "itaruta-library", "nekuda", "itra", "video"], c: 1, r: 1, hue: "#0e6f86" },
  { id: "reach", t: "קשר והפצה", s: "אנשי קשר, תורמים, הודעות ואתרים", gs: ["crm", "distribution", "whatsapp", "public-sites"], c: 2, r: 1, hue: "#2f55b5" },
  { id: "agents", t: "סוכנים ואוטומציה", s: "נשמה AI, אוטומציות וסוכני העבודה", gs: ["nai", "automation", "mnos-agents", "learning"], c: 1, r: 2, hue: "#6b46b0" },
  { id: "admin", t: "ניהול וכספים", s: "כספים, מסכי ניהול ודיווחים אליך", gs: ["finance", "cockpit", "flow-apps", "owner-reports"], c: 2, r: 2, hue: "#9b3a72" },
  { id: "base", t: "תשתיות ותפעול", s: "השרת, הרשת, גיבויים, ניטור, והשירותים בחוץ. כל השאר רץ על זה.", gs: ["infra", "backups", "monitoring", "deploy-ci"], c: 0, r: 3, hue: "#4b5d6e", base: 1 },
];
export type Zone = (typeof ZONES)[number];
export const ZN: Record<string, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const ZG: Record<string, string> = Object.fromEntries(ZONES.flatMap((z) => z.gs.map((g) => [g, z.id])));
export const LAYERS: [string, string][] = [["struct", "מבנה"], ["status", "מצב"], ["routes", "מסלולים"], ["whose", "של מי"], ["floors", "קומות"]];
export const CHAIN_HUE: Record<string, string> = { lesson: "#1f7a68", donation: "#c05030", ai: "#6a4fb0", owner: "#2b5f9e" };
export const PEOPLE = ["עדי", "הרב", "הילד", "לא ידוע"];
const SRANK: Record<string, number> = { down: 3, care: 2, ok: 0 };
export const SO: Record<StatusK, number> = { down: 0, care: 1, unk: 2, ok: 3, maint: 3, priv: 4, off: 5 };
type Edge = { from: string; to: string; confidence?: string; purpose_he?: string };
export interface AtlasP { ly: string; o: string | null; z: string | null; d: string | null; pw: string | null }
export type Line = { a: string; b: string; n?: number; dash?: boolean; o?: string; arrow?: 1 };

export const atlasHref = (p: AtlasP, over: Partial<AtlasP> = {}) => {
  const q = { ...p, ...over };
  const s = (["ly", "o", "z", "d", "pw"] as const).filter((k) => q[k] && !(k === "ly" && q.ly === "struct")).map((k) => `${k}=${encodeURIComponent(q[k]!)}`);
  return `/m/system/map${s.length ? `?${s.join("&")}` : ""}`;
};
export const fsHref = (p: AtlasP, over: Partial<AtlasP> = {}) => { const h = atlasHref(p, over); return `${h}${h.includes("?") ? "&" : "?"}fs=1`; };
export const gNodes = (m: Model, g?: Group) => (g ? (g.node_ids || g.component_ids || []).map((i) => m.N[i]).filter(Boolean) : []);
export const zNodes = (m: Model, z: Zone) => m.nodes.filter((n) => ZG[n.group || ""] === z.id);
export const needsLook = (ns: SystemNode[]) => [...ns.filter(isProblem), ...ns.filter((n) => n.state === "not running" && !isProblem(n))];
export function scopeStatus(m: Model, G: Record<string, Group>, gs: string[]) {
  const st = gs.filter((g) => G[g]).map((g) => groupStatus(G[g], m));
  return { k: st.reduce<"ok" | "care" | "down">((a, s) => (SRANK[s.k] > SRANK[a] ? s.k : a), "ok"), p: st.flatMap((s) => s.p) };
}
const stWord = (s: { k: string; p: unknown[] }) => (s.k === "ok" ? "עובד" : s.p.length === 1 ? "תקלה אחת" : `${s.p.length} תקלות`);
export const SPill = ({ s }: { s: { k: string; p: unknown[] } }) => <span className={`sy-spill sy-sp-${s.k}`}>{stWord(s)}</span>;

export function zoneLinks(m: Model, edges: Edge[]) {
  const acc: Record<string, { a: string; b: string; ev: Edge[] }> = {};
  for (const e of edges) {
    const a = ZG[m.N[e.from]?.group || ""], b = ZG[m.N[e.to]?.group || ""];
    if (!a || !b || a === b || ZN[a].base || ZN[b].base) continue;
    const k = [a, b].sort().join("|");
    (acc[k] ||= { a: k.split("|")[0], b: k.split("|")[1], ev: [] }).ev.push(e);
  }
  return Object.values(acc).map((l) => ({ ...l, hi: l.ev.some((e) => e.confidence === "high") }));
}
// a service sits in the area of its records; an outside service sits where its own chain uses it
function svcZone(x: Services, s: Svc): string | undefined {
  const z = ZG[x.m.N[[...x.sets[s.id]][0]]?.group || ""] || (s.g ? ZG[s.g] : undefined);
  if (!s.ext) return z;
  const l = x.links.find((k) => (k.a === s.id || k.b === s.id) && SV[k.a === s.id ? k.b : k.a].o === s.o && !SV[k.a === s.id ? k.b : k.a].ext);
  return l ? svcZone(x, SV[l.a === s.id ? l.b : l.a]) : z;
}
const chainSteps = (x: Services, o: string) => SVC.filter((s) => s.o === o).map((s, i) => ({ s, i: i + 1, z: svcZone(x, s) }));

export function routeLines(x: Services, o: string | null): Line[] {
  const L: Line[] = [];
  for (const oc of OUTCOMES.filter((y) => !o || y.id === o)) {
    const st = chainSteps(x, oc.id);
    st.forEach((t, i) => { const u = st[i + 1]; if (u && t.z && u.z && u.z !== t.z && !L.some((l) => l.a === t.z && l.b === u.z && l.o === oc.id)) L.push({ a: t.z, b: u.z, o: oc.id, arrow: 1 }); });
  }
  const cross = x.links.find((l) => l.ty === "x");
  const ca = cross && svcZone(x, SV[cross.a]), cb = cross && svcZone(x, SV[cross.b]);
  if (cross && ca && cb && ca !== cb && (!o || o === SV[cross.a].o || o === SV[cross.b].o)) L.push({ a: ca, b: cb, o: "x", arrow: 1 });
  return L;
}

export const rootLines = (x: Services, zl: ReturnType<typeof zoneLinks>, P: AtlasP): Line[] =>
  P.ly === "routes" ? routeLines(x, P.o) : zl.map((l) => ({ a: l.a, b: l.b, n: l.ev.length, dash: !l.hi }));
/** Lines between tiles, measured from the rendered boxes; redrawn when the canvas changes size. */
// The box is the svg's parent: a parent ref is not attached yet when a child's layout effect runs.
export function Wires({ lines, dep }: { lines: Line[]; dep: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [g, setG] = useState<{ w: number; h: number; paths: { d: string; col: string; dash: boolean; arrow?: string }[]; tags: { x: number; y: number; n: number; side: boolean }[] }>({ w: 0, h: 0, paths: [], tags: [] });
  useLayoutEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const draw = () => {
      const R = el.getBoundingClientRect(), k0 = R.width / (el.offsetWidth || R.width) || 1, W = el.offsetWidth || R.width, H = el.offsetHeight || R.height;
      const rect = (id: string) => { const e = el.querySelector(`[data-z="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: (r.left - R.left) / k0, y: (r.top - R.top) / k0, w: r.width / k0, h: r.height / k0 }; };
      const seen: Record<string, number> = {}, paths: typeof g.paths = [], tags: typeof g.tags = [];
      for (const L of lines) {
        const a = rect(L.a), b = rect(L.b);
        if (!a || !b) continue;
        const k = [L.a, L.b].sort().join("|"), off = (seen[k] = (seen[k] ?? -1) + 1) * 9;
        const ovx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), ovy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        let d: string, mx: number, my: number, side = false;
        if (ovy > 0) {
          const y = Math.max(a.y, b.y) + ovy / 2 + off * 4, [x1, x2] = a.x < b.x ? [a.x + a.w, b.x] : [a.x, b.x + b.w];
          d = `M${x1},${y} H${x2}`; mx = (x1 + x2) / 2; my = y; side = true;
        } else if (ovx > 0) {
          const xx = Math.max(a.x, b.x) + Math.min(ovx, Math.min(a.w, b.w)) / 2 + off, [y1, y2] = a.y < b.y ? [a.y + a.h, b.y] : [a.y, b.y + b.h];
          d = `M${xx},${y1} V${y2}`; mx = xx; my = Math.min(y1, y2) + Math.abs(y2 - y1) * 0.62;
        } else {
          d = `M${a.x + a.w / 2},${a.y + a.h / 2} L${b.x + b.w / 2},${b.y + b.h / 2}`; mx = (a.x + b.x + (a.w + b.w) / 2) / 2; my = (a.y + b.y + (a.h + b.h) / 2) / 2;
        }
        paths.push({ d, col: L.o ? CHAIN_HUE[L.o] || "#6b7a86" : "#004060", dash: !!L.dash || L.o === "x", arrow: L.arrow ? L.o : undefined });
        if (L.n) tags.push({ x: W - mx, y: my, n: L.n, side });
      }
      setG({ w: W, h: H, paths, tags });
    };
    draw();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(draw) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return (
    <>
      <svg ref={svgRef} className="sy-al" aria-hidden="true" width={g.w} height={g.h} viewBox={`0 0 ${g.w || 1} ${g.h || 1}`}>
        <defs>
          {[...Object.keys(CHAIN_HUE), "x"].map((o) => (
            <marker key={o} id={`sy-m-${o}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={CHAIN_HUE[o] || "#6b7a86"} />
            </marker>
          ))}
        </defs>
        {g.paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.col} strokeWidth={4} strokeLinejoin="round" strokeDasharray={p.dash ? "8 6" : undefined} markerEnd={p.arrow ? `url(#sy-m-${p.arrow})` : undefined} />)}
      </svg>
      <div className="sy-pills" aria-hidden="true">
        {g.tags.map((t, i) => (
          <span key={i} className={`sy-pill${t.side ? " sy-pill-st" : ""}`} style={{ insetInlineStart: t.x, insetBlockStart: t.y }}>
            {t.side ? <><b>{t.n}</b>{t.n === 1 ? "קשר" : "קשרים"}</> : t.n === 1 ? "קשר אחד" : `${t.n} קשרים`}
          </span>
        ))}
      </div>
    </>
  );
}

export function ZoneTile({ zz, m, x, G, p }: { zz: Zone; m: Model; x: Services; G: Record<string, Group>; p: AtlasP }) {
  const ns = zNodes(m, zz), s = scopeStatus(m, G, zz.gs), gs = zz.gs.filter((g) => G[g]);
  const unk = ns.filter((n) => nodeStatus(n).k === "unk").length;
  let extra: React.ReactNode = null, on = true;
  if (p.ly === "struct") extra = <span className="sy-doms">{gs.map((g, i) => <span key={g}>{i > 0 && " · "}<span className="sy-dname">{G[g].name_he}</span></span>)}</span>;
  if (p.ly === "status") extra = s.p.length
    ? <span className="sy-probs">{s.p.slice(0, 2).map((n) => <span key={n.id}><Bidi t={`${title(n)}: ${consequence(n, m)}`} /></span>)}{s.p.length > 2 && <span>ועוד <bdi>{s.p.length - 2}</bdi></span>}</span>
    : <span className="sy-doms">שום חלק נחוץ לא נכשל. <bdi>{unk}</bdi> בלי בדיקה.</span>;
  if (p.ly === "routes") {
    const steps = OUTCOMES.filter((y) => !p.o || y.id === p.o).flatMap((y) => chainSteps(x, y.id).filter((t) => t.z === zz.id).map((t) => ({ ...t, y })));
    on = !p.o || steps.length > 0;
    extra = p.o
      ? steps.length ? <ol className="sy-steps">{steps.map((t) => <li key={t.s.id}><b style={{ background: CHAIN_HUE[t.y.id] }}>{t.i}</b><span>{t.s.t}{t.s.ext && <span className="sy-u"> (בחוץ)</span>}</span></li>)}</ol> : <span className="sy-doms">המסלול לא עובר כאן</span>
      : <span className="sy-chains">{[...new Set(steps.map((t) => t.y))].map((y) => <span key={y.id}><i className="sy-sw" style={{ background: CHAIN_HUE[y.id] }} />{y.t}</span>)}{!steps.length && <span className="sy-u">אף מסלול לא עובר כאן</span>}</span>;
  }
  if (p.ly === "whose") {
    const c = Object.fromEntries(PEOPLE.map((w) => [w, ns.filter((n) => whose(n) === w).length]));
    on = p.pw ? c[p.pw] > 0 : PEOPLE.slice(0, 3).some((w) => c[w] > 0);
    extra = <span className="sy-who">{PEOPLE.filter((w) => !p.pw || w === p.pw).map((w) => <span key={w} className={c[w] ? "sy-has" : undefined}>{w} <b>{c[w]}</b></span>)}</span>;
  }
  const style = { "--hue": zz.hue, gridColumn: zz.base ? "1 / -1" : zz.c, gridRow: zz.r } as CSSProperties;
  return (
    <Link className={`sy-zt${zz.base ? " sy-base" : ""}${on ? "" : " sy-off"}${s.k !== "ok" ? ` sy-bad sy-b-${s.k}` : ""}`} data-z={zz.id} to={atlasHref(p, { z: zz.id, d: null })} style={style}>
      <span className="sy-ztt">{zz.t}</span>
      <span className="sy-zn"><span className="sy-dname"><bdi>{ns.length}</bdi> רכיבים</span> · <span className="sy-dname"><bdi>{gs.length}</bdi> תחומים</span></span>
      <span className="sy-zs"><SPill s={s} /></span>
      {extra}
      {zz.base && <span className="sy-doms">כל האזורים נשענים על התשתית</span>}
    </Link>
  );
}

export function DomainTile({ g, zz, m, x, p }: { g: Group; zz: Zone; m: Model; x: Services; p: AtlasP }) {
  const ns = gNodes(m, g), s = groupStatus(g, m);
  let extra: React.ReactNode = <span className="sy-doms">{g.purpose_he}</span>, on = true;
  if (p.ly === "status" && s.p.length) extra = <span className="sy-probs">{s.p.map((n) => <span key={n.id}><Bidi t={`${title(n)}: ${consequence(n, m)}`} /></span>)}</span>;
  if (p.ly === "routes") {
    const sv = SVC.filter((v) => (!p.o || v.o === p.o) && [...x.sets[v.id]].some((i) => m.N[i]?.group === g.id));
    on = !p.o || sv.length > 0;
    if (sv.length) extra = <span className="sy-chains">{sv.map((v) => <span key={v.id}><i className="sy-sw" style={{ background: CHAIN_HUE[v.o] }} />{v.t}</span>)}</span>;
  }
  if (p.ly === "whose") {
    const c = PEOPLE.map((w) => [w, ns.filter((n) => whose(n) === w).length] as const).filter(([w, k]) => k && (!p.pw || w === p.pw));
    on = c.some(([w]) => w !== "לא ידוע");
    extra = <span className="sy-who">{c.map(([w, k]) => <span key={w} className="sy-has">{w} <b>{k}</b></span>)}{!c.length && <span>אין</span>}</span>;
  }
  return (
    <Link data-g={g.id} className={`sy-zt sy-dt${on ? "" : " sy-off"}${s.k !== "ok" ? ` sy-bad sy-b-${s.k}` : ""}`} to={atlasHref(p, { d: g.id })} style={{ "--hue": zz.hue } as CSSProperties}>
      <span className="sy-ztt">{g.name_he}</span>
      <span className="sy-zn"><bdi>{ns.length}</bdi> רכיבים</span>
      <span className="sy-zs"><SPill s={s} /></span>
      {extra}
    </Link>
  );
}

function DomainLevel({ g, m }: { g: Group; m: Model }) {
  const ns = [...gNodes(m, g)].sort((a, b) => SO[nodeStatus(a).k] - SO[nodeStatus(b).k]);
  return (
    <>
      <p className="sy-s sy-dpurp">{g.purpose_he}</p>
      <ul className="sy-cgrid">
        {ns.slice(0, 24).map((n) => (
          <li key={n.id}>
            <Link to={itemHref(n.id)}>
              <span className="sy-t"><Bidi t={title(n)} /><Whose n={n} /></span>
              <span className="sy-s">{KSHORT[n.kind] || n.kind}{consequence(n, m) && <> · <Bidi t={consequence(n, m)} /></>}</span>
              <St k={nodeStatus(n).k} />
            </Link>
          </li>
        ))}
      </ul>
      {ns.length > 24 && <p className="sy-s"><Link to={`/m/system/all?g=${encodeURIComponent(g.id)}`}>ועוד <bdi>{ns.length - 24}</bdi>: כל התחום בטבלה</Link></p>}
    </>
  );
}

// "מבט על": the numbers, what needs a look first, and how this scope connects
function Overview({ m, G, zl, p }: { m: Model; G: Record<string, Group>; zl: ReturnType<typeof zoneLinks>; p: AtlasP }) {
  const zz = p.z ? ZN[p.z] : null, g = p.d ? G[p.d] : null;
  const ns = g ? gNodes(m, g) : zz ? zNodes(m, zz) : m.nodes;
  const look = needsLook(ns), unk = ns.filter((n) => nodeStatus(n).k === "unk").length;
  const table = g ? `/m/system/all?g=${encodeURIComponent(g.id)}` : "/m/system/all";
  const links = zz && !g ? zl.filter((l) => l.a === zz.id || l.b === zz.id) : [];
  return (
    <>
      <p className="sy-ovl">{g ? "תחום" : zz ? "אזור במפה" : "המערכת כולה"}</p>
      <h2 className="sy-ovt">{g ? g.name_he : zz ? zz.t : "מרכז נשמה"}</h2>
      {zz && !g && <p className="sy-s">{zz.s}</p>}
      <dl className="sy-ovn">
        <div><dt>רכיבים</dt><dd><bdi>{ns.length}</bdi></dd></div>
        {!g && <div><dt>תחומים</dt><dd><bdi>{zz ? zz.gs.filter((x) => G[x]).length : m.groups.length}</bdi></dd></div>}
        <div><dt>דורש בדיקה</dt><dd className={look.length ? "sy-hot" : undefined}><bdi>{look.length}</bdi></dd></div>
        <div><dt>בלי בדיקה</dt><dd><bdi>{unk}</bdi></dd></div>
      </dl>
      <h3 className="sy-ovh">דורש בדיקה</h3>
      <ul className="sy-ovlist">
        {look.map((n) => (
          <li key={n.id}>
            <Link to={itemHref(n.id)}>
              <span className="sy-t"><St k={nodeStatus(n).k} /> <Bidi t={title(n)} /><Whose n={n} /></span>
              <span className="sy-s"><Bidi t={`${(n.decided as { decision_he?: string } | undefined)?.decision_he ? `לא רץ; הוחלט: ${(n.decided as { decision_he: string }).decision_he}` : consequence(n, m)} · ${G[n.group || ""]?.name_he || ""}`} /></span>
            </Link>
          </li>
        ))}
        {!look.length && <li className="sy-s">אין כרגע.</li>}
      </ul>
      {links.length > 0 && (
        <>
          <h3 className="sy-ovh">מחובר אל</h3>
          <ul className="sy-ovlist">
            {links.map((l) => {
              const other = ZN[l.a === zz!.id ? l.b : l.a];
              const ex = [...new Set(l.ev.map((e) => e.purpose_he).filter(Boolean))].slice(0, 2) as string[];
              return (
                <li key={other.id}>
                  <Link to={atlasHref(p, { z: other.id, d: null })}>
                    <span className="sy-t">{other.t} <span className="sy-u"><bdi>{l.ev.length}</bdi> קשרים</span></span>
                    {ex.length > 0 && <span className="sy-s"><Bidi t={ex.join(" · ")} /></span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Link className="mg-btn sy-ovbtn" to={table}>לפתוח <bdi>{ns.length}</bdi> רכיבים בטבלה</Link>
    </>
  );
}

export function Atlas({ m, x, edges, p }: { m: Model; x: Services; edges: Edge[]; p: AtlasP }) {
  const G: Record<string, Group> = Object.fromEntries(m.groups.map((g) => [g.id, g]));
  const fl0 = p.ly === "floors";
  const z = !fl0 && p.z && ZN[p.z] ? p.z : null, d = z && p.d && G[p.d] && ZG[p.d] === z ? p.d : null;
  const fl = useMemo(() => buildFloors(m, edges), [m, edges]);
  const [fsel, setFsel] = useState<string | null>(null);
  const P: AtlasP = { ...p, z, d, o: p.ly === "routes" && p.o && OC[p.o] ? p.o : null, pw: p.ly === "whose" && p.pw && PEOPLE.includes(p.pw) ? p.pw : null };
  const zl = zoneLinks(m, edges);
  const lines: Line[] = z ? [] : rootLines(x, zl, P);
  const nav = useNavigate();
  const zz = z ? ZN[z] : null;
  return (
    <>
      <div className="sy-atop">
        <nav className="sy-seg sy-full sy-layers" aria-label="שכבות המפה">
          {LAYERS.map(([k, l]) => <Link key={k} to={atlasHref(P, { ly: k, o: null, pw: null })} aria-current={P.ly === k ? "true" : undefined}>{l}</Link>)}
        </nav>
        <form className="sy-asearch" role="search" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); nav(`/m/system/all?q=${encodeURIComponent(String(q || ""))}`); }}>
          <input name="q" type="search" placeholder="חיפוש רכיב, תחום או מזהה" aria-label="חיפוש במערכת" />
        </form>
      </div>
      {P.ly === "routes" && (
        <div className="sy-chips" role="group" aria-label="מסלולים">
          {OUTCOMES.map((y) => <Link key={y.id} className="sy-chip" to={atlasHref(P, { o: P.o === y.id ? null : y.id })} aria-current={P.o === y.id ? "true" : undefined}><i className="sy-sw" style={{ background: CHAIN_HUE[y.id] }} />{y.t}</Link>)}
        </div>
      )}
      {P.ly === "whose" && (
        <div className="sy-chips" role="group" aria-label="של מי">
          {PEOPLE.map((w) => <Link key={w} className="sy-chip" to={atlasHref(P, { pw: P.pw === w ? null : w })} aria-current={P.pw === w ? "true" : undefined}>{w === "לא ידוע" ? "לא ידוע של מי" : w}</Link>)}
        </div>
      )}
      {P.o && <p className="sy-s sy-detlink"><Link to={`/m/system/map?o=${P.o}`}>התרשים המפורט של המסלול: כל שירות, וכל קשר ביניהם</Link></p>}
      <div className="sy-agrid">
        <div className="mg-panel sy-awrap">
          <nav className="sy-crumbs" aria-label="איפה אני במפה">
            <Link to={atlasHref(P, { z: null, d: null })}>כל המערכת</Link>
            {zz && <> <span aria-hidden="true">/</span> <Link to={atlasHref(P, { d: null })}>{zz.t}</Link></>}
            {d && <> <span aria-hidden="true">/</span> <span>{G[d].name_he}</span></>}
            <button type="button" className="mg-btn mg-btn-cta sy-fsbtn" onClick={() => { nav(fsHref(P, { z: null, d: null })); document.documentElement.requestFullscreen?.().catch(() => {}); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>לפתוח את המפה במסך מלא
            </button>
          </nav>
          <div className={`sy-ac sy-ly-${P.ly}${P.o ? " sy-has-o" : ""}${P.pw ? " sy-has-pw" : ""}`} data-testid="atlas">
            {!z && !fl0 && <Wires lines={lines} dep={`${P.ly}|${P.o}|${P.pw}|${lines.length}`} />}
            {fl0 ? <FloorsView fl={fl} sel={fsel} onPick={(id) => setFsel(fsel === id ? null : id)} />
              : d ? <DomainLevel g={G[d]} m={m} />
              : zz ? <div className="sy-dgrid">{zz.gs.filter((g) => G[g]).map((g) => <DomainTile key={g} g={G[g]} zz={zz} m={m} x={x} p={P} />)}</div>
              : <div className="sy-zgrid">{ZONES.map((y) => <ZoneTile key={y.id} zz={y} m={m} x={x} G={G} p={P} />)}</div>}
          </div>
          <div className="sy-akey">
            {fl0 ? <><span><i className="sy-ln sy-thin" />קו = נשען על, לפי הקשרים שנמצאו בנתונים</span><span>חלק בלי קו: אין במפה קשר רשום</span><span>נגיעה מדליקה את כל העמוד</span></>
              : d ? null : z ? <span>לחיצה על תחום מראה ממה הוא בנוי</span>
              : P.ly === "routes" ? <><span>המספר = סדר השלבים במסלול</span><span>חץ = המסלול עובר לאזור אחר</span><span><i className="sy-ln sy-dash" />לומדים תורמים מתוך נקודה שלי</span></>
              : <><span><i className="sy-ln" />קו = יש קשרים בנתונים בין האזורים</span><span><i className="sy-ln sy-dash" />קו מקווקו = קשר לא ודאי</span></>}
            <Link to="/m/system/map?det=1">התוצאות והשירותים כרשימה</Link>
          </div>
        </div>
        <aside className="sy-aside" aria-label="מבט על">
          {fl0 && fsel ? <FloorInfo fl={fl} id={fsel} onClear={() => setFsel(null)} actions={m.N[fsel] && <Link className="mg-btn mg-btn-cta" to={itemHref(fsel)}>כל הפרטים</Link>} /> : <Overview m={m} G={G} zl={zl} p={P} />}
        </aside>
      </div>
    </>
  );
}
