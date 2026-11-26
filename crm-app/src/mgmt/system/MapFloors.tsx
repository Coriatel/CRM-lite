import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SystemNode } from "./systemApi";
import { isProblem, nodeStatus, title, type Model } from "./model";
import { Bidi, St } from "./MgmtSystemPage";

// "קומות" (panel-design-3d verdict, owner 26.11): what runs on what, as three flat floors — what people see / what works behind
// it / what it all sits on. Pillars only where the map has an edge; a part with no edge stands without pillars, and the
// sheet says so in words. One tap lights the whole column: what it stands on and what stands on it.
type Edge = { from: string; to: string };
interface Bg { id: string; kind: "bg"; he: string; members: Set<string> }
type FNode = SystemNode | Bg;
export interface Floors { top: SystemNode[]; mid: FNode[]; bot: SystemNode[]; down: Record<string, Set<string>>; up: Record<string, Set<string>>; F: Record<string, FNode> }
const MID = new Set(["service", "container", "workflow", "env-service"]), BOT = new Set(["external", "disk", "machine", "gpu", "network-entry"]);
const BG: Record<string, [string, string]> = { workflow: ["bg:flows", "תהליכים אוטומטיים"], timer: ["bg:timers", "משימות מתוזמנות"], "user-timer": ["bg:timers", "משימות מתוזמנות"], script: ["bg:scripts", "סקריפטים"], service: ["bg:svc", "שירותי רקע"], container: ["bg:svc", "שירותי רקע"] };
const KB: Record<string, number> = { machine: 0, "network-entry": 1, gpu: 2, disk: 3, external: 4 };
export const FL_NAMES: [keyof Pick<Floors, "top" | "mid" | "bot">, string, string, string][] = [
  ["top", "מה שאנשים רואים", "אתרים ואפליקציות", "#0e6f86"],
  ["mid", "מה שעובד מאחור", "שירותים, תוכנות ועבודות רקע", "#6b46b0"],
  ["bot", "על מה הכול יושב", "השרת, הדיסקים, דרכי הכניסה והשירותים בחוץ", "#4b5d6e"],
];

export function buildFloors(m: Model, edges: Edge[]): Floors {
  const N = m.N, out: Record<string, string[]> = {};
  for (const e of edges) if (N[e.from] && N[e.to]) (out[e.from] ||= []).push(e.to);
  // top: the sites that work now; the private tailnet address is the owner's back door, not a site people see
  const top = m.nodes.filter((n) => n.kind === "site" && n.state === "works" && !/\.ts\.net$/.test(n.name));
  const down: Record<string, Set<string>> = {}, mids = new Set<string>(), bots = new Set(["hw:mn-home"].filter((id) => N[id]));
  for (const s of top) {
    down[s.id] = new Set();
    for (const t of out[s.id] || []) {
      if (MID.has(N[t].kind)) { down[s.id].add(t); mids.add(t); } else if (BOT.has(N[t].kind)) { down[s.id].add(t); bots.add(t); }
    }
  }
  // middle -> bottom: directly, or through a container it depends on (that container stands on the middle floor too)
  const queue = [...mids];
  while (queue.length) {
    const a = queue.pop()!;
    down[a] ||= new Set();
    for (const t of out[a] || []) {
      if (BOT.has(N[t].kind)) { down[a].add(t); bots.add(t); }
      else if (N[t].kind === "container" && t !== a) { down[a].add(t); if (!mids.has(t)) { mids.add(t); queue.push(t); } }
    }
  }
  // background work that no site stands on, one chip per kind, so the floor stays readable (members listed when tapped)
  const bg: Record<string, Bg> = {};
  for (const [a, ts] of Object.entries(out)) {
    if (mids.has(a) || !BG[N[a].kind]) continue;
    const ex = ts.filter((t) => N[t].kind === "external");
    if (!ex.length) continue;
    const [id, he] = BG[N[a].kind];
    (bg[id] ||= { id, kind: "bg", he, members: new Set() }).members.add(a);
    down[id] ||= new Set();
    for (const t of ex) { down[id].add(t); bots.add(t); }
  }
  for (const a of mids) for (const t of out[a] || []) if (N[t].kind === "external") { down[a].add(t); bots.add(t); }
  const up: Record<string, Set<string>> = {};
  for (const [a, ds] of Object.entries(down)) for (const b of ds) (up[b] ||= new Set()).add(a);
  const rank = (id: string) => (down[id]?.size || 0) + (up[id]?.size || 0);
  const F: Record<string, FNode> = { ...N, ...bg };
  return {
    top: top.sort((a, b) => down[b.id].size - down[a.id].size || a.name.localeCompare(b.name)),
    mid: [...[...mids].map((id) => N[id]).sort((a, b) => rank(b.id) - rank(a.id)), ...Object.values(bg)],
    bot: [...bots].map((id) => N[id]).sort((a, b) => (KB[a.kind] ?? 9) - (KB[b.kind] ?? 9) || rank(b.id) - rank(a.id)),
    down, up, F,
  };
}

const isBg = (n: FNode): n is Bg => n.kind === "bg";
/** The Hebrew name on a chip; the technical name waits in the sheet. */
export function flLab(n: FNode): string {
  if (isBg(n)) return `${n.he} · ${n.members.size}`;
  if (n.kind === "machine") return "שרת הבית";
  if (n.kind === "gpu") return "כרטיס מסך";
  if (n.kind === "disk") return `דיסק ${n.name.split(" ")[0].split("/").pop() || "/"}`;
  if (n.kind === "network-entry") return n.name.replace(/\s*\(.*$/, "");
  return title(n);
}
export function column(fl: Floors, id: string): Set<string> {
  const seen = new Set([id]);
  const walk = (mp: Record<string, Set<string>>, k: string) => { for (const x of mp[k] || []) if (!seen.has(x)) { seen.add(x); walk(mp, x); } };
  walk(fl.down, id);
  walk(fl.up, id);
  return seen;
}

/** The three floors with their pillars. The pillars are measured after layout in unscaled coordinates (works inside full screen). */
export function FloorsView({ fl, sel, onPick }: { fl: Floors; sel: string | null; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pil, setPil] = useState<{ w: number; h: number; ls: { a: string; b: string; x1: number; y1: number; x2: number; y2: number }[] }>({ w: 0, h: 0, ls: [] });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const R = el.getBoundingClientRect(), k = R.width / (el.offsetWidth || R.width) || 1;
      const pos: Record<string, { x: number; t: number; b: number }> = {};
      el.querySelectorAll<HTMLElement>("[data-f]").forEach((e) => { const r = e.getBoundingClientRect(); pos[e.dataset.f!] = { x: (r.left - R.left + r.width / 2) / k, t: (r.top - R.top) / k, b: (r.bottom - R.top) / k }; });
      const ls: typeof pil.ls = [];
      for (const [a, ds] of Object.entries(fl.down)) for (const b of ds) { const p = pos[a], q = pos[b]; if (p && q) ls.push({ a, b, x1: p.x, y1: p.b, x2: q.x, y2: q.t }); }
      setPil({ w: el.offsetWidth, h: el.offsetHeight, ls });
    };
    draw();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(draw) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [fl]);
  const col = useMemo(() => (sel ? column(fl, sel) : null), [fl, sel]);
  return (
    <div ref={box} className={`sy-fl3${col ? " sy-lit" : ""}`} data-testid="floors">
      {FL_NAMES.map(([k, t, s, hue], i) => (
        <section key={k} className="sy-flr" style={{ "--hue": hue } as React.CSSProperties} aria-label={`קומה ${3 - i}: ${t}`}>
          <h3 className="sy-flt"><span className="sy-fln">קומה <bdi>{3 - i}</bdi></span> {t} <span className="sy-flc"><bdi>{fl[k].length}</bdi></span></h3>
          <p className="sy-fls">{s}</p>
          <div className="sy-fchips">
            {fl[k].map((n) => {
              const bad = !isBg(n) && (isProblem(n) || n.state === "not running");
              return (
                <button type="button" key={n.id} data-f={n.id} onClick={() => onPick(n.id)} aria-pressed={sel === n.id}
                  className={`sy-fchip${bad ? " sy-hot" : ""}${col?.has(n.id) ? " sy-on" : ""}${sel === n.id ? " sy-picked" : ""}`}>
                  <span className="sy-t"><Bidi t={flLab(n)} /></span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <svg className="sy-fpil" aria-hidden="true" width={pil.w} height={pil.h} viewBox={`0 0 ${pil.w || 1} ${pil.h || 1}`}>
        {pil.ls.map((l) => <line key={`${l.a}>${l.b}`} className={col && col.has(l.a) && col.has(l.b) ? "sy-on" : undefined} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
      </svg>
    </div>
  );
}

/** What one part stands on, what stands on it, and how big its column is; a missing edge is said in words. */
export function FloorInfo({ fl, id, onClear, actions }: { fl: Floors; id: string; onClear: () => void; actions?: React.ReactNode }) {
  const n = fl.F[id];
  if (!n) return null;
  const f = fl.top.some((x) => x.id === id) ? 0 : fl.mid.some((x) => x.id === id) ? 1 : 2;
  const dn = [...(fl.down[id] || [])].map((x) => fl.F[x]).filter(Boolean), upn = [...(fl.up[id] || [])].map((x) => fl.F[x]).filter(Boolean);
  const list = (ns: FNode[]) => <Bidi t={ns.map(flLab).join(" · ")} />;
  const row = (k: string, v: React.ReactNode) => <div><dt>{k}</dt><dd>{v}</dd></div>;
  const size = column(fl, id).size - 1;
  return (
    <>
      <p className="sy-ovl">קומה <bdi>{3 - f}</bdi> · {FL_NAMES[f][1]}</p>
      <h2 className="sy-ovt"><Bidi t={isBg(n) ? n.he : title(n)} /></h2>
      {!isBg(n) && <p className="sy-s"><bdi>{n.name}</bdi></p>}
      <dl className="sy-fs-kv">
        {isBg(n)
          ? row("מה בפנים", <Bidi t={`${[...n.members].slice(0, 8).map((x) => { const y = fl.F[x]; return y && !isBg(y) ? title(y) : x; }).join(" · ")}${n.members.size > 8 ? ` ועוד ${n.members.size - 8}` : ""}`} />)
          : row("מצב", <St k={nodeStatus(n).k} />)}
        {row("נשען על", dn.length ? list(dn) : f === 2 ? "זה הבסיס" : <span className="sy-unk">אין במפה קשר רשום</span>)}
        {row("נשענים עליו", upn.length ? list(upn) : f === 0 ? "אנשים" : <span className="sy-unk">אין במפה קשר רשום</span>)}
        {row("בכל העמוד", <><bdi>{size}</bdi> חלקים</>)}
      </dl>
      <div className="sy-fs-acts">
        {actions}
        <button type="button" className="mg-btn" onClick={onClear}>לנקות</button>
      </div>
    </>
  );
}
