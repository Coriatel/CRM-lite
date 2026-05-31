import { useState } from "react";
import { CalendarRange, RefreshCw, Check, MapPin, Pencil } from "lucide-react";
import { useRabbiScheduleItems } from "../../data/useRabbiScheduleItems";
import { MeetingForm } from "../schedule/MeetingForm";
import { ReminderForm } from "../schedule/ReminderForm";
import {
  updateMeeting,
  updateReminder,
  type DirectusMeeting,
  type DirectusReminder,
  type MeetingStatus,
  type ReminderStatus,
} from "../../services/directus";

/**
 * Rabbi schedule/task management surface (A7 Phase 4). Lists the FULL scheduled
 * meetings + pending reminders (not the lossy daily agenda), so each row can be
 * edited and its status flipped. Owner-scoped; mobile-first RTL.
 * PRIVACY: rows never carry `notes` (the readers omit it) — pastoral notes stay
 * out of this surface.
 */

/** ISO datetime -> "ראשון 31/05 14:30" (he-IL). Empty string for null. */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  const hm = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${weekday} ${dm} ${hm}`;
}

// Status display only — derived from the row's existing `status` field. No
// schema change, no scope/private work. tone drives the chip colour.
type StatusTone = "open" | "done" | "cancelled";

const MEETING_STATUS: Record<MeetingStatus, { label: string; tone: StatusTone }> = {
  scheduled: { label: "מתוכנן", tone: "open" },
  done: { label: "בוצע", tone: "done" },
  cancelled: { label: "בוטל", tone: "cancelled" },
};
const REMINDER_STATUS: Record<ReminderStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "פתוח", tone: "open" },
  done: { label: "בוצע", tone: "done" },
  dismissed: { label: "בוטל", tone: "cancelled" },
};

const TONE_STYLE: Record<StatusTone, React.CSSProperties> = {
  open: { color: "var(--color-primary)", borderColor: "var(--color-primary)" },
  done: { color: "var(--color-success, #16a34a)", borderColor: "var(--color-success, #16a34a)" },
  cancelled: { color: "var(--color-text-secondary)", borderColor: "var(--color-border)" },
};

function StatusChip({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      data-testid="rabbi-sched-status-badge"
      style={{
        fontSize: 11,
        lineHeight: 1,
        padding: "2px 6px",
        borderRadius: 999,
        border: "1px solid",
        whiteSpace: "nowrap",
        flexShrink: 0,
        ...TONE_STYLE[tone],
      }}
    >
      {label}
    </span>
  );
}

function MarkDoneButton({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      data-testid="rabbi-sched-mark-done"
      onClick={onClick}
      disabled={busy}
      aria-label="סמן כבוצע"
      title="סמן כבוצע"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 44,
        minHeight: 44,
        background: "none",
        border: "1px solid var(--color-border)",
        borderRadius: 999,
        color: "var(--color-primary)",
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <Check size={16} />
    </button>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="rabbi-sched-edit"
      onClick={onClick}
      aria-label="עריכה"
      title="עריכה"
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
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <Pencil size={15} />
    </button>
  );
}

function rowStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-sm)",
    padding: "8px 0",
    borderTop: "1px solid var(--color-border)",
  };
}

export function RabbiScheduleManager() {
  const { meetings, reminders, loading, error, refresh } =
    useRabbiScheduleItems();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editMeeting, setEditMeeting] = useState<DirectusMeeting | null>(null);
  const [editReminder, setEditReminder] = useState<DirectusReminder | null>(null);

  async function markMeetingDone(m: DirectusMeeting) {
    setBusyId(`m:${m.id}`);
    setActionError(null);
    try {
      await updateMeeting(m.id, { status: "done" });
      refresh();
    } catch {
      setActionError("עדכון הסטטוס נכשל");
    } finally {
      setBusyId(null);
    }
  }

  async function markReminderDone(r: DirectusReminder) {
    setBusyId(`r:${r.id}`);
    setActionError(null);
    try {
      await updateReminder(r.id, { status: "done" });
      refresh();
    } catch {
      setActionError("עדכון הסטטוס נכשל");
    } finally {
      setBusyId(null);
    }
  }

  const empty =
    (meetings?.length ?? 0) === 0 && (reminders?.length ?? 0) === 0;

  return (
    <section
      className="card"
      data-testid="rabbi-sched-manager"
      style={{ marginBottom: "var(--spacing-md)" }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <CalendarRange size={20} style={{ color: "var(--color-primary)" }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>
          ניהול לוח זמנים
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="ריענון לוח הזמנים"
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
          <RefreshCw
            size={16}
            style={{ animation: loading ? "spin 1s linear infinite" : undefined }}
          />
        </button>
      </header>

      {error ? (
        <p data-testid="rabbi-sched-error" style={{ color: "var(--color-danger)", fontSize: 14, margin: 0 }}>
          {error}
        </p>
      ) : meetings === null || reminders === null ? (
        <p data-testid="rabbi-sched-loading" style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: 0 }}>
          טוען…
        </p>
      ) : empty ? (
        <p data-testid="rabbi-sched-empty" style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>
          אין פגישות או תזכורות פתוחות.
        </p>
      ) : (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", margin: "4px 0" }}>
            פגישות קרובות ({meetings.length})
          </h3>
          {meetings.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 8px" }}>—</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px" }}>
              {meetings.map((m) => (
                <li key={m.id} data-testid="rabbi-sched-meeting-row" style={rowStyle()}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.title}
                      </span>
                      <StatusChip {...MEETING_STATUS[m.status]} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                      {fmtDateTime(m.starts_at)}
                      {m.location && (
                        <span style={{ marginInlineStart: 8, display: "inline-flex", alignItems: "center", gap: 2 }}>
                          <MapPin size={11} /> {m.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <EditButton onClick={() => setEditMeeting(m)} />
                  <MarkDoneButton onClick={() => markMeetingDone(m)} busy={busyId === `m:${m.id}`} />
                </li>
              ))}
            </ul>
          )}

          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", margin: "4px 0" }}>
            תזכורות ומשימות ({reminders.length})
          </h3>
          {reminders.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>—</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {reminders.map((r) => (
                <li key={r.id} data-testid="rabbi-sched-reminder-row" style={rowStyle()}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.title}
                      </span>
                      <StatusChip {...REMINDER_STATUS[r.status]} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                      {fmtDateTime(r.due_at)}
                    </div>
                  </div>
                  <EditButton onClick={() => setEditReminder(r)} />
                  <MarkDoneButton onClick={() => markReminderDone(r)} busy={busyId === `r:${r.id}`} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {actionError && (
        <p data-testid="rabbi-sched-action-error" style={{ color: "var(--color-danger)", fontSize: 13, margin: "8px 0 0" }}>
          {actionError}
        </p>
      )}

      {editMeeting && (
        <MeetingForm
          editing={editMeeting}
          onClose={() => setEditMeeting(null)}
          onCreated={refresh}
        />
      )}
      {editReminder && (
        <ReminderForm
          editing={editReminder}
          onClose={() => setEditReminder(null)}
          onCreated={refresh}
        />
      )}
    </section>
  );
}
