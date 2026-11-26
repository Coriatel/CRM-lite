import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { getSystem, type SystemMap } from "./systemApi";
import { buildModel } from "./model";
import { allQs, openQs, qConsequence, qLeft } from "./questions";
import { itemHref, SystemHead } from "./SystemHead";
import { Bidi } from "./MgmtSystemPage";
import "./system.css";

// "מחכה להחלטה שלך" (mockup v4d decide): only what is still open, written by consequence and the proposed choice.
// Read-only: the owner answers in a conversation with Claude, nothing here changes the system.
export function MgmtSystemDecide() {
  const map = useLoad<SystemMap>(() => getSystem("map"), []);
  const m = useMemo(() => (map.data ? buildModel(map.data) : null), [map.data]);
  const all = allQs(map.data), qs = openQs(map.data);
  return (
    <>
      <SystemHead gen={map.data ? (map.data._meta?.generated_at ?? null) : undefined} nq={all ? qs.length : undefined} />
      {!map.loaded && map.error == null && <MgLoading />}
      {map.error != null && (
        <section className="mg-panel">
          <MgNotice error={map.error} onRetry={map.reload} />
        </section>
      )}
      {m && !all && <p className="mg-panel sy-collect">השאלות שמחכות לך עוד לא מתפרסמות במפה. הן יופיעו כאן בסריקה הבאה שתכלול אותן.</p>}
      {m && all && (
        <>
          <p className="sy-s sy-lede">
            <bdi>{qs.length}</bdi> החלטות פתוחות. ליד כל אחת: מה המצב, ומה אנחנו מציעים. שום דבר לא נמחק ולא נכבה בלי אישור שלך. עונים בשיחה עם Claude.
            {all.length > qs.length && <> <bdi>{all.length - qs.length}</bdi> שכבר הוכרעו לא מוצגות.</>}
          </p>
          {qs.length === 0 ? <p className="mg-panel sy-collect">אין החלטות פתוחות.</p> : (
            <ul className="mg-panel sy-rows" aria-label="החלטות פתוחות">
              {qs.map((q, i) => {
                const left = qLeft(q, m);
                const g = m.groups.find((x) => x.id === q.group);
                return (
                  <li key={`${q.n ?? i}-${q.text_he}`} className="sy-row sy-q">
                    <span className="sy-qa">{g?.name_he || q.group}{left.length > 1 && ` · ${left.length} דברים`}</span>
                    <span className="sy-qt"><Bidi t={qConsequence(q, m)} /></span>
                    {q.default_he && <span className="sy-qd">ההצעה: <b><Bidi t={q.default_he} /></b></span>}
                    <details className="sy-qx">
                      <summary>השאלה המלאה והשמות הטכניים</summary>
                      <div>
                        <span><Bidi t={q.text_he} /></span>
                        {q.reason_he && <span><Bidi t={q.reason_he} /></span>}
                        {left.length > 0 && <ul>{left.slice(0, 24).map((n) => <li key={n.id}><Link to={itemHref(n.id)}><bdi className="sy-ltr">{n.name}</bdi></Link></li>)}</ul>}
                        {!!q.decided_today?.length && <span><bdi>{q.decided_today.length}</bdi> מתוך <bdi>{q.node_ids?.length ?? 0}</bdi> כבר הוכרעו היום.</span>}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
