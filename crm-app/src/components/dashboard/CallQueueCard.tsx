import { Phone, SkipForward } from "lucide-react";
import { CallQueueItem } from "../../hooks/useCallQueue";

interface CallQueueCardProps {
  item: CallQueueItem;
  contactName: string;
  contactPhone?: string;
  projectName?: string;
  onCall: (item: CallQueueItem) => void;
  onSkip: (item: CallQueueItem) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#6b7280",
};

export function CallQueueCard({
  item,
  contactName,
  contactPhone,
  projectName,
  onCall,
  onSkip,
}: CallQueueCardProps) {
  return (
    <div
      className="card"
      style={{
        marginBottom: "var(--spacing-sm)",
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-sm)",
      }}
    >
      {/* Priority dot */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: PRIORITY_COLORS[item.priority] || "#6b7280",
          flexShrink: 0,
        }}
      />

      {/* Contact info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "15px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {contactName}
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "var(--color-text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-xs)",
          }}
        >
          {contactPhone && <span dir="ltr">{contactPhone}</span>}
          {projectName && (
            <span
              style={{
                background: "var(--color-primary-light, #e0f2fe)",
                color: "var(--color-primary)",
                padding: "1px 6px",
                borderRadius: "8px",
                fontSize: "11px",
                fontWeight: 500,
              }}
            >
              {projectName}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--spacing-xs)", flexShrink: 0 }}>
        <button
          onClick={() => onSkip(item)}
          style={{
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            color: "var(--color-text-secondary)",
          }}
          title="דלג"
        >
          <SkipForward size={16} />
        </button>
        <button
          onClick={() => onCall(item)}
          style={{
            background: "var(--color-primary)",
            border: "none",
            borderRadius: "8px",
            padding: "6px 12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "#fff",
            fontWeight: 500,
            fontSize: "13px",
          }}
        >
          <Phone size={14} />
          התקשר
        </button>
      </div>
    </div>
  );
}
