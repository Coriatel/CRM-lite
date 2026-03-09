import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Phone, MapPin, Mail, FileText, Send } from "lucide-react";
import { CallHistoryTimeline } from "../components/call/CallHistoryTimeline";
import { CallNoteForm } from "../components/call/CallNoteForm";
import { StatusBadge } from "../components/StatusBadge";
import {
  getContact,
  getInteractions,
  updateContact as patchContact,
  getProjectContactForContact,
  getContactCrossProjectDonations,
  DirectusContact,
  DirectusInteraction,
} from "../services/directus";
import { useContactActions } from "../hooks/useContacts";
import { useCallQueue, useCallQueueActions } from "../hooks/useCallQueue";
import { useProjectContext } from "../contexts/ProjectContext";
import { useProjectContactActions } from "../hooks/useProjectContacts";
import { WhatsAppSendModal } from "../components/WhatsAppSendModal";
import { ContactStatus, ProjectContact } from "../types";

export function ActiveCallPage() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { addNote } = useContactActions();
  const { queue } = useCallQueue();
  const { markCompleted, skip } = useCallQueueActions();

  const [contact, setContact] = useState<DirectusContact | null>(null);
  const [interactions, setInteractions] = useState<DirectusInteraction[]>([]);
  const [loadingContact, setLoadingContact] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const dialedRef = useRef(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [projectContact, setProjectContact] = useState<ProjectContact | null>(
    null,
  );
  const [crossDonations, setCrossDonations] = useState<
    { projectId: string; projectName: string; amount: number }[]
  >([]);

  const { activeProject, projects } = useProjectContext();
  const { recordLinkSent } = useProjectContactActions();

  // Validate contactId format
  const isValidId =
    contactId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      contactId,
    );

  // Load contact
  useEffect(() => {
    dialedRef.current = false;
    if (!contactId || !isValidId) return;
    setLoadingContact(true);
    getContact(contactId)
      .then((c) => {
        setContact(c);
        setLoadingContact(false);
      })
      .catch((err) => {
        console.error("Failed to load contact:", err);
        setLoadingContact(false);
      });
  }, [contactId]);

  // Load interactions
  useEffect(() => {
    if (!contactId || !isValidId) return;
    setLoadingHistory(true);
    getInteractions(contactId)
      .then((data) => {
        setInteractions(data);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error("Failed to load interactions:", err);
        setLoadingHistory(false);
      });
  }, [contactId]);

  // Sanitize phone for tel: links
  const sanitizePhone = (raw: string): string | null => {
    const cleaned = raw.replace(/[^\d+\-() ]/g, "");
    return cleaned.length >= 5 ? cleaned : null;
  };

  // Auto-dial on mount
  useEffect(() => {
    if (contact && !dialedRef.current) {
      const rawPhone = contact.phone_e164 || contact.phone_raw;
      const safe = rawPhone ? sanitizePhone(rawPhone) : null;
      if (safe) {
        dialedRef.current = true;
        setTimeout(() => {
          window.open(`tel:${safe}`, "_self");
        }, 500);
      }
    }
  }, [contact]);

  // Fetch project_contact and cross-project donations
  useEffect(() => {
    let cancelled = false;
    if (!activeProject || !contactId || !isValidId) {
      setProjectContact(null);
      setCrossDonations([]);
      return;
    }
    getProjectContactForContact(activeProject.id, contactId)
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

    getContactCrossProjectDonations(contactId)
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
  }, [activeProject, contactId, projects]);

  // Find current queue item for this contact
  const currentQueueItem = queue.find(
    (q) => q.contactId === contactId && q.status === "pending",
  );

  // Find next queue item
  const currentIdx = currentQueueItem
    ? queue.findIndex((q) => q.id === currentQueueItem.id)
    : -1;
  const nextQueueItem =
    currentIdx >= 0 && currentIdx < queue.length - 1
      ? queue[currentIdx + 1]
      : null;

  const handleSave = async (data: {
    note: string;
    status: ContactStatus;
    donationAmount?: number;
    followUpDate?: string;
    followUpNote?: string;
  }) => {
    if (!contactId || !isValidId) return;
    setSaving(true);
    try {
      // Save note + status
      const noteText =
        data.note || (data.status !== "not_checked" ? `סטטוס עודכן` : "");
      if (noteText) {
        await addNote(
          contactId,
          noteText,
          data.status !== "not_checked" ? data.status : undefined,
        );
      }

      // Save follow-up fields to contact
      if (data.followUpDate || data.followUpNote) {
        await patchContact(contactId, {
          follow_up_date: data.followUpDate,
          follow_up_note: data.followUpNote,
        } as Partial<DirectusContact>);
      } else if (data.status !== "call_later" && data.status !== "follow_up") {
        // Clear follow-up when status is no longer follow-up/call_later
        await patchContact(contactId, {
          follow_up_date: undefined,
          follow_up_note: undefined,
        });
      }

      // Mark queue item as completed
      if (currentQueueItem) {
        await markCompleted(currentQueueItem.id, data.status, data.note);
      }

      // Navigate to next or back
      if (nextQueueItem) {
        navigate(`/call/${nextQueueItem.contactId}`, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      console.error("Failed to save:", err);
      alert("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    try {
      if (currentQueueItem) {
        await skip(currentQueueItem.id);
      }
      if (nextQueueItem) {
        navigate(`/call/${nextQueueItem.contactId}`, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      console.error("Failed to skip:", err);
      alert("שגיאה בדילוג");
    }
  };

  if (loadingContact) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--spacing-lg)",
        }}
      >
        <p>איש הקשר לא נמצא</p>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/")}
          style={{ marginTop: "var(--spacing-md)" }}
        >
          חזור לרשימה
        </button>
      </div>
    );
  }

  const rawPhone = contact.phone_e164 || contact.phone_raw;
  const phone = rawPhone ? sanitizePhone(rawPhone) : null;
  const initials = contact.full_name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Header */}
      <header
        className="header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
        }}
      >
        <button
          className="header-btn"
          onClick={() => navigate(-1)}
          style={{ padding: "6px" }}
        >
          <ArrowRight size={20} />
        </button>
        <h1 className="header-title" style={{ flex: 1 }}>
          שיחה פעילה
        </h1>
        {activeProject && activeProject.landingPageUrl && phone && (
          <button
            className="header-btn"
            onClick={() => setShowWhatsApp(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 10px",
              background: "#25D366",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            <Send size={16} />
            לינק
          </button>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="header-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              textDecoration: "none",
              padding: "6px 10px",
            }}
          >
            <Phone size={16} />
            חייג שוב
          </a>
        )}
      </header>

      {/* Contact compact header */}
      <div
        style={{
          padding: "var(--spacing-sm) var(--spacing-md)",
          background: "var(--color-bg-secondary, #f1f5f9)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-sm)",
          }}
        >
          <div
            className="contact-avatar"
            style={{ width: 40, height: 40, fontSize: "14px" }}
          >
            {initials || "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "16px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {contact.full_name}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--spacing-xs)",
                alignItems: "center",
                fontSize: "13px",
                color: "var(--color-text-secondary)",
              }}
            >
              {phone && <span dir="ltr">{phone}</span>}
              <StatusBadge
                status={(contact.call_status as ContactStatus) || "not_checked"}
              />
            </div>
          </div>
        </div>

        {/* Contact details row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--spacing-sm)",
            marginTop: "var(--spacing-xs)",
            fontSize: "12px",
            color: "var(--color-text-secondary)",
          }}
        >
          {contact.city && (
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <MapPin size={11} /> {contact.city}
              {contact.address ? `, ${contact.address}` : ""}
            </span>
          )}
          {contact.email && (
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <Mail size={11} /> {contact.email}
            </span>
          )}
          {contact.original_note && (
            <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <FileText size={11} /> {contact.original_note}
            </span>
          )}
        </div>

        {/* Cross-project donation badges */}
        {crossDonations.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              marginTop: "var(--spacing-xs)",
            }}
          >
            {crossDonations.map((d) => (
              <span
                key={d.projectId}
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: "#f9731620",
                  color: "#f97316",
                }}
              >
                תרם ₪{d.amount.toLocaleString()} ב{d.projectName}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable call history */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--spacing-md)",
          minHeight: 0,
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "var(--spacing-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          היסטוריית שיחות ({interactions.length})
        </h3>
        <CallHistoryTimeline
          interactions={interactions}
          loading={loadingHistory}
        />
      </div>

      {/* Sticky bottom form */}
      {contactId && (
        <CallNoteForm
          contactId={contactId}
          onSave={handleSave}
          onSkip={currentQueueItem ? handleSkip : undefined}
          saving={saving}
          hasNext={!!nextQueueItem}
        />
      )}

      {showWhatsApp && activeProject && contact && (
        <WhatsAppSendModal
          contact={{
            fullName: contact.full_name,
            phone1: contact.phone_e164 || contact.phone_raw,
          }}
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
