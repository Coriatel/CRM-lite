import { Phone, MessageSquare, Clock } from "lucide-react";
import { DirectusInteraction } from "../../services/directus";

interface CallHistoryTimelineProps {
  interactions: DirectusInteraction[];
  loading: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return `היום ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}

function getTypeIcon(type: string) {
  switch (type) {
    case "call":
      return <Phone size={14} />;
    case "note":
      return <MessageSquare size={14} />;
    default:
      return <Clock size={14} />;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "call":
      return "שיחה";
    case "note":
      return "הערה";
    case "meeting":
      return "פגישה";
    default:
      return type;
  }
}

export function CallHistoryTimeline({
  interactions,
  loading,
}: CallHistoryTimelineProps) {
  if (loading) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "var(--spacing-lg)",
          color: "var(--color-text-secondary)",
          fontSize: "14px",
        }}
      >
        טוען היסטוריה...
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "var(--spacing-lg)",
          color: "var(--color-text-secondary)",
          fontSize: "14px",
        }}
      >
        אין היסטוריית שיחות
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Timeline line */}
      <div
        style={{
          position: "absolute",
          right: "11px",
          top: "12px",
          bottom: "12px",
          width: "2px",
          background: "var(--color-border)",
        }}
      />

      {interactions.map((interaction) => (
        <div
          key={interaction.id}
          style={{
            display: "flex",
            gap: "var(--spacing-sm)",
            marginBottom: "var(--spacing-sm)",
            position: "relative",
          }}
        >
          {/* Dot */}
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: "var(--color-bg)",
              border: "2px solid var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              zIndex: 1,
              color: "var(--color-primary)",
            }}
          >
            {getTypeIcon(interaction.type)}
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              background: "var(--color-bg-secondary, #f1f5f9)",
              borderRadius: "8px",
              padding: "var(--spacing-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--color-primary)",
                }}
              >
                {getTypeLabel(interaction.type)}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {formatDate(interaction.created_at)}
              </span>
            </div>
            {interaction.summary && (
              <div style={{ fontSize: "14px", lineHeight: 1.5 }}>
                {interaction.summary}
              </div>
            )}
            {interaction.result && (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                  marginTop: "4px",
                }}
              >
                תוצאה: {interaction.result}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
