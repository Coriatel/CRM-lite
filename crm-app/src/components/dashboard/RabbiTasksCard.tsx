import { useState } from "react";
import { ListTodo, Plus, Check, Clock, Pencil, Trash2, X } from "lucide-react";
import { useRabbiTasks } from "../../data/useRabbiTasks";
import {
  TASK_DOMAINS,
  domainLabel,
  dueBucket,
  DUE_BUCKET_ORDER,
  DUE_BUCKET_LABEL,
  type RabbiTask,
  type TaskDomain,
  type TaskPriority,
  type TaskStore,
} from "../../data/rabbiTasks";

/**
 * Rabbi Personal OS task runtime (R2). Self-contained over the internal store:
 * create / edit / complete / snooze, with Personal/Business/Merkaz life-domains.
 * Drops into /rabbi with a single tag. Hebrew RTL, mobile-first.
 */

const DOMAIN_COLOR: Record<TaskDomain, string> = {
  personal: "var(--color-primary)",
  business: "#7a5c1a",
  merkaz: "#1a5f7a",
  learning: "#5b3a8a",
  family: "#2e7d4f",
  community: "#a14e1a",
};

const PRIORITIES: TaskPriority[] = [1, 2, 3, 4, 5];

interface FormState {
  id: string | null; // null = creating, else editing
  title: string;
  domain: TaskDomain;
  priority: TaskPriority;
  due: string; // date-only "YYYY-MM-DD"; "" = no due date
}

const EMPTY_FORM: FormState = { id: null, title: "", domain: "personal", priority: 2, due: "" };

function DomainChip({ domain }: { domain: TaskDomain }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 10,
        color: "#fff",
        backgroundColor: DOMAIN_COLOR[domain],
        flexShrink: 0,
      }}
    >
      {domainLabel(domain)}
    </span>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return m && d ? `${d}/${m}` : "";
}

const iconBtn = (color = "var(--color-text-secondary)"): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 44,
  minHeight: 44,
  background: "none",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  color,
  cursor: "pointer",
});

export function RabbiTasksCard({ store }: { store?: TaskStore } = {}) {
  const { active, snoozed, loading, create, update, remove, complete, snooze, reopen } =
    useRabbiTasks(store);
  const [form, setForm] = useState<FormState | null>(null);

  const openCreate = () => setForm({ ...EMPTY_FORM });
  const openEdit = (t: RabbiTask) =>
    setForm({
      id: t.id,
      title: t.title,
      domain: t.domain,
      priority: t.priority,
      due: t.dueAt ? t.dueAt.slice(0, 10) : "",
    });
  const closeForm = () => setForm(null);

  const submit = async () => {
    if (!form || !form.title.trim()) return;
    const dueAt = form.due ? `${form.due}T00:00:00.000Z` : null;
    const fields = { title: form.title.trim(), domain: form.domain, priority: form.priority, dueAt };
    if (form.id) {
      await update(form.id, fields);
    } else {
      await create(fields);
    }
    closeForm();
  };

  const groups = DUE_BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: active.filter((t) => dueBucket(t.dueAt) === bucket),
  })).filter((g) => g.items.length > 0);

  const renderActiveItem = (t: RabbiTask) => (
    <li
      key={t.id}
      data-testid="rabbi-task-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <DomainChip domain={t.domain} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {t.title}
      </span>
      {t.dueAt && (
        <span dir="ltr" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          {shortDate(t.dueAt)}
        </span>
      )}
      <button type="button" onClick={() => complete(t.id)} aria-label="סיום" style={iconBtn("var(--color-primary)")}>
        <Check size={16} />
      </button>
      <button type="button" onClick={() => snooze(t.id)} aria-label="דחייה למחר" style={iconBtn()}>
        <Clock size={16} />
      </button>
      <button type="button" onClick={() => openEdit(t)} aria-label="עריכה" style={iconBtn()}>
        <Pencil size={16} />
      </button>
      <button type="button" onClick={() => remove(t.id)} aria-label="מחיקה" style={iconBtn("var(--color-danger)")}>
        <Trash2 size={16} />
      </button>
    </li>
  );

  return (
    <section
      className="card"
      data-testid="rabbi-tasks-card"
      style={{ marginBottom: "var(--spacing-md)" }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <ListTodo size={20} style={{ color: "var(--color-primary)" }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>המשימות שלי</h2>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{active.length}</span>
        <button
          type="button"
          onClick={form ? closeForm : openCreate}
          aria-label={form ? "סגירת טופס" : "משימה חדשה"}
          style={iconBtn("var(--color-primary)")}
        >
          {form ? <X size={18} /> : <Plus size={18} />}
        </button>
      </header>

      {form && (
        <div
          data-testid="rabbi-task-form"
          style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}
        >
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="מה צריך לעשות?"
            aria-label="כותרת המשימה"
            style={{
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid var(--color-border)",
              borderRadius: 8,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value as TaskDomain })}
              aria-label="תחום"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
            >
              {TASK_DOMAINS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) as TaskPriority })}
              aria-label="עדיפות"
              style={{ width: 96, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  עדיפות {p}
                </option>
              ))}
            </select>
          </div>
          <input
            type="date"
            value={form.due}
            onChange={(e) => setForm({ ...form, due: e.target.value })}
            aria-label="תאריך יעד"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!form.title.trim()}
            style={{
              minHeight: 44,
              borderRadius: 8,
              border: "none",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              fontWeight: 600,
              cursor: form.title.trim() ? "pointer" : "not-allowed",
              opacity: form.title.trim() ? 1 : 0.5,
            }}
          >
            {form.id ? "שמירה" : "הוספה"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>טוען…</p>
      ) : active.length === 0 && snoozed.length === 0 && !form ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: 0 }}>
          אין משימות פתוחות. הוסף משימה חדשה עם הכפתור למעלה.
        </p>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.bucket} data-testid={`rabbi-task-group-${g.bucket}`}>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: g.bucket === "overdue" ? "var(--color-danger)" : "var(--color-text-secondary)",
                  margin: "8px 0 0",
                }}
              >
                {DUE_BUCKET_LABEL[g.bucket]} ({g.items.length})
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{g.items.map(renderActiveItem)}</ul>
            </div>
          ))}

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {snoozed.map((t) => (
            <li
              key={t.id}
              data-testid="rabbi-task-snoozed"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderTop: "1px solid var(--color-border)",
                opacity: 0.6,
              }}
            >
              <DomainChip domain={t.domain} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </span>
              <span dir="ltr" style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                נדחה ל-{shortDate(t.snoozedUntil)}
              </span>
              <button type="button" onClick={() => reopen(t.id)} aria-label="החזרה לפעילות" style={iconBtn()}>
                <Clock size={16} />
              </button>
            </li>
          ))}
          </ul>
        </>
      )}
    </section>
  );
}
