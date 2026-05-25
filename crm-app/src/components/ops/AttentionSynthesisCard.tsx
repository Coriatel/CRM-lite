// Surfaces the canonical server-ranked attention feed (state/attention_synthesis.json,
// produced every 5 min by build_attention_synthesis.py) on /ops. Advisory display only —
// per the producer contract, consumers MAY render it but MUST NOT gate on it.

export interface AttentionSynthItem {
  id: string;
  source: string;
  title: string;
  lifecycle?: string;
  urgency_band?: string; // today | this_week | later
  gate_role?: string; // owner | ...
  autonomous_resolvable?: boolean;
  next_action?: string;
  stale_days?: number;
  source_ref?: string;
  rank_score?: number;
}

export interface AttentionSynthesisDoc {
  _meta?: { generated_at?: string; note?: string };
  summary?: {
    total_items?: number;
    today?: number;
    this_week?: number;
    later?: number;
    owner_gated?: number;
    blocked?: number;
    autonomous_resolvable?: number;
    by_source?: Record<string, number>;
  };
  items?: AttentionSynthItem[];
}

const MAX_ROWS = 8;

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

function urgencyColor(band?: string): string {
  if (band === "today") return "#dc2626";
  if (band === "this_week") return "#a16207";
  return "#737373";
}

function urgencyLabel(band?: string): string {
  if (band === "today") return "היום";
  if (band === "this_week") return "השבוע";
  if (band === "later") return "מאוחר";
  return band ?? "";
}

export function AttentionSynthesisCard({ doc }: { doc: AttentionSynthesisDoc | null }) {
  if (!doc) {
    return (
      <section style={cardStyle} aria-label="תשומת לב — סינתזה">
        <div style={headStyle}>
          <strong style={{ fontSize: 16 }}>תשומת לב — מה דורש טיפול</strong>
        </div>
        <div style={{ fontSize: 13, color: "#737373" }}>
          אין נתוני סינתזה — האם <code style={{ direction: "ltr", unicodeBidi: "isolate" }}>state/attention_synthesis.json</code> נכתב?
        </div>
      </section>
    );
  }

  const s = doc.summary ?? {};
  const items = [...(doc.items ?? [])].sort(
    (a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0),
  );
  const shown = items.slice(0, MAX_ROWS);
  const remaining = Math.max(0, items.length - shown.length);

  return (
    <section style={cardStyle} aria-label="תשומת לב — סינתזה">
      <div style={headStyle}>
        <strong style={{ fontSize: 16 }}>תשומת לב — מה דורש טיפול</strong>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(s.today ?? 0) > 0 && (
            <span style={{ ...badge, background: "#dc2626" }}>היום {s.today}</span>
          )}
          {(s.this_week ?? 0) > 0 && (
            <span style={{ ...badge, background: "#a16207" }}>השבוע {s.this_week}</span>
          )}
          {(s.owner_gated ?? 0) > 0 && (
            <span style={{ ...badge, background: "#7c3aed" }}>אונר {s.owner_gated}</span>
          )}
        </span>
      </div>

      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: "#16a34a" }}>אין פריטים פתוחים — הכל מטופל.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {shown.map((it) => (
            <li
              key={it.id}
              style={{
                padding: "8px 0",
                borderTop: "1px solid #f0f0f0",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...badge, background: urgencyColor(it.urgency_band) }}>
                  {urgencyLabel(it.urgency_band)}
                </span>
                {it.gate_role === "owner" && (
                  <span style={{ ...badge, background: "#7c3aed" }}>אונר</span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</span>
              </div>
              {it.next_action && (
                <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>
                  ← {it.next_action}
                </div>
              )}
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>{it.source}</span>
                {typeof it.stale_days === "number" && it.stale_days > 0
                  ? ` · ${it.stale_days} ימים`
                  : ""}
              </div>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <div style={{ fontSize: 12, color: "#737373", marginTop: 6 }}>
          ועוד {remaining} פריטים
        </div>
      )}
    </section>
  );
}
