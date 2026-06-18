import type React from "react";
import {
  DECISIONS_ENABLED,
  DECISION_INBOX_URL,
  type DecisionInboxPacket,
} from "./decisionTypes";
import {
  DecisionCardView,
  DecisionSection,
  FreshnessNote,
  RecommendationCard,
  ResolvedRow,
} from "./decisionUi";
import { useOpsPacket } from "./useOpsPacket";

// E2 — Decision Inbox `/decisions` (flag OFF by default).
// One owner-grade view of "what needs you", over the frozen decision_inbox_packet.

export function DecisionInboxView({ doc }: { doc: DecisionInboxPacket | null }) {
  if (!doc) {
    return (
      <div dir="rtl" style={pageStyle}>
        <p style={{ color: "var(--mn-text-muted)" }}>טוען…</p>
      </div>
    );
  }
  const { header } = doc;
  return (
    <div dir="rtl" style={pageStyle} data-testid="decision-inbox">
      <header style={headerStyle}>
        <h1 style={h1Style}>החלטות</h1>
        <div style={{ fontSize: 13, color: "var(--mn-text-body)" }}>
          {header.needs_you_count} פריטים דורשים אותך
          {header.oldest_age_days ? ` · הוותיק ממתין ${Math.round(header.oldest_age_days)} ימים` : ""}
        </div>
        <FreshnessNote freshness={doc._meta.freshness} />
      </header>

      {doc.recommended_next && (
        <div style={{ marginTop: 14 }}>
          <RecommendationCard card={doc.recommended_next} />
        </div>
      )}

      {doc.requires_decision.length > 0 && (
        <DecisionSection title="דורש הכרעה" count={doc.requires_decision.length}>
          {doc.requires_decision.map((c) => (
            <DecisionCardView key={c.id} card={c} />
          ))}
        </DecisionSection>
      )}

      {doc.blocked_waiting.length > 0 && (
        <DecisionSection title="חסום וממתין" count={doc.blocked_waiting.length}>
          {doc.blocked_waiting.map((c) => (
            <DecisionCardView key={c.id} card={c} />
          ))}
        </DecisionSection>
      )}

      {doc.high_risk.length > 0 && (
        <DecisionSection title="סיכון גבוה" count={doc.high_risk.length}>
          {doc.high_risk.map((c) => (
            <DecisionCardView key={c.id} card={c} />
          ))}
        </DecisionSection>
      )}

      {doc.recently_resolved.length > 0 && (
        <DecisionSection title="הוכרע לאחרונה" count={doc.recently_resolved.length}>
          <div>
            {doc.recently_resolved.map((c) => (
              <ResolvedRow key={c.id} card={c} />
            ))}
          </div>
        </DecisionSection>
      )}

      <footer style={footerStyle}>קריאה בלבד · רענון כל 30 שניות</footer>
    </div>
  );
}

export function DecisionInboxPage() {
  // flag OFF → nothing renders and no fetch fires (flag is a build constant,
  // so this early return is consistent across every render — hook order is stable).
  if (!DECISIONS_ENABLED) return null;
  return <DecisionInboxFetcher />;
}

function DecisionInboxFetcher() {
  const { doc } = useOpsPacket<DecisionInboxPacket>(DECISION_INBOX_URL);
  return <DecisionInboxView doc={doc} />;
}

export const pageStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "12px 14px 32px",
  fontFamily: "'Rubik', sans-serif",
  background: "var(--mn-surface-root)",
  minHeight: "100vh",
};
export const headerStyle: React.CSSProperties = {
  paddingBottom: 8,
  borderBottom: "1px solid var(--mn-border-fold)",
};
export const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  color: "var(--mn-text-strong)",
};
export const footerStyle: React.CSSProperties = {
  marginTop: 20,
  fontSize: 11,
  color: "var(--mn-text-muted)",
  textAlign: "center",
};

export default DecisionInboxPage;
