import { useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { updateContact } from "../../services/directus";

/**
 * Schedule a follow-up for a contact OUTSIDE the call flow (RPOS Lane A,
 * data-entry-first). Writes follow_up_date (+ optional note) via the existing
 * updateContact PATCH — no schema change. Populates the People Waiting card and
 * the daily agenda naturally as the Rabbi schedules follow-ups from a person.
 *
 * Self-contained: owns its own form/save state. Host renders it with the
 * contact id + current values; onChanged lets the host refresh after a save.
 */

/** Local YYYY-MM-DD for the date input's default/min (tz-safe, no UTC shift). */
function todayLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function ScheduleFollowUp({
  contactId,
  currentDate,
  currentNote,
  onChanged,
}: {
  contactId: string;
  currentDate?: string | null;
  currentNote?: string | null;
  onChanged?: (date: string, note: string) => void;
}) {
  const [date, setDate] = useState<string>(currentDate?.slice(0, 10) ?? "");
  const [note, setNote] = useState<string>(currentNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDate, setSavedDate] = useState<string | null>(
    currentDate ? currentDate.slice(0, 10) : null,
  );

  async function handleSave() {
    if (!date) {
      setError("בחר תאריך מעקב");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateContact(contactId, {
        follow_up_date: date,
        // Only send the note when the Rabbi typed one — never blank an existing note.
        ...(note.trim() ? { follow_up_note: note.trim() } : {}),
      } as Record<string, unknown>);
      setSavedDate(date);
      onChanged?.(date, note.trim());
    } catch {
      setError("שמירת המעקב נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="schedule-followup"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--spacing-sm)",
        marginBottom: "var(--spacing-md)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <CalendarPlus size={18} style={{ color: "var(--color-primary)" }} />
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1 }}>
          קביעת מעקב
        </h3>
        {savedDate ? (
          <span
            data-testid="schedule-followup-current"
            dir="ltr"
            style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
          >
            מעקב נוכחי: {savedDate}
          </span>
        ) : null}
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="date"
          data-testid="schedule-followup-date"
          aria-label="תאריך מעקב"
          value={date}
          min={todayLocal()}
          onChange={(e) => setDate(e.target.value)}
          style={{
            minHeight: 44,
            padding: "8px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <textarea
          data-testid="schedule-followup-note"
          aria-label="הערת מעקב (לא חובה)"
          placeholder="הערת מעקב (לא חובה)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{
            padding: "8px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 14,
            resize: "vertical",
          }}
        />
        {error ? (
          <p data-testid="schedule-followup-error" style={{ color: "var(--color-danger)", fontSize: 13, margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          data-testid="schedule-followup-save"
          onClick={handleSave}
          disabled={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            minHeight: 44,
            background: "var(--color-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Check size={16} />
          {savedDate ? "עדכון מעקב" : "קבע מעקב"}
        </button>
      </div>
    </section>
  );
}
