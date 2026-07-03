import { DECISIONS_ENABLED, PORTFOLIO_URL, type PortfolioPacket } from "./decisionTypes";
import { ControlTowerHeader, PortfolioCardView, PortfolioSummary } from "./decisionUi";
import { rollupSystems } from "./decisionLogic";
import { useDarkChrome, useOpsPacket } from "./useOpsPacket";
import { footerStyle, pageStyle } from "./DecisionInboxPage";

// E5 — Portfolio `/portfolio` (flag OFF by default).
// Summary first (how many Healthy / Warning / Needs-you), then the list — attention
// systems on top. Honest status, no green-by-default.

export function OwnerPortfolioView({ doc }: { doc: PortfolioPacket | null }) {
  if (!doc) {
    return (
      <div dir="rtl" style={pageStyle}>
        <p style={{ color: "var(--mn-text-muted)" }}>טוען…</p>
      </div>
    );
  }
  const rollup = rollupSystems(doc.systems);
  return (
    <div dir="rtl" style={pageStyle} data-testid="owner-portfolio">
      <ControlTowerHeader
        title="תיק המערכות"
        subtitle={`${doc.header.systems_total} מערכות${rollup.attention > 0 ? ` · ${rollup.attention} דורשות אותך` : " · הכול יציב"}`}
        freshness={doc._meta.freshness}
      />

      <div style={{ marginTop: 14 }}>
        <PortfolioSummary rollup={rollup} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {rollup.ordered.map((s) => (
          <PortfolioCardView key={s.system} system={s} />
        ))}
      </div>

      <footer style={footerStyle}>קריאה בלבד · רענון כל 30 שניות</footer>
    </div>
  );
}

export function OwnerPortfolioPage() {
  if (!DECISIONS_ENABLED) return null; // flag OFF → nothing renders, no fetch
  return <OwnerPortfolioFetcher />;
}

function OwnerPortfolioFetcher() {
  useDarkChrome();
  const { doc } = useOpsPacket<PortfolioPacket>(PORTFOLIO_URL);
  return <OwnerPortfolioView doc={doc} />;
}

export default OwnerPortfolioPage;
