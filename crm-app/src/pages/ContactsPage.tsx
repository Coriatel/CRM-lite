import { useState, useEffect, useRef } from "react";
import { useDebounce } from "../hooks/useDebounce";
import {
  Search,
  Users,
  X,
  Plus,
  MoreHorizontal,
  Download,
  Upload,
} from "lucide-react";
import {
  SortOption,
  Contact,
  AdvancedFilters,
  CampaignQuickFilter,
  CAMPAIGN_FILTER_LABELS,
  CAMPAIGN_STATUS_COLORS,
  CampaignStatus,
} from "../types";
import {
  useProjectContacts,
  useProjectContactActions,
} from "../hooks/useProjectContacts";
import { useContactActions } from "../hooks/useContacts";
import { useProjectContext } from "../contexts/ProjectContext";
import { getProjectStats } from "../services/directus";
import { ContactCard } from "../components/ContactCard";
import { AddNoteModal } from "../components/AddNoteModal";
import { ContactDetailModal } from "../components/ContactDetailModal";
import { EditContactModal } from "../components/EditContactModal";
import { ImportModal } from "../components/ImportModal";
import { ProjectSwitcher } from "../components/ProjectSwitcher";
import { WhatsAppSendModal } from "../components/WhatsAppSendModal";
import { ImportContactsToProject } from "../components/ImportContactsToProject";

interface ContactsPageProps {
  sortBy: SortOption;
  onSortChange?: (sort: SortOption) => void;
  advancedFilters?: AdvancedFilters;
}

export function ContactsPage({ sortBy, advancedFilters }: ContactsPageProps) {
  const { activeProject } = useProjectContext();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [noteContact, setNoteContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportFromProjectOpen, setIsImportFromProjectOpen] = useState(false);

  // Campaign filter
  const [campaignFilter, setCampaignFilter] =
    useState<CampaignQuickFilter>("all");
  const [whatsappContact, setWhatsappContact] = useState<{
    contact: Contact;
    pcId: string;
    linkCount: number;
    lastSent?: string;
  } | null>(null);

  // Overflow menu for import actions
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Tab count stats (effect is below after campaignContacts is declared)
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  // Close overflow on outside click
  useEffect(() => {
    if (!showOverflow) return;
    const handler = (e: MouseEvent) => {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setShowOverflow(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOverflow]);

  // Tag filters from drawer
  const allTags = [
    ...(advancedFilters?.sheetTags || []),
    ...(advancedFilters?.groupTags || []),
  ];

  // Project contacts with server-side search + filtering
  const {
    contacts: campaignContacts,
    loading: campaignLoading,
    refresh: refreshCampaign,
  } = useProjectContacts(
    activeProject?.id || null,
    campaignFilter !== "all" ? campaignFilter : undefined,
    debouncedSearch || undefined,
    sortBy,
    allTags.length > 0 ? allTags : undefined,
  );

  // Refresh tab counts when contacts change
  useEffect(() => {
    if (!activeProject) return;
    getProjectStats(activeProject.id)
      .then((stats) => {
        setTabCounts({ all: stats.total, ...stats.byStatus });
      })
      .catch(() => {});
  }, [activeProject?.id, campaignContacts.length]);

  const { createContact, updateContact, deleteContact } = useContactActions();
  const pcActions = useProjectContactActions();

  const handleSaveContact = async (data: Partial<Contact>) => {
    if (editContact) {
      await updateContact(editContact.id, data);
    } else {
      const newContact = await createContact(data);
      // Auto-add new contact to current project
      if (activeProject && newContact) {
        try {
          await pcActions.addToProject(activeProject.id, [
            (newContact as { id: string }).id,
          ]);
        } catch {}
      }
    }
    setIsEditModalOpen(false);
    refreshCampaign();
  };

  const handleDeleteContact = async () => {
    if (selectedContact) {
      await deleteContact(selectedContact.id);
      setSelectedContact(null);
      refreshCampaign();
    }
  };

  const handleDeleteEditContact = async () => {
    if (editContact) {
      await deleteContact(editContact.id);
      setIsEditModalOpen(false);
      setEditContact(null);
      refreshCampaign();
    }
  };

  const handleBulkImport = async (importedContacts: Partial<Contact>[]) => {
    for (const contact of importedContacts) {
      await createContact(contact);
    }
    refreshCampaign();
  };

  if (!activeProject) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        <header className="header">
          <h1 className="header-title">אנשי קשר</h1>
        </header>
        <div
          className="empty-state"
          style={{ paddingTop: "var(--spacing-xl)" }}
        >
          <Users size={48} className="empty-state-icon" />
          <p>יש לבחור פרויקט בהגדרות כדי להציג אנשי קשר</p>
        </div>
      </div>
    );
  }

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
      <header className="header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <ProjectSwitcher />
          <div style={{ position: "relative" }} ref={overflowRef}>
            <button
              className="header-btn"
              onClick={() => setShowOverflow((v) => !v)}
              title="אפשרויות"
            >
              <MoreHorizontal size={20} />
            </button>
            {showOverflow && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "var(--color-surface)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 60,
                  minWidth: 160,
                  overflow: "hidden",
                }}
              >
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: 14,
                    color: "var(--color-text)",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setShowOverflow(false);
                    setIsImportFromProjectOpen(true);
                  }}
                >
                  <Download size={16} />
                  ייבא מפרויקט
                </button>
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: 14,
                    color: "var(--color-text)",
                    cursor: "pointer",
                    borderTop: "1px solid var(--color-border)",
                  }}
                  onClick={() => {
                    setShowOverflow(false);
                    setIsImportModalOpen(true);
                  }}
                >
                  <Upload size={16} />
                  ייבא מאקסל
                </button>
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: 14,
                    color: "var(--color-text)",
                    cursor: "pointer",
                    borderTop: "1px solid var(--color-border)",
                  }}
                  onClick={() => {
                    setShowOverflow(false);
                    setEditContact(null);
                    setIsEditModalOpen(true);
                  }}
                >
                  <Plus size={16} />
                  איש קשר חדש
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="search-box">
          <Search size={20} style={{ opacity: 0.7 }} />
          <input
            type="text"
            placeholder="חיפוש לפי שם או טלפון..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              style={{
                background: "none",
                border: "none",
                color: "white",
                cursor: "pointer",
              }}
              onClick={() => setSearchQuery("")}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Campaign filter tabs — horizontal scroll */}
      <div
        className="tabs"
        style={{
          overflowX: "auto",
          flexWrap: "nowrap",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {(Object.keys(CAMPAIGN_FILTER_LABELS) as CampaignQuickFilter[]).map(
          (filter) => (
            <button
              key={filter}
              className={`tab ${campaignFilter === filter ? "active" : ""}`}
              onClick={() => setCampaignFilter(filter)}
              style={{
                flexShrink: 0,
                ...(campaignFilter === filter && filter !== "all"
                  ? {
                      borderBottomColor:
                        CAMPAIGN_STATUS_COLORS[filter as CampaignStatus],
                    }
                  : undefined),
              }}
            >
              {CAMPAIGN_FILTER_LABELS[filter]}
              {tabCounts[filter] !== undefined && (
                <span
                  style={{
                    fontSize: 11,
                    opacity: 0.8,
                    fontWeight: 400,
                    marginInlineStart: 2,
                  }}
                >
                  ({tabCounts[filter]})
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {/* Contact list */}
      <main
        className="main-content"
        style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
      >
        {campaignLoading ? (
          <div className="contact-list">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card contact-card skeleton-card">
                <div className="skeleton skeleton-avatar" />
                <div className="contact-info">
                  <div
                    className="skeleton skeleton-line"
                    style={{ width: "60%" }}
                  />
                  <div
                    className="skeleton skeleton-line"
                    style={{ width: "40%", marginTop: 6 }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : campaignContacts.length === 0 ? (
          <div className="empty-state">
            <Users size={48} className="empty-state-icon" />
            {debouncedSearch ? (
              <>
                <p>לא נמצאו תוצאות עבור "{debouncedSearch}"</p>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSearchQuery("")}
                  style={{ marginTop: "var(--spacing-sm)" }}
                >
                  <X size={16} />
                  נקה חיפוש
                </button>
              </>
            ) : campaignFilter !== "all" ? (
              <>
                <p>
                  אין אנשי קשר בסטטוס "{CAMPAIGN_FILTER_LABELS[campaignFilter]}"
                </p>
                <button
                  className="btn btn-secondary"
                  onClick={() => setCampaignFilter("all")}
                  style={{ marginTop: "var(--spacing-sm)" }}
                >
                  הצג הכל
                </button>
              </>
            ) : (
              <>
                <p>הקמפיין ריק</p>
                <button
                  className="btn btn-primary"
                  onClick={() => setIsImportFromProjectOpen(true)}
                  style={{ marginTop: "var(--spacing-sm)" }}
                >
                  <Download size={16} />
                  ייבא אנשי קשר
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="contact-list">
            {campaignContacts.map((pc) => {
              if (!pc.contact) return null;
              return (
                <ContactCard
                  key={pc.id}
                  contact={pc.contact}
                  onAddNote={(c) => setNoteContact(c)}
                  onViewDetails={(c) => setSelectedContact(c)}
                  onEdit={(c) => {
                    setEditContact(c);
                    setIsEditModalOpen(true);
                  }}
                  campaignStatus={pc.campaignStatus}
                  linkSendCount={pc.linkSendCount}
                  onSendLink={
                    activeProject?.landingPageUrl
                      ? (c) =>
                          setWhatsappContact({
                            contact: c,
                            pcId: pc.id,
                            linkCount: pc.linkSendCount,
                            lastSent: pc.lastLinkSentAt,
                          })
                      : undefined
                  }
                />
              );
            })}
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--color-text-secondary)",
              }}
            >
              {campaignContacts.length} אנשי קשר בקמפיין
            </div>
          </div>
        )}
      </main>

      {/* FAB */}
      <button
        className="fab"
        onClick={() => {
          setEditContact(null);
          setIsEditModalOpen(true);
        }}
        title="איש קשר חדש"
      >
        <Plus size={24} />
      </button>

      {/* Modals */}
      {noteContact && (
        <AddNoteModal
          contact={noteContact}
          onClose={() => setNoteContact(null)}
          onSaved={() => refreshCampaign()}
        />
      )}

      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onAddNote={() => {
            setNoteContact(selectedContact);
            setSelectedContact(null);
          }}
          onEdit={() => {
            setEditContact(selectedContact);
            setSelectedContact(null);
            setIsEditModalOpen(true);
          }}
          onDelete={handleDeleteContact}
        />
      )}

      <EditContactModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveContact}
        onDelete={handleDeleteEditContact}
        contact={editContact || undefined}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleBulkImport}
      />

      {isImportFromProjectOpen && activeProject && (
        <ImportContactsToProject
          targetProjectId={activeProject.id}
          onClose={() => setIsImportFromProjectOpen(false)}
          onImported={refreshCampaign}
        />
      )}

      {whatsappContact && activeProject && (
        <WhatsAppSendModal
          contact={whatsappContact.contact}
          project={activeProject}
          projectContact={{
            id: whatsappContact.pcId,
            projectId: activeProject.id,
            contactId: whatsappContact.contact.id,
            campaignStatus: "link_sent",
            linkSendCount: whatsappContact.linkCount,
            lastLinkSentAt: whatsappContact.lastSent,
            dateCreated: "",
            dateUpdated: "",
          }}
          onSent={async () => {
            const { recordLinkSent } = pcActions;
            await recordLinkSent(
              whatsappContact!.pcId,
              whatsappContact!.linkCount,
            );
            setWhatsappContact(null);
            refreshCampaign();
          }}
          onClose={() => setWhatsappContact(null)}
        />
      )}
    </div>
  );
}
