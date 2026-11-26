import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { getSystem, type SystemMap, type SystemNode } from "./systemApi";
import { buildModel, consequence, isAuto, lastGood, nodeStatus, title, when, W, type Model, type StatusK } from "./model";
import { builtBy, COL, dupTitles, lastRunTxt, maintBy, matches, purpose, rowsFor, schedTxt, verdTxt, VIEWS, WHOSE, type Filter } from "./inventory";
import { itemHref, SystemHead } from "./SystemHead";
import { Bidi, St, Val, Whose } from "./MgmtSystemPage";
import "./system.css";

const LIMIT = 40;
const ST_OPTS: StatusK[] = ["ok", "down", "unk", "off", "priv"];

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
  const f: Filter = { view: sp.get("view") || "all", who: sp.get("who") || "", st: sp.get("st") || "", g: sp.get("g") || "", q: sp.get("q") || "", sort: sp.get("sort") || "", dir: sp.get("dir") === "desc" ? "desc" : "asc" };
  const set = (o: Partial<Filter>) => {
    const next = { ...f, ...o };
    setSp(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === "view" && v === "all") && !(k === "dir" && v === "asc"))), { replace: true });
    setAll(false);
  };
  const dup = useMemo(() => (m ? dupTitles(m) : new Set<string>()), [m]);
  const r = useMemo(() => (m ? rowsFor(m, f) : null), [m, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = VIEWS.find((v) => v.id === f.view) || VIEWS[0];
  const cols = view.d.map((k) => COL[k]);
  const table = desk || !cards;
  const shown = r ? (all || table ? r.rows : r.rows.slice(0, LIMIT)) : [];

  return (
    <>
      <SystemHead gen={map.data ? (map.data._meta?.generated_at ?? null) : undefined} />
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
              <span className="sy-seg" role="group" aria-label="תצוגה">
                <button type="button" aria-pressed={cards} onClick={() => setCards(true)}>כרטיסים</button>
                <button type="button" aria-pressed={!cards} onClick={() => setCards(false)}>טבלה</button>
              </span>
            )}
          </div>
          <div className="sy-filters">
            <label className="sy-fsel">
              מצב
              <select className={f.st ? "sy-set" : ""} value={f.st} onChange={(e) => set({ st: e.target.value })}>
                <option value="">כל המצבים</option>
                {ST_OPTS.map((k) => <option key={k} value={k}>{W[k]}</option>)}
              </select>
            </label>
            <label className="sy-fsel">
              תחום
              <select className={f.g ? "sy-set" : ""} value={f.g} onChange={(e) => set({ g: e.target.value })}>
                <option value="">כל התחומים</option>
                {m.groups.map((g) => <option key={g.id} value={g.id}>{g.name_he}</option>)}
              </select>
            </label>
            {(f.st || f.g || f.who || f.q) && <button type="button" className="mg-btn mg-btn-quiet" onClick={() => set({ st: "", g: "", who: "", q: "" })}>נקה מסננים</button>}
          </div>
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
                          {i === 0 ? <Link to={itemHref(n.id)}><Bidi t={c.v(n, m)} /></Link> : c.k === "state" ? <St k={nodeStatus(n).k} /> : c.k === "url" ? <bdi className="sy-ltr">{n.name}</bdi> : <Val t={c.v(n, m)} />}
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
