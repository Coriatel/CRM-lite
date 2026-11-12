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

  const groups = tasks.data ? groupTasks(tasks.data) : [];
  const urgent = groups.filter((g) => g.bucket === "overdue" || g.bucket === "today");
  const waiting = urgent.reduce((n, g) => n + g.tasks.length, 0);
  const later = tasks.data ? tasks.data.length - waiting : 0;

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>היום</h1>
          <p className="mg-sub">
            {DATE_FMT.format(new Date())}
            {tasks.data && ` · ${waiting === 0 ? "אין משימות שמחכות" : waiting === 1 ? "משימה אחת מחכה" : `${waiting} משימות מחכות`}`}
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
                <span className="mg-count">{g.tasks.length}</span>
              </div>
              {g.tasks.map((t) => (
                <MgTaskRow key={t.id} task={t} bucket={g.bucket} />
              ))}
            </section>
          ))}
          <p style={{ marginBlockEnd: 16 }}>
            <Link className="mg-link-act" to="/m/tasks">
              {later > 0 ? `לכל המשימות (עוד ${later} בהמשך)` : "לכל המשימות"}
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
