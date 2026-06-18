import {
  DECISIONS_ENABLED,
  DECISION_INBOX_URL,
  PORTFOLIO_URL,
  type DecisionInboxPacket,
  type PortfolioPacket,
} from "./decisionTypes";
import {
  DecisionCardView,
  DecisionSection,
  FreshnessNote,
  PortfolioCardView,
  RecommendationCard,
} from "./decisionUi";
import { useOpsPacket } from "./useOpsPacket";
import { footerStyle, h1Style, headerStyle, pageStyle } from "./DecisionInboxPage";

// E6 — Executive Dashboard `/executive` (flag OFF by default).
// A one-screen owner overview that COMPOSES the same packets and components as E2/E5
// and the E3 recommendation — no separate derivation, so it can never disagree with
// the Inbox or Portfolio (E7 consistency by construction).

export function ExecutiveDashboardView({
  inbox,
  portfolio,
}: {
  inbox: DecisionInboxPacket | null;
  portfolio: PortfolioPacket | null;
}) {
  if (!inbox || !portfolio) {
    return (
      <div dir="rtl" style={pageStyle}>
        <p style={{ color: "var(--mn-text-muted)" }}>טוען…</p>
      </div>
    );
  }
  // top decisions: same cards the Inbox shows, capped for an at-a-glance view.
  const topDecisions = [...inbox.requires_decision, ...inbox.blocked_waiting, ...inbox.high_risk].slice(0, 3);
  const needsYouSystems = portfolio.systems.filter((s) => s.status === "דורש אותך" || s.needs_me > 0);

  return (
    <div dir="rtl" style={pageStyle} data-testid="executive-dashboard">
      <header style={headerStyle}>
        <h1 style={h1Style}>סקירת מנהל</h1>
        <div style={{ fontSize: 13, color: "var(--mn-text-body)" }}>
          {inbox.header.needs_you_count} החלטות ממתינות · {portfolio.header.needs_you_systems} מערכות דורשות אותך
        </div>
        <FreshnessNote freshness={inbox._meta.freshness} />
      </header>

      {inbox.recommended_next && (
        <div style={{ marginTop: 14 }}>
          <RecommendationCard card={inbox.recommended_next} />
        </div>
      )}

      {topDecisions.length > 0 && (
        <DecisionSection title="הכרעות מובילות" count={inbox.header.needs_you_count}>
          {topDecisions.map((c) => (
            <DecisionCardView key={c.id} card={c} />
          ))}
        </DecisionSection>
      )}

      <DecisionSection title="מערכות שדורשות אותך" count={needsYouSystems.length}>
        {needsYouSystems.length > 0 ? (
          needsYouSystems.map((s) => <PortfolioCardView key={s.system} system={s} />)
        ) : (
          <p style={{ fontSize: 13, color: "var(--mn-success)" }}>✓ כל המערכות תקינות</p>
        )}
      </DecisionSection>

      <footer style={footerStyle}>קריאה בלבד · מאוחד מ-החלטות ו-תיק המערכות</footer>
    </div>
  );
}

export function ExecutiveDashboardPage() {
  if (!DECISIONS_ENABLED) return null; // flag OFF → nothing renders, no fetch
  return <ExecutiveDashboardFetcher />;
}

function ExecutiveDashboardFetcher() {
  const { doc: inbox } = useOpsPacket<DecisionInboxPacket>(DECISION_INBOX_URL);
  const { doc: portfolio } = useOpsPacket<PortfolioPacket>(PORTFOLIO_URL);
  return <ExecutiveDashboardView inbox={inbox} portfolio={portfolio} />;
}

export default ExecutiveDashboardPage;
