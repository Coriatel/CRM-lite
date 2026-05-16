import { Link } from "react-router-dom";
import {
  BookHeart,
  RefreshCw,
  Phone,
  PhoneOff,
  RotateCcw,
  ArrowLeftRight,
  PhoneCall,
  CalendarClock,
  Flame,
  Sparkles,
} from "lucide-react";
import { useAmutaAttention } from "../data/useAmutaAttention";
import type {
  AttentionContext,
  AttentionItem,
  AttentionUrgency,
} from "../data/amutaAttention";

const URGENCY_LABEL: Record<AttentionUrgency, string> = {
  critical: "דחוף מאוד",
  high: "דחוף",
  normal: "רגיל",
  low: "נמוך",
};

const URGENCY_COLOR: Record<AttentionUrgency, string> = {
  critical: "var(--color-danger)",
  high: "var(--color-danger)",
  normal: "var(--color-text-secondary)",
  low: "var(--color-text-secondary)",
};

const DISABLED_HINT = "יופעל אחרי אישור attention_items";

export function RabbiQueuePage() {
  const { buckets, source, loading, error, refresh } = useAmutaAttention();
  const items = buckets?.needsRav ?? null;

  return (
    <main
      id="main-content"
      className="main-content"
      aria-labelledby="rabbi-queue-title"
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <BookHeart size={22} style={{ color: "var(--color-primary)" }} />
        <h1
          id="rabbi-queue-title"
          style={{ fontSize: 22, fontWeight: 700, margin: 0, flex: 1 }}
        >
          תור הרב
        </h1>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="ריענון תור הרב"
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
      </header>
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: 13,
          marginBottom: "var(--spacing-md)",
        }}
      >
        אנשים ופניות שמחכים להחלטה או לתשובה של הרב היום.{" "}
        {source && source !== "directus" ? (
          <span style={{ fontSize: 12 }}>
            (מקור: {source === "mock" ? "מוקאפ" : source})
          </span>
        ) : null}
      </p>

      {error ? (
        <p
          className="card"
          style={{ color: "var(--color-danger)", fontSize: 14 }}
        >
          {error}
        </p>
      ) : items === null ? (
        <p
          className="card"
          style={{ color: "var(--color-text-secondary)", fontSize: 14 }}
        >
          טוען…
        </p>
      ) : items.length === 0 ? (
        <p
          className="card"
          style={{ color: "var(--color-text-secondary)", fontSize: 14 }}
        >
          אין פניות פתוחות לרב כרגע.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-md)",
          }}
        >
          {items.map((it) => (
            <RabbiQueueCard key={it.id} item={it} />
          ))}
        </ul>
      )}

      <p
        style={{
          marginTop: "var(--spacing-md)",
          fontSize: 12,
          color: "var(--color-text-secondary)",
        }}
      >
        <Link
          to="/today"
          style={{ color: "var(--color-primary)", textDecoration: "none" }}
        >
          ← חזרה ל&quot;היום&quot;
        </Link>
      </p>
    </main>
  );
}

function RabbiQueueCard({ item }: { item: AttentionItem }) {
  return (
    <li
      className="card"
      style={{
        borderInlineStart: `4px solid ${URGENCY_COLOR[item.urgency]}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
          {item.href ? (
            <Link
              to={item.href}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h2>
        <span
          style={{
            fontSize: 11,
            color: URGENCY_COLOR[item.urgency],
            fontWeight: 600,
          }}
        >
          {URGENCY_LABEL[item.urgency]}
        </span>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--color-text-secondary)",
          margin: "0 0 var(--spacing-sm) 0",
        }}
      >
        {item.next_action}
      </p>
      {item.context ? <QuickContext context={item.context} /> : null}
      <div
        role="group"
        aria-label="פעולות (יופעלו אחרי אישור)"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <DisabledAction icon={<Phone size={14} />} label="דיברתי" />
        <DisabledAction icon={<PhoneOff size={14} />} label="לא השגתי" />
        <DisabledAction icon={<RotateCcw size={14} />} label="צריך המשך" />
        <DisabledAction
          icon={<ArrowLeftRight size={14} />}
          label="העבר לאלרון"
        />
      </div>
    </li>
  );
}

function QuickContext({ context }: { context: AttentionContext }) {
  const badges: { icon: React.ReactNode; text: string; key: string }[] = [];
  if (context.last_call_date)
    badges.push({
      key: "last",
      icon: <PhoneCall size={12} />,
      text: `שיחה אחרונה: ${context.last_call_date}`,
    });
  if (context.follow_up_date)
    badges.push({
      key: "due",
      icon: <CalendarClock size={12} />,
      text: `יעד מעקב: ${context.follow_up_date}`,
    });
  if (typeof context.interest_level === "number")
    badges.push({
      key: "interest",
      icon: <Flame size={12} />,
      text: `עניין: ${context.interest_level}/5`,
    });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginBottom: "var(--spacing-sm)",
      }}
    >
      {badges.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {badges.map((b) => (
            <span
              key={b.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--color-text-secondary)",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              {b.icon}
              {b.text}
            </span>
          ))}
        </div>
      ) : null}
      {context.why_now ? (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          <strong style={{ color: "var(--color-text)" }}>למה עכשיו: </strong>
          {context.why_now}
        </div>
      ) : null}
      {context.recommended_step ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: "var(--color-primary)",
          }}
        >
          <Sparkles size={12} />
          <span>{context.recommended_step}</span>
        </div>
      ) : null}
    </div>
  );
}

function DisabledAction({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={DISABLED_HINT}
      aria-label={`${label} (${DISABLED_HINT})`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
        color: "var(--color-text-secondary)",
        cursor: "not-allowed",
        opacity: 0.6,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
