import { useState } from "react";
import { UserRound, RefreshCw, Phone, MessageCircle, Check } from "lucide-react";
import { usePeopleWaiting } from "../../data/usePeopleWaiting";
import { normalizeIsraeliPhone } from "../../services/phoneUtils";
import { updateContact, type DirectusContact } from "../../services/directus";

/**
 * People Waiting card (RPOS Phase 1 top-card "people waiting for contact").
 * Surfaces follow-up-due contacts on the Rabbi home with one-tap call / WhatsApp
 * actions — the "act now" the agenda glance (RabbiDayCard) lacks. Reuses the
 * getFollowUpCandidates reader via usePeopleWaiting; no new service code.
 */

const MAX_ROWS = 6;

/** Whole days between follow_up_date (YYYY-MM-DD) and today; negative = future. */
function daysOverdue(due: string | null | undefined, today = new Date()): number | null {
  if (!due) return null;
  const d = due.slice(0, 10);
  const t = today.toISOString().slice(0, 10);
  const ms = Date.parse(t) - Date.parse(d);
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / 86400000);
}

function OverdueBadge({ due }: { due: string | null | undefined }) {
  const n = daysOverdue(due);
  if (n === null) return null;
  const label = n > 0 ? `באיחור ${n}ד׳` : n === 0 ? "להיום" : "בקרוב";
  const color = n > 0 ? "var(--color-danger)" : n === 0 ? "var(--color-primary)" : "var(--color-text-secondary)";
  return (
    <span
      data-testid="people-waiting-overdue"
      style={{ fontSize: 11, fontWeight: 600, color, flexShrink: 0 }}
    >
      {label}
    </span>
  );
}

function ActionButton({
  href,
  label,
  icon,
  testId,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  testId: string;
}) {
  return (
    <a
      href={href}
      data-testid={testId}
      aria-label={label}
      title={label}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 44,
        minHeight: 44,
        border: "1px solid var(--color-border)",
        borderRadius: 999,
        color: "var(--color-primary)",
        textDecoration: "none",
        flexShrink: 0,
      }}
    >
      {icon}
    </a>
  );
}

function PersonRow({
  person,
  onHandled,
  busy,
}: {
  person: DirectusContact;
  onHandled: () => void;
  busy: boolean;
}) {
  const phone = normalizeIsraeliPhone(person.phone_e164 || person.phone_raw);
  const waNumber = phone.replace(/^\+/, "");
  const hasPhone = phone.length >= 10;
  return (
    <li
      data-testid="people-waiting-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-sm)",
        padding: "8px 0",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {person.full_name || "ללא שם"}
        </div>
        {person.follow_up_note ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {person.follow_up_note}
          </div>
        ) : null}
      </div>
      <OverdueBadge due={person.follow_up_date} />
      {hasPhone ? (
        <>
          <ActionButton
            href={`tel:${phone}`}
            label={`התקשר ל${person.full_name || "איש קשר"}`}
            icon={<Phone size={16} />}
            testId="people-waiting-call"
          />
          <ActionButton
            href={`https://wa.me/${waNumber}`}
            label={`וואטסאפ ל${person.full_name || "איש קשר"}`}
            icon={<MessageCircle size={16} />}
            testId="people-waiting-whatsapp"
          />
        </>
      ) : (
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", flexShrink: 0 }}>
          אין טלפון
        </span>
      )}
      <button
        type="button"
        data-testid="people-waiting-handled"
        onClick={onHandled}
        disabled={busy}
        aria-label={`סמן שטופל — ${person.full_name || "איש קשר"}`}
        title="טופל (הסר מהרשימה)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 44,
          minHeight: 44,
          background: "none",
          border: "1px solid var(--color-border)",
          borderRadius: 999,
          color: "var(--color-text-secondary)",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        <Check size={16} />
      </button>
    </li>
  );
}

export function PeopleWaitingCard() {
  const { people, loading, error, refresh } = usePeopleWaiting();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // "Handled": after the Rabbi makes contact, clear follow_up_date so the
  // person drops off the waiting list (and the agenda). The note is preserved.
  async function handleHandled(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await updateContact(id, { follow_up_date: null } as Record<string, unknown>);
      refresh();
    } catch {
      setActionError("עדכון נכשל");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      className="card"
      data-testid="people-waiting-card"
      style={{ marginBottom: "var(--spacing-md)" }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <UserRound size={20} style={{ color: "var(--color-primary)" }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>
          ממתינים ליצירת קשר
        </h2>
        {people && people.length > 0 ? (
          <span
            data-testid="people-waiting-count"
            style={{ fontSize: 13, fontWeight: 700, color: "var(--color-danger)" }}
          >
            {people.length}
          </span>
        ) : null}
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="ריענון ממתינים"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 44,
            minHeight: 44,
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: 999,
            color: "var(--color-text-secondary)",
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw size={16} style={{ animation: loading ? "spin 1s linear infinite" : undefined }} />
        </button>
      </header>

      {error ? (
        <p data-testid="people-waiting-error" style={{ color: "var(--color-danger)", fontSize: 14, margin: 0 }}>
          {error}
        </p>
      ) : people === null ? (
        <p data-testid="people-waiting-loading" style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: 0 }}>
          טוען…
        </p>
      ) : people.length === 0 ? (
        <p data-testid="people-waiting-empty" style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>
          אין כרגע אנשים שממתינים ליצירת קשר.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {people.slice(0, MAX_ROWS).map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              busy={busyId === p.id}
              onHandled={() => handleHandled(p.id)}
            />
          ))}
        </ul>
      )}
      {actionError ? (
        <p data-testid="people-waiting-action-error" style={{ color: "var(--color-danger)", fontSize: 13, margin: "8px 0 0" }}>
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
