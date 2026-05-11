import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PhoneCall, CheckCircle2, SkipForward, Phone } from "lucide-react";
import {
  getCallQueueInRange,
  getContactsByIds,
  DirectusCallQueueItem,
  DirectusContact,
} from "../services/directus";
import { todayWindowIsrael } from "../utils/dateWindow";
import { relativeFromNow, clockIsrael } from "../utils/relativeTime";
import { useCallQueueActions } from "../hooks/useCallQueue";

interface Row {
  queue: DirectusCallQueueItem;
  contact?: DirectusContact;
  bucket: "today" | "overdue";
}

const SOFT_CAP = 100;

const PRIORITY_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#6b7280",
};

export function CallsTodayPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { markCompleted, skip } = useCallQueueActions();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { startIso, endIso } = todayWindowIsrael();
        const [todayRows, overdueRows] = await Promise.all([
          getCallQueueInRange({
            status: "pending",
            fromInclusive: startIso,
            toExclusive: endIso,
            limit: SOFT_CAP,
          }),
          getCallQueueInRange({
            status: "pending",
            toExclusive: startIso,
            limit: SOFT_CAP,
          }),
        ]);
        const all: Row[] = [
          ...overdueRows.map((q) => ({ queue: q, bucket: "overdue" as const })),
          ...todayRows.map((q) => ({ queue: q, bucket: "today" as const })),
        ];
        const ids = Array.from(new Set(all.map((r) => r.queue.contact_id)));
        const contacts = ids.length > 0 ? await getContactsByIds(ids) : [];
        const byId = new Map(contacts.map((c) => [c.id, c]));
        if (cancelled) return;
        setRows(
          all.map((r) => ({ ...r, contact: byId.get(r.queue.contact_id) })),
        );
      } catch {
        if (!cancelled) setError("שגיאה בטעינת תור השיחות");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { overdue, today } = useMemo(() => {
    const overdue = (rows ?? []).filter((r) => r.bucket === "overdue");
    const today = (rows ?? []).filter((r) => r.bucket === "today");
    return { overdue, today };
  }, [rows]);

  async function handleComplete(row: Row) {
    setPendingId(row.queue.id);
    try {
      await markCompleted(row.queue.id);
      setRows((prev) =>
        prev ? prev.filter((r) => r.queue.id !== row.queue.id) : prev,
      );
    } catch {
      setError("נכשל סימון השיחה כהושלמה");
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
      setError("נכשל דחיית השיחה");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="main-content">
      <header style={{ marginBottom: "var(--spacing-md)" }}>
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
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <PhoneCall size={22} /> תור שיחות
        </h1>
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
        </>
      )}
    </main>
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
