import { useState } from "react";
import { X, ShieldAlert } from "lucide-react";
import { createMeeting, type MeetingStatus } from "../../services/directus";
import { useAuth } from "../../contexts/AuthContext";

interface MeetingFormProps {
  onClose: () => void;
  onCreated?: () => void;
}

const STATUSES: { value: MeetingStatus; label: string }[] = [
  { value: "scheduled", label: "מתוכננת" },
  { value: "done", label: "התקיימה" },
  { value: "cancelled", label: "בוטלה" },
];

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function MeetingForm({ onClose, onCreated }: MeetingFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(nowLocalInput());
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<MeetingStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("נא למלא כותרת לפגישה");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createMeeting({
        title: title.trim(),
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        location: location.trim() || null,
        status,
        owner_id: user?.uid ?? null,
        notes: notes.trim() || null,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      console.error("Error creating meeting");
      setError("שגיאה ביצירת הפגישה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>פגישה חדשה</h2>
          <button className="btn btn-icon btn-outline" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">כותרת</label>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="עם מי / על מה"
            />
          </div>

          <div className="form-group">
            <label className="form-label">תחילה</label>
            <input
              className="form-input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">סיום (לא חובה)</label>
            <input
              className="form-input"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">מיקום</label>
            <input
              className="form-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="חדר / כתובת / קישור"
            />
          </div>

          <div className="form-group">
            <label className="form-label">סטטוס</label>
            <select
              className="form-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as MeetingStatus)}
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
