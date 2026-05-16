import { Link } from "react-router-dom";
import {
  BookHeart,
  RefreshCw,
  Phone,
  PhoneOff,
  RotateCcw,
  ArrowLeftRight,
} from "lucide-react";
import { useAmutaAttention } from "../data/useAmutaAttention";
import { AttentionQueueCard } from "../components/dashboard/AttentionQueueCard";

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
            <AttentionQueueCard
              key={it.id}
              item={it}
              actions={
                <>
                  <DisabledAction icon={<Phone size={14} />} label="דיברתי" />
                  <DisabledAction
                    icon={<PhoneOff size={14} />}
                    label="לא השגתי"
                  />
                  <DisabledAction
                    icon={<RotateCcw size={14} />}
                    label="צריך המשך"
                  />
                  <DisabledAction
                    icon={<ArrowLeftRight size={14} />}
                    label="העבר לאלרון"
                  />
                </>
              }
            />
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
