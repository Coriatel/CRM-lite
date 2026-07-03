import {
  DECISIONS_ENABLED,
  DECISION_INBOX_URL,
  PORTFOLIO_URL,
  type DecisionInboxPacket,
  type PortfolioPacket,
} from "./decisionTypes";
import {
  CompactKpiStrip,
  ControlTowerHeader,
  DecisionCardView,
  DecisionSection,
  PortfolioRow,
  RecommendationCard,
  type HeroMetric,
} from "./decisionUi";
import { isSameItem, rollupSystems, sortByPriority } from "./decisionLogic";
import { useDarkChrome, useOpsPacket } from "./useOpsPacket";
import { footerStyle, pageStyle } from "./DecisionInboxPage";

// E6 — Executive cockpit `/executive` (flag OFF by default).
// One screen, maximum synthesis: glance the org, see the next move, scan the top
// decisions and the system health — without scrolling through every card. Composes the
// same packets + components as /decisions and /portfolio (E7 consistency by construction).

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
  const reco = inbox.recommended_next;
  const rollup = rollupSystems(portfolio.systems);
  const topDecisions = sortByPriority(
    [...inbox.requires_decision, ...inbox.blocked_waiting].filter((c) => !reco || !isSameItem(c, reco)),
  ).slice(0, 3);
  const attentionSystems = rollup.ordered.filter((s) => s.status === "דורש אותך" || s.needs_me > 0);

  const metrics: HeroMetric[] = [
    { value: inbox.header.needs_you_count, label: "החלטות ממתינות", severity: inbox.header.needs_you_count > 0 ? "critical" : "ok" },
    { value: rollup.attention, label: "מערכות דורשות אותך", severity: rollup.attention > 0 ? "warn" : "ok" },
    { value: inbox.high_risk.length, label: "סיכונים פעילים", severity: inbox.high_risk.length > 0 ? "critical" : "ok" },
  ];

  return (
    <div dir="rtl" style={pageStyle} data-testid="executive-dashboard">
      <ControlTowerHeader title="חדר בקרה" subtitle="מצב הארגון במבט אחד" freshness={inbox._meta.freshness} />

      {/* decision first: the single next action, then the top decisions — above the fold */}
      {reco && (
        <div style={{ marginTop: 12 }}>
          <RecommendationCard card={reco} />
        </div>
      )}

      {topDecisions.length > 0 && (
        <DecisionSection title="הכרעות מובילות" count={inbox.header.needs_you_count}>
          {topDecisions.map((c) => (
            <DecisionCardView key={c.id} card={c} />
          ))}
        </DecisionSection>
      )}

      {/* metrics are supporting context, not the headline — one compact strip */}
      <CompactKpiStrip metrics={metrics} />

      {attentionSystems.length > 0 && (
        <DecisionSection title="מערכות שדורשות אותך" count={attentionSystems.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {attentionSystems.map((s) => (
              <PortfolioRow key={s.system} system={s} />
            ))}
          </div>
        </DecisionSection>
      )}

      <footer style={footerStyle}>קריאה בלבד · מאוחד מ-החלטות ו-תיק המערכות</footer>
    </div>
  );
}

export function ExecutiveDashboardPage() {
  if (!DECISIONS_ENABLED) return null; // flag OFF → nothing renders, no fetch
  return <ExecutiveDashboardFetcher />;
}

function ExecutiveDashboardFetcher() {
  useDarkChrome();
  const { doc: inbox } = useOpsPacket<DecisionInboxPacket>(DECISION_INBOX_URL);
  const { doc: portfolio } = useOpsPacket<PortfolioPacket>(PORTFOLIO_URL);
  return <ExecutiveDashboardView inbox={inbox} portfolio={portfolio} />;
}

export default ExecutiveDashboardPage;
