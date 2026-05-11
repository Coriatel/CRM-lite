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
} from "lucide-react";
import { getContacts } from "../services/directus";
import { useCallsToday } from "../hooks/useCallsToday";

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

export function TodayPage() {
  const navigate = useNavigate();
  const { setAdvancedFilters } = useOutletContext<{
    setAdvancedFilters: (f: AdvancedFilters) => void;
  }>();
  const [people, setPeople] = useState<PeopleCounts | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [donors, setDonors] = useState<DonorCounts | null>(null);
  const [donorsError, setDonorsError] = useState<string | null>(null);
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
      } catch {
        if (!cancelled) setDonorsError("שגיאה בטעינת נתוני תורמים");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="main-content">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
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

      <PeopleCareCard
        people={people}
        error={peopleError}
        onFollowUpDueClick={() => {
          setAdvancedFilters({ followUpBefore: todayIso() });
          navigate("/");
        }}
      />
      <CallsTodayCard
        calls={calls}
        error={callsError}
        onRefresh={refreshCalls}
      />
      <RecurringDonorsCard donors={donors} error={donorsError} />

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
  onFollowUpDueClick,
}: {
  people: PeopleCounts | null;
  error: string | null;
  onFollowUpDueClick: () => void;
}) {
  return (
    <CardFrame icon={<Users size={20} />} title="אנשים / חיזוק">
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
              <>
                <strong>{people.neverCalled}</strong>
                {people.neverCalledOver ? "+" : ""} לא דיברנו איתן עדיין
              </>
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
  onRefresh,
}: {
  calls: CallsCounts | null;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <CardFrame
      icon={<PhoneCall size={20} />}
      title="שיחות להיום"
      action={
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
}: {
  donors: DonorCounts | null;
  error: string | null;
}) {
  return (
    <CardFrame icon={<HandHeart size={20} />} title="תורמים קבועים">
      {error ? (
        <p style={{ color: "var(--color-danger)", fontSize: 14 }}>{error}</p>
      ) : !donors ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          טוען…
        </p>
      ) : (
        <p style={{ fontSize: 14 }}>
          <strong>{donors.recurring}</strong>
          {donors.recurringOver ? "+" : ""} אנשי קשר מסומנים בכרטיס כתורמים קבועים
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
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        אין נתונים עדיין. צריך:{" "}
        <code
          style={{
            background: "var(--color-bg-secondary)",
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {missing}
        </code>
      </p>
    </CardFrame>
  );
}
