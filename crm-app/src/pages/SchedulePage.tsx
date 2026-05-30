import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CalendarDays, Phone, RefreshCw, CalendarClock } from "lucide-react";
import {
  getContactsByIds,
  DirectusCallQueueItem,
  DirectusContact,
} from "../services/directus";
import { useRabbiSchedule } from "../hooks/useRabbiSchedule";
import { useCallQueueActions } from "../hooks/useCallQueue";
import { addDays, type DayKey } from "../utils/scheduleWindow";

const AGENDA_DAYS = 7;
const SOFT_CAP = 200;

const PRIORITY_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#6b7280",
};

// Hebrew label for a day bucket. today/tomorrow are named; further days show
// weekday + dd/MM so a Rabbi can plan the week at a glance.
function dayLabel(dateStr: string, key: DayKey): string {
  if (key === "today") return "היום";
  if (key === "tomorrow") return "מחר";
  const d = new Date(`${dateStr}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  return `${weekday} ${dm}`;
}

export function SchedulePage() {
  const { schedule, error, refresh } = useRabbiSchedule(AGENDA_DAYS, SOFT_CAP);
  const [contactsById, setContactsById] = useState<Map<
    string,
    DirectusContact
  > | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { reschedule } = useCallQueueActions();
  const navigate = useNavigate();

  async function handleSnooze(id: string) {
    if (!schedule) return;
    setPendingId(id);
    setActionError(null);
    try {
      await reschedule(id, addDays(schedule.todayStr, 1));
      refresh();
    } catch {
      setActionError("נכשלה דחיית המשימה");
      setPendingId(null);
    }
  }

  useEffect(() => {
    if (!schedule) {
      setContactsById(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const all = [
        ...schedule.overdue,
        ...schedule.days.flatMap((d) => d.items),
      ];
      const ids = Array.from(new Set(all.map((q) => q.contact_id)));
      const contacts = ids.length > 0 ? await getContactsByIds(ids) : [];
      if (cancelled) return;
      setContactsById(new Map(contacts.map((c) => [c.id, c])));
    })();
    return () => {
      cancelled = true;
    };
  }, [schedule]);

  const loading = !schedule;
  const totalUpcoming = schedule
    ? schedule.days.reduce((n, d) => n + d.items.length, 0)
    : 0;
  const empty =
    schedule && schedule.overdue.length === 0 && totalUpcoming === 0;

  return (
    <main className="main-content">
      <header
        style={{
          marginBottom: "var(--spacing-md)",
          position: "sticky",
          top: 0,
          background: "var(--color-bg)",
          paddingTop: "var(--spacing-xs)",
          paddingBottom: "var(--spacing-sm)",
          zIndex: 5,
        }}
      >
        <Link
          to="/today"
          style={{
            color: "var(--color-primary)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          ← חזרה ללוח היום
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 4,
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CalendarDays size={22} /> לוח זמנים
          </h1>
          <button
            type="button"
            onClick={refresh}
            aria-label="רענן"
            title="רענן"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
              width: 36,
              height: 36,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {(error || actionError) && (
        <p
          role="alert"
          style={{
            color: "var(--color-danger)",
            fontSize: 14,
            marginBottom: "var(--spacing-md)",
          }}
        >
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      ) : empty ? (
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: 14,
            padding: "var(--spacing-md) 0",
          }}
        >
          אין משימות מתוזמנות בשבוע הקרוב
        </p>
      ) : (
        <>
          {schedule!.overdue.length > 0 && (
            <DaySection
              title={`באיחור (${schedule!.overdue.length})`}
              tone="danger"
              items={schedule!.overdue}
              contactsById={contactsById}
              pendingId={pendingId}
              onCall={(id) => navigate(`/call/${id}`)}
              onSnooze={handleSnooze}
            />
          )}
          {schedule!.days.map((d) => (
            <DaySection
              key={d.dateStr}
              title={`${dayLabel(d.dateStr, d.key)} (${d.items.length})`}
              muted={d.items.length === 0}
              items={d.items}
              contactsById={contactsById}
              pendingId={pendingId}
              onCall={(id) => navigate(`/call/${id}`)}
              // No snooze on "today" — those are handled on the calls page;
              // snoozing today to tomorrow from the agenda is the planning move.
              onSnooze={handleSnooze}
            />
          ))}
        </>
      )}
    </main>
  );
}

function DaySection({
  title,
  tone,
  muted,
  items,
  contactsById,
  pendingId,
  onCall,
  onSnooze,
}: {
  title: string;
  tone?: "danger";
  muted?: boolean;
  items: DirectusCallQueueItem[];
  contactsById: Map<string, DirectusContact> | null;
  pendingId: string | null;
  onCall: (contactId: string) => void;
  onSnooze: (queueId: string) => void;
}) {
  return (
    <section style={{ marginBottom: "var(--spacing-lg)" }}>
      <h2
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: "var(--spacing-sm)",
          color:
            tone === "danger"
              ? "var(--color-danger)"
              : "var(--color-text-secondary)",
          opacity: muted ? 0.55 : 1,
        }}
      >
        {title}
      </h2>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          —
        </p>
      ) : (
        items.map((q) => (
          <ScheduleRow
            key={q.id}
            queue={q}
            contact={contactsById?.get(q.contact_id)}
            disabled={pendingId === q.id}
            onCall={() => onCall(q.contact_id)}
            onSnooze={() => onSnooze(q.id)}
          />
        ))
      )}
    </section>
  );
}

function ScheduleRow({
  queue,
  contact,
  disabled,
  onCall,
  onSnooze,
}: {
  queue: DirectusCallQueueItem;
  contact?: DirectusContact;
  disabled: boolean;
  onCall: () => void;
  onSnooze: () => void;
}) {
  const name = contact?.full_name || "(ללא שם)";
  const phone = contact?.phone_e164 || contact?.phone2;
  return (
    <div
      className="card"
      style={{
        marginBottom: "var(--spacing-sm)",
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-sm)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: PRIORITY_COLORS[queue.priority] || "#6b7280",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        {phone && (
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
            }}
            dir="ltr"
          >
            {phone}
          </div>
        )}
        {queue.notes && (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={queue.notes}
          >
            {queue.notes}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onSnooze}
          disabled={disabled}
          aria-label="דחה למחר"
          title="דחה למחר"
          className="icon-button"
          style={iconBtn("#6b7280")}
        >
          <CalendarClock size={18} />
        </button>
        <button
          onClick={onCall}
          disabled={disabled}
          aria-label="התקשר"
          title="התקשר"
          className="icon-button"
          style={iconBtn("var(--color-primary)")}
        >
          <Phone size={18} />
        </button>
      </div>
    </div>
  );
}

function iconBtn(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}
