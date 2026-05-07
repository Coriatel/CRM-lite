import { useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useContacts } from "../hooks/useContacts";
import { useDebounce } from "../hooks/useDebounce";
import { ContactCard } from "../components/ContactCard";
import { ContactDetailModal } from "../components/ContactDetailModal";
import { AddNoteModal } from "../components/AddNoteModal";
import type {
  AdvancedFilters,
  Contact,
  ContactStatus,
  QuickFilterTab,
  SortOption,
} from "../types";

interface PeopleHubPageProps {
  sortBy: SortOption;
  advancedFilters: AdvancedFilters;
}

export function PeopleHubPage({ sortBy, advancedFilters }: PeopleHubPageProps) {
  const [quickFilter] = useState<QuickFilterTab>("all");
  const [statusFilter] = useState<ContactStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [noteContact, setNoteContact] = useState<Contact | null>(null);

  const { contacts, loading, hasMore, loadMore, refresh } = useContacts(
    quickFilter,
    statusFilter,
    debouncedSearch,
    sortBy,
    advancedFilters,
  );

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1 className="header-title">אנשי קשר — כל הקהילה</h1>
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
              aria-label="נקה חיפוש"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--spacing-md)",
        }}
      >
        {loading && contacts.length === 0 ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "var(--spacing-xl)",
            }}
          >
            <Loader2 className="spinner" size={32} />
          </div>
        ) : contacts.length === 0 ? (
          <div
            className="empty-state"
            style={{ paddingTop: "var(--spacing-xl)" }}
          >
            <p>לא נמצאו אנשי קשר לפילטר הנוכחי</p>
          </div>
        ) : (
          <>
            {contacts.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                onAddNote={(contact) => setNoteContact(contact)}
                onViewDetails={(contact) => setSelectedContact(contact)}
                // Slice A is read-only — avatar-click edit is a no-op.
                // Wiring to EditContactModal is deferred to Slice E.
                onEdit={() => {}}
              />
            ))}
            {hasMore && (
              <div
                style={{
                  padding: "var(--spacing-md)",
                  textAlign: "center",
                }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={loadMore}
                  disabled={loading}
                >
                  טען עוד
                </button>
              </div>
            )}
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--color-text-secondary)",
              }}
            >
              {contacts.length} אנשי קשר{hasMore ? " (חלקי)" : ""}
            </div>
          </>
        )}
      </main>

      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onAddNote={() => {
            setNoteContact(selectedContact);
            setSelectedContact(null);
          }}
          onEdit={() => setSelectedContact(null)}
          onDelete={() => setSelectedContact(null)}
          onStageChanged={refresh}
        />
      )}

      {noteContact && (
        <AddNoteModal
          contact={noteContact}
          onClose={() => setNoteContact(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
