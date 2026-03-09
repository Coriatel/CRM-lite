import { useNavigate } from "react-router-dom";
import {
  Phone,
  MessageSquarePlus,
  CheckCircle2,
  Circle,
  Send,
} from "lucide-react";
import { Contact, CampaignStatus, CAMPAIGN_STATUS_COLORS } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ContactCardProps {
  contact: Contact;
  onAddNote: (contact: Contact) => void;
  onViewDetails: (contact: Contact) => void;
  onEdit: (contact: Contact) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  campaignStatus?: CampaignStatus;
  linkSendCount?: number;
  onSendLink?: (contact: Contact) => void;
}

export function ContactCard({
  contact,
  onAddNote,
  onViewDetails,
  onEdit,
  selectionMode,
  isSelected,
  onToggleSelect,
  campaignStatus,
  linkSendCount,
  onSendLink,
}: ContactCardProps) {
  const navigate = useNavigate();
  const initials = contact.fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  const lastNote =
    contact.notes.length > 0
      ? contact.notes[contact.notes.length - 1].text
      : contact.originalNote;

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/call/${contact.id}`);
  };

  return (
    <div
      className="card contact-card"
      onClick={() => {
        if (selectionMode && onToggleSelect) {
          onToggleSelect(contact.id);
        } else {
          onViewDetails(contact);
        }
      }}
      style={{
        border:
          selectionMode && isSelected
            ? "2px solid var(--color-primary)"
            : undefined,
        background:
          selectionMode && isSelected ? "rgba(26, 95, 122, 0.05)" : undefined,
        borderInlineStart: campaignStatus
          ? `4px solid ${CAMPAIGN_STATUS_COLORS[campaignStatus]}`
          : undefined,
      }}
    >
      {selectionMode ? (
        <div
          className="contact-avatar"
          style={{
            background: isSelected ? "var(--color-primary)" : "transparent",
            border: "2px solid var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isSelected ? (
            <CheckCircle2 size={24} color="white" />
          ) : (
            <Circle size={24} color="var(--color-primary)" />
          )}
        </div>
      ) : (
        <div
          className="contact-avatar"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(contact);
          }}
          style={{ cursor: "pointer" }}
          title="לחץ לעריכה"
        >
          {initials || "?"}
        </div>
      )}

      <div className="contact-info">
        <div className="contact-name">{contact.fullName}</div>

        {contact.phone1 && (
          <div className="contact-phone">
            <Phone size={14} />
            <a
              href={`tel:${contact.phone1}`}
              onClick={(e) => e.stopPropagation()}
            >
              {contact.phone1}
            </a>
          </div>
        )}

        {/* Status: color strip on card edge replaces inline badge for campaign */}
        {!campaignStatus && <StatusBadge status={contact.status} />}

        {lastNote && (
          <div className="contact-note" title={lastNote}>
            {lastNote}
          </div>
        )}
      </div>

      <div className="contact-actions">
        {/* WhatsApp send link button for campaign mode */}
        {onSendLink && contact.phone1 && (
          <button
            className="btn btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onSendLink(contact);
            }}
            title="שלח לינק תרומה"
            style={{
              color: "#25D366",
              position: "relative",
              background: "none",
              border: "none",
              padding: "6px",
              cursor: "pointer",
            }}
          >
            <Send size={18} />
            {linkSendCount !== undefined && linkSendCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  background: "#25D366",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 16,
                  height: 16,
                  fontSize: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                {linkSendCount}
              </span>
            )}
          </button>
        )}

        {contact.phone1 && (
          <button className="call-btn" onClick={handleCall} title="חייג">
            <Phone size={20} />
          </button>
        )}

        <button
          className="btn btn-icon btn-outline"
          onClick={(e) => {
            e.stopPropagation();
            onAddNote(contact);
          }}
          title="הוסף הערה"
        >
          <MessageSquarePlus size={18} />
        </button>
      </div>
    </div>
  );
}
