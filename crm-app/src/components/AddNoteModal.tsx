import { useState } from "react";
import {
  X,
  Check,
  XCircle,
  Clock,
  UserCheck,
  PhoneOff,
  Heart,
} from "lucide-react";
import { Contact, ContactStatus, STATUS_LABELS } from "../types";
import { useContactActions } from "../hooks/useContacts";

interface AddNoteModalProps {
  contact: Contact;
  onClose: () => void;
  onSaved?: () => void;
}

const QUICK_STATUSES: {
  status: ContactStatus;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    status: "agreed",
    icon: <Check size={16} />,
    color: "var(--color-success)",
  },
  {
    status: "refused",
    icon: <XCircle size={16} />,
    color: "var(--color-danger)",
  },
  {
    status: "no_answer",
    icon: <PhoneOff size={16} />,
    color: "var(--color-warning)",
  },
  { status: "call_later", icon: <Clock size={16} />, color: "#f59e0b" },
  { status: "follow_up", icon: <UserCheck size={16} />, color: "#8b5cf6" },
  { status: "donated", icon: <Heart size={16} />, color: "var(--color-info)" },
];

export function AddNoteModal({ contact, onClose, onSaved }: AddNoteModalProps) {
  const [noteText, setNoteText] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<ContactStatus | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const { addNote } = useContactActions();

  const handleSave = async () => {
    if (!noteText.trim() && !selectedStatus) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await addNote(
        contact.id,
        noteText.trim() || STATUS_LABELS[selectedStatus!],
        selectedStatus || undefined,
      );
      onSaved?.();
      onClose();
    } catch (error) {
      console.error("Error saving note:", error);
      alert("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>הוסף הערה - {contact.fullName}</h2>
          <button className="btn btn-icon btn-outline" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">סטטוס מהיר</label>
            <div className="quick-actions">
              {QUICK_STATUSES.map(({ status, icon, color }) => (
                <button
                  key={status}
                  className={`quick-action-btn ${selectedStatus === status ? "selected" : ""}`}
                  onClick={() =>
                    setSelectedStatus(selectedStatus === status ? null : status)
                  }
                  style={
                    selectedStatus === status
                      ? { background: color, color: "white" }
                      : {}
                  }
                >
                  {icon}
                  <span>{STATUS_LABELS[status]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">הערה</label>
            <textarea
              className="form-textarea"
              placeholder="כתוב הערה..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              autoFocus
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-outline"
            onClick={onClose}
            disabled={saving}
          >
            ביטול
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}
