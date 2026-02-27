import { useNavigate } from "react-router-dom";
import { Phone, MessageSquarePlus, CheckCircle2, Circle } from "lucide-react";
import { Contact } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ContactCardProps {
  contact: Contact;
  onAddNote: (contact: Contact) => void;
  onViewDetails: (contact: Contact) => void;
  onEdit: (contact: Contact) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function ContactCard({
  contact,
  onAddNote,
  onViewDetails,
  onEdit,
  selectionMode,
  isSelected,
  onToggleSelect,
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

        <StatusBadge status={contact.status} />

        {lastNote && (
          <div className="contact-note" title={lastNote}>
            {lastNote}
          </div>
        )}
      </div>

      <div className="contact-actions">
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
