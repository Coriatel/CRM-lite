import { useMemo, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { getSystem, type SystemMap, type SystemNode } from "./systemApi";
import { buildModel, consequence, isAuto, lastGood, nodeStatus, title, when, whose, type Model } from "./model";
import { builtBy, checkedBy, lastRunTxt, maintBy, purpose, schedTxt, verdTxt } from "./inventory";
import { buildServices, downstream, outcomesOf, svcOf } from "./services";
import { itemHref, SystemHead } from "./SystemHead";
import { Bidi, St, Val, Whose } from "./MgmtSystemPage";
import "./system.css";

// One record of the map, in the eight sections of the approved mockup v4d. Permissions (section 7) come with S10.
const KIND: Record<string, string> = { site: "אתר", container: "קונטיינר (תוכנה ארוזה שרצה בשרת)", timer: "משימה מתוזמנת", "user-timer": "משימה מתוזמנת", service: "שירות רקע", workflow: "תהליך אוטומטי", script: "סקריפט", external: "שירות שאנחנו משתמשים בו", machine: "המחשב", disk: "דיסק", gpu: "כרטיס מסך", "network-entry": "כניסת רשת", "person-env": "סביבה אישית", "env-service": "שירות בסביבה אישית" };
const ENTRY: Record<string, string> = { cloudflare: "מבחוץ, דרך Cloudflare", tailnet: "רק מהרשת הפרטית", caddy: "דרך שרת האינטרנט הפנימי", none: "אין לו כתובת" };
const REG: Record<string, string> = { yes: "רשום", no: "לא נמצא ברישום", "n/a": "לא רלוונטי" };
const CONF: Record<string, string> = { high: "גבוה", medium: "בינוני", low: "נמוך" };
const VISION: Record<string, string> = { torah: "הפצת פנימיות התורה", income: "פרנסה", operations: "תפעול", "owner-control": "שליטה של הבעלים" };

const o = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : undefined);
const s = (v: unknown) => (v == null ? "" : String(v));
const Unk = ({ t = "לא ידוע" }: { t?: string }) => <span className="sy-unk">{t}</span>;
const Ev = ({ t }: { t: string }) => (t ? <span className="sy-ev"><Bidi t={t} /></span> : null);

function contrib(n: SystemNode): string[] {
  let v: unknown = n.contributes_to;
  if (o(v) && Array.isArray(o(v)!.values)) v = o(v)!.values;
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => (typeof x === "string" ? VISION[x] || x : s(o(x)?.label_he || o(x)?.id))).filter(Boolean);
}

function Names({ a, none = "אין" }: { a: SystemNode[]; none?: string }) {
  if (!a.length) return <Unk t={none} />;
  return (
    <>
      {a.slice(0, 8).map((x, i) => <span key={x.id}>{i > 0 && " · "}<Link to={itemHref(x.id)}><Bidi t={title(x)} /></Link></span>)}
      {a.length > 8 && ` ועוד ${a.length - 8}`}
    </>
  );
}

const Sec = ({ i, t, children }: { i: number; t: string; children: ReactNode }) => (
  <section>
    <h2 className="sy-sec"><span className="sy-n">{i}</span> {t}</h2>
    <dl className="mg-panel sy-kv sy-ikv">{children}</dl>
  </section>
);
const Kv = ({ k, children }: { k: string; children: ReactNode }) => (
  <div><dt>{k}</dt><dd>{children}</dd></div>
);

function Body({ n, m, map }: { n: SystemNode; m: Model; map: SystemMap }) {
  const x = useMemo(() => buildServices(m, map.edges), [m, map.edges]);
  const uniq = (a: (SystemNode | undefined)[]) => [...new Map(a.filter((y): y is SystemNode => !!y).map((y) => [y.id, y])).values()];
  const outs = uniq(map.edges.filter((e) => e.from === n.id).map((e) => m.N[e.to]));
  const ins = uniq(map.edges.filter((e) => e.to === n.id).map((e) => m.N[e.from]));
  const sv = svcOf(x, n), ds = sv.length ? downstream(x, sv[0].id) : [];
  const job = s(o(n.does_its_job)?.value);
  const failed = n.state === "failing" || /נכשל/.test(s(n.last_result));
  const cb = o(n.contributes_to), presumed = !!cb && /כלל|rule/.test(s(cb.basis));
  const host = o(n.hosting), reg = o(n.registered), made = o(n.made_at);
  const g = m.groups.find((gr) => gr.id === n.group);
  const entries = outs.filter((y) => y.id.startsWith("net:")), disks = outs.filter((y) => y.kind === "disk");
  const madeAt = made ? s(made.value) : s(n.made_at);
  const ownerBasis = o(n.owner_label_basis);
  const lead = purpose(n) || s(o(n.serves)?.text_he);
  const sid = s(n.short_id || n.id);
  return (
    <>
      <div className="sy-ihead">
        <h1><Bidi t={title(n)} />{n.purpose_source === "guess" && <span className="sy-s"> (תיאור משוער)</span>}</h1>
        {lead && <p className="sy-lead"><Bidi t={lead} /></p>}
        <p className="sy-s"><St k={nodeStatus(n).k} />{consequence(n, m) && <> · <Bidi t={consequence(n, m)} /></>}<Whose n={n} /> · <span className="sy-nw">מזהה <bdi className="sy-ltr">{sid}</bdi></span></p>
      </div>
      <div className="sy-xcut">
        <Sec i={1} t="מה זה עושה ולמי זה עוזר">
          <Kv k="מה זה עושה"><Bidi t={s(n.why_he) || title(n)} /></Kv>
          <Kv k="למי זה עוזר">{s(o(n.serves)?.text_he) ? <Bidi t={s(o(n.serves)?.text_he)} /> : <Unk />}</Kv>
          <Kv k="תורם ל">{contrib(n).length ? <>{contrib(n).join(" · ")}<Ev t={presumed ? "משוער לפי התחום, לא מתועד לרכיב עצמו" : s(cb?.basis)} /></> : <Unk />}</Kv>
          <Kv k="מה זה">{KIND[n.kind] || n.kind}</Kv>
        </Sec>
        <Sec i={2} t="צריך אותו?">
          <Kv k="החלטה">{verdTxt(n) || <Unk />}<Ev t={s(n._owner_note || n.verdict_reason_he)} /></Kv>
          <Kv k="מה ייפסק בלעדיו">
            {ds.length ? <>{ds.map((y) => y.t).join(", ")}<Ev t={`דרך השירות „${sv[0].t}” במפה`} /></> : ins.length ? <><Names a={ins} /><Ev t="אלה מצביעים עליו בנתונים" /></> : <Unk t="שום דבר שידוע לנו" />}
          </Kv>
          <Kv k="תלויים בו"><Names a={ins} none="לא נמצא" /></Kv>
        </Sec>
        <Sec i={3} t="מצב עכשיו">
          <Kv k="מצב"><St k={nodeStatus(n).k} /><Ev t={consequence(n, m)} /></Kv>
          <Kv k="עושה את העבודה?">{job === "yes" ? <span className="sy-yes">כן</span> : job === "no" ? <span className="sy-no">לא</span> : <Unk />}{failed && <Ev t="הריצה האחרונה נכשלה" />}</Kv>
          <Kv k="נסרק לאחרונה"><Val t={when(s(n.last_checked) || null, m.gen)} /><Ev t={checkedBy(n.checked_by) || "שום בדיקה"} /></Kv>
          <Kv k="עבר בהצלחה לאחרונה"><Val t={when(lastGood(n), m.gen)} /></Kv>
          {!!n.failing_since && <Kv k="נכשל מאז"><span className="sy-no">{when(s(n.failing_since), m.gen)}</span></Kv>}
          <Kv k="פעיל לאחרונה"><Val t={when(s(n.last_active) || null, m.gen)} /></Kv>
        </Sec>
        <Sec i={4} t="מקומו במסלול השירות">
          <Kv k="שירות במפה">{sv.length ? sv.map((y, i) => <span key={y.id}>{i > 0 && " · "}<Link to={`/m/system/map?o=${y.o}&s=${y.id}`}>{y.t}</Link></span>) : <Unk t="לא חלק מהמפה" />}</Kv>
          <Kv k="תוצאה">{sv.length ? outcomesOf(x, sv[0].id).map((y) => y.t).join(", ") : <Unk />}</Kv>
          <Kv k="תחום">{g ? <Link to={`/m/system/all?g=${encodeURIComponent(g.id)}`}>{g.name_he}</Link> : <Unk />}</Kv>
          <Kv k="משתמש ב"><Names a={outs.filter((y) => !y.id.startsWith("hw:") && !y.id.startsWith("net:"))} /></Kv>
        </Sec>
        <Sec i={5} t="של מי">
          <Kv k="של מי">{whose(n)}{ownerBasis?.confidence === "low" && <Ev t={`ביטחון נמוך: ${s(ownerBasis.basis)}`} />}</Kv>
          <Kv k="נבנה על ידי">{builtBy(n) ? <Bidi t={builtBy(n)} /> : <><Unk /><Ev t={s(o(n.made_by)?.reason)} /></>}</Kv>
          <Kv k="מתוחזק על ידי">{maintBy(n, m.lanes) ? <Bidi t={maintBy(n, m.lanes)} /> : <Unk />}</Kv>
        </Sec>
        <Sec i={6} t="רץ אוטומטית ואיפה בשרת">
          <Kv k="מתי רץ"><Bidi t={schedTxt(n)} /></Kv>
          {(isAuto(n) || !!n.last_run_at) && <Kv k="ריצה אחרונה"><span className={failed ? "sy-no" : undefined}><Val t={lastRunTxt(n, m)} /></span></Kv>}
          {!!n.next_run_at && <Kv k="הריצה הבאה">{when(s(n.next_run_at), m.gen)}</Kv>}
          <Kv k="מחשב">{s(host?.machine) ? <bdi>{s(host?.machine)}</bdi> : <Unk />}</Kv>
          <Kv k="איך מגיעים אליו">{entries.length ? <Names a={entries} /> : ENTRY[s(host?.entry)] || <Unk />}</Kv>
          {disks.length > 0 && <Kv k="דיסק"><Names a={disks} /></Kv>}
        </Sec>
        <Sec i={8} t="מזהה, תאריכים ומקורות">
          <Kv k="מזהה"><bdi className="sy-ltr">{sid}</bdi></Kv>
          <Kv k="שם טכני"><bdi className="sy-ltr">{n.name}</bdi></Kv>
          <Kv k="מתי נוצר">{madeAt ? <>{when(madeAt, m.gen, true)}{made?.strength === "weak" && " (משוער)"}</> : <Unk />}{made?.strength === "weak" && <Ev t={s(made.reason)} />}</Kv>
          <Kv k="ברישום הנכסים">{REG[s(reg?.estate)] || <Unk />}</Kv>
          <Kv k="בבדיקות הבריאות">{REG[s(reg?.health)] || <Unk />}</Kv>
          <Kv k="ביטחון בנתון">{CONF[s(n.confidence)] || <Unk />}</Kv>
          <Kv k="מקור">{n.source_of_truth ? <bdi className="sy-ltr">{s(n.source_of_truth)}</bdi> : <Unk />}</Kv>
        </Sec>
      </div>
    </>
  );
}

export function MgmtSystemItem() {
  const id = useParams()["*"] || "";
  const nav = useNavigate();
  const map = useLoad<SystemMap>(() => getSystem("map"), []);
  const m = useMemo(() => (map.data ? buildModel(map.data) : null), [map.data]);
  const n = m?.N[id];
  return (
    <>
      <SystemHead gen={map.data ? (map.data._meta?.generated_at ?? null) : undefined} />
      <button type="button" className="sy-back" onClick={() => nav(-1)}><span aria-hidden="true">→</span> חזרה</button>
      {!map.loaded && map.error == null && <MgLoading />}
      {map.error != null && (
        <section className="mg-panel">
          <MgNotice error={map.error} onRetry={map.reload} />
        </section>
      )}
      {m && map.data && (n ? <Body n={n} m={m} map={map.data} /> : <p>לא נמצא בשם <bdi className="sy-ltr">{id}</bdi>.</p>)}
    </>
  );
}
