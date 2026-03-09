import { useState } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import { Project } from "../contexts/ProjectContext";
import { ProjectContact } from "../types";

interface WhatsAppSendModalProps {
  contact: { fullName: string; phone1?: string };
  project: Project;
  projectContact?: ProjectContact;
  onSent: () => void;
  onClose: () => void;
}

export function WhatsAppSendModal({
  contact,
  project,
  projectContact,
  onSent,
  onClose,
}: WhatsAppSendModalProps) {
  const template = project.whatsappTemplate || "שלום {{name}},\nלתרומה: {{link}}";
  const message = template
    .replace(/\{\{link\}\}/g, project.landingPageUrl || "")
    .replace(/\{\{name\}\}/g, contact.fullName);

  const [previewMessage] = useState(message);

  const getWhatsAppUrl = () => {
    const phone = contact.phone1 || "";
    const cleanPhone = phone.replace(/\D/g, "");
    const international = cleanPhone.startsWith("0")
      ? "972" + cleanPhone.substring(1)
      : cleanPhone;
    return `https://wa.me/${international}?text=${encodeURIComponent(previewMessage)}`;
  };

  const handleSend = () => {
    window.open(getWhatsAppUrl(), "_blank");
    onSent();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400 }}
      >
        <div className="modal-header">
          <button className="btn btn-icon btn-outline" onClick={onClose}>
            <X size={20} />
          </button>
          <h2 style={{ fontSize: "16px" }}>שליחת לינק תרומה</h2>
          <div style={{ width: 36 }} />
        </div>

        <div className="modal-body">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-sm)",
              marginBottom: "var(--spacing-md)",
            }}
          >
            <MessageCircle size={20} style={{ color: "#25D366" }} />
            <div>
              <div style={{ fontWeight: 600 }}>{contact.fullName}</div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
                dir="ltr"
              >
                {contact.phone1}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--color-bg-secondary, #f1f5f9)",
              borderRadius: "8px",
              padding: "var(--spacing-sm)",
              whiteSpace: "pre-wrap",
              fontSize: "14px",
              lineHeight: 1.6,
              marginBottom: "var(--spacing-md)",
              direction: "rtl",
            }}
          >
            {previewMessage}
          </div>

          {projectContact && projectContact.linkSendCount > 0 && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-text-secondary)",
                marginBottom: "var(--spacing-sm)",
                textAlign: "center",
              }}
            >
              נשלח {projectContact.linkSendCount} פעמים
              {projectContact.lastLinkSentAt &&
                ` | אחרון: ${new Date(projectContact.lastLinkSentAt).toLocaleDateString("he-IL")}`}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-primary"
            style={{
              flex: 1,
              background: "#25D366",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
            onClick={handleSend}
          >
            <Send size={18} />
            שלח בוואטסאפ
          </button>
        </div>
      </div>
    </div>
  );
}
