import { useEffect, useState } from "react";
import { getOpenTasks, MG_TASK_PAGE, type MgTask } from "../services/directus";
import { taskBucket } from "./tasks";
import { isForbidden } from "./errors";
import { MgLoading, MgNotice } from "./MgState";
import { MgTaskForm, MgTaskRow } from "./MgTaskList";
import { groupTasks } from "./tasks";

export function MgmtTasksPage() {
  const [tasks, setTasks] = useState<MgTask[] | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState<"" | "busy" | "failed">("");
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTasks(null);
    setError(null);
    setMore("");
    getOpenTasks()
      .then((page) => {
        if (cancelled) return;
        setTasks(page.rows);
        setTotal(page.total);
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const groups = tasks ? groupTasks(tasks) : [];
  const remaining = tasks ? Math.max(0, total - tasks.length) : 0;
  // Rows come soonest first, so only the group of the last loaded row can be incomplete.
  const openGroup = remaining > 0 && tasks?.length ? taskBucket(tasks[tasks.length - 1].due_at) : null;

  async function loadMore() {
    if (!tasks) return;
    setMore("busy");
    try {
      // Ask again from the start with a larger limit and replace the list, so
      // tasks ticked on this screen cannot shift the rest out of view.
      const page = await getOpenTasks(undefined, tasks.length + MG_TASK_PAGE);
      setTasks(page.rows);
      setTotal(page.total);
      setMore("");
    } catch (e) {
      if (isForbidden(e)) setError(e);
      else setMore("failed");
    }
  }

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>משימות</h1>
          {tasks && (
            <p className="mg-sub">
              {total} פתוחות{remaining > 0 && ` · מוצגות ${tasks.length} הקרובות ביותר`}
            </p>
          )}
        </div>
        {!error && !adding && (
          <div className="mg-head-actions">
            <button className="mg-btn mg-btn-cta" type="button" onClick={() => setAdding(true)}>
              משימה חדשה
            </button>
          </div>
        )}
      </div>

      {adding && (
        <MgTaskForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setReload((n) => n + 1);
          }}
        />
      )}

      {error ? (
        <section className="mg-panel">
          <MgNotice error={error} onRetry={() => setReload((n) => n + 1)} />
        </section>
      ) : !tasks ? (
        <section className="mg-panel">
          <MgLoading />
        </section>
      ) : groups.length === 0 ? (
        <section className="mg-panel">
          <MgNotice empty="אין משימות פתוחות." />
        </section>
      ) : (
        <>
          {groups.map((g) => (
            <section className="mg-panel" key={g.bucket} aria-label={g.label}>
              <div className="mg-panel-head">
                <h2>{g.label}</h2>
                <span className="mg-count">
                  {g.tasks.length}
                  {g.bucket === openGroup && " ויותר"}
                </span>
              </div>
              {g.tasks.map((t) => (
                <MgTaskRow key={t.id} task={t} bucket={g.bucket} />
              ))}
            </section>
          ))}
          {remaining > 0 && (
            <p style={{ marginBlockEnd: 16 }}>
              <button className="mg-link-act" type="button" onClick={loadMore} disabled={more === "busy"}>
                הצגת {Math.min(MG_TASK_PAGE, remaining)} הבאות (נשארו {remaining})
              </button>
              {more === "failed" && (
                <span className="mg-stale" role="alert">
                  {" "}
                  הטעינה נכשלה. נסו שוב.
                </span>
              )}
            </p>
          )}
        </>
      )}
    </>
  );
}
