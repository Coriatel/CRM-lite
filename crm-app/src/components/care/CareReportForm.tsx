import { useState } from "react";
import { X, ShieldAlert } from "lucide-react";
import {
  createCareReport,
  type CareInteractionType,
  type CareFollowupStatus,
  type CareSentiment,
} from "../../services/directus";

interface CareReportFormProps {
  contactId: string;
  contactName: string;
  onClose: () => void;
  onSaved?: () => void;
}

const INTERACTION_TYPES: { value: CareInteractionType; label: string }[] = [
  { value: "call", label: "שיחה" },
  { value: "meeting", label: "פגישה" },
  { value: "message", label: "הודעה" },
  { value: "other", label: "אחר" },
];

const FOLLOWUP_STATUSES: { value: CareFollowupStatus; label: string }[] = [
  { value: "none", label: "ללא מעקב" },
  { value: "pending", label: "מעקב נדרש" },
  { value: "done", label: "טופל" },
];

const SENTIMENTS: { value: CareSentiment; label: string }[] = [
  { value: "positive", label: "חיובי" },
  { value: "neutral", label: "ניטרלי" },
  { value: "concern", label: "דאגה" },
];

// Local "now" as a value the datetime-local input accepts (YYYY-MM-DDTHH:mm).
function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function CareReportForm({
  contactId,
  contactName,
  onClose,
  onSaved,
}: CareReportFormProps) {
  const [interactionType, setInteractionType] =
    useState<CareInteractionType>("call");
  const [interactionAt, setInteractionAt] = useState(nowLocalInput());
  const [summary, setSummary] = useState("");
  const [followupStatus, setFollowupStatus] =
    useState<CareFollowupStatus>("none");
  const [followupDue, setFollowupDue] = useState("");
  const [sentiment, setSentiment] = useState<CareSentiment | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!summary.trim()) {
      setError("נא למלא תיאור הטיפול");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCareReport({
        contact_id: contactId,
        interaction_type: interactionType,
        interaction_at: new Date(interactionAt).toISOString(),
        summary: summary.trim(),
        followup_status: followupStatus,
        followup_due:
          followupStatus === "pending" && followupDue ? followupDue : null,
        sentiment: sentiment || null,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Error saving care report:", err);
      setError("שגיאה בשמירת דיווח הטיפול");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>דיווח טיפול רוחני – {contactName}</h2>
          <button className="btn btn-icon btn-outline" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">סוג אינטראקציה</label>
            <select
              className="form-input"
              value={interactionType}
              onChange={(e) =>
                setInteractionType(e.target.value as CareInteractionType)
              }
              style={{ minHeight: 44 }}
            >
              {INTERACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">מתי</label>
            <input
              className="form-input"
              type="datetime-local"
              value={interactionAt}
              onChange={(e) => setInteractionAt(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">תיאור הטיפול</label>
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
              <span>תוכן רגיש – מידע פסטורלי חסוי</span>
            </div>
            <textarea
              className="form-input"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="מה קרה בטיפול"
            />
          </div>

          <div className="form-group">
            <label className="form-label">סטטוס מעקב</label>
            <select
              className="form-input"
              value={followupStatus}
              onChange={(e) =>
                setFollowupStatus(e.target.value as CareFollowupStatus)
              }
              style={{ minHeight: 44 }}
            >
              {FOLLOWUP_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {followupStatus === "pending" && (
            <div className="form-group">
              <label className="form-label">תאריך מעקב</label>
              <input
                className="form-input"
                type="date"
                value={followupDue}
                onChange={(e) => setFollowupDue(e.target.value)}
                style={{ minHeight: 44 }}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">תחושה</label>
            <select
              className="form-input"
              value={sentiment}
              onChange={(e) =>
                setSentiment(e.target.value as CareSentiment | "")
              }
              style={{ minHeight: 44 }}
            >
              <option value="">–</option>
              {SENTIMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
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
