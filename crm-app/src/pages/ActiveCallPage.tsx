import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Phone, MapPin, Mail, FileText } from "lucide-react";
import { CallHistoryTimeline } from "../components/call/CallHistoryTimeline";
import { CallNoteForm } from "../components/call/CallNoteForm";
import { StatusBadge } from "../components/StatusBadge";
import {
  getContact,
  getInteractions,
  updateContact as patchContact,
  DirectusContact,
  DirectusInteraction,
} from "../services/directus";
import { useContactActions } from "../hooks/useContacts";
import { useCallQueue, useCallQueueActions } from "../hooks/useCallQueue";
import { ContactStatus } from "../types";

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
    </div>
  );
}
