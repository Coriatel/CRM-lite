import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  PhoneCall,
  CheckCircle2,
  SkipForward,
  Phone,
  RefreshCw,
} from "lucide-react";
import {
  getContactsByIds,
  DirectusCallQueueItem,
  DirectusContact,
} from "../services/directus";
import { relativeFromNow, clockIsrael } from "../utils/relativeTime";
import { useCallQueueActions } from "../hooks/useCallQueue";
import { useCallsToday } from "../hooks/useCallsToday";

interface Row {
  queue: DirectusCallQueueItem;
  contact?: DirectusContact;
  bucket: "today" | "overdue" | "undated";
}

const SOFT_CAP = 100;

const PRIORITY_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#6b7280",
};

type BucketFilter = "all" | "overdue" | "today" | "undated";

export function CallsTodayPage() {
  const { buckets, error: bucketsError, refresh } = useCallsToday(SOFT_CAP);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<BucketFilter>("all");
  const { markCompleted, skip } = useCallQueueActions();
  const navigate = useNavigate();
  const error = bucketsError || localError;

  useEffect(() => {
    if (!buckets) {
      setRows(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all: Row[] = [
          ...buckets.overdue.map((q) => ({
            queue: q,
            bucket: "overdue" as const,
          })),
          ...buckets.today.map((q) => ({
            queue: q,
            bucket: "today" as const,
          })),
          ...buckets.undated.map((q) => ({
            queue: q,
            bucket: "undated" as const,
          })),
        ];
        const ids = Array.from(new Set(all.map((r) => r.queue.contact_id)));
        const contacts = ids.length > 0 ? await getContactsByIds(ids) : [];
        const byId = new Map(contacts.map((c) => [c.id, c]));
        if (cancelled) return;
        setRows(
          all.map((r) => ({ ...r, contact: byId.get(r.queue.contact_id) })),
        );
      } catch {
        if (!cancelled) setLocalError("שגיאה בטעינת תור השיחות");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buckets]);

  const { overdue, today, undated, totalOverdue, totalToday, totalUndated } =
    useMemo(() => {
      const allOverdue = (rows ?? []).filter((r) => r.bucket === "overdue");
      const allToday = (rows ?? []).filter((r) => r.bucket === "today");
      const allUndated = (rows ?? []).filter((r) => r.bucket === "undated");
      return {
        totalOverdue: allOverdue.length,
        totalToday: allToday.length,
        totalUndated: allUndated.length,
        overdue: filter === "all" || filter === "overdue" ? allOverdue : [],
        today: filter === "all" || filter === "today" ? allToday : [],
        undated: filter === "all" || filter === "undated" ? allUndated : [],
      };
    }, [rows, filter]);

  async function handleComplete(row: Row) {
    setPendingId(row.queue.id);
    try {
      await markCompleted(row.queue.id);
      setRows((prev) =>
        prev ? prev.filter((r) => r.queue.id !== row.queue.id) : prev,
      );
    } catch {
      setLocalError("נכשל סימון השיחה כהושלמה");
    } finally {
      setPendingId(null);
    }
  }

  async function handleSkip(row: Row) {
    setPendingId(row.queue.id);
    try {
      await skip(row.queue.id);
      setRows((prev) =>
        prev ? prev.filter((r) => r.queue.id !== row.queue.id) : prev,
      );
    } catch {
      setLocalError("נכשל דחיית השיחה");
    } finally {
      setPendingId(null);
    }
  }

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
            <PhoneCall size={22} /> תור שיחות
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
        <div
          role="tablist"
          aria-label="סינון"
          style={{ display: "flex", gap: 6, marginTop: "var(--spacing-sm)" }}
        >
          <FilterChip
            active={filter === "all"}
            label={`הכול (${totalOverdue + totalToday + totalUndated})`}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            active={filter === "overdue"}
            label={`באיחור (${totalOverdue})`}
            onClick={() => setFilter("overdue")}
            tone="danger"
          />
          <FilterChip
            active={filter === "today"}
            label={`להיום (${totalToday})`}
            onClick={() => setFilter("today")}
          />
          {totalUndated > 0 && (
            <FilterChip
              active={filter === "undated"}
              label={`ללא תאריך (${totalUndated})`}
              onClick={() => setFilter("undated")}
            />
          )}
        </div>
      </header>

      {error && (
        <p
          role="alert"
          style={{
            color: "var(--color-danger)",
            fontSize: 14,
            marginBottom: "var(--spacing-md)",
          }}
        >
          {error}
        </p>
      )}

      {!rows ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      ) : rows.length === 0 ? (
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: 14,
            padding: "var(--spacing-md) 0",
          }}
        >
          אין שיחות פתוחות להיום
        </p>
      ) : overdue.length === 0 && today.length === 0 && undated.length === 0 ? (
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: 14,
            padding: "var(--spacing-md) 0",
          }}
        >
          {filter === "overdue"
            ? "אין שיחות באיחור"
            : filter === "today"
              ? "אין שיחות מתוזמנות להיום"
              : filter === "undated"
                ? "אין שיחות ללא תאריך"
                : "אין שיחות בתור"}
        </p>
      ) : (
        <>
          {overdue.length > 0 && (
            <Section
              title={`שיחות באיחור (${overdue.length})`}
              tone="danger"
            >
              {overdue.map((r) => (
                <CallRow
                  key={r.queue.id}
                  row={r}
                  disabled={pendingId === r.queue.id}
                  onCall={() => navigate(`/call/${r.queue.contact_id}`)}
                  onComplete={() => handleComplete(r)}
                  onSkip={() => handleSkip(r)}
                />
              ))}
            </Section>
          )}
          {today.length > 0 && (
            <Section title={`להיום (${today.length})`}>
              {today.map((r) => (
                <CallRow
                  key={r.queue.id}
                  row={r}
                  disabled={pendingId === r.queue.id}
                  onCall={() => navigate(`/call/${r.queue.contact_id}`)}
                  onComplete={() => handleComplete(r)}
                  onSkip={() => handleSkip(r)}
                />
              ))}
            </Section>
          )}
          {undated.length > 0 && (
            <Section title={`ללא תאריך (${undated.length})`}>
              {undated.map((r) => (
                <CallRow
                  key={r.queue.id}
                  row={r}
                  disabled={pendingId === r.queue.id}
                  onCall={() => navigate(`/call/${r.queue.contact_id}`)}
                  onComplete={() => handleComplete(r)}
                  onSkip={() => handleSkip(r)}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </main>
  );
}

function FilterChip({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  const accent =
    tone === "danger" ? "var(--color-danger)" : "var(--color-primary)";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? accent : "var(--color-border)"}`,
        background: active ? accent : "transparent",
        color: active ? "#fff" : "var(--color-text-secondary)",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "danger";
  children: React.ReactNode;
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
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function CallRow({
  row,
  disabled,
  onCall,
  onComplete,
  onSkip,
}: {
  row: Row;
  disabled: boolean;
  onCall: () => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const name = row.contact?.full_name || "(ללא שם)";
  const phone = row.contact?.phone_e164 || row.contact?.phone2;
  const stamp =
    row.bucket === "today"
      ? clockIsrael(row.queue.scheduled_date)
      : relativeFromNow(row.queue.scheduled_date);
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
          backgroundColor: PRIORITY_COLORS[row.queue.priority] || "#6b7280",
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
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            display: "flex",
            gap: 8,
            alignItems: "baseline",
          }}
        >
          {phone && <span dir="ltr">{phone}</span>}
          {stamp && <span aria-label="זמן מתוזמן">{stamp}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
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
        <button
          onClick={onComplete}
          disabled={disabled}
          aria-label="סמן כהושלמה"
          title="סמן כהושלמה"
          className="icon-button"
          style={iconBtn("#16a34a")}
        >
          <CheckCircle2 size={18} />
        </button>
        <button
          onClick={onSkip}
          disabled={disabled}
          aria-label="דחה"
          title="דחה"
          className="icon-button"
          style={iconBtn("#6b7280")}
        >
          <SkipForward size={18} />
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
