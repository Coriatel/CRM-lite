import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { AdvancedFilters } from "../types";
import {
  Users,
  Coins,
  UsersRound,
  GraduationCap,
  PlaySquare,
  HandHeart,
  PhoneCall,
  UserCog,
  BookHeart,
  AlertOctagon,
  RefreshCw,
} from "lucide-react";
import { getContacts } from "../services/directus";
import { useCallsToday } from "../hooks/useCallsToday";
import { EmptyState } from "../components/EmptyState";
import type { AttentionItem } from "../data/amutaAttention";
import { useAmutaAttention } from "../data/useAmutaAttention";
import { AttentionQueueCard } from "../components/dashboard/AttentionQueueCard";

interface PeopleCounts {
  followUpDue: number;
  followUpOver: boolean;
  neverCalled: number;
  neverCalledOver: boolean;
}

interface DonorCounts {
  recurring: number;
  recurringOver: boolean;
}

interface CallsCounts {
  today: number;
  todayOver: boolean;
  overdue: number;
  overdueOver: boolean;
  undated: number;
  undatedOver: boolean;
}

const SOFT_CAP = 50;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatRelativeHebrew(d: Date, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (diffSec < 60) return "עכשיו";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  return `לפני ${hours} שעות`;
}

function ProvenancePill({
  fetchedAt,
  hasError,
}: {
  fetchedAt: Date | null;
  hasError: boolean;
}) {
  if (hasError) {
    return (
      <span
        style={{
          fontSize: 11,
          color: "var(--color-danger)",
          border: "1px solid var(--color-danger)",
          borderRadius: 999,
          padding: "2px 8px",
          whiteSpace: "nowrap",
        }}
        title="כשל בטעינה מ-Directus"
      >
        מקור: Directus · שגיאה
      </span>
    );
  }
  if (!fetchedAt) return null;
  return (
    <span
      style={{
        fontSize: 11,
        color: "var(--color-text-secondary)",
        border: "1px solid var(--color-border)",
        borderRadius: 999,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
      title={`עודכן: ${fetchedAt.toISOString()}`}
    >
      מקור: Directus · {formatRelativeHebrew(fetchedAt)}
    </span>
  );
}

export function TodayPage() {
  const navigate = useNavigate();
  const { setAdvancedFilters } = useOutletContext<{
    setAdvancedFilters: (f: AdvancedFilters) => void;
  }>();
  const [people, setPeople] = useState<PeopleCounts | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleFetchedAt, setPeopleFetchedAt] = useState<Date | null>(null);
  const [donors, setDonors] = useState<DonorCounts | null>(null);
  const [donorsError, setDonorsError] = useState<string | null>(null);
  const [donorsFetchedAt, setDonorsFetchedAt] = useState<Date | null>(null);
  const [callsFetchedAt, setCallsFetchedAt] = useState<Date | null>(null);
  const [attentionFetchedAt, setAttentionFetchedAt] = useState<Date | null>(
    null,
  );
  const {
    buckets: attention,
    source: attentionSource,
    error: attentionError,
    loading: attentionLoading,
    refresh: refreshAttention,
  } = useAmutaAttention();

  useEffect(() => {
    if (attention) setAttentionFetchedAt(new Date());
  }, [attention]);
  const {
    buckets: callBuckets,
    error: callsError,
    refresh: refreshCalls,
  } = useCallsToday(SOFT_CAP);
  const calls: CallsCounts | null = callBuckets
    ? {
        today: callBuckets.today.length,
        todayOver: callBuckets.today.length >= SOFT_CAP,
        overdue: callBuckets.overdue.length,
        overdueOver: callBuckets.overdue.length >= SOFT_CAP,
        undated: callBuckets.undated.length,
        undatedOver: callBuckets.undated.length >= SOFT_CAP,
      }
    : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [followUp, neverCalled] = await Promise.all([
          getContacts({ followUpBefore: todayIso(), limit: SOFT_CAP }),
          getContacts({ neverCalled: true, limit: SOFT_CAP }),
        ]);
        if (cancelled) return;
        setPeople({
          followUpDue: followUp.length,
          followUpOver: followUp.length >= SOFT_CAP,
          neverCalled: neverCalled.length,
          neverCalledOver: neverCalled.length >= SOFT_CAP,
        });
        setPeopleFetchedAt(new Date());
      } catch {
        if (!cancelled) setPeopleError("שגיאה בטעינת נתוני אנשים");
      }
    })();
    (async () => {
      try {
        const recurring = await getContacts({
          donationType: "recurring",
          limit: SOFT_CAP,
        });
        if (cancelled) return;
        setDonors({
          recurring: recurring.length,
          recurringOver: recurring.length >= SOFT_CAP,
        });
        setDonorsFetchedAt(new Date());
      } catch {
        if (!cancelled) setDonorsError("שגיאה בטעינת נתוני תורמים");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (callBuckets) setCallsFetchedAt(new Date());
  }, [callBuckets]);

  return (
    <main
      id="main-content"
      className="main-content"
      aria-labelledby="today-page-title"
    >
      <h1
        id="today-page-title"
        style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}
      >
        מרכז נשמה — היום
      </h1>
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: 13,
          marginBottom: "var(--spacing-md)",
        }}
      >
        תצוגה ראשונית. רוב הקלפים ממתינים לחיבור נתונים.
      </p>

      <AttentionSectionHeader
        loading={attentionLoading}
        fetchedAt={attentionFetchedAt}
        onRefresh={refreshAttention}
      />
      <AttentionCard
        icon={<UserCog size={20} />}
        title="צריך את אלרון"
        items={attention?.needsElron ?? null}
        error={attentionError}
        source={attentionSource}
        onRefresh={refreshAttention}
        emptyHint={
          <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
            אין פריטים שדורשים תשומת לב עכשיו —{" "}
            <Link
              to="/calls-today"
              style={{ color: "var(--color-primary)", textDecoration: "none" }}
            >
              עבור לשיחות המתוכננות להיום ←
            </Link>
          </span>
        }
        footer={
          <Link
            to="/elron"
            style={{
              fontSize: 13,
              color: "var(--color-primary)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            פתח תור אלרון מלא ←
          </Link>
        }
      />
      <AttentionCard
        icon={<BookHeart size={20} />}
        title="צריך את הרב"
        items={attention?.needsRav ?? null}
        error={attentionError}
        source={attentionSource}
        onRefresh={refreshAttention}
        emptyHint={
          <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
            אין פריטים שדורשים תשומת לב עכשיו
          </span>
        }
        footer={
          <Link
            to="/rabbi"
            style={{
              fontSize: 13,
              color: "var(--color-primary)",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            פתח תור הרב מלא ←
          </Link>
        }
      />
      <AttentionCard
        icon={<AlertOctagon size={20} />}
        title="תקוע"
        items={attention?.stuck ?? null}
        error={attentionError}
        source={attentionSource}
        onRefresh={refreshAttention}
        emptyHint={
          <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
            אין פריטים תקועים — הכל זורם
          </span>
        }
      />

      <PeopleCareCard
        people={people}
        error={peopleError}
        fetchedAt={peopleFetchedAt}
        onFollowUpDueClick={() => {
          setAdvancedFilters({ followUpBefore: todayIso() });
          navigate("/people");
        }}
        onNeverCalledClick={() => {
          setAdvancedFilters({ neverCalled: true });
          navigate("/people");
        }}
      />
      <CallsTodayCard
        calls={calls}
        error={callsError}
        fetchedAt={callsFetchedAt}
        onRefresh={refreshCalls}
      />
      <RecurringDonorsCard
        donors={donors}
        error={donorsError}
        fetchedAt={donorsFetchedAt}
        onRecurringClick={() => {
          setAdvancedFilters({ donationType: "recurring" });
          navigate("/people");
        }}
      />

      <ShellCard
        icon={<Coins size={20} />}
        title="כסף קריטי"
        missing="financial_obligations + manual_bank_snapshots"
      />
      <ShellCard
        icon={<UsersRound size={20} />}
        title="הקבוצה הבאה"
        missing="cohorts + cohort_members"
      />
      <ShellCard
        icon={<GraduationCap size={20} />}
        title="שיעורים היום"
        missing="lessons"
      />
      <ShellCard
        icon={<PlaySquare size={20} />}
        title="תכנים"
        missing="lesson_processing_runs + Windmill bridge"
      />
    </main>
  );
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function AttentionSectionHeader({
  loading,
  fetchedAt,
  onRefresh,
}: {
  loading: boolean;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  const staleMinutes =
    fetchedAt && !loading
      ? Math.floor((Date.now() - fetchedAt.getTime()) / 60_000)
      : 0;
  const isStale = staleMinutes >= STALE_THRESHOLD_MS / 60_000;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "var(--spacing-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            margin: 0,
          }}
        >
          מוקדי תשומת לב
        </h2>
        {isStale && (
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: 999,
              padding: "2px 8px",
              whiteSpace: "nowrap",
            }}
            title={`עודכן: ${fetchedAt!.toISOString()}`}
            aria-label={`מידע מלפני ${staleMinutes} דקות`}
          >
            מידע מלפני {staleMinutes} דק׳
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        aria-label="ריענון מוקדי תשומת לב"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "1px solid var(--color-border)",
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 12,
          color: "var(--color-text-secondary)",
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <RefreshCw
          size={14}
          style={{
            animation: loading ? "spin 1s linear infinite" : undefined,
          }}
        />
        ריענון
      </button>
    </div>
  );
}

function AttentionCard({
  icon,
  title,
  items,
  error,
  source,
  onRefresh,
  emptyHint,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  items: AttentionItem[] | null;
  error: string | null;
  source: string | null;
  onRefresh: () => void;
  emptyHint?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const action =
    source && source !== "directus" ? (
      <span
        style={{
          fontSize: 11,
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: 999,
          padding: "2px 8px",
        }}
        title="מקור נתונים זמני — מוקאפ"
      >
        {source === "mock" ? "מוקאפ" : source}
      </span>
    ) : undefined;

  return (
    <CardFrame icon={icon} title={title} action={action}>
      {error ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              color: "var(--color-danger)",
              fontSize: 14,
              margin: 0,
              flex: 1,
            }}
          >
            לא הצלחנו לטעון תור תשומת-לב
          </p>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="נסה שוב לטעון תור תשומת לב"
            style={{
              background: "none",
              border: "1px solid var(--color-danger)",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 12,
              color: "var(--color-danger)",
              cursor: "pointer",
            }}
          >
            נסה שוב
          </button>
        </div>
      ) : items === null ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 14 }}>{emptyHint ?? "אין פריטים פתוחים"}</div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-sm)",
          }}
        >
          {items.map((it) => (
            <AttentionQueueCard key={it.id} item={it} dense />
          ))}
        </ul>
      )}
      {footer ? (
        <div style={{ marginTop: "var(--spacing-sm)" }}>{footer}</div>
      ) : null}
    </CardFrame>
  );
}

function CardFrame({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="card"
      style={{ marginBottom: "var(--spacing-md)" }}
      aria-label={title}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: "var(--spacing-sm)",
        }}
      >
        <span style={{ color: "var(--color-primary)" }}>{icon}</span>
        <h2 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function PeopleCareCard({
  people,
  error,
  fetchedAt,
  onFollowUpDueClick,
  onNeverCalledClick,
}: {
  people: PeopleCounts | null;
  error: string | null;
  fetchedAt: Date | null;
  onFollowUpDueClick: () => void;
  onNeverCalledClick: () => void;
}) {
  return (
    <CardFrame
      icon={<Users size={20} />}
      title="אנשים / חיזוק"
      action={<ProvenancePill fetchedAt={fetchedAt} hasError={!!error} />}
    >
      {error ? (
        <p style={{ color: "var(--color-danger)", fontSize: 14 }}>{error}</p>
      ) : !people ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gap: 6,
            fontSize: 14,
          }}
        >
          <li>
            {people.followUpDue === 0 ? (
              <span style={{ color: "var(--color-text-secondary)" }}>
                אין מעקבים חוזרים להיום
              </span>
            ) : (
              <button
                type="button"
                onClick={onFollowUpDueClick}
                aria-label="הצג אנשים שממתינים למעקב חוזר היום"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  color: "inherit",
                  cursor: "pointer",
                  textAlign: "inherit",
                }}
              >
                <strong>{people.followUpDue}</strong>
                {people.followUpOver ? "+" : ""} ממתינות למעקב חוזר היום
              </button>
            )}
          </li>
          <li>
            {people.neverCalled === 0 ? (
              <span style={{ color: "var(--color-text-secondary)" }}>
                דיברנו עם כל אנשי הקשר
              </span>
            ) : (
              <button
                type="button"
                onClick={onNeverCalledClick}
                aria-label="הצג אנשי קשר שלא דיברנו איתם עדיין"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  color: "inherit",
                  cursor: "pointer",
                  textAlign: "inherit",
                }}
              >
                <strong>{people.neverCalled}</strong>
                {people.neverCalledOver ? "+" : ""} לא דיברנו איתן עדיין
              </button>
            )}
          </li>
        </ul>
      )}
      <Link
        to="/"
        style={{
          display: "inline-block",
          marginTop: "var(--spacing-sm)",
          color: "var(--color-primary)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        פתח רשימת אנשי קשר ←
      </Link>
    </CardFrame>
  );
}

function CallsTodayCard({
  calls,
  error,
  fetchedAt,
  onRefresh,
}: {
  calls: CallsCounts | null;
  error: string | null;
  fetchedAt: Date | null;
  onRefresh: () => void;
}) {
  return (
    <CardFrame
      icon={<PhoneCall size={20} />}
      title="שיחות להיום"
      action={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ProvenancePill fetchedAt={fetchedAt} hasError={!!error} />
          <button
            type="button"
            onClick={onRefresh}
            aria-label="רענן שיחות"
            title="רענן"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              padding: 4,
              fontSize: 13,
            }}
          >
            ↻
          </button>
        </span>
      }
    >
      {error ? (
        <p style={{ color: "var(--color-danger)", fontSize: 14 }}>{error}</p>
      ) : !calls ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      ) : calls.today === 0 &&
        calls.overdue === 0 &&
        calls.undated === 0 ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          אין שיחות פתוחות להיום
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gap: 6,
            fontSize: 14,
          }}
        >
          <li>
            <strong>{calls.today}</strong>
            {calls.todayOver ? "+" : ""} שיחות מתוזמנות להיום
          </li>
          {calls.overdue > 0 && (
            <li>
              <strong>{calls.overdue}</strong>
              {calls.overdueOver ? "+" : ""} שיחות באיחור
            </li>
          )}
          {calls.undated > 0 && (
            <li>
              <strong>{calls.undated}</strong>
              {calls.undatedOver ? "+" : ""} שיחות ללא תאריך
            </li>
          )}
        </ul>
      )}
      <Link
        to="/calls-today"
        style={{
          display: "inline-block",
          marginTop: "var(--spacing-sm)",
          color: "var(--color-primary)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        פתח תור שיחות ←
      </Link>
    </CardFrame>
  );
}

function RecurringDonorsCard({
  donors,
  error,
  fetchedAt,
  onRecurringClick,
}: {
  donors: DonorCounts | null;
  error: string | null;
  fetchedAt: Date | null;
  onRecurringClick: () => void;
}) {
  return (
    <CardFrame
      icon={<HandHeart size={20} />}
      title="תורמים קבועים"
      action={<ProvenancePill fetchedAt={fetchedAt} hasError={!!error} />}
    >
      {error ? (
        <p style={{ color: "var(--color-danger)", fontSize: 14 }}>{error}</p>
      ) : !donors ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      ) : donors.recurring === 0 ? (
        <p style={{ fontSize: 14 }}>
          <strong>0</strong> אנשי קשר מסומנים בכרטיס כתורמים קבועים
        </p>
      ) : (
        <p style={{ fontSize: 14 }}>
          <button
            type="button"
            onClick={onRecurringClick}
            aria-label="הצג תורמים קבועים"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
              textAlign: "inherit",
            }}
          >
            <strong>{donors.recurring}</strong>
            {donors.recurringOver ? "+" : ""} אנשי קשר מסומנים בכרטיס כתורמים קבועים
          </button>
        </p>
      )}
    </CardFrame>
  );
}

function ShellCard({
  icon,
  title,
  missing,
}: {
  icon: React.ReactNode;
  title: string;
  missing: string;
}) {
  return (
    <CardFrame icon={icon} title={title}>
      <EmptyState variant="blocked-on-schema" requires={missing} compact />
    </CardFrame>
  );
}
