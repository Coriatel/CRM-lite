import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { consequence, groupStatus, isProblem, nodeStatus, title, whose, type Group, type Model } from "./model";
import { dupTitles, KSHORT, purpose } from "./inventory";
import { OUTCOMES, type Services } from "./services";
import { itemHref } from "./SystemHead";
import { Bidi, St } from "./MgmtSystemPage";
import { buildFloors, FloorInfo, FloorsView } from "./MapFloors";
import {
  atlasHref, CHAIN_HUE, DomainTile, fsHref, gNodes, LAYERS, needsLook, PEOPLE, rootLines, scopeStatus, SO, SPill, Wires, ZG, ZN, ZONES, zNodes, ZoneTile, zoneLinks, type AtlasP,
} from "./MapAtlas";

// Full-screen map (owner 26.11 12:16, mockup v4c/v4d): one finger drags, two fingers zoom, a tap explains, exit lands on the list of
// what was last chosen. Three levels laid out for the screen: the whole system -> one area -> one domain. Pinching in on an area
// or a domain opens it; pinching out past "fit" goes one level up. Only translate + scale, never below "fit".
const FMAX = 3, FDRILL = 1.8, FFLOOR = 0.85;
type Sel = { k: "z" | "g" | "n" | "f"; id: string } | null;
type Edge = { from: string; to: string; confidence?: string; purpose_he?: string };

// the map's buttons act on the finger's lift: a tap right after a quick drag can lose its click on a phone; then swallow the ghost click
function act(run: () => void) {
  let t = 0;
  return {
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      t = Date.now();
      const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      document.addEventListener("click", stop, true);
      setTimeout(() => document.removeEventListener("click", stop, true), 700);
      run();
    },
    onClick: () => { if (Date.now() - t > 700) run(); },
  };
}

export function FullMap({ m, x, edges, p: p0 }: { m: Model; x: Services; edges: Edge[]; p: AtlasP }) {
  const p: AtlasP = { ...p0, pw: p0.pw && PEOPLE.includes(p0.pw) ? p0.pw : null };
  const nav = useNavigate();
  const G: Record<string, Group> = Object.fromEntries(m.groups.map((g) => [g.id, g]));
  const [lv, setLv] = useState<{ z: string | null; g: string | null }>({ z: null, g: null });
  const [sel, setSel] = useState<Sel>(null);
  const [sheet, setSheet] = useState(false);
  const vpRef = useRef<HTMLDivElement>(null), wRef = useRef<HTMLDivElement>(null);
  const lvRef = useRef(lv);
  lvRef.current = lv;
  const T = useRef({ s: 0, x: 0, y: 8, fit: 1, pull: 1, pinch: false, mid: null as HTMLElement | null, ly: "" });
  const zl = zoneLinks(m, edges);
  const fl = useMemo(() => buildFloors(m, edges), [m, edges]);
  const lines = rootLines(x, zl, p);

  const applyT = () => {
    const w = wRef.current, vp = vpRef.current, t = T.current;
    if (!w || !vp) return;
    const vw = vp.clientWidth, vh = vp.clientHeight, W = w.offsetWidth * t.s, H = w.offsetHeight * t.s;
    // never lose the map: smaller than the screen = centred (top-aligned when short); larger = its edges stop at the screen edges
    t.x = W <= vw ? (vw - W) / 2 : Math.min(8, Math.max(vw - W - 8, t.x));
    t.y = H <= vh ? 8 : Math.min(8, Math.max(vh - H - 8, t.y));
    w.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.s})`;
  };
  const zoomAt = (px: number, py: number, k: number) => {
    const t = T.current, want = t.s * k, s2 = Math.min(FMAX, Math.max(t.fit, want));
    if (want < t.fit) t.pull *= want / Math.max(t.s, t.fit);
    k = s2 / t.s; t.x = px - (px - t.x) * k; t.y = py - (py - t.y) * k; t.s = s2; applyT();
  };
  const fit = () => { const t = T.current; t.s = t.fit; t.x = 0; t.y = 8; applyT(); };
  const zoom = (k: number) => { const vp = vpRef.current; if (!vp) return; T.current.pull = 1; zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, k); };
  const go = (z: string | null, g: string | null) => { T.current.s = 0; T.current.mid = null; setLv({ z, g }); setSel(g ? { k: "g", id: g } : z ? { k: "z", id: z } : null); setSheet(false); };

  // lay the level out at scale 1 for the width of the screen, then fit; the whole system should fit the screen height:
  // a small shrink first, then fold the domain-name lines (the next level shows them), never below 0.85
  useLayoutEffect(() => {
    const vp = vpRef.current, w = wRef.current, t = T.current;
    if (!vp || !w) return;
    w.style.transform = "none";
    w.classList.remove("sy-tight");
    w.style.inlineSize = `${Math.max(280, Math.min(vp.clientWidth - 16, 960))}px`;
    if (!lv.z && (vp.clientHeight - 16) / (w.offsetHeight || 1) < 0.95) w.classList.add("sy-tight");
    t.fit = !lv.z ? Math.min(1, Math.max(FFLOOR, (vp.clientHeight - 16) / (w.offsetHeight || 1))) : 1;
    const keep = t.ly === p.ly && t.s; t.ly = p.ly;
    if (keep) applyT(); else fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lv.z, lv.g, p.ly, p.o, p.pw]);

  useEffect(() => {
    const w = wRef.current;
    w?.querySelectorAll(".sy-picked").forEach((e) => e.classList.remove("sy-picked"));
    if (w && sel) Array.from(w.querySelectorAll<HTMLElement>(`[data-${sel.k}]`)).find((e) => e.dataset[sel.k] === sel.id)?.classList.add("sy-picked");
  }, [sel, lv]);

  useEffect(() => {
    document.body.classList.add("sy-fs-on");
    return () => document.body.classList.remove("sy-fs-on");
  }, []);

  // touch: native pointer events on the viewport (no re-render per move)
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const pts = new Map<number, [number, number]>();
    let start = 0, moved = 0, last: { n: number; mx: number; my: number; d: number } | null = null;
    const snap = () => {
      const a = [...pts.values()];
      if (!a.length) return null;
      return { n: a.length, mx: a.reduce((s, q) => s + q[0], 0) / a.length, my: a.reduce((s, q) => s + q[1], 0) / a.length, d: a.length > 1 ? Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) : 0 };
    };
    const tap = (cx: number, cy: number) => {
      const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
      if (!el || !wRef.current?.contains(el)) return;
      const c = el.closest<HTMLElement>("[data-n]"), g = el.closest<HTMLElement>("[data-g]"), z = el.closest<HTMLElement>("[data-z]");
      const pick: Sel = c ? { k: "n", id: c.dataset.n! } : g ? { k: "g", id: g.dataset.g! } : z ? { k: "z", id: z.dataset.z! } : null;
      if (pick) { setSel(pick); setSheet(true); }
    };
    const down = (e: PointerEvent) => {
      vp.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const t = T.current;
      if (pts.size === 1) { start = Date.now(); moved = 0; t.pull = 1; t.pinch = false; } else { moved = 99; t.pinch = true; }
      last = snap();
      // what the two fingers are on when the pinch starts is what a pinch-in opens
      if (pts.size === 2 && last) t.mid = (document.elementFromPoint(last.mx, last.my) as HTMLElement | null)?.closest<HTMLElement>(lvRef.current.z ? "[data-g]" : "[data-z]") || null;
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const now = snap()!, t = T.current;
      if (last && now.n === last.n) {
        const r = vp.getBoundingClientRect();
        t.x += now.mx - last.mx; t.y += now.my - last.my;
        zoomAt(now.mx - r.left, now.my - r.top, now.d && last.d ? now.d / last.d : 1);
        moved += Math.abs(now.mx - last.mx) + Math.abs(now.my - last.my);
      }
      last = now;
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!pts.size) {
        const t = T.current, L = lvRef.current;
        if (moved < 10 && Date.now() - start < 700) tap(e.clientX, e.clientY);
        else if (t.pinch) {
          if (t.pull < 0.75 && L.z) go(L.g ? L.z : null, null);
          else if (t.s >= FDRILL && !L.g && t.mid?.isConnected) L.z ? go(L.z, t.mid.dataset.g!) : go(t.mid.dataset.z!, null);
        }
      }
      last = snap();
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = vp.getBoundingClientRect(); T.current.pull = 1; zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY / 300)); };
    // links inside the map are for the normal page; in full screen a tap explains instead of leaving
    const noLink = (e: MouseEvent) => e.preventDefault();
    vp.addEventListener("pointerdown", down);
    vp.addEventListener("pointermove", move);
    vp.addEventListener("pointerup", up);
    vp.addEventListener("pointercancel", up);
    vp.addEventListener("wheel", wheel, { passive: false });
    vp.addEventListener("click", noLink, true);
    return () => {
      vp.removeEventListener("pointerdown", down);
      vp.removeEventListener("pointermove", move);
      vp.removeEventListener("pointerup", up);
      vp.removeEventListener("pointercancel", up);
      vp.removeEventListener("wheel", wheel);
      vp.removeEventListener("click", noLink, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // exit lands on the list of what was last chosen; an area has no list filter, so it lands on that area in the map
  const target = (cur: Sel = sel) => {
    if (!cur) return atlasHref(p);
    if (cur.k === "z") return atlasHref(p, { z: cur.id, d: null });
    if (cur.k === "g") return `/m/system/all?g=${encodeURIComponent(cur.id)}`;
    if (cur.k === "f" && !m.N[cur.id]) return atlasHref(p);
    const n = m.N[cur.id];
    return `/m/system/all?g=${encodeURIComponent(n?.group || "")}&q=${encodeURIComponent(n ? title(n) : "")}`;
  };
  const left = useRef(false), selRef = useRef(sel), targetRef = useRef(target);
  selRef.current = sel;
  targetRef.current = target;
  const leave = (to: string) => {
    left.current = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    nav(to, { replace: true });
  };
  // the phone's back gesture leaves full screen like the exit button: with something chosen, it lands on that choice
  useEffect(() => () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!left.current && selRef.current && window.location.pathname === "/m/system/map" && !/[?&]fs=1/.test(window.location.search)) nav(targetRef.current(selRef.current), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ly = p.ly;
  const cls = `sy-ac sy-fsa sy-ly-${ly}${p.o ? " sy-has-o" : ""}${p.pw ? " sy-has-pw" : ""}`;
  let world: React.ReactNode;
  if (ly === "floors") {
    world = <FloorsView fl={fl} sel={sel?.k === "f" ? sel.id : null} onPick={(id) => { setSel({ k: "f", id }); setSheet(true); }} />;
  } else if (lv.g && G[lv.g]) {
    const g = G[lv.g], dups = dupTitles(m), s = groupStatus(g, m), ns = [...gNodes(m, g)].sort((a, b) => SO[nodeStatus(a).k] - SO[nodeStatus(b).k]);
    const unk = ns.filter((n) => nodeStatus(n).k === "unk").length, off = ns.filter((n) => nodeStatus(n).k === "off").length;
    world = (
      <>
        <div className="sy-fhead" style={{ "--hue": ZN[ZG[g.id]].hue } as React.CSSProperties}>
          <h2>{g.name_he}</h2>
          <p><bdi>{ns.length}</bdi> רכיבים <SPill s={s} /></p>
          <p className="sy-s">{g.purpose_he}</p>
          <p className="sy-fnote">{s.p.length ? (s.p.length === 1 ? "חלק נחוץ אחד נכשל." : `${s.p.length} חלקים נחוצים נכשלו.`) : "שום חלק נחוץ לא נכשל."} <bdi>{unk}</bdi> בלי בדיקה{off ? <>, <bdi>{off}</bdi> כבויים בכוונה</> : null}.</p>
        </div>
        <ul className="sy-fcomp">
          {ns.map((n) => (
            <li key={n.id} data-n={n.id} className={isProblem(n) || n.state === "not running" ? "sy-hot" : undefined}>
              <span className="sy-t"><Bidi t={title(n)} /></span>
              {dups.has(title(n)) && <span className="sy-u"><bdi>{n.name}</bdi></span>}
              <span className="sy-s"><St k={nodeStatus(n).k} />{consequence(n, m) && <> · <Bidi t={consequence(n, m)} /></>}</span>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (lv.z && ZN[lv.z]) {
    const zz = ZN[lv.z];
    world = (
      <>
        <div className="sy-fhead" style={{ "--hue": zz.hue } as React.CSSProperties}>
          <h2>{zz.t}</h2>
          <p><bdi>{zNodes(m, zz).length}</bdi> רכיבים <SPill s={scopeStatus(m, G, zz.gs)} /></p>
          <p className="sy-s">{zz.s}</p>
        </div>
        <div className={cls}><div className="sy-dgrid">{zz.gs.filter((g) => G[g]).map((g) => <DomainTile key={g} g={G[g]} zz={zz} m={m} x={x} p={p} />)}</div></div>
      </>
    );
  } else {
    world = (
      <div className={cls}>
        <Wires lines={lines} dep={`fs|${ly}|${p.o}|${p.pw}|${lines.length}`} />
        <div className="sy-zgrid">{ZONES.map((y) => <ZoneTile key={y.id} zz={y} m={m} x={x} G={G} p={p} />)}</div>
      </div>
    );
  }

  const hint = ly === "floors" ? "נגיעה בחלק מדליקה את כל העמוד שלו: על מה הוא נשען ומה נשען עליו." : lv.g ? "נגיעה ברכיב מסבירה מה הוא. צביטה החוצה חוזרת לאזור." : lv.z ? "צביטה על תחום פותחת אותו, החוצה חוזרת." : "צביטה על אזור פותחת אותו. נגיעה מסבירה מה זה.";
  return (
    <div className={`sy-fs sy-ly-${ly}`} role="dialog" aria-label="המפה במסך מלא">
      <div className="sy-fs-top">
        <button type="button" className="mg-btn sy-fs-exit" {...act(() => leave(target()))}><span aria-hidden="true">✕</span> יציאה ממסך מלא</button>
        <span className="sy-fs-title">מפת המערכת</span>
      </div>
      <nav className="sy-seg sy-full sy-layers sy-fs-ly" aria-label="שכבות המפה">
        {LAYERS.map(([k, l]) => <Link key={k} to={fsHref(p, { ly: k, o: null, pw: null })} replace aria-current={ly === k ? "true" : undefined}>{l}</Link>)}
      </nav>
      {ly === "routes" && (
        <>
          <div className="sy-chips sy-fs-sub" role="group" aria-label="מסלולים">
            {OUTCOMES.map((y) => <Link key={y.id} className="sy-chip" replace to={fsHref(p, { o: p.o === y.id ? null : y.id })} aria-current={p.o === y.id ? "true" : undefined}><i className="sy-sw" style={{ background: CHAIN_HUE[y.id] }} />{y.t}</Link>)}
          </div>
          <p className="sy-fs-note"><span>נגיעה במסלול מראה את השלבים.</span> <span><i className="sy-ln sy-dash" />לומדים בנקודה שלי תורמים</span></p>
        </>
      )}
      {ly === "whose" && (
        <div className="sy-chips sy-fs-sub" role="group" aria-label="של מי">
          {PEOPLE.map((w) => <Link key={w} className="sy-chip" replace to={fsHref(p, { pw: p.pw === w ? null : w })} aria-current={p.pw === w ? "true" : undefined}>{w === "לא ידוע" ? "לא ידוע של מי" : w}</Link>)}
        </div>
      )}
      {lv.z && (
        <nav className="sy-fs-crumbs" aria-label="איפה אני במפה">
          <button type="button" className="mg-btn" {...act(() => go(null, null))}>‹ כל המערכת</button>
          {lv.g && <button type="button" className="mg-btn" {...act(() => go(lv.z, null))}>‹ {ZN[lv.z].t}</button>}
        </nav>
      )}
      <div className="sy-fs-vp" id="fsvp" ref={vpRef}>
        <div className="sy-fworld" id="fw" ref={wRef}>{world}</div>
      </div>
      <div className="sy-fs-bar">
        <div className="sy-fs-ctl" role="group" aria-label="זום">
          <button type="button" className="mg-btn" aria-label="הקטנה" {...act(() => zoom(1 / 1.5))}>−</button>
          <button type="button" className="mg-btn sy-fit" {...act(fit)}>התאם למסך</button>
          <button type="button" className="mg-btn" aria-label="הגדלה" {...act(() => zoom(1.5))}>+</button>
        </div>
        <p className="sy-fs-hint">{hint}</p>
      </div>
      {sel?.k === "f" && sheet && (
        <div className="sy-fs-sheet" id="fss">
          <button type="button" className="mg-btn sy-fs-x" aria-label="סגירה" {...act(() => setSheet(false))}>✕</button>
          <FloorInfo fl={fl} id={sel.id} onClear={() => { setSel(null); setSheet(false); }} actions={m.N[sel.id] && <button type="button" className="mg-btn mg-btn-cta" {...act(() => leave(target()))}>לראות ברשימה</button>} />
        </div>
      )}
      {sel && sel.k !== "f" && sheet && <Sheet sel={sel} m={m} G={G} lv={lv} go={go} close={() => setSheet(false)} exit={() => leave(target())} />}
    </div>
  );
}

function Sheet({ sel, m, G, lv, go, close, exit }: { sel: NonNullable<Sel>; m: Model; G: Record<string, Group>; lv: { z: string | null; g: string | null }; go: (z: string | null, g: string | null) => void; close: () => void; exit: () => void }) {
  const row = (k: string, v: React.ReactNode) => <div><dt>{k}</dt><dd>{v}</dd></div>;
  const x = <button type="button" className="mg-btn sy-fs-x" aria-label="סגירה" {...act(close)}>✕</button>;
  if (sel.k === "n") {
    const n = m.N[sel.id];
    if (!n) return null;
    return (
      <div className="sy-fs-sheet" id="fss">
        {x}
        <p className="sy-ovl">רכיב · {G[n.group || ""]?.name_he || ""}</p>
        <h2 className="sy-ovt"><Bidi t={title(n)} /></h2>
        <dl className="sy-fs-kv">
          {row("מה הוא עושה", <Bidi t={purpose(n) || String(n.why_he || title(n))} />)}
          {row("מצב", <><St k={nodeStatus(n).k} />{consequence(n, m) && <> · <Bidi t={consequence(n, m)} /></>}</>)}
          {row("של מי", whose(n))}
          {row("סוג", KSHORT[n.kind] || n.kind)}
        </dl>
        <div className="sy-fs-acts">
          <button type="button" className="mg-btn mg-btn-cta" {...act(exit)}>לראות ברשימה</button>
          <Link className="mg-btn" to={itemHref(n.id)} onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }}>כל הפרטים</Link>
        </div>
      </div>
    );
  }
  const isZ = sel.k === "z", zz = isZ ? ZN[sel.id] : null, g = isZ ? null : G[sel.id];
  if (!zz && !g) return null;
  const ns = zz ? zNodes(m, zz) : gNodes(m, g!), look = needsLook(ns), s = zz ? scopeStatus(m, G, zz.gs) : groupStatus(g!, m);
  const here = isZ ? lv.z === sel.id && !lv.g : lv.g === sel.id;
  return (
    <div className="sy-fs-sheet" id="fss">
      {x}
      <p className="sy-ovl">{isZ ? "אזור במפה" : `תחום · ${ZN[ZG[sel.id]]?.t || ""}`}</p>
      <h2 className="sy-ovt">{zz ? zz.t : g!.name_he}</h2>
      <p className="sy-s">{zz ? zz.s : g!.purpose_he}</p>
      <dl className="sy-fs-kv">
        {row("מצב", <SPill s={s} />)}
        {row("רכיבים", <bdi>{ns.length}</bdi>)}
        {look.length > 0 && row("דורש בדיקה", <Bidi t={look.map((n) => title(n)).join(" · ")} />)}
      </dl>
      <div className="sy-fs-acts">
        {!here && <button type="button" className="mg-btn mg-btn-cta" {...act(() => (isZ ? go(sel.id, null) : go(ZG[sel.id], sel.id)))}>{isZ ? "לפתוח את האזור" : "לפתוח את התחום"}</button>}
        <button type="button" className={`mg-btn${here ? " mg-btn-cta" : ""}`} {...act(exit)}>{isZ ? "לצאת אל האזור במפה" : <>לראות את <bdi>{ns.length}</bdi> הרכיבים ברשימה</>}</button>
      </div>
    </div>
  );
}
