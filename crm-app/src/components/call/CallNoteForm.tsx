import { useState, useEffect } from "react";
import {
  Check,
  XCircle,
  Clock,
  UserCheck,
  PhoneOff,
  Heart,
  Send,
  SkipForward,
} from "lucide-react";
import { ContactStatus, STATUS_LABELS } from "../../types";
import { DonationProcess } from "../DonationProcess";

interface CallNoteFormProps {
  contactId: string;
  onSave: (data: {
    note: string;
    status: ContactStatus;
    donationAmount?: number;
    followUpDate?: string;
    followUpNote?: string;
    receiptConfirmed?: boolean;
    thankYouSent?: boolean;
  }) => void;
  onSkip?: () => void;
  saving: boolean;
  hasNext: boolean;
}

const DRAFT_PREFIX = "call_draft_";

const QUICK_STATUSES: {
  status: ContactStatus;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    status: "agreed",
    icon: <Check size={14} />,
    color: "var(--color-success)",
  },
  {
    status: "refused",
    icon: <XCircle size={14} />,
    color: "var(--color-danger)",
  },
  {
    status: "no_answer",
    icon: <PhoneOff size={14} />,
    color: "var(--color-warning)",
  },
  { status: "call_later", icon: <Clock size={14} />, color: "#f59e0b" },
  { status: "follow_up", icon: <UserCheck size={14} />, color: "#8b5cf6" },
  { status: "donated", icon: <Heart size={14} />, color: "var(--color-info)" },
];

export function CallNoteForm({
  contactId,
  onSave,
  onSkip,
  saving,
  hasNext,
}: CallNoteFormProps) {
  const draftKey = `${DRAFT_PREFIX}${contactId}`;

  const [note, setNote] = useState("");
  const [selectedStatus, setSelectedStatus] =
    useState<ContactStatus>("not_checked");
  const [donationAmount, setDonationAmount] = useState("");
  const [showDonation, setShowDonation] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const [thankYouSent, setThankYouSent] = useState(false);

  // Restore draft from localStorage (with type validation)
  useEffect(() => {
    const VALID_STATUSES = new Set([
      "not_checked",
      "agreed",
      "refused",
      "no_answer",
      "call_later",
      "follow_up",
      "donated",
    ]);
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (typeof draft.note === "string") setNote(draft.note);
        if (
          typeof draft.status === "string" &&
          VALID_STATUSES.has(draft.status)
        ) {
          setSelectedStatus(draft.status as ContactStatus);
        }
        if (
          typeof draft.donationAmount === "string" &&
          Number(draft.donationAmount) > 0
        ) {
          setDonationAmount(draft.donationAmount);
          setShowDonation(true);
        }
        if (
          typeof draft.followUpDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(draft.followUpDate)
        ) {
          setFollowUpDate(draft.followUpDate);
        }
        if (typeof draft.followUpNote === "string")
          setFollowUpNote(draft.followUpNote);
      }
    } catch {
      // ignore parse errors
    }
  }, [draftKey]);

  // Auto-save draft on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const draft = {
          note,
          status: selectedStatus,
          donationAmount: donationAmount || undefined,
          followUpDate: followUpDate || undefined,
          followUpNote: followUpNote || undefined,
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    note,
    selectedStatus,
    donationAmount,
    followUpDate,
    followUpNote,
    draftKey,
  ]);

  const handleSubmit = () => {
    onSave({
      note: note.trim(),
      status: selectedStatus,
      donationAmount: donationAmount ? Number(donationAmount) : undefined,
      followUpDate: followUpDate || undefined,
      followUpNote: followUpNote || undefined,
      receiptConfirmed:
        selectedStatus === "donated" ? receiptConfirmed : undefined,
      thankYouSent: selectedStatus === "donated" ? thankYouSent : undefined,
    });
    // Clear draft after save
    localStorage.removeItem(draftKey);
  };

  // Show/hide donation field based on status
  useEffect(() => {
    setShowDonation(selectedStatus === "donated");
  }, [selectedStatus]);

  return (
    <div
      style={{
        background: "var(--color-bg)",
        borderTop: "1px solid var(--color-border)",
        padding: "var(--spacing-sm)",
      }}
    >
      {/* Status picker */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          marginBottom: "var(--spacing-xs)",
          flexWrap: "wrap",
        }}
      >
        {QUICK_STATUSES.map(({ status, icon, color }) => (
          <button
            key={status}
            onClick={() =>
              setSelectedStatus(
                selectedStatus === status ? "not_checked" : status,
              )
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "16px",
              border:
                selectedStatus === status
                  ? "none"
                  : "1px solid var(--color-border)",
              background: selectedStatus === status ? color : "transparent",
              color: selectedStatus === status ? "#fff" : "var(--color-text)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {icon}
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {/* Note textarea */}
      <textarea
        placeholder="כתוב הערה על השיחה..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid var(--color-border)",
          fontSize: "14px",
          resize: "none",
          boxSizing: "border-box",
          marginBottom: "var(--spacing-xs)",
          fontFamily: "inherit",
        }}
      />

      {/* Donation amount + process (conditionally shown) */}
      {showDonation && (
        <div style={{ marginBottom: "var(--spacing-xs)" }}>
          <input
            type="number"
            placeholder="סכום תרומה (₪)"
            value={donationAmount}
            onChange={(e) => setDonationAmount(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
          <DonationProcess
            receiptConfirmed={receiptConfirmed}
            thankYouSent={thankYouSent}
            onToggleReceipt={() => setReceiptConfirmed(!receiptConfirmed)}
            onToggleThankYou={() => setThankYouSent(!thankYouSent)}
          />
        </div>
      )}

      {/* Follow-up fields (shown for call_later / follow_up) */}
      {(selectedStatus === "call_later" || selectedStatus === "follow_up") && (
        <div style={{ marginBottom: "var(--spacing-xs)" }}>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "6px",
            }}
          >
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--color-border)",
                fontSize: "14px",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>
          <input
            type="text"
            placeholder="סיבת מעקב..."
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              fontSize: "14px",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: "var(--spacing-xs)",
        }}
      >
        {onSkip && (
          <button
            onClick={onSkip}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              color: "var(--color-text-secondary)",
            }}
          >
            <SkipForward size={16} />
            דלג
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={
            saving || (selectedStatus === "not_checked" && !note.trim())
          }
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            background: "var(--color-primary)",
            color: "#fff",
            cursor: saving ? "wait" : "pointer",
            fontSize: "14px",
            fontWeight: 600,
            opacity:
              saving || (selectedStatus === "not_checked" && !note.trim())
                ? 0.6
                : 1,
          }}
        >
          <Send size={16} />
          {saving ? "שומר..." : hasNext ? "שמור והבא" : "שמור"}
        </button>
      </div>
    </div>
  );
}
