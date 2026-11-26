import { useMemo } from "react";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { freshness } from "../format";
import { getSystem, type SystemMap, type SystemNode } from "./systemApi";
import { buildModel, consequence, homeLists, nodeStatus, title, whose, W, type Model, type StatusK } from "./model";
import "./system.css";

export const St = ({ k }: { k: StatusK }) => <span className={`sy-st sy-st-${k}`}>{W[k]}</span>;

const Whose = ({ n }: { n: SystemNode }) => {
  const w = whose(n);
  if (w === "המערכת") return null;
  return <span className={["עדי", "הרב", "הילד", "הבעלים"].includes(w) ? "sy-tag sy-person" : "sy-tag"}> של {w === "לא ידוע" ? "מי: לא ידוע" : w}</span>;
};

function Row({ n, m }: { n: SystemNode; m: Model }) {
  const why = consequence(n, m);
  return (
    <li className="sy-row">
      <span className="sy-t">
        <St k={nodeStatus(n).k} /> {title(n)}
        <Whose n={n} />
      </span>
      {why && <span className="sy-s">{why}</span>}
    </li>
  );
}

export function MgmtSystemPage() {
  const map = useLoad<SystemMap>(() => getSystem("map"), []);
  const m = useMemo(() => (map.data ? buildModel(map.data) : null), [map.data]);
  const h = useMemo(() => (m ? homeLists(m) : null), [m]);
  const fresh = freshness(map.data?._meta?.generated_at ?? null);

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>מערכת</h1>
          {map.data && (
            <p className={fresh.stale ? "mg-sub mg-stale" : "mg-sub"} role="status">
              {fresh.label}
            </p>
          )}
        </div>
      </div>
      {!map.loaded && map.error == null && <MgLoading />}
      {map.error != null && (
        <section className="mg-panel">
          <MgNotice error={map.error} onRetry={map.reload} />
        </section>
      )}
      {m && h && (
        <div className="sy-home">
          <div>
            <h2 className="sy-sec">
              מה מופרע <span className="sy-n"><bdi>{h.probs.length}</bdi></span>
            </h2>
            <ul className="mg-panel sy-rows" aria-label="מה מופרע">
              {h.probs.length ? h.probs.map((n) => <Row key={n.id} n={n} m={m} />) : <li className="sy-row">אין כרגע דבר שלא עובד.</li>}
            </ul>
            {h.parked.length > 0 && (
              <details className="mg-panel sy-fold">
                <summary>
                  לא רצים, ומחכים לניקוי או להחלטה <span className="sy-n"><bdi>{h.parked.length}</bdi></span>
                </summary>
                <ul className="sy-rows">{h.parked.map((n) => <Row key={n.id} n={n} m={m} />)}</ul>
              </details>
            )}
          </div>
          <div>
            <h2 className="sy-sec">מה לא נבדק</h2>
            <ul className="mg-panel sy-rows">
              <li className="sy-row">
                <span className="sy-t"><bdi>{h.unk}</bdi> דברים במצב „לא ידוע”</span>
                <span className="sy-s">אין בדיקה שמודדת אותם. זו לא תקלה, אבל גם לא ידוע שהם עובדים.</span>
              </li>
              <li className="sy-row">
                <span className="sy-t"><bdi>{h.offAuto}</bdi> משימות אוטומטיות כבויות</span>
                <span className="sy-s">{h.offNeeded ? `${h.offNeeded} מהן עדיין מסומנות כנדרשות לדבר פעיל.` : "אף דבר פעיל לא תלוי בהן."}</span>
              </li>
            </ul>
            <details className="mg-panel sy-fold">
              <summary>
                <bdi>{h.groups.length}</bdi> תחומים: <bdi>{h.groups.length - h.badGroups}</bdi> עובדים{h.badGroups ? <>, <bdi>{h.badGroups}</bdi> צריכים טיפול</> : null}
              </summary>
              <p className="sy-s">תחום נחשב עובד כשאף חלק נחוץ בו לא נכשל בסריקה האחרונה. „לא ידוע” לא נספר כתקלה.</p>
              <ul className="sy-rows">
                {h.groups.map(({ g, s }) => (
                  <li key={g.id} className="sy-row">
                    <span className="sy-t"><St k={s.k} /> {g.name_he}</span>
                    <span className="sy-s">{s.k === "ok" ? g.purpose_he : s.p.map((n) => title(n)).join("; ")}</span>
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
