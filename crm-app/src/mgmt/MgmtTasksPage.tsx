import { useEffect, useState } from "react";
import { getOpenTasks, type MgTask } from "../services/directus";
import { MgLoading, MgNotice } from "./MgState";
import { MgTaskForm, MgTaskRow } from "./MgTaskList";
import { groupTasks } from "./tasks";

export function MgmtTasksPage() {
  const [tasks, setTasks] = useState<MgTask[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTasks(null);
    setError(null);
    getOpenTasks()
      .then((t) => !cancelled && setTasks(t))
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const groups = tasks ? groupTasks(tasks) : [];

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>משימות</h1>
          {tasks && <p className="mg-sub">{tasks.length} פתוחות</p>}
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
        groups.map((g) => (
          <section className="mg-panel" key={g.bucket} aria-label={g.label}>
            <div className="mg-panel-head">
              <h2>{g.label}</h2>
              <span className="mg-count">{g.tasks.length}</span>
            </div>
            {g.tasks.map((t) => (
              <MgTaskRow key={t.id} task={t} bucket={g.bucket} />
            ))}
          </section>
        ))
      )}
    </>
  );
}
