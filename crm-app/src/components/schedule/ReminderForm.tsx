import { useState } from "react";
import { X, ShieldAlert } from "lucide-react";
import {
  createReminder,
  updateReminder,
  type DirectusReminder,
  type ReminderStatus,
} from "../../services/directus";
import { useAuth } from "../../contexts/AuthContext";

interface ReminderFormProps {
  onClose: () => void;
  onCreated?: () => void;
  /** When provided, the form edits this row (PATCH) instead of creating one. */
  editing?: DirectusReminder;
}

const STATUSES: { value: ReminderStatus; label: string }[] = [
  { value: "pending", label: "ממתינה" },
  { value: "done", label: "בוצעה" },
  { value: "dismissed", label: "בוטלה" },
];

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** ISO datetime -> local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ReminderForm({ onClose, onCreated, editing }: ReminderFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [dueAt, setDueAt] = useState(
    editing ? isoToLocalInput(editing.due_at) : nowLocalInput(),
  );
  const [status, setStatus] = useState<ReminderStatus>(
    editing?.status ?? "pending",
  );
  // notes never read into this surface (privacy) — blank in edit mode; an empty
  // field is not sent on update, so an existing note is preserved.
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("נא למלא תיאור לתזכורת");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateReminder(editing.id, {
          title: title.trim(),
          due_at: new Date(dueAt).toISOString(),
          status,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
      } else {
        await createReminder({
          title: title.trim(),
          due_at: new Date(dueAt).toISOString(),
          status,
          owner_id: user?.uid ?? null,
          notes: notes.trim() || null,
        });
      }
      onCreated?.();
      onClose();
    } catch (err) {
      console.error(editing ? "Error updating reminder" : "Error creating reminder");
      setError(editing ? "שגיאה בעדכון התזכורת" : "שגיאה ביצירת התזכורת");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editing ? "עריכת תזכורת" : "תזכורת חדשה"}</h2>
          <button className="btn btn-icon btn-outline" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">תיאור</label>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="מה לזכור"
            />
          </div>

          <div className="form-group">
            <label className="form-label">מתי</label>
            <input
              className="form-input"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">סטטוס</label>
            <select
              className="form-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ReminderStatus)}
              style={{ minHeight: 44 }}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">הערות</label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--color-warning, #b45309)",
                marginBottom: 4,
              }}
            >
              <ShieldAlert size={14} />
              <span>
                {editing
                  ? "הערות פרטיות – השאר ריק כדי לא לשנות הערה קיימת"
                  : "הערות פרטיות – לא מוצגות בסדר היום"}
              </span>
            </div>
            <textarea
              className="form-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="empty-state" style={{ color: "var(--color-danger)" }}>
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>
            ביטול
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "שומר…" : editing ? "עדכון" : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
