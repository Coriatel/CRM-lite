import { Fragment, useMemo } from "react";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { Link } from "react-router-dom";
import { itemHref, SystemHead } from "./SystemHead";
import { getSystem, type SystemMap, type SystemNode } from "./systemApi";
import { buildModel, consequence, homeLists, lastGood, nodeStatus, title, when, whose, W, type Model, type StatusK } from "./model";
import { buildServices, OUTCOMES, outcomeStatus, outcomesOf, svcOf, type Services } from "./services";
import "./system.css";

export const St = ({ k }: { k: StatusK }) => <span className={`sy-st sy-st-${k}`}>{W[k]}</span>;

// Hebrew that may carry Latin names or numbers: isolate every Latin/digit run so order and parentheses stay right.
const RUN = /([A-Za-z0-9/](?:[A-Za-z0-9.:/_\-@+%#=]*[A-Za-z0-9])?(?:[ ,]+[A-Za-z0-9/](?:[A-Za-z0-9.:/_\-@+%#=]*[A-Za-z0-9])?)*)/;
export const Bidi = ({ t }: { t: string }) => <>{String(t).split(RUN).map((p, i) => (i % 2 ? <bdi key={i}>{p}</bdi> : <Fragment key={i}>{p}</Fragment>))}</>;

interface Finding { id: string; severity: string; what_he: string; why_it_matters_he?: string; needs_owner?: boolean }
interface SecurityMap { generated_at?: string; findings: Finding[] }

export const Whose = ({ n }: { n: SystemNode }) => {
  const w = whose(n);
  if (w === "המערכת") return null;
  return <span className={["עדי", "הרב", "הילד", "הבעלים"].includes(w) ? "sy-tag sy-person" : "sy-tag"}> של {w === "לא ידוע" ? "מי: לא ידוע" : w}</span>;
};

function ProbRow({ n, m, x }: { n: SystemNode; m: Model; x: Services }) {
  const sv = svcOf(x, n);
  const since = n.failing_since ? ` · מאז ${when(n.failing_since as string, m.gen)}` : "";
  const group = m.groups.find((g) => g.id === n.group)?.name_he || "";
  return (
    <li className="sy-row">
      <Link className="sy-link" to={itemHref(n.id)}>
        <span className="sy-t"><St k={nodeStatus(n).k} /> <Bidi t={title(n)} /><Whose n={n} /></span>
        <span className="sy-s"><Bidi t={`${consequence(n, m)}${since} · עבר בהצלחה לאחרונה: ${when(lastGood(n), m.gen)}`} /></span>
        <span className="sy-s">{group}{sv.length ? ` · משפיע על: ${outcomesOf(x, sv[0].id).map((o) => o.t).join(", ")}` : " · לא משבש אף תוצאה במפה"}</span>
      </Link>
    </li>
  );
}

function ParkedRow({ n, m }: { n: SystemNode; m: Model }) {
  const d = (n.decided as { decision_he?: string } | undefined)?.decision_he;
  const group = m.groups.find((g) => g.id === n.group)?.name_he || "";
  return (
    <li className="sy-row">
      <Link className="sy-link" to={itemHref(n.id)}>
        <span className="sy-t"><St k={nodeStatus(n).k} /> <Bidi t={title(n)} /><Whose n={n} /></span>
        <span className="sy-s">{d ? `הוחלט: ${d}` : consequence(n, m) || "לא רץ"} · {group} · לא משבש אף תוצאה</span>
      </Link>
    </li>
  );
}

function Security({ sec, m }: { sec: ReturnType<typeof useLoad<SecurityMap>>; m: Model }) {
  if (sec.error != null) return <p className="sy-note">ממצאי האבטחה לא נטענו עכשיו. שאר המסך מעודכן.</p>;
  if (!sec.data) return null;
  const highs = sec.data.findings.filter((f) => f.severity === "high");
  if (!highs.length) return null;
  return (
    <>
      <h2 className="sy-sec">ממצאי אבטחה דחופים <span className="sy-n"><bdi>{highs.length}</bdi></span></h2>
      <ul className="mg-panel sy-rows sy-alert" aria-label="ממצאי אבטחה דחופים">
        {highs.map((f) => (
          <li key={f.id} className="sy-row">
            <span className="sy-t"><span className="sy-sev">חומרה גבוהה</span>{f.needs_owner && <> · <span className="sy-needs">צריך אותך</span></>}</span>
            <span className="sy-t"><Bidi t={f.what_he} /></span>
            {f.why_it_matters_he && <span className="sy-s"><Bidi t={f.why_it_matters_he} /></span>}
          </li>
        ))}
      </ul>
      <p className="sy-s sy-after">נמדד {when(sec.data.generated_at, m.gen)}.</p>
    </>
  );
}

export function MgmtSystemPage() {
  const map = useLoad<SystemMap>(() => getSystem("map"), []);
  const sec = useLoad<SecurityMap>(() => getSystem<SecurityMap>("security"), []);
  const m = useMemo(() => (map.data ? buildModel(map.data) : null), [map.data]);
  const x = useMemo(() => (m && map.data ? buildServices(m, map.data.edges) : null), [m, map.data]);
  const h = useMemo(() => (m ? homeLists(m) : null), [m]);
  const unv = x ? x.links.filter((l) => !l.ok).length : 0;

  return (
    <>
      <SystemHead gen={map.data ? (map.data._meta?.generated_at ?? null) : undefined} />
      {!map.loaded && map.error == null && <MgLoading />}
      {map.error != null && (
        <section className="mg-panel">
          <MgNotice error={map.error} onRetry={map.reload} />
        </section>
      )}
      {m && h && x && (
        <div className="sy-home">
          <div>
            <h2 className="sy-sec sy-first">מה אפשר לעשות עכשיו</h2>
            <ul className="mg-panel sy-rows" aria-label="מה אפשר לעשות עכשיו">
              {OUTCOMES.map((o) => {
                const s = outcomeStatus(x, o);
                const un = [s.unkS.length ? `${s.unkS.map((v) => v.t).join(", ")} (שירותים חיצוניים)` : "", s.unvL.length ? (s.unvL.length === 1 ? "קשר אחד שעוד לא אימתנו" : `${s.unvL.length} קשרים שעוד לא אימתנו`) : ""].filter(Boolean);
                return (
                  <li key={o.id} className="sy-row">
                    <Link className="sy-link sy-go" to={`/m/system/map?o=${o.id}`}>
                      <span className="sy-t"><St k={s.k} /> {o.t}</span>
                      <span className="sy-s"><Bidi t={s.k === "ok" ? o.ok : `${o.ok}; ${s.probs.map((n) => `${title(n)}: ${consequence(n, m) || "לא עובד"}`).join("; ")}`} /></span>
                      {un.length > 0 && <span className="sy-u"><Bidi t={`לא נבדק: ${un.join(" · ")}`} /></span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Security sec={sec} m={m} />
          </div>
          <div>
            <h2 className="sy-sec">
              מה מופרע <span className="sy-n"><bdi>{h.probs.length}</bdi></span>
            </h2>
            <ul className="mg-panel sy-rows" aria-label="מה מופרע">
              {h.probs.length ? h.probs.map((n) => <ProbRow key={n.id} n={n} m={m} x={x} />) : <li className="sy-row">אין כרגע.</li>}
            </ul>
            {h.parked.length > 0 && (
              <details className="mg-panel sy-fold">
                <summary>
                  לא רצים, ומחכים לניקוי או להחלטה <span className="sy-n"><bdi>{h.parked.length}</bdi></span>
                </summary>
                <ul className="sy-rows">{h.parked.map((n) => <ParkedRow key={n.id} n={n} m={m} />)}</ul>
              </details>
            )}
            <h2 className="sy-sec">מה לא נבדק</h2>
            <ul className="mg-panel sy-rows">
              <li className="sy-row">
                <Link className="sy-link" to="/m/system/all?st=unk">
                  <span className="sy-t"><bdi>{h.unk}</bdi> דברים במצב „לא ידוע”</span>
                  <span className="sy-s">אין בדיקה שמודדת אותם. זו לא תקלה, אבל גם לא ידוע שהם עובדים.</span>
                </Link>
              </li>
              <li className="sy-row">
                <span className="sy-t"><bdi>{unv}</bdi> קשרים במפה שעוד לא אימתנו</span>
                <span className="sy-s">ידוע מהמוצר שהם קיימים, אבל עוד לא נמצאו בנתונים.</span>
              </li>
              <li className="sy-row">
                <Link className="sy-link" to="/m/system/all?view=auto&st=off">
                  <span className="sy-t"><bdi>{h.offAuto}</bdi> משימות אוטומטיות כבויות</span>
                  <span className="sy-s">
                    {h.offNeeded ? `${h.offNeeded} מהן עדיין מסומנות כנדרשות לדבר פעיל.` : "אף דבר פעיל לא תלוי בהן."} <bdi>{h.offOther}</bdi> דברים נוספים כבויים בכוונה.
                  </span>
                </Link>
              </li>
            </ul>
            <details className="mg-panel sy-fold sy-gap">
              <summary>
                <bdi>{h.groups.length}</bdi> תחומים: <bdi>{h.groups.length - h.badGroups}</bdi> עובדים{h.badGroups ? <>, <bdi>{h.badGroups}</bdi> צריכים טיפול</> : null}
              </summary>
              <p className="sy-s">תחום נחשב עובד כשאף חלק נחוץ בו לא נכשל בסריקה האחרונה. „לא ידוע” לא נספר כתקלה.</p>
              <ul className="sy-rows">
                {h.groups.map(({ g, s }) => (
                  <li key={g.id} className="sy-row">
                    <Link className="sy-link" to={`/m/system/all?g=${encodeURIComponent(g.id)}`}>
                      <span className="sy-t"><St k={s.k} /> {g.name_he}</span>
                      <span className="sy-s"><Bidi t={s.k === "ok" ? g.purpose_he || "" : s.p.map((n) => `${title(n)}: ${consequence(n, m) || "לא עובד"}`).join("; ")} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}
    </>
  );
}
