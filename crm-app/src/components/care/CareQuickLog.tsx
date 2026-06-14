import { useState } from "react";
import { Check } from "lucide-react";
import { createCareReport, type CareInteractionType } from "../../services/directus";

/**
 * Minimal care-touch capture (RPOS Lane A, data-entry-first). Complements — does
 * NOT replace — the full CareReportForm (followup/sentiment/datetime), mirroring
 * the codebase's existing ScheduleQuickAdd-vs-MeetingForm quick/full split.
 * One interaction-type chip + one line of summary -> createCareReport with
 * interaction_at=now and safe defaults. Populates care_reports naturally.
 */

const TYPES: { value: CareInteractionType; label: string }[] = [
  { value: "call", label: "שיחה" },
  { value: "meeting", label: "פגישה" },
  { value: "message", label: "הודעה" },
  { value: "other", label: "אחר" },
];

/** Local "now" as a Directus-acceptable ISO (tz-safe, no UTC shift). */
function nowLocalIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 19);
}

export function CareQuickLog({
  contactId,
  onSaved,
}: {
  contactId: string;
  onSaved?: () => void;
}) {
  const [type, setType] = useState<CareInteractionType>("call");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!summary.trim()) {
      setError("כתוב סיכום קצר");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCareReport({
        contact_id: contactId,
        interaction_type: type,
        interaction_at: nowLocalIso(),
        summary: summary.trim(),
      });
      setSummary("");
      onSaved?.();
    } catch {
      setError("שמירת הדיווח נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="care-quick-log" style={{ marginBottom: "var(--spacing-sm)" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            data-testid={`care-quick-type-${t.value}`}
            aria-pressed={type === t.value}
            onClick={() => setType(t.value)}
            style={{
              minHeight: 36,
              padding: "4px 12px",
              borderRadius: 999,
              border: "1px solid var(--color-border)",
              background: type === t.value ? "var(--color-primary)" : "none",
              color: type === t.value ? "#fff" : "var(--color-text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <input
          type="text"
          data-testid="care-quick-summary"
          aria-label="סיכום טיפול קצר"
          placeholder="סיכום קצר…"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            padding: "8px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <button
          type="button"
          data-testid="care-quick-save"
          onClick={handleSave}
          disabled={busy}
          aria-label="שמור דיווח טיפול מהיר"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 44,
            minHeight: 44,
            background: "var(--color-primary)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          <Check size={18} />
        </button>
      </div>
      {error ? (
        <p data-testid="care-quick-error" style={{ color: "var(--color-danger)", fontSize: 13, margin: "6px 0 0" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
