import { useState } from "react";
import { Link } from "react-router-dom";
import { createMgTask, setTaskStatus, type MgTask } from "../services/directus";
import type { DueBucket } from "../data/rabbiTasks";
import { isForbidden } from "./errors";
import { telHref } from "./format";
import { NEW_TASK_KINDS, kindLabel, taskMeta, taskTitle } from "./tasks";

/** One task row. Ticking marks it done on the server; it stays visible with an undo. */
export function MgTaskRow({
  task,
  bucket,
  showPerson = true,
  onDone,
}: {
  task: MgTask;
  bucket: DueBucket;
  showPerson?: boolean;
  /** Called after the server accepted the change, so counters can follow. */
  onDone?: (taskId: string, done: boolean) => void;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const person = task.subject_contact_id;
  // On a person card the call button already sits at the top of the card.
  const tel = showPerson && person ? telHref(person.phone_e164) : "";
  const meta = taskMeta(task, bucket);

  async function toggle() {
    setBusy(true);
    setFailed("");
    try {
      await setTaskStatus(task.id, done ? "open" : "done");
      setDone(!done);
      onDone?.(task.id, !done);
    } catch (e) {
      setFailed(isForbidden(e) ? "אין לך הרשאה לעדכן משימות." : "העדכון לא נשמר. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mg-task">
      <input
        type="checkbox"
        className="mg-check"
        aria-label={`סימון כבוצע: ${taskTitle(task)}`}
        checked={done}
        disabled={busy}
        onChange={toggle}
      />
      <div>
        <p className="mg-title" style={done ? { textDecoration: "line-through" } : undefined}>
          {taskTitle(task)}
          {showPerson && person && (
            <>
              {" · "}
              <Link to={`/m/people/${person.id}`}>{person.full_name || "ללא שם"}</Link>
            </>
          )}
        </p>
        {(meta || done || failed) && (
          <p className={bucket === "overdue" && !done ? "mg-meta mg-warn" : "mg-meta"}>
            {done ? "בוצע" : meta}
            {failed && <span role="alert"> {failed}</span>}
          </p>
        )}
      </div>
      <div className="mg-acts">
        {tel && !done && (
          <a className="mg-btn" href={tel}>
            חיוג
          </a>
        )}
      </div>
    </div>
  );
}

/** Short form for a new task; `contactId` ties it to a person when given. */
export function MgTaskForm({
  contactId,
  onSaved,
  onCancel,
}: {
  contactId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [kind, setKind] = useState<string>(NEW_TASK_KINDS[0]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) {
      setFailed("כתבו מה צריך לעשות.");
      return;
    }
    setBusy(true);
    setFailed("");
    try {
      await createMgTask({
        notes: notes.trim(),
        kind,
        // Noon local time: the column is a timestamp, and noon keeps the chosen day
        // the same in UTC and across daylight-saving changes.
        due_at: due ? new Date(`${due}T12:00:00`).toISOString() : null,
        subject_contact_id: contactId ?? null,
      });
      onSaved();
    } catch (err) {
      setFailed(isForbidden(err) ? "אין לך הרשאה ליצור משימות." : "המשימה לא נשמרה. נסו שוב.");
      setBusy(false);
    }
  }

  return (
    <form className="mg-panel" onSubmit={save} aria-label="משימה חדשה">
      <div className="mg-field">
        <label htmlFor="mg-t-notes">מה צריך לעשות</label>
        <input
          id="mg-t-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={failed && !notes.trim() ? true : undefined}
          autoFocus
        />
      </div>
      <div className="mg-field">
        <label htmlFor="mg-t-due">עד מתי</label>
        <input id="mg-t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div className="mg-field">
        <label htmlFor="mg-t-kind">סוג</label>
        <select id="mg-t-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {NEW_TASK_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
      </div>
      {failed && (
        <p className="mg-err" role="alert">
          {failed}
        </p>
      )}
      <div className="mg-head-actions">
        <button className="mg-btn mg-btn-cta" type="submit" disabled={busy}>
          שמירה
        </button>
        <button className="mg-btn mg-btn-quiet" type="button" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </form>
  );
}
