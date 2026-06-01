import { useState } from "react";
import { CalendarClock, RefreshCw, Check } from "lucide-react";
import { useDailyAgenda } from "../../data/useDailyAgenda";
import type { AgendaBucket, AgendaItem } from "../../data/dailyAgenda";
import { ScheduleQuickAdd } from "../schedule/ScheduleQuickAdd";
import { updateMeeting, updateReminder } from "../../services/directus";

/**
 * Rabbi daily agenda surface (A4). Self-contained: owns its `useDailyAgenda`
 * fetch so it drops into /today and /rabbi with a single tag. Presents the
 * overdue/today/upcoming counts + the most urgent items; loading/empty/error
 * states inline. Hebrew RTL, mobile-first compact.
 */

const MAX_ITEMS = 5;

const BUCKET_LABEL: Record<AgendaBucket, string> = {
  overdue: "באיחור",
  today: "להיום",
  upcoming: "בקרוב",
};

const BUCKET_COLOR: Record<AgendaBucket, string> = {
  overdue: "var(--color-danger)",
  today: "var(--color-primary)",
  upcoming: "var(--color-text-secondary)",
};

/** "2026-05-29" / ISO datetime -> "29/05" (no Date parse; tz-safe). */
function shortDate(due: string | null): string {
  if (!due) return "";
  const d = due.slice(0, 10);
  const [, m, day] = d.split("-");
  return m && day ? `${day}/${m}` : d;
}

function CountStat({ bucket, n }: { bucket: AgendaBucket; n: number }) {
  return (
    <div
      data-testid={`rabbi-day-count-${bucket}`}
      style={{ flex: 1, textAlign: "center" }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: BUCKET_COLOR[bucket] }}>
        {n}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
        {BUCKET_LABEL[bucket]}
      </div>
    </div>
  );
}

/** Only meetings/reminders own a writable status lifecycle via this card. */
function isMarkable(item: AgendaItem): boolean {
  return item.kind === "meeting" || item.kind === "reminder";
}

function ItemRow({
  item,
  onMarkDone,
  busy,
}: {
  item: AgendaItem;
  onMarkDone?: () => void;
  busy?: boolean;
}) {
  return (
    <li
      data-testid="rabbi-day-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-sm)",
        padding: "8px 0",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: BUCKET_COLOR[item.bucket],
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.title}
      </span>
      <span
        dir="ltr"
        style={{ fontSize: 12, color: "var(--color-text-secondary)", flexShrink: 0 }}
      >
        {shortDate(item.due)}
      </span>
      {onMarkDone && (
        <button
          type="button"
          data-testid="rabbi-day-mark-done"
          onClick={onMarkDone}
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
      )}
    </li>
  );
}

/**
 * @param hideHeading suppress the card's own title row when an outer container
 *   (e.g. TodaySection on /today) already supplies the "סדר היום של הרב" heading,
 *   avoiding a duplicate. /rabbi renders the card standalone with the full header.
 */
export function RabbiDayCard({ hideHeading = false }: { hideHeading?: boolean } = {}) {
  const { agenda, loading, error, refresh } = useDailyAgenda();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const urgent = agenda
    ? [...agenda.overdue, ...agenda.today, ...agenda.upcoming].slice(0, MAX_ITEMS)
    : [];

  // Status lifecycle (A7): mark a meeting/reminder done from the agenda. The
  // agenda id is namespaced (`meeting:<uuid>`); strip the prefix for the PATCH.
  async function handleMarkDone(item: AgendaItem) {
    const rawId = item.id.slice(item.id.indexOf(":") + 1);
    setBusyId(item.id);
    setActionError(null);
    try {
      if (item.kind === "meeting") await updateMeeting(rawId, { status: "done" });
      else if (item.kind === "reminder") await updateReminder(rawId, { status: "done" });
      refresh();
    } catch {
      setActionError("עדכון הסטטוס נכשל");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card" data-testid="rabbi-day-card" style={{ marginBottom: "var(--spacing-md)" }}>
      {!hideHeading && (
      <header data-testid="rabbi-day-header" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <CalendarClock size={20} style={{ color: "var(--color-primary)" }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>
          סדר היום של הרב
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="ריענון סדר היום"
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
      )}

      {error ? (
        <p data-testid="rabbi-day-error" style={{ color: "var(--color-danger)", fontSize: 14, margin: 0 }}>
          {error}
        </p>
      ) : agenda === null ? (
        <p data-testid="rabbi-day-loading" style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: 0 }}>
          טוען…
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
            <CountStat bucket="overdue" n={agenda.counts.overdue} />
            <CountStat bucket="today" n={agenda.counts.today} />
            <CountStat bucket="upcoming" n={agenda.counts.upcoming} />
          </div>
          {agenda.counts.total === 0 ? (
            <p
              data-testid="rabbi-day-empty"
              style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: "8px 0 0" }}
            >
              אין משימות מתוזמנות בטווח הקרוב.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
              {urgent.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onMarkDone={
                    isMarkable(item) ? () => handleMarkDone(item) : undefined
                  }
                />
              ))}
            </ul>
          )}
          {actionError && (
            <p
              data-testid="rabbi-day-action-error"
              style={{ color: "var(--color-danger)", fontSize: 13, margin: "8px 0 0" }}
            >
              {actionError}
            </p>
          )}
        </>
      )}

      <ScheduleQuickAdd onCreated={refresh} />
    </section>
  );
}
