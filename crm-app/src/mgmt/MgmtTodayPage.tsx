import { useState } from "react";
import { Link } from "react-router-dom";
import { getLatestIncomeDate, getOpenTasks } from "../services/directus";
import { freshness } from "./format";
import { MgLoading, MgNotice } from "./MgState";
import { MgTaskRow } from "./MgTaskList";
import { groupTasks } from "./tasks";
import { useLoad } from "./useLoad";

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" });

/** Focus screen: what is waiting now. Late first, then today; the rest lives in Tasks. */
export function MgmtTodayPage() {
  const tasks = useLoad(() => getOpenTasks(), []);
  const income = useLoad(() => getLatestIncomeDate(), []);

  // Tasks ticked on this screen: they stay visible with an undo, but stop counting.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  function onDone(id: string, done: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (done) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const rows = tasks.data?.rows ?? [];
  const groups = tasks.data ? groupTasks(rows) : [];
  const urgent = groups.filter((g) => g.bucket === "overdue" || g.bucket === "today");
  const urgentCount = urgent.reduce((n, g) => n + g.tasks.length, 0);
  const waiting = urgent.reduce((n, g) => n + g.tasks.filter((t) => !ticked.has(t.id)).length, 0);
  // Tasks come soonest first, so when every loaded row is urgent there may be more urgent ones not loaded.
  const partial = !!tasks.data && tasks.data.total > rows.length && urgentCount === rows.length;
  const later = tasks.data ? tasks.data.total - urgentCount : 0;

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>היום</h1>
          <p className="mg-sub">
            {DATE_FMT.format(new Date())}
            {tasks.data && ` · ${waiting === 0 ? "אין משימות שמחכות" : waiting === 1 ? "משימה אחת מחכה" : `${partial ? "לפחות " : ""}${waiting} משימות מחכות`}`}
          </p>
        </div>
      </div>

      {tasks.error ? (
        <section className="mg-panel" aria-label="משימות">
          <div className="mg-panel-head">
            <h2>משימות</h2>
          </div>
          <MgNotice error={tasks.error} onRetry={tasks.reload} />
        </section>
      ) : !tasks.data ? (
        <section className="mg-panel">
          <MgLoading />
        </section>
      ) : (
        <>
          {urgent.length === 0 && (
            <section className="mg-panel">
              <MgNotice empty="אין משימות באיחור ואין משימות להיום." />
            </section>
          )}
          {urgent.map((g) => (
            <section className="mg-panel" key={g.bucket} aria-label={g.bucket === "overdue" ? "משימות באיחור" : "משימות להיום"}>
              <div className="mg-panel-head">
                <h2>{g.bucket === "overdue" ? "משימות באיחור" : "משימות להיום"}</h2>
                <span className="mg-count">{g.tasks.filter((t) => !ticked.has(t.id)).length}</span>
              </div>
              {g.tasks.map((t) => (
                <MgTaskRow key={t.id} task={t} bucket={g.bucket} onDone={onDone} />
              ))}
            </section>
          ))}
          <p style={{ marginBlockEnd: 16 }}>
            <Link className="mg-link-act" to="/m/tasks">
              {partial ? "לכל המשימות (יש עוד שלא מוצגות כאן)" : later > 0 ? `לכל המשימות (עוד ${later} בהמשך)` : "לכל המשימות"}
            </Link>
          </p>
        </>
      )}

      <section className="mg-panel" aria-label="מצב נתוני התרומות">
        <div className="mg-panel-head">
          <h2>נתוני תרומות</h2>
        </div>
        {income.error ? (
          <MgNotice error={income.error} onRetry={income.reload} />
        ) : !income.loaded ? (
          <MgLoading />
        ) : null}
        {!income.error && income.loaded && (
          <>
            {(() => {
              const fresh = freshness(income.data);
              return <p className={fresh.stale ? "mg-stale" : "mg-plain"}>{fresh.label}</p>;
            })()}
            <div className="mg-panel-foot">
              <Link className="mg-link-act" to="/m/donors">
                לתורמים ותרומות
              </Link>
            </div>
          </>
        )}
      </section>
    </>
  );
}
