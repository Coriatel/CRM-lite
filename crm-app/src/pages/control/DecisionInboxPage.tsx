import type React from "react";
import {
  DECISIONS_ENABLED,
  DECISION_INBOX_URL,
  PORTFOLIO_URL,
  type DecisionInboxPacket,
  type PortfolioPacket,
} from "./decisionTypes";
import {
  ControlTowerHeader,
  DecisionSection,
  CompactKpiStrip,
  PriorityList,
  RecommendationCard,
  ResolvedHistory,
  type HeroMetric,
} from "./decisionUi";
import { isSameItem, sortByPriority } from "./decisionLogic";
import { CONTROL_THEME } from "./controlTheme";
import { useDarkChrome, useOpsPacket } from "./useOpsPacket";

// E2 — "What needs me today" `/decisions` (flag OFF by default).
// Owner-first: glance the state in one second, see the single best move, focus on the
// top 3, reveal the rest only on demand.

export function DecisionInboxView({
  doc,
  portfolio,
}: {
  doc: DecisionInboxPacket | null;
  portfolio: PortfolioPacket | null;
}) {
  if (!doc) {
    return (
      <div dir="rtl" style={pageStyle}>
        <p style={{ color: "var(--mn-text-muted)" }}>טוען…</p>
      </div>
    );
  }
  const reco = doc.recommended_next;
  // The 16 owner items = decisions + blocked, minus whatever is already the hero action.
  const priorities = sortByPriority(
    [...doc.requires_decision, ...doc.blocked_waiting].filter((c) => !reco || !isSameItem(c, reco)),
  );
  const metrics: HeroMetric[] = [
    { value: doc.header.needs_you_count, label: "החלטות ממתינות", severity: doc.header.needs_you_count > 0 ? "critical" : "ok" },
    {
      value: portfolio?.header.needs_you_systems ?? "—",
      label: "מערכות דורשות אותך",
      severity: (portfolio?.header.needs_you_systems ?? 0) > 0 ? "warn" : "ok",
    },
    { value: doc.high_risk.length, label: "סיכונים פעילים", severity: doc.high_risk.length > 0 ? "critical" : "ok" },
  ];

  return (
    <div dir="rtl" style={pageStyle} data-testid="decision-inbox">
      <ControlTowerHeader
        title="מה דורש אותך היום"
        subtitle={doc.header.oldest_age_days ? `הוותיק ממתין ${Math.round(doc.header.oldest_age_days)} ימים` : undefined}
        freshness={doc._meta.freshness}
      />

      {/* the single most important next action is the first thing on screen */}
      {reco && (
        <div style={{ marginTop: 12 }}>
          <RecommendationCard card={reco} />
        </div>
      )}

      {/* one-glance context strip, below the action — metrics are supporting context */}
      <CompactKpiStrip metrics={metrics} />

      {priorities.length > 0 && (
        <DecisionSection title="העדיפויות שלך" count={priorities.length}>
          <PriorityList cards={priorities} top={3} />
        </DecisionSection>
      )}

      {doc.high_risk.length > 0 && (
        <DecisionSection title="סיכונים פעילים" count={doc.high_risk.length}>
          <PriorityList cards={sortByPriority(doc.high_risk)} top={3} />
        </DecisionSection>
      )}

      {/* history — not a decision; collapsed, expandable only */}
      <ResolvedHistory items={doc.recently_resolved} />

      <footer style={footerStyle}>קריאה בלבד · רענון כל 30 שניות</footer>
    </div>
  );
}

export function DecisionInboxPage() {
  if (!DECISIONS_ENABLED) return null; // flag OFF → nothing renders, no fetch
  return <DecisionInboxFetcher />;
}

function DecisionInboxFetcher() {
  useDarkChrome();
  const { doc } = useOpsPacket<DecisionInboxPacket>(DECISION_INBOX_URL);
  const { doc: portfolio } = useOpsPacket<PortfolioPacket>(PORTFOLIO_URL);
  return <DecisionInboxView doc={doc} portfolio={portfolio} />;
}

export const pageStyle: React.CSSProperties = {
  ...CONTROL_THEME,
  maxWidth: 760,
  margin: "0 auto",
  // bottom padding clears the fixed 56px BottomNav so content scrolls behind it
  padding: "12px 14px calc(84px + env(safe-area-inset-bottom))",
  fontFamily: "'Rubik', sans-serif",
  background: "var(--mn-surface-root)",
  minHeight: "100vh",
};
export const footerStyle: React.CSSProperties = {
  marginTop: 20,
  fontSize: 11,
  color: "var(--mn-text-muted)",
  textAlign: "center",
};

export default DecisionInboxPage;
