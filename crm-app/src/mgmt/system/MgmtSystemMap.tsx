import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { getSystem, type SystemMap, type SystemNode } from "./systemApi";
import { buildModel, consequence, nodeStatus, title, type Model, type StatusK } from "./model";
import { KSHORT } from "./inventory";
import { buildServices, downstream, OC, OUTCOMES, outcomeStatus, outcomesOf, SV, SVC, svcStatus, type Services } from "./services";
import { itemHref, SystemHead } from "./SystemHead";
import { Bidi, St, Whose } from "./MgmtSystemPage";
import { AccessView, SecView, type Permissions, type Security } from "./MapAccessSec";
import { Atlas, LAYERS } from "./MapAtlas";
import { FullMap } from "./MapFull";
import "./system.css";

// The map tab: the drawn atlas from above (default), and the list form (?det=1 or ?o= without a layer):
// the four outcomes -> the chain of services under one -> one service. `?fs=1` opens the atlas in full screen.
const SO: Record<StatusK, number> = { down: 0, care: 1, unk: 2, ok: 3, maint: 3, priv: 4, off: 5 };
const pStat = (n: SystemNode, m: Model) => `${title(n)}: ${consequence(n, m) || "לא עובד"}`;
const mapHref = (o?: string | null, s?: string | null) => `/m/system/map${o || s ? `?${[o && `o=${o}`, s && `s=${s}`].filter(Boolean).join("&")}` : ""}`;

function members(x: Services, id: string): SystemNode[] {
  const s = SV[id];
  const g = s.g && x.m.groups.find((gr) => gr.id === s.g);
  const ids = g ? (g.node_ids || g.component_ids || []) : [...x.sets[id]];
  return ids.map((i) => x.m.N[i]).filter(Boolean);
}

function Outcomes({ x, m }: { x: Services; m: Model }) {
  return (
    <>
      <p className="sy-s sy-lede">ארבע התוצאות שהמערכת קיימת בשבילן. כל אחת נשענת על כמה שירותים, וחלק מהשירותים משותפים.</p>
      <ul className="mg-panel sy-rows" aria-label="התוצאות">
        {OUTCOMES.map((o) => {
          const s = outcomeStatus(x, o);
          return (
            <li key={o.id} className="sy-row">
              <Link className="sy-link sy-go" to={mapHref(o.id)}>
                <span className="sy-t"><St k={s.k} /> {o.t}</span>
                <span className="sy-s"><Bidi t={s.k === "ok" ? o.ok : `${o.ok}; ${s.probs.map((n) => pStat(n, m)).join("; ")}`} /></span>
                <span className="sy-u"><bdi>{SVC.filter((v) => v.o === o.id).length}</bdi> שירותים{s.unvL.length ? ` · ${s.unvL.length} קשרים שעוד לא אימתנו` : ""}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Chain({ x, oid, sel }: { x: Services; oid: string; sel: string | null }) {
  const ss = SVC.filter((s) => s.o === oid);
  const lk = (a: string, b: string) => x.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  return (
    <ol className="sy-chain" aria-label={`השירותים של ${OC[oid].t}`}>
      {ss.map((s, i) => {
        const l = i ? lk(ss[i - 1].id, s.id) : undefined;
        const extra = x.links.filter((k) => (k.a === s.id || k.b === s.id) && k !== l && !(ss[i + 1] && lk(ss[i + 1].id, s.id) === k));
        return (
          <li key={s.id}>
            {l && (
              <span className={l.ok ? "sy-vlink" : "sy-vlink sy-unv"}>
                {SV[l.a].t} {l.l} {SV[l.b].t}{l.ok ? "" : " · עוד לא אימתנו"} <span aria-hidden="true">{l.a === s.id ? "▲" : "▼"}</span>
              </span>
            )}
            <Link className={`sy-vnode${s.ext ? " sy-ext" : ""}${sel === s.id ? " sy-sel" : ""}`} to={mapHref(oid, s.id)} aria-current={sel === s.id ? "true" : undefined}>
              <span className="sy-t">{s.t} <St k={svcStatus(x, s).k as StatusK} /></span>
              <span className="sy-s">{s.s}</span>
              {extra.length > 0 && <span className="sy-u">גם: {extra.map((k) => `${SV[k.a].t} ${k.l} ${SV[k.b].t}${k.ok ? "" : " (עוד לא אימתנו)"}`).join(" · ")}</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ x, m, id, o }: { x: Services; m: Model; id: string; o: string | null }) {
  const s = SV[id], z = svcStatus(x, s), ds = downstream(x, id), outs = outcomesOf(x, id);
  const near = x.links.filter((l) => l.a === id || l.b === id);
  const imp = z.k === "ok"
    ? ds.length ? `אם הוא ייפסק, ייפגעו: ${ds.map((y) => y.t).join(", ")}. התוצאה: ${outs.map((y) => y.t).join(", ")}.` : `משרת את: ${outs.map((y) => y.t).join(", ")}.`
    : z.k === "unk" ? `לא נבדק מכאן. אם הוא לא עובד, ייפגעו: ${(ds.length ? ds : [s]).map((y) => y.t).join(", ")}.`
    : `${z.p.map((n) => pStat(n, m)).join("; ")}. תלויים בו: ${ds.map((y) => y.t).join(", ") || "אף שירות במפה"}.`;
  const ns = members(x, id).sort((a, b) => SO[nodeStatus(a).k] - SO[nodeStatus(b).k]);
  return (
    <>
      <section className="mg-panel sy-focus" aria-label={s.t}>
        <h2 className="sy-sec">{s.t} <St k={z.k as StatusK} /></h2>
        <p className="sy-s">{s.s}</p>
        <p><Bidi t={imp} /></p>
      </section>
      <h2 className="sy-sec">מחובר אל <span className="sy-n"><bdi>{near.length}</bdi></span></h2>
      <ul className="mg-panel sy-rows">
        {near.map((l) => {
          const other = SV[l.a === id ? l.b : l.a];
          return (
            <li key={`${l.a}-${l.b}`} className="sy-row">
              <span className="sy-t"><Link to={mapHref(o, other.id)}>{other.t}</Link> <St k={svcStatus(x, other).k as StatusK} /></span>
              <span className={l.ok ? "sy-s" : "sy-s sy-unv"}>{l.a === id ? `${s.t} ${l.l}…` : `…${l.l} ${s.t}`}{l.ok ? " · נמצא בנתונים" : " · עוד לא אימתנו את הקשר הזה"}</span>
            </li>
          );
        })}
      </ul>
      <h2 className="sy-sec">ממה הוא בנוי <span className="sy-n"><bdi>{ns.length}</bdi></span>{s.g && <Link className="sy-end" to={`/m/system/all?g=${encodeURIComponent(s.g)}`}>כל התחום</Link>}</h2>
      <ul className="mg-panel sy-rows">
        {ns.slice(0, 12).map((n) => (
          <li key={n.id} className="sy-row">
            <span className="sy-t"><Link to={itemHref(n.id)}><Bidi t={title(n)} /></Link><Whose n={n} /> <St k={nodeStatus(n).k} /></span>
            <span className="sy-s">{KSHORT[n.kind] || n.kind}{consequence(n, m) && <> · <Bidi t={consequence(n, m)} /></>}</span>
          </li>
        ))}
        {ns.length > 12 && s.g && <li className="sy-row"><Link to={`/m/system/all?g=${encodeURIComponent(s.g)}`}>ועוד <bdi>{ns.length - 12}</bdi></Link></li>}
        {!ns.length && <li className="sy-row sy-unk">לא נמצא ברשומות של המפה</li>}
      </ul>
    </>
  );
}

function Infra({ m }: { m: Model }) {
  const NET: Record<string, string> = { "net:cloudflared": "מנהרה: חיבור יוצא בלבד", "net:caddy": "מנתב כל כתובת לשירות שלה", "net:tailscale": "רשת פרטית בין המכשירים שלך לשרת" };
  const rows: { id: string; t: string; s: string; k: StatusK }[] = [
    ...Object.keys(NET).filter((i) => m.N[i]).map((i) => ({ id: i, t: title(m.N[i]), s: `${NET[i]} · משמש את כל האתרים`, k: nodeStatus(m.N[i]).k })),
    ...(m.N["hw:mn-home"] ? [{ id: "hw:mn-home", t: "המחשב mn-home", s: `כל ${SVC.filter((v) => !v.ext).length} השירותים שאצלנו במפה רצים עליו`, k: nodeStatus(m.N["hw:mn-home"]).k }] : []),
    ...(m.N["hw:gpu"] ? [{ id: "hw:gpu", t: "כרטיס המסך", s: "התמלול רץ עליו", k: nodeStatus(m.N["hw:gpu"]).k }] : []),
  ];
  return (
    <>
      <h2 className="sy-sec">על מה הכול רץ <span className="sy-n">שכבת החומרה והרשת</span></h2>
      <ul className="mg-panel sy-rows" aria-label="על מה הכול רץ">
        {rows.map((r) => (
          <li key={r.id} className="sy-row">
            <Link className="sy-link" to={itemHref(r.id)}>
              <span className="sy-t"><Bidi t={r.t} /> <St k={r.k} /></span>
              <span className="sy-s">{r.s}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Segments({ v }: { v: string }) {
  const a = (k: string, l: string) => (
    <Link to={k === "svc" ? "/m/system/map" : `/m/system/map?v=${k}`} aria-current={v === k ? "true" : undefined}>{l}</Link>
  );
  return <nav className="sy-seg sy-full" aria-label="תצוגות המפה">{a("svc", "שירותים")}{a("access", "גישה והרשאות")}{a("sec", "שרת ואבטחה")}</nav>;
}

function Extra({ v, m, open }: { v: "access" | "sec"; m: Model; open: string | null }) {
  const d = useLoad<Permissions | Security>(() => getSystem<Permissions | Security>(v === "access" ? "permissions" : "security"), [v]);
  if (d.error != null) return <section className="mg-panel"><MgNotice error={d.error} onRetry={d.reload} /></section>;
  if (!d.data) return <MgLoading />;
  return v === "access" ? <AccessView perm={d.data as Permissions} m={m} /> : <SecView sec={d.data as Security} m={m} open={open} />;
}

export function MgmtSystemMap() {
  const map = useLoad<SystemMap>(() => getSystem("map"), []);
  const m = useMemo(() => (map.data ? buildModel(map.data) : null), [map.data]);
  const x = useMemo(() => (m && map.data ? buildServices(m, map.data.edges) : null), [m, map.data]);
  const [sp] = useSearchParams();
  const o = OC[sp.get("o") || ""] ? sp.get("o") : null;
  const sel = SV[sp.get("s") || ""] ? sp.get("s") : null;
  const oo = o || (sel ? SV[sel].o : null);
  const v = sp.get("v") === "access" ? "access" : sp.get("v") === "sec" ? "sec" : "svc";
  const ly = LAYERS.some(([k]) => k === sp.get("ly")) ? sp.get("ly")! : null;
  const atlas = !sp.get("det") && !sel && !(o && !ly);

  return (
    <>
      <SystemHead gen={map.data ? (map.data._meta?.generated_at ?? null) : undefined} />
      {!map.loaded && map.error == null && <MgLoading />}
      {map.error != null && (
        <section className="mg-panel">
          <MgNotice error={map.error} onRetry={map.reload} />
        </section>
      )}
      {m && x && <Segments v={v} />}
      {m && x && v !== "svc" && <Extra v={v} m={m} open={sp.get("f")} />}
      {m && x && map.data && v === "svc" && atlas && (
        sp.get("fs")
          ? <FullMap m={m} x={x} edges={map.data.edges} p={{ ly: ly || "struct", o: ly === "routes" ? o : null, z: null, d: null, pw: ly === "whose" ? sp.get("pw") : null }} />
          : <Atlas m={m} x={x} edges={map.data.edges} p={{ ly: ly || "struct", o, z: sp.get("z"), d: sp.get("d"), pw: sp.get("pw") }} />
      )}
      {m && x && v === "svc" && !atlas && (
        <div className={oo ? "sy-home" : undefined}>
          {oo ? (
            <>
              <div>
                <Link className="sy-backlink" to="/m/system/map?det=1"><span aria-hidden="true">→</span> כל התוצאות</Link>
                <h2 className="sy-sec sy-first">{OC[oo].t} <St k={outcomeStatus(x, OC[oo]).k} /></h2>
                <p className="sy-s">לחיצה על שירות מראה למה הוא מחובר ומה תלוי בו.</p>
                <div className="mg-panel sy-chainbox"><Chain x={x} oid={oo} sel={sel} /></div>
              </div>
              <div>{sel ? <Summary x={x} m={m} id={sel} o={oo} /> : <Infra m={m} />}</div>
            </>
          ) : (
            <>
              <Link className="sy-backlink" to={mapHref()}><span aria-hidden="true">→</span> המפה מלמעלה</Link>
              <Outcomes x={x} m={m} />
              <Infra m={m} />
            </>
          )}
        </div>
      )}
    </>
  );
}
