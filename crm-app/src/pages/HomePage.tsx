import { useState, useCallback } from "react";
import {
  Search,
  Filter,
  Users,
  Heart,
  GraduationCap,
  Phone as PhoneIcon,
  LogOut,
  X,
  Plus,
  CheckSquare,
  Trash2,
  Upload,
} from "lucide-react";
import {
  SheetName,
  ContactStatus,
  STATUS_LABELS,
  SHEET_LABELS,
  Contact,
} from "../types";
import { useContacts, useContactActions } from "../hooks/useContacts";
import { useAuth } from "../contexts/AuthContext";
import { ContactCard } from "../components/ContactCard";
import { AddNoteModal } from "../components/AddNoteModal";
import { ContactDetailModal } from "../components/ContactDetailModal";
import { EditContactModal } from "../components/EditContactModal";
import { ImportModal } from "../components/ImportModal";

const SHEET_ICONS: Record<SheetName, React.ReactNode> = {
  אנשי_קשר: <Users size={16} />,
  תורמים_פוטנציאליים: <Heart size={16} />,
  תורמים_שתרמו: <Heart size={16} />,
  חברים_טובים: <Users size={16} />,
  תלמידים: <GraduationCap size={16} />,
  להתרמות: <PhoneIcon size={16} />,
};

export function HomePage() {
  const { user, signOut } = useAuth();
  const [selectedSheet, setSelectedSheet] = useState<SheetName | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [noteContact, setNoteContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const { contacts, loading, hasMore, loadMore, loadAll, refresh } =
    useContacts(selectedSheet, statusFilter, searchQuery);

  const { createContact, updateContact, deleteContact } = useContactActions();

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (
        scrollHeight - scrollTop <= clientHeight * 1.5 &&
        hasMore &&
        !loading
      ) {
        loadMore();
      }
    },
    [hasMore, loading, loadMore],
  );

  const handleSaveContact = async (data: Partial<Contact>) => {
    if (editContact) {
      await updateContact(editContact.id, data);
    } else {
      await createContact(data);
    }
    setIsEditModalOpen(false);
    refresh();
  };

  const handleDeleteContact = async () => {
    if (selectedContact) {
      await deleteContact(selectedContact.id);
      setSelectedContact(null);
      refresh();
    }
  };

  const handleDeleteEditContact = async () => {
    if (editContact) {
      await deleteContact(editContact.id);
      setIsEditModalOpen(false);
      setEditContact(null);
      refresh();
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedIds(new Set());
  };

  const selectAll = () => {
    setSelectedIds(new Set(contacts.map((c) => c.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (confirm(`האם אתה בטוח שברצונך למחוק ${selectedIds.size} אנשי קשר?`)) {
      for (const id of selectedIds) {
        await deleteContact(id);
      }
      setSelectedIds(new Set());
      setSelectionMode(false);
      refresh();
    }
  };

  const handleBulkImport = async (contacts: Partial<Contact>[]) => {
    for (const contact of contacts) {
      await createContact(contact);
    }
    refresh();
  };

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
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
          <h1 className="header-title">CRM Lite</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-sm)",
            }}
          >
            {!selectionMode ? (
              <>
                <button
                  className="btn btn-primary"
                  style={{
                    padding: "4px 8px",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onClick={() => {
                    setEditContact(null);
                    setIsEditModalOpen(true);
                  }}
                >
                  <Plus size={16} />
                  <span>חדש</span>
                </button>
                <button
                  className="btn btn-icon"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                  onClick={() => setIsImportModalOpen(true)}
                  title="ייבא מאקסל"
                >
                  <Upload size={18} />
                </button>
                <button
                  className="btn btn-icon"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                  onClick={toggleSelectionMode}
                  title="בחירה מרובה"
                >
                  <CheckSquare size={18} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-icon"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                  onClick={selectAll}
                  title="בחר הכל"
                >
                  <CheckSquare size={18} />
                </button>
                <button
                  className="btn btn-icon"
                  style={{ background: "var(--color-danger)" }}
                  onClick={handleBulkDelete}
                  title="מחק נבחרים"
                  disabled={selectedIds.size === 0}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  className="btn btn-icon"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                  onClick={toggleSelectionMode}
                  title="ביטול"
                >
                  <X size={18} />
                </button>
                <span style={{ fontSize: "14px", opacity: 0.8 }}>
                  {selectedIds.size} נבחרו
                </span>
              </>
            )}
            <span style={{ fontSize: "14px", opacity: 0.8 }}>
              {user?.displayName}
            </span>
            <button
              className="btn btn-icon"
              style={{ background: "rgba(255,255,255,0.2)" }}
              onClick={signOut}
              title="התנתק"
            >
              <LogOut size={18} />
            </button>
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
          <button
            style={{
              background: "none",
              border: "none",
              color: "white",
              cursor: "pointer",
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={20} />
          </button>
        </div>
      </header>

      {/* Sheet tabs */}
      <div className="tabs">
        <button
          className={`tab ${selectedSheet === "all" ? "active" : ""}`}
          onClick={() => setSelectedSheet("all")}
        >
          הכל ({contacts.length})
        </button>
        {(Object.keys(SHEET_LABELS) as SheetName[]).map((sheet) => (
          <button
            key={sheet}
            className={`tab ${selectedSheet === sheet ? "active" : ""}`}
            onClick={() => setSelectedSheet(sheet)}
          >
            {SHEET_ICONS[sheet]}
            <span style={{ marginRight: 4 }}>{SHEET_LABELS[sheet]}</span>
          </button>
        ))}
      </div>

      {/* Status filter */}
      {showFilters && (
        <div
          className="filter-chips"
          style={{ padding: "var(--spacing-sm) var(--spacing-md)" }}
        >
          <button
            className={`filter-chip ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            הכל
          </button>
          {(Object.keys(STATUS_LABELS) as ContactStatus[]).map((status) => (
            <button
              key={status}
              className={`filter-chip ${statusFilter === status ? "active" : ""}`}
              onClick={() => setStatusFilter(status)}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      )}

      {/* Contact list */}
      <main
        className="main-content"
        onScroll={handleScroll}
        style={{ overflowY: "auto", flex: 1 }}
      >
        {loading && contacts.length === 0 ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="empty-state">
            <Users size={48} className="empty-state-icon" />
            <p>לא נמצאו אנשי קשר</p>
            {searchQuery && <p style={{ fontSize: "14px" }}>נסה חיפוש אחר</p>}
          </div>
        ) : (
          <div className="contact-list">
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onAddNote={(c) => setNoteContact(c)}
                onViewDetails={(c) => setSelectedContact(c)}
                onEdit={(c) => {
                  setEditContact(c);
                  setIsEditModalOpen(true);
                }}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(contact.id)}
                onToggleSelect={toggleSelection}
              />
            ))}

            {loading && (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            )}

            {!loading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "20px",
                  color: "var(--color-text-secondary)",
                }}
              >
                <div>מוצגים {contacts.length} אנשי קשר</div>
                <button
                  onClick={loadAll}
                  className="btn"
                  style={{
                    background: "var(--color-bg-secondary)",
                    border: "1px solid var(--color-border)",
                    padding: "8px 16px",
                    fontSize: "14px",
                  }}
                >
                  טען את הכל
                </button>
              </div>
            )}
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
        title="אנשי קשר חדש"
      >
        <Plus size={24} />
      </button>

      {/* Modals */}
      {noteContact && (
        <AddNoteModal
          contact={noteContact}
          onClose={() => setNoteContact(null)}
          onSaved={refresh}
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
    </div>
  );
}
