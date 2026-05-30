import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePerson } from "../hooks/usePerson";
import { ContactDetailModal } from "../components/ContactDetailModal";
import { AddNoteModal } from "../components/AddNoteModal";

// Deep-linkable full person workflow surface (A3). Reuses the existing
// ContactDetailModal body (notes, stage, donations, WhatsApp) rendered as a
// routed page, so /people/:id can be linked from anywhere (e.g. lesson and
// follow-up relationships) instead of only opening as a transient modal.
export function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { contact, loading, error, refresh } = usePerson(id);
  const [addingNote, setAddingNote] = useState(false);
  const navigate = useNavigate();

  const goBack = () => navigate(-1);

  if (loading) {
    return (
      <main className="main-content">
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      </main>
    );
  }

  if (error || !contact) {
    return (
      <main className="main-content">
        <p
          role="alert"
          style={{ color: "var(--color-danger)", fontSize: 14 }}
        >
          {error || "איש הקשר לא נמצא"}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: "var(--spacing-md)" }}
          onClick={goBack}
        >
          חזרה
        </button>
      </main>
    );
  }

  return (
    <>
      <ContactDetailModal
        contact={contact}
        onClose={goBack}
        onAddNote={() => setAddingNote(true)}
        onEdit={() => {}}
        onDelete={goBack}
        onStageChanged={refresh}
      />
      {addingNote && (
        <AddNoteModal
          contact={contact}
          onClose={() => setAddingNote(false)}
          onSaved={() => {
            setAddingNote(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
