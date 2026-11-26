import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { getSystem, type SystemMap, type SystemNode } from "./systemApi";
import { buildModel, consequence, isAuto, lastGood, nodeStatus, title, when, type Model } from "./model";
import { builtBy, COL, COLS, dupTitles, FILTERS, lastRunTxt, maintBy, matches, purpose, rowsFor, schedTxt, verdTxt, VIEWS, WHOSE, type FDef, type Filter } from "./inventory";
import { itemHref, SystemHead } from "./SystemHead";
import { qCount } from "./questions";
import { Bidi, St, Val, Whose } from "./MgmtSystemPage";
import "./system.css";

const LIMIT = 40;
const FKEYS = ["view", "who", "st", "z", "g", "lane", "vis", "verd", "kind", "q", "sort", "dir"] as const;
// the chosen columns are remembered per view and per screen size (a convenience only: the URL ?cols= wins, and the default is always there)
const colsKey = (view: string, desk: boolean) => `sy-cols-${view}-${desk ? "d" : "m"}`;
function savedCols(view: string, desk: boolean): string[] | null {
  try { const v = JSON.parse(localStorage.getItem(colsKey(view, desk)) || "null"); return Array.isArray(v) ? v : null; } catch { return null; }
}
function saveCols(view: string, desk: boolean, cols: string[] | null) {
  try { if (cols) localStorage.setItem(colsKey(view, desk), JSON.stringify(cols)); else localStorage.removeItem(colsKey(view, desk)); } catch { /* private window: keep it for this visit only */ }
}

function FSel({ F, f, m, set }: { F: FDef; f: Filter; m: Model; set: (o: Partial<Filter>) => void }) {
  const v = f[F.k] || "";
  return (
    <label className="sy-fsel">
      {F.l}
      <select className={v ? "sy-set" : ""} value={v} onChange={(e) => set({ [F.k]: e.target.value })}>
        <option value="">{F.all}</option>
        {F.opts(m).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function ColPanel({ order, setOrder, reset }: { order: string[]; setOrder: (o: string[]) => void; reset: () => void }) {
  const all = [...order, ...COLS.map((c) => c.k).filter((k) => !order.includes(k))];
  const move = (k: string, d: number) => { const o = [...order], i = o.indexOf(k); [o[i], o[i + d]] = [o[i + d], o[i]]; setOrder(o); };
  return (
    <div className="sy-colpanel" role="group" aria-label="עמודות">
      <h4>עמודות: להציג, להסתיר, להזיז</h4>
      {all.map((k) => {
        const c = COL[k], on = order.includes(k), i = order.indexOf(k);
        return (
          <div key={k} className="sy-colrow">
            <input type="checkbox" checked={on} disabled={!!c.always} aria-label={c.l} onChange={() => setOrder(on ? order.filter((x) => x !== k) : [...order, k])} />
            <span>{c.l}</span>
            <button type="button" className="sy-mv" disabled={!on || i <= 1} aria-label={`להזיז את ${c.l} ימינה`} onClick={() => move(k, -1)}>→</button>
            <button type="button" className="sy-mv" disabled={!on || !!c.always || i === order.length - 1} aria-label={`להזיז את ${c.l} שמאלה`} onClick={() => move(k, 1)}>←</button>
          </div>
        );
      })}
      <button type="button" className="mg-btn mg-btn-quiet sy-colreset" onClick={reset}>לחזור לעמודות של התצוגה</button>
    </div>
  );
}

function useDesk() {
  const q = "(min-width: 56rem)";
  const [d, setD] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q), on = () => setD(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

const DupName = ({ n, dup }: { n: SystemNode; dup: Set<string> }) =>
  dup.has(title(n)) ? <span className="sy-sub sy-wide"><bdi className="sy-ltr">{n.name}</bdi></span> : null;

function Card({ n, m, dup }: { n: SystemNode; m: Model; dup: Set<string> }) {
  const kv: [string, string][] = [
    ["נבנה על ידי", builtBy(n)],
    ["מתוחזק על ידי", maintBy(n, m.lanes)],
    ["משמש את", String((n.serves as { text_he?: string } | undefined)?.text_he || "")],
    ...(isAuto(n) ? ([["מתי רץ", schedTxt(n)], ["ריצה אחרונה", lastRunTxt(n, m)]] as [string, string][]) : []),
    ["החלטה", verdTxt(n)],
  ];
  const good = lastGood(n);
  return (
    <li>
      <details>
        <summary>
          <span className="sy-t"><Bidi t={title(n)} /><Whose n={n} /></span>
          <span className="sy-chev" aria-hidden="true">⌄</span>
          <DupName n={n} dup={dup} />
          {purpose(n) && <span className="sy-s sy-wide"><Bidi t={purpose(n)} /></span>}
          <span className="sy-stl"><St k={nodeStatus(n).k} />{consequence(n, m) && <span className="sy-s"><Bidi t={consequence(n, m)} /></span>}</span>
          <span className="sy-s sy-wide">נבדק {when(n.last_checked as string, m.gen)}{good && good !== n.last_checked ? ` · עבר בהצלחה ${when(good, m.gen)}` : ""}</span>
        </summary>
        <dl className="sy-kv">
          {kv.filter(([, v]) => v && v !== "לא ידוע").map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd><Bidi t={v} /></dd></div>
          ))}
          <div><dt></dt><dd><Link to={itemHref(n.id)}>לדף המלא ‹</Link></dd></div>
        </dl>
      </details>
    </li>
  );
}

export function MgmtSystemAll() {
  const map = useLoad<SystemMap>(() => getSystem("map"), []);
  const m = useMemo(() => (map.data ? buildModel(map.data) : null), [map.data]);
  const [sp, setSp] = useSearchParams();
  const desk = useDesk();
  const [cards, setCards] = useState(true);
  const [all, setAll] = useState(false);
  const f = Object.fromEntries(FKEYS.map((k) => [k, sp.get(k) || ""])) as unknown as Filter;
  f.view ||= "all";
  f.dir = sp.get("dir") === "desc" ? "desc" : "asc";
  const set = (o: Partial<Filter>) => {
    const next: Record<string, string> = { ...(f as unknown as Record<string, string>), ...(o as Record<string, string>) };
    if (sp.get("cols") && !("view" in o)) next.cols = sp.get("cols")!;
    setSp(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === "view" && v === "all") && !(k === "dir" && v === "asc"))), { replace: true });
    setAll(false);
  };
  const [colsOpen, setColsOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const dup = useMemo(() => (m ? dupTitles(m) : new Set<string>()), [m]);
  const r = useMemo(() => (m ? rowsFor(m, f) : null), [m, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = VIEWS.find((v) => v.id === f.view) || VIEWS[0];
  const table = desk || !cards;
  const defCols = desk ? view.d : view.m || view.d;
  const urlCols = sp.get("cols")?.split(",").filter((k) => COL[k]);
  const order = (urlCols?.length ? urlCols : savedCols(view.id, desk)?.filter((k) => COL[k]) || defCols).filter((k, i, a) => a.indexOf(k) === i);
  if (order[0] !== "name") order.splice(0, 0, ...(order.includes("name") ? order.splice(order.indexOf("name"), 1) : ["name"]));
  const cols = order.map((k) => COL[k]);
  const setOrder = (o: string[] | null) => {
    saveCols(view.id, desk, o);
    const next = new URLSearchParams(sp);
    if (o && o.join() !== defCols.join()) next.set("cols", o.join(",")); else next.delete("cols");
    setSp(next, { replace: true });
  };
  const nActive = FILTERS.filter((F) => f[F.k]).length;
  const clear = () => set({ st: "", z: "", g: "", lane: "", vis: "", verd: "", kind: "", who: "", q: "" });
  const shown = r ? (all || table ? r.rows : r.rows.slice(0, LIMIT)) : [];

  return (
    <>
      <SystemHead gen={map.data ? (map.data._meta?.generated_at ?? null) : undefined} nq={qCount(map.data)} />
      {!map.loaded && map.error == null && <MgLoading />}
      {map.error != null && (
        <section className="mg-panel">
          <MgNotice error={map.error} onRetry={map.reload} />
        </section>
      )}
      {m && r && (
        <>
          <div className="sy-views sy-d" role="group" aria-label="תצוגות שמורות">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className="sy-pbtn" aria-pressed={view.id === v.id} onClick={() => set({ view: v.id, sort: "" })}>
                {v.l} <span className="sy-n"><bdi>{m.nodes.filter(v.f).length}</bdi></span>
              </button>
            ))}
          </div>
          <label className="sy-fsel sy-m">
            תצוגה
            <select value={view.id} onChange={(e) => set({ view: e.target.value, sort: "" })}>
              {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.l} ({m.nodes.filter(v.f).length})</option>)}
            </select>
          </label>
          <div className="sy-whose" role="group" aria-label="של מי">
            <span className="sy-lbl">של מי:</span>
            {["", ...WHOSE].map((w) => (
              <button key={w || "all"} type="button" className="sy-pbtn" aria-pressed={f.who === w} onClick={() => set({ who: w })}>
                {w || "כולם"} <span className="sy-n"><bdi>{r.base.filter((n) => matches(n, { ...f, who: w })).length}</bdi></span>
              </button>
            ))}
          </div>
          <div className="sy-toolbar">
            <input className="sy-search" type="search" placeholder="חיפוש לפי שם, מזהה, מטרה…" aria-label="חיפוש" defaultValue={f.q} onChange={(e) => set({ q: e.target.value })} />
            {!desk && (
              <button type="button" className="mg-btn sy-fbtn" aria-label="מסננים" aria-expanded={sheet} onClick={() => setSheet(true)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
                {nActive > 0 && <span className="sy-badge"><bdi>{nActive}</bdi></span>}
              </button>
            )}
            {!desk && (
              <span className="sy-seg" role="group" aria-label="תצוגה">
                <button type="button" aria-pressed={cards} onClick={() => setCards(true)}>כרטיסים</button>
                <button type="button" aria-pressed={!cards} onClick={() => setCards(false)}>טבלה</button>
              </span>
            )}
            {desk && nActive + (f.who ? 1 : 0) + (f.q ? 1 : 0) > 0 && <button type="button" className="mg-btn mg-btn-quiet" onClick={clear}>נקה מסננים</button>}
            {table && (
              <span className="sy-colpick">
                <button type="button" className="mg-btn" aria-expanded={colsOpen} onClick={() => setColsOpen(!colsOpen)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18M15 3v18" /></svg>עמודות
                </button>
                {colsOpen && <ColPanel order={order} setOrder={setOrder} reset={() => setOrder(null)} />}
              </span>
            )}
          </div>
          {desk && <div className="sy-filters">{FILTERS.map((F) => <FSel key={F.k} F={F} f={f} m={m} set={set} />)}</div>}
          {!desk && nActive > 0 && (
            <div className="sy-active">
              {FILTERS.filter((F) => f[F.k]).map((F) => (
                <button key={F.k} type="button" className="sy-af" aria-label={`הסרת מסנן ${F.l}`} onClick={() => set({ [F.k]: "" })}>
                  {F.l}: {F.opts(m).find(([k]) => k === f[F.k])?.[1] || f[F.k]} <span aria-hidden="true">✕</span>
                </button>
              ))}
            </div>
          )}
          {!desk && sheet && (
            <div className="sy-sheet" role="dialog" aria-label="סינון">
              <div className="sy-sheet-head"><h2>סינון</h2><button type="button" className="mg-btn" aria-label="סגירה" onClick={() => setSheet(false)}>✕</button></div>
              {FILTERS.map((F) => <FSel key={F.k} F={F} f={f} m={m} set={set} />)}
              <div className="sy-sheet-foot">
                <button type="button" className="mg-btn" onClick={clear}>נקה</button>
                <button type="button" className="mg-btn mg-btn-cta" onClick={() => setSheet(false)}>להציג <bdi>{r.rows.length}</bdi></button>
              </div>
            </div>
          )}
          <p className="sy-count" role="status">מציג <b><bdi>{r.rows.length}</bdi></b> מתוך <b><bdi>{r.base.length}</bdi></b></p>
          {table ? (
            <div className="sy-tbl-wrap">
              <table className="sy-tbl">
                <thead>
                  <tr>
                    {cols.map((c, i) => (
                      <th key={c.k} className={i === 0 ? "sy-c0" : ""} aria-sort={f.sort === c.k ? (f.dir === "desc" ? "descending" : "ascending") : undefined}>
                        <button type="button" onClick={() => set(f.sort === c.k ? { dir: f.dir === "asc" ? "desc" : "asc" } : { sort: c.k, dir: "asc" })}>
                          {c.l}{f.sort === c.k ? (f.dir === "desc" ? " ▼" : " ▲") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((n) => (
                    <tr key={n.id}>
                      {cols.map((c, i) => (
                        <td key={c.k} className={i === 0 ? "sy-c0" : c.nowrap ? "sy-nowrap" : ""}>
                          {i === 0 ? <Link to={itemHref(n.id)}><Bidi t={c.v(n, m)} /></Link> : c.k === "state" ? <St k={nodeStatus(n).k} /> : c.k === "url" || c.k === "id" ? <bdi className="sy-ltr">{c.v(n, m)}</bdi> : <Val t={c.v(n, m)} />}
                          {i === 0 && <><Whose n={n} />{dup.has(title(n)) && <span className="sy-sub"><bdi className="sy-ltr">{n.name}</bdi></span>}</>}
                          {c.sub && c.sub(n, m) && <span className="sy-sub"><Bidi t={c.sub(n, m)} /></span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <ul className="mg-panel sy-rows sy-cards">
                {shown.length ? shown.map((n) => <Card key={n.id} n={n} m={m} dup={dup} />) : <li className="sy-row">לא נמצא כלום. אפשר לנקות מסננים.</li>}
              </ul>
              {r.rows.length > shown.length && (
                <div className="sy-more">
                  <button type="button" className="mg-btn" onClick={() => setAll(true)}>להציג את כל <bdi>{r.rows.length}</bdi></button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
