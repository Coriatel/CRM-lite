import { useState, useEffect } from "react";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  Edit2,
  ChevronLeft,
  MessageCircle,
  Pencil,
  Trash2,
  Send,
} from "lucide-react";
import { Contact, Note, ProjectContact } from "../types";
import { StatusBadge } from "./StatusBadge";
import {
  getInteractions,
  updateContact as patchContact,
  getProjectContactForContact,
  getContactCrossProjectDonations,
} from "../services/directus";
import { IS_DEMO_MODE } from "../config";
import { DonationProcess } from "./DonationProcess";
import { WhatsAppSendModal } from "./WhatsAppSendModal";
import { useProjectContext } from "../contexts/ProjectContext";
import { useProjectContactActions } from "../hooks/useProjectContacts";

interface ContactDetailModalProps {
  contact: Contact;
  onClose: () => void;
  onAddNote: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ContactDetailModal({
  contact,
  onClose,
  onAddNote,
  onEdit,
  onDelete,
}: ContactDetailModalProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [localReceipt, setLocalReceipt] = useState(
    contact.receiptConfirmed || false,
  );
  const [localThankYou, setLocalThankYou] = useState(
    contact.thankYouSent || false,
  );
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [projectContact, setProjectContact] = useState<ProjectContact | null>(
    null,
  );
  const [crossDonations, setCrossDonations] = useState<
    { projectId: string; projectName: string; amount: number }[]
  >([]);

  const { activeProject, projects } = useProjectContext();
  const { recordLinkSent } = useProjectContactActions();

  const canSendLink =
    activeProject && activeProject.landingPageUrl && contact.phone1;

  // Fetch project_contact record and cross-project donations
  useEffect(() => {
    let cancelled = false;
    if (!activeProject || IS_DEMO_MODE) {
      setProjectContact(null);
      setCrossDonations([]);
      return;
    }
    getProjectContactForContact(activeProject.id, contact.id)
      .then((pc) => {
        if (cancelled) return;
        if (pc) {
          setProjectContact({
            id: pc.id,
            projectId: pc.project_id,
            contactId: pc.contact_id,
            campaignStatus:
              pc.campaign_status as ProjectContact["campaignStatus"],
            donationAmount: pc.donation_amount
              ? Number(pc.donation_amount)
              : undefined,
            donationType: pc.donation_type as ProjectContact["donationType"],
            tierLabel: pc.tier_label || undefined,
            linkSendCount: pc.link_send_count || 0,
            lastLinkSentAt: pc.last_link_sent_at || undefined,
            notes: pc.notes || undefined,
            dateCreated: pc.date_created,
            dateUpdated: pc.date_updated,
          });
        }
      })
      .catch((err) => console.error("Failed to load project contact:", err));

    getContactCrossProjectDonations(contact.id)
      .then((donations) => {
        if (cancelled) return;
        const other = donations
          .filter((d) => d.project_id !== activeProject.id && d.donation_amount)
          .map((d) => ({
            projectId: d.project_id,
            projectName:
              projects.find((p) => p.id === d.project_id)?.name || "פרויקט",
            amount: Number(d.donation_amount),
          }));
        setCrossDonations(other);
      })
      .catch((err) =>
        console.error("Failed to load cross-project donations:", err),
      );
    return () => {
      cancelled = true;
    };
  }, [activeProject, contact.id, projects]);

  const handleToggleReceipt = async () => {
    const next = !localReceipt;
    setLocalReceipt(next);
    try {
      await patchContact(contact.id, { receipt_confirmed: next } as Record<
        string,
        unknown
      >);
    } catch (err) {
      setLocalReceipt(!next); // revert on error
      console.error("Error updating receipt:", err);
    }
  };

  const handleToggleThankYou = async () => {
    const next = !localThankYou;
    setLocalThankYou(next);
    try {
      await patchContact(contact.id, { thank_you_sent: next } as Record<
        string,
        unknown
      >);
    } catch (err) {
      setLocalThankYou(!next); // revert on error
      console.error("Error updating thank you:", err);
    }
  };

  useEffect(() => {
    if (IS_DEMO_MODE) {
      setNotes(contact.notes);
      return;
    }

    setNotesLoading(true);
    getInteractions(contact.id)
      .then((interactions) => {
        setNotes(
          interactions.map((i) => ({
            id: i.id,
            text: i.summary || "",
            timestamp: new Date(i.created_at),
            userId: i.created_by || "",
            userName: "מרכז נשמה",
            type: i.type,
            result: i.result || undefined,
          })),
        );
      })
      .catch((err) => console.error("Error loading interactions:", err))
      .finally(() => setNotesLoading(false));
  }, [contact.id]);

  const handleDelete = () => {
    if (confirm(`האם אתה בטוח שברצונך למחוק את ${contact.fullName}?`)) {
      onDelete();
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("he-IL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const isValidPhone = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    return cleanPhone.length >= 9;
  };

  const getWhatsAppLink = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length >= 9) {
      const international = cleanPhone.startsWith("0")
        ? "972" + cleanPhone.substring(1)
        : cleanPhone;
      return `https://wa.me/${international}`;
    }
    return null;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="btn btn-icon btn-outline" onClick={onClose}>
            <ChevronLeft size={20} />
          </button>
          <h2>{contact.fullName}</h2>
          <button
            className="btn btn-icon btn-outline"
            onClick={onEdit}
            title="ערוך פרטים"
          >
            <Pencil size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Status */}
          <div
            style={{ marginBottom: "var(--spacing-md)", textAlign: "center" }}
          >
            <StatusBadge status={contact.status} />
          </div>

          {/* Donation process for donated contacts */}
          {contact.status === "donated" && (
            <div style={{ marginBottom: "var(--spacing-md)" }}>
              <DonationProcess
                receiptConfirmed={localReceipt}
                thankYouSent={localThankYou}
                onToggleReceipt={handleToggleReceipt}
                onToggleThankYou={handleToggleThankYou}
              />
            </div>
          )}

          {/* Cross-project donation badges */}
          {crossDonations.length > 0 && (
            <div
              style={{
                marginBottom: "var(--spacing-md)",
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                justifyContent: "center",
              }}
            >
              {crossDonations.map((d) => (
                <span
                  key={d.projectId}
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: "#f97316" + "20",
                    color: "#f97316",
                    border: "1px solid #f97316" + "40",
                  }}
                >
                  תרם ₪{d.amount.toLocaleString()} בפרויקט {d.projectName}
                </span>
              ))}
            </div>
          )}

          {/* Contact Info */}
          <div className="card" style={{ marginBottom: "var(--spacing-md)" }}>
            {contact.phone1 && (
              <div className="contact-detail-row">
                {isValidPhone(contact.phone1) ? (
                  <a href={`tel:${contact.phone1}`} className="contact-link">
                    <Phone size={18} />
                    <span>{contact.phone1}</span>
                  </a>
                ) : (
                  <div className="contact-link" style={{ cursor: "default" }}>
                    <Phone size={18} />
                    <span>{contact.phone1}</span>
                  </div>
                )}
                {getWhatsAppLink(contact.phone1) && (
                  <a
                    href={getWhatsAppLink(contact.phone1) || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-icon"
                    style={{ color: "#25D366" }}
                    title="שלח הודעה בוואטסאפ"
                  >
                    <MessageCircle size={20} />
                  </a>
                )}
              </div>
            )}

            {contact.phone2 && (
              <div className="contact-detail-row">
                {isValidPhone(contact.phone2) ? (
                  <a href={`tel:${contact.phone2}`} className="contact-link">
                    <Phone size={18} />
                    <span>{contact.phone2}</span>
                  </a>
                ) : (
                  <div className="contact-link" style={{ cursor: "default" }}>
                    <Phone size={18} />
                    <span>{contact.phone2}</span>
                  </div>
                )}
                {getWhatsAppLink(contact.phone2) && (
                  <a
                    href={getWhatsAppLink(contact.phone2) || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-icon"
                    style={{ color: "#25D366" }}
                    title="שלח הודעה בוואטסאפ"
                  >
                    <MessageCircle size={20} />
                  </a>
                )}
              </div>
            )}

            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="contact-detail-row contact-link-secondary"
              >
                <Mail size={18} />
                <span>{contact.email}</span>
              </a>
            )}

            {(contact.address || contact.city) && (
              <div className="contact-detail-row contact-detail-info">
                <MapPin size={18} />
                <span>
                  {[contact.address, contact.city].filter(Boolean).join(", ")}
                </span>
              </div>
            )}

            {contact.lastCallDate && (
              <div
                className="contact-detail-row contact-detail-info"
                style={{ fontSize: "14px" }}
              >
                <Calendar size={18} />
                <span>שיחה אחרונה: {formatDate(contact.lastCallDate)}</span>
              </div>
            )}
          </div>

          {/* Notes History */}
          <div>
            <h3 className="notes-title">היסטוריית הערות</h3>

            {contact.originalNote && (
              <div
                className="note-item note-original"
                style={{ marginBottom: "var(--spacing-sm)" }}
              >
                <div className="note-header">
                  <span>הערה מקורית (מהאקסל)</span>
                </div>
                <div className="note-text">{contact.originalNote}</div>
              </div>
            )}

            {notesLoading && (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            )}

            {!notesLoading && notes.length === 0 && !contact.originalNote && (
              <div className="empty-state">
                <p>אין הערות עדיין</p>
              </div>
            )}

            {notes.map((note) => (
              <div
                key={note.id}
                className="note-item"
                style={{ marginBottom: "var(--spacing-sm)" }}
              >
                <div className="note-header">
                  <span>{note.userName}</span>
                  <span>{formatDate(note.timestamp)}</span>
                </div>
                <div className="note-text">{note.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={onAddNote}
          >
            <Edit2 size={18} />
            הוסף הערה
          </button>
          {canSendLink && (
            <button
              className="btn"
              style={{
                flex: 0,
                background: "#25D366",
                color: "white",
                border: "none",
              }}
              onClick={() => setShowWhatsApp(true)}
              title="שלח לינק תרומה"
            >
              <Send size={18} />
            </button>
          )}
          <button
            className="btn"
            style={{
              flex: 0,
              background: "var(--color-danger)",
              color: "white",
              border: "none",
            }}
            onClick={handleDelete}
            title="מחק איש קשר"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {showWhatsApp && activeProject && (
        <WhatsAppSendModal
          contact={contact}
          project={activeProject}
          projectContact={projectContact || undefined}
          onSent={async () => {
            if (projectContact) {
              await recordLinkSent(
                projectContact.id,
                projectContact.linkSendCount,
              );
              setProjectContact((prev) =>
                prev
                  ? { ...prev, linkSendCount: prev.linkSendCount + 1 }
                  : prev,
              );
            }
            setShowWhatsApp(false);
          }}
          onClose={() => setShowWhatsApp(false)}
        />
      )}
    </div>
  );
}
