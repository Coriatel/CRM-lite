import {
  DECISIONS_ENABLED,
  PORTFOLIO_URL,
  type PortfolioPacket,
} from "./decisionTypes";
import { FreshnessNote, PortfolioCardView } from "./decisionUi";
import { useOpsPacket } from "./useOpsPacket";
import { footerStyle, h1Style, headerStyle, pageStyle } from "./DecisionInboxPage";

// E5 — Portfolio `/portfolio` (flag OFF by default).
// One health line per system, honest status (no green-by-default), over the frozen
// owner_portfolio_packet.

export function OwnerPortfolioView({ doc }: { doc: PortfolioPacket | null }) {
  if (!doc) {
    return (
      <div dir="rtl" style={pageStyle}>
        <p style={{ color: "var(--mn-text-muted)" }}>טוען…</p>
      </div>
    );
  }
  const { header } = doc;
  return (
    <div dir="rtl" style={pageStyle} data-testid="owner-portfolio">
      <header style={headerStyle}>
        <h1 style={h1Style}>תיק המערכות</h1>
        <div style={{ fontSize: 13, color: "var(--mn-text-body)" }}>
          {header.systems_total} מערכות
          {header.needs_you_systems > 0 ? ` · ${header.needs_you_systems} דורשות אותך` : " · הכול תקין"}
          {header.unknown_systems > 0 ? ` · ${header.unknown_systems} לא ידוע` : ""}
        </div>
        <FreshnessNote freshness={doc._meta.freshness} />
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {doc.systems.map((s) => (
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
  const { doc } = useOpsPacket<PortfolioPacket>(PORTFOLIO_URL);
  return <OwnerPortfolioView doc={doc} />;
}

export default OwnerPortfolioPage;
