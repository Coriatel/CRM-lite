import { Link } from "react-router-dom";
import { UserCog, RefreshCw, AlertOctagon, Clock3, Zap } from "lucide-react";
import { useAmutaAttention } from "../data/useAmutaAttention";
import { AttentionQueueCard } from "../components/dashboard/AttentionQueueCard";
import { AttentionBucketOperatorSummary } from "../components/dashboard/AttentionBucketOperatorSummary";
import type { AttentionItem } from "../data/amutaAttention";

interface Group {
  key: "urgent" | "stuck" | "open";
  title: string;
  icon: React.ReactNode;
  items: AttentionItem[];
  empty: string;
}

function dedupedQueueItems(
  needsElron: AttentionItem[],
  stuck: AttentionItem[],
): AttentionItem[] {
  const dedup = new Map<string, AttentionItem>();
  for (const it of [...needsElron, ...stuck]) {
    if (!dedup.has(it.id)) dedup.set(it.id, it);
  }
  return Array.from(dedup.values());
}

function groupItems(
  needsElron: AttentionItem[],
  stuck: AttentionItem[],
): Group[] {
  const all = dedupedQueueItems(needsElron, stuck);

  const urgent = all.filter(
    (i) => i.urgency === "critical" || i.urgency === "high",
  );
  const stuckGroup = all.filter(
    (i) =>
      !urgent.includes(i) &&
      (i.status === "blocked" || i.status === "stale"),
  );
  const open = all.filter(
    (i) => !urgent.includes(i) && !stuckGroup.includes(i),
  );

  return [
    {
      key: "urgent",
      title: "דחוף עכשיו",
      icon: <Zap size={18} />,
      items: urgent,
      empty: "אין פריטים דחופים",
    },
    {
      key: "stuck",
      title: "תקוע",
      icon: <AlertOctagon size={18} />,
      items: stuckGroup,
      empty: "אין פריטים תקועים",
    },
    {
      key: "open",
      title: "פתוח להמשך טיפול",
      icon: <Clock3 size={18} />,
      items: open,
      empty: "אין מעקבים פתוחים",
    },
  ];
}

export function ElronQueuePage() {
  const { buckets, source, loading, error, refresh } = useAmutaAttention();
  const queueItems = buckets
    ? dedupedQueueItems(buckets.needsElron, buckets.stuck)
    : null;
  const groups = buckets && groupItems(buckets.needsElron, buckets.stuck);

  return (
    <main
      id="main-content"
      className="main-content"
      aria-labelledby="elron-queue-title"
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <UserCog size={22} style={{ color: "var(--color-primary)" }} />
        <h1
          id="elron-queue-title"
          style={{ fontSize: 22, fontWeight: 700, margin: 0, flex: 1 }}
        >
          התור של אלרון
        </h1>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="ריענון תור אלרון"
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
        מה הכי חשוב לאלרון לטפל בו עכשיו.{" "}
        {source && source !== "directus" ? (
          <span style={{ fontSize: 12 }}>
            (מקור: {source === "empty" ? "אין נתונים עדיין" : source})
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
      ) : groups === null || queueItems === null ? (
        <p
          className="card"
          style={{ color: "var(--color-text-secondary)", fontSize: 14 }}
        >
          טוען…
        </p>
      ) : (
        <>
          {queueItems.length > 0 ? (
            <AttentionBucketOperatorSummary
              items={queueItems}
              testIdPrefix="elron-queue"
            />
          ) : null}
          {groups.map((g) => (
            <QueueGroup key={g.key} group={g} />
          ))}
        </>
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

function QueueGroup({ group }: { group: Group }) {
  return (
    <section
      aria-labelledby={`elron-group-${group.key}`}
      style={{ marginBottom: "var(--spacing-md)" }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          color: "var(--color-text-secondary)",
        }}
      >
        {group.icon}
        <h2
          id={`elron-group-${group.key}`}
          style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}
        >
          {group.title}
        </h2>
        <span style={{ fontSize: 12 }}>{group.items.length}</span>
      </header>
      {group.items.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-secondary)",
            margin: 0,
            paddingInlineStart: 10,
          }}
        >
          {group.empty}
        </p>
      ) : (
        <>
          <AttentionBucketOperatorSummary
            items={group.items}
            testIdPrefix={`elron-group-${group.key}`}
          />
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
            {group.items.map((it) => (
              <AttentionQueueCard key={it.id} item={it} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
