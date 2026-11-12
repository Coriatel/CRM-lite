import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createInteraction,
  getContact,
  getContactIncome,
  getInteractions,
  getLatestIncomeDate,
  getOpenTasks,
  updateContact,
  type DirectusInteraction,
} from "../services/directus";
import { isForbidden } from "./errors";
import { classificationLabel, displayPhone, freshness, fullDate, shekels, telHref } from "./format";
import { MgLoading, MgNotice } from "./MgState";
import { MgTaskForm, MgTaskRow } from "./MgTaskList";
import { taskBucket } from "./tasks";
import { useLoad, type Loaded } from "./useLoad";

const TYPE_LABEL: Record<string, string> = {
  call: "שיחת טלפון",
  whatsapp: "WhatsApp",
  email: 'דוא"ל',
  meeting: "פגישה",
  note: "הערה",
};
const TIMELINE_SHORT = 3;
// On a phone the secondary sections start folded, so the card stays short.
const WIDE =
  typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 56rem)").matches;

export function MgmtPersonPage() {
  const { id = "" } = useParams();
  const person = useLoad(() => getContact(id), [id]);
  const tasks = useLoad(() => getOpenTasks(id), [id]);
  const timeline = useLoad(() => getInteractions(id), [id]);
  const income = useLoad(
    () => Promise.all([getContactIncome(id), getLatestIncomeDate()]),
    [id],
  );
  const [addingTask, setAddingTask] = useState(false);

  if (person.error) {
    return (
      <>
        <BackLink />
        <section className="mg-panel">
          <MgNotice error={person.error} onRetry={person.reload} />
        </section>
      </>
    );
  }
  if (!person.data) {
    return (
      <>
        <BackLink />
        <MgLoading />
      </>
    );
  }

  const c = person.data;
  const phone = displayPhone(c.phone_e164);
  const tel = telHref(c.phone_e164);
  const facts = [classificationLabel(c.classification), c.city].filter(Boolean).join(" · ");

  return (
    <>
      <BackLink />
      <div className="mg-person-head">
        <h1>{c.full_name || "ללא שם"}</h1>
        {facts && <p className="mg-plain">{facts}</p>}
        <p className="mg-plain">
          {phone ? <bdi className="mg-ltr">{phone}</bdi> : "אין טלפון"}
          {c.email && (
            <>
              <span className="mg-sep"> · </span>
              <bdi className="mg-ltr">{c.email}</bdi>
            </>
          )}
        </p>
      </div>
      <div className="mg-person-acts">
        {tel && (
          <a className="mg-btn mg-btn-cta" href={tel}>
            חיוג
          </a>
        )}
        {!tasks.error && !addingTask && (
          <button className="mg-btn" type="button" onClick={() => setAddingTask(true)}>
            משימה חדשה
          </button>
        )}
      </div>

      {addingTask && (
        <MgTaskForm
          contactId={id}
          onCancel={() => setAddingTask(false)}
          onSaved={() => {
            setAddingTask(false);
            tasks.reload();
          }}
        />
      )}

      <div className="mg-two-col mg-even">
        <div>
          <section className="mg-panel" aria-label="משימות פתוחות">
            <div className="mg-panel-head">
              <h2>משימות פתוחות</h2>
              {tasks.data && <span className="mg-count">{tasks.data.total}</span>}
            </div>
            <Section state={tasks} empty="אין משימות פתוחות." isEmpty={(d) => d.rows.length === 0}>
              {(page) =>
                page.rows.map((t) => (
                  <MgTaskRow key={t.id} task={t} bucket={taskBucket(t.due_at)} showPerson={false} />
                ))
              }
            </Section>
          </section>

          <section className="mg-panel" aria-label="ציר זמן">
            <div className="mg-panel-head">
              <h2>ציר זמן</h2>
            </div>
            <NoteForm
              contactId={id}
              onSaved={() => {
                timeline.reload();
              }}
            />
            <Section state={timeline} empty="עדיין לא תועד קשר.">
              {(list) => <Timeline items={list} />}
            </Section>
          </section>
        </div>

        <div>
          <section className="mg-panel" aria-label="תרומות">
            <details className="mg-fold" open={WIDE}>
              <summary className="mg-panel-head">
                <h2>תרומות</h2>
                {income.data && (
                  <span className="mg-fold-sum">
                    {income.data[0].length === 0 ? "אין" : `${income.data[0].length} תרומות`}
                  </span>
                )}
              </summary>
              {income.data && (
                <p className={freshness(income.data[1]).stale ? "mg-stale" : "mg-plain"}>
                  {freshness(income.data[1]).label}
                </p>
              )}
              <Section state={income} empty="לא נרשמו תרומות." isEmpty={(d) => d[0].length === 0}>
                {([rows]) => {
                  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
                  return (
                    <>
                      <dl>
                        <div className="mg-kv">
                          <dt>סך הכול</dt>
                          <dd>
                            {shekels(total)} · {rows.length === 1 ? "תרומה אחת" : `${rows.length} תרומות`}
                          </dd>
                        </div>
                        <div className="mg-kv">
                          <dt>תרומה אחרונה</dt>
                          <dd>
                            {shekels(Number(rows[0].amount) || 0)} · <bdi>{fullDate(rows[0].date)}</bdi>
                          </dd>
                        </div>
                      </dl>
                      <p className="mg-plain">לפי התנועות שנרשמו, לפני אימות.</p>
                    </>
                  );
                }}
              </Section>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link className="mg-back" to="/m/people">
      ‹ אנשי קשר
    </Link>
  );
}

/** Loading / refused / failed / empty for one section, without touching the others. */
function Section<T>({
  state,
  empty,
  isEmpty,
  children,
}: {
  state: Loaded<T>;
  empty: string;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (state.error) return <MgNotice error={state.error} onRetry={state.reload} />;
  if (state.data === null) return <MgLoading />;
  const none = isEmpty ? isEmpty(state.data) : Array.isArray(state.data) && state.data.length === 0;
  if (none) return <MgNotice empty={empty} />;
  return <>{children(state.data)}</>;
}

function Timeline({ items }: { items: DirectusInteraction[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, TIMELINE_SHORT);
  return (
    <>
      <ol className="mg-timeline">
        {shown.map((i) => (
          <li key={i.id}>
            <span className="mg-d">
              <bdi>{fullDate(i.created_at)}</bdi>
            </span>
            <div>
              {TYPE_LABEL[i.type] ?? i.type}
              {i.summary ? ` · ${i.summary}` : ""}
              {i.result_note && <span className="mg-by">{i.result_note}</span>}
            </div>
          </li>
        ))}
      </ol>
      {!all && items.length > TIMELINE_SHORT && (
        <div className="mg-panel-foot">
          <button className="mg-link-act" type="button" onClick={() => setAll(true)}>
            הצגת כל {items.length}
          </button>
        </div>
      )}
    </>
  );
}

function NoteForm({ contactId, onSaved }: { contactId: string; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setFailed("");
    try {
      await createInteraction({ contact_id: contactId, type: "note", summary: text.trim() });
      setText("");
      onSaved();
      // Same as the old screen: a note counts as contact, so "last contact" follows it.
      // The note is already saved; if this second step is refused, say so and keep the note.
      try {
        await updateContact(contactId, { last_call_date: new Date().toISOString() });
      } catch {
        setFailed('ההערה נשמרה, אבל "קשר אחרון" לא עודכן.');
      }
    } catch (err) {
      setFailed(isForbidden(err) ? "אין לך הרשאה להוסיף הערות." : "ההערה לא נשמרה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mg-search" onSubmit={save}>
      <label className="mg-sr-only" htmlFor="mg-note">
        הערה חדשה
      </label>
      <input
        id="mg-note"
        placeholder="הערה חדשה"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="mg-btn mg-btn-quiet" type="submit" disabled={busy || !text.trim()}>
        הוספה
      </button>
      {failed && (
        <p className="mg-err" role="alert">
          {failed}
        </p>
      )}
    </form>
  );
}
