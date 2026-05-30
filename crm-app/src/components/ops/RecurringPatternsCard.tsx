// Surfaces the C1 recurring-pattern producer's output (state/recurring_patterns.json,
// emitted every 15 min by build_recurring_patterns.py — MN-OS Cognitive Runtime G1).
// Advisory display only: each item summarises whether something keeps recurring across
// recent snapshots of runtime-issues, blockers, or producer_contract_violations.

export type RecurrenceStatus = "recurring" | "episodic" | "new";

export interface RecurringPatternItem {
  domain: string; // runtime-issues | blockers | violations
  id: string;
  title: string;
  first_seen_at: string;
  last_seen_at: string;
  total_snapshots: number;
  gap_days_max: number;
  active_now: boolean;
  recurrence_status: RecurrenceStatus;
  evidence_pointers?: string[];
}

export interface RecurringPatternsDoc {
  _meta?: {
    schema_version?: number;
    generated_at?: string;
    window_days?: number;
    min_snapshots?: number;
    min_span_days?: number;
    snapshot_count?: number;
    bootstrap?: boolean;
    counts?: { recurring?: number; episodic?: number; new?: number };
  };
  items?: RecurringPatternItem[];
}

const MAX_ROWS = 6;

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
  background: "var(--color-card, #fff)",
};

const headStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
  gap: 8,
  flexWrap: "wrap",
};

const badge: React.CSSProperties = {
  color: "#fff",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};

function softBadge(tone: string): React.CSSProperties {
  return {
    color: tone,
    background: "#fff",
    border: `1px solid ${tone}`,
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    fontWeight: 500,
  };
}

function statusTone(status: RecurrenceStatus): string {
  if (status === "recurring") return "#dc2626";
  if (status === "episodic") return "#a16207";
  return "#737373";
}

function statusLabel(status: RecurrenceStatus): string {
  if (status === "recurring") return "חוזר";
  if (status === "episodic") return "אפיזודי";
  return "חדש";
}

function domainLabel(domain: string): string {
  if (domain === "runtime-issues") return "תקלת ריצה";
  if (domain === "blockers") return "חסם";
  if (domain === "violations") return "הפרת חוזה";
  return domain;
}

export function RecurringPatternsCard({ doc }: { doc: RecurringPatternsDoc | null }) {
  if (!doc) {
    return (
      <section style={cardStyle} aria-label="דפוסים חוזרים">
        <div style={headStyle}>
          <strong style={{ fontSize: 16 }}>דפוסים חוזרים</strong>
        </div>
        <div style={{ fontSize: 13, color: "#737373" }}>
          אין נתוני דפוסים — האם <code style={{ direction: "ltr", unicodeBidi: "isolate" }}>state/recurring_patterns.json</code> נכתב?
        </div>
      </section>
    );
  }

  const meta = doc._meta ?? {};
  const counts = meta.counts ?? {};
  const items = doc.items ?? [];
  const recurringItems = items.filter((i) => i.recurrence_status === "recurring");
  const shown = recurringItems.slice(0, MAX_ROWS);
  const remaining = Math.max(0, recurringItems.length - shown.length);

  return (
    <section style={cardStyle} aria-label="דפוסים חוזרים">
      <div style={headStyle}>
        <strong style={{ fontSize: 16 }}>דפוסים חוזרים — מה לא מפסיק לחזור</strong>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(counts.recurring ?? 0) > 0 && (
            <span style={{ ...badge, background: "#dc2626" }}>
              חוזרים {counts.recurring}
            </span>
          )}
          {(counts.episodic ?? 0) > 0 && (
            <span style={{ ...badge, background: "#a16207" }}>
              אפיזודיים {counts.episodic}
            </span>
          )}
        </span>
      </div>

      {meta.bootstrap && (
        <div style={{ fontSize: 12, color: "#737373", marginBottom: 6 }}>
          איסוף ראשוני — נדרשים לפחות {meta.min_snapshots ?? 10} צילומים על פני {meta.min_span_days ?? 3} ימים כדי לסווג דפוס כ"חוזר".
        </div>
      )}

      {recurringItems.length === 0 ? (
        <div style={{ fontSize: 13, color: "#16a34a" }}>
          אין דפוסים חוזרים בחלון של {meta.window_days ?? 7} ימים.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {shown.map((it) => (
            <li
              key={`${it.domain}:${it.id}`}
              style={{ padding: "8px 0", borderTop: "1px solid #f0f0f0" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span
                  data-testid="recurring-row-status"
                  style={softBadge(statusTone(it.recurrence_status))}
                >
                  {statusLabel(it.recurrence_status)}
                </span>
                <span data-testid="recurring-row-domain" style={softBadge("#374151")}>
                  {domainLabel(it.domain)}
                </span>
                {!it.active_now && (
                  <span style={softBadge("#737373")}>לא פעיל כעת</span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600 }}>{it.title || it.id}</span>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                {it.total_snapshots} צילומים
                {" · "}
                <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>
                  {it.first_seen_at.slice(0, 10)} → {it.last_seen_at.slice(0, 10)}
                </span>
                {it.gap_days_max > 0 ? ` · פער מקס׳ ${it.gap_days_max.toFixed(1)} ימים` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <div style={{ fontSize: 12, color: "#737373", marginTop: 6 }}>
          ועוד {remaining} דפוסים חוזרים
        </div>
      )}
    </section>
  );
}
