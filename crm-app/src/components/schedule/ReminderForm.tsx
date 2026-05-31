import { useState } from "react";
import { X, ShieldAlert } from "lucide-react";
import { createReminder, type ReminderStatus } from "../../services/directus";
import { useAuth } from "../../contexts/AuthContext";

interface ReminderFormProps {
  onClose: () => void;
  onCreated?: () => void;
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

export function ReminderForm({ onClose, onCreated }: ReminderFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(nowLocalInput());
  const [status, setStatus] = useState<ReminderStatus>("pending");
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
      await createReminder({
        title: title.trim(),
        due_at: new Date(dueAt).toISOString(),
        status,
        owner_id: user?.uid ?? null,
        notes: notes.trim() || null,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      console.error("Error creating reminder");
      setError("שגיאה ביצירת התזכורת");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>תזכורת חדשה</h2>
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
              <span>הערות פרטיות – לא מוצגות בסדר היום</span>
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
            {saving ? "שומר…" : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
