import { useState } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import type { DecisionCard, PortfolioSystem, ResolvedCard } from "./decisionTypes";

// ── shared presentational primitives for the owner decision surfaces ───────────
// Pure render — no fetch, no derivation. Reused by Decision Inbox (E2), Portfolio
// (E5) and Executive Dashboard (E6) so the three surfaces are visually and
// semantically identical for the same fact (E7 consistency by construction).

const URGENCY_COLOR: Record<string, string> = {
  high: "var(--mn-critical)",
  medium: "var(--mn-warning)",
  low: "var(--mn-text-muted)",
};
const URGENCY_LABEL: Record<string, string> = {
  high: "דחוף",
  medium: "בינוני",
  low: "נמוך",
};

export function UrgencyChip({ urgency }: { urgency: string }) {
  const color = URGENCY_COLOR[urgency] ?? "var(--mn-text-muted)";
  return (
    <span data-testid="urgency-chip" style={{ ...chipStyle, color, borderColor: color }}>
      {URGENCY_LABEL[urgency] ?? urgency}
    </span>
  );
}

export function ConfidenceChip({ confidence }: { confidence: string }) {
  return (
    <span style={{ ...chipStyle, color: "var(--mn-text-muted)", borderColor: "var(--mn-border-fold)" }}>
      ביטחון: {confidence}
    </span>
  );
}

// Evidence is hidden by default (progressive disclosure). Collapsed evidence is NOT
// rendered into the DOM, so the default-view forbidden-token scan never sees the
// technical refs kept here as honest residual.
export function EvidenceDisclosure({ refs }: { refs: string[] }) {
  const [open, setOpen] = useState(false);
  if (!refs?.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        data-testid="evidence-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={evidenceToggleStyle}
      >
        {open ? "הסתר מקורות" : `מקורות (${refs.length})`}
      </button>
      {open && (
        <ul data-testid="evidence-list" style={evidenceListStyle}>
          {refs.map((r, i) => (
            <li key={i} style={{ direction: "ltr", textAlign: "left", color: "var(--mn-text-muted)" }}>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RouteLink({ route }: { route?: string }) {
  if (!route) return null;
  // route is an internal href, never displayed as text (exempt from the One Rule).
  return (
    <Link to={route} data-testid="card-route" style={routeLinkStyle}>
      פתח ←
    </Link>
  );
}

export function DecisionCardView({ card }: { card: DecisionCard }) {
  return (
    <article data-testid="decision-card" style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <h3 data-testid="card-title" style={cardTitleStyle}>
          {card.title}
        </h3>
        <UrgencyChip urgency={String(card.urgency)} />
      </div>
      <p data-testid="card-why" style={cardWhyStyle}>
        {card.why_it_matters}
      </p>
      <div data-testid="card-recommendation" style={recommendationStyle}>
        <span style={{ color: "var(--mn-text-muted)", fontSize: 12 }}>המלצה: </span>
        {card.recommendation}
      </div>
      {card.if_ignored && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--mn-text-muted)" }}>
          אם מתעלמים: {card.if_ignored}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <ConfidenceChip confidence={card.confidence} />
        {typeof card.age_days === "number" && (
          <span style={{ fontSize: 12, color: "var(--mn-text-muted)" }}>
            ממתין {Math.round(card.age_days)} ימים
          </span>
        )}
        <RouteLink route={card.route} />
      </div>
      <EvidenceDisclosure refs={card.evidence_refs} />
    </article>
  );
}

// The single recommended next move — visually elevated (E3 recommendation engine output).
export function RecommendationCard({ card }: { card: DecisionCard }) {
  return (
    <article data-testid="recommendation-card" style={{ ...cardStyle, ...recoCardStyle }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mn-brand-teal)", marginBottom: 4 }}>
        הצעד הבא המומלץ
      </div>
      <h3 data-testid="card-title" style={{ ...cardTitleStyle, fontSize: 18 }}>
        {card.title}
      </h3>
      <p data-testid="card-why" style={cardWhyStyle}>
        {card.why_it_matters}
      </p>
      <div data-testid="card-recommendation" style={recommendationStyle}>
        {card.recommendation}
      </div>
      {card.if_ignored && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--mn-text-muted)" }}>
          אם מתעלמים: {card.if_ignored}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <ConfidenceChip confidence={card.confidence} />
        <RouteLink route={card.route} />
      </div>
      <EvidenceDisclosure refs={card.evidence_refs} />
    </article>
  );
}

export function DecisionSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section data-testid="decision-section" style={{ marginTop: 18 }}>
      <h2 style={sectionTitleStyle}>
        {title}
        {typeof count === "number" && <span style={sectionCountStyle}>{count}</span>}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

const STATUS_COLOR: Record<string, string> = {
  תקין: "var(--mn-success)",
  בעבודה: "var(--mn-warning)",
  "דורש אותך": "var(--mn-critical)",
  "לא ידוע": "var(--mn-text-muted)",
};

export function PortfolioCardView({ system }: { system: PortfolioSystem }) {
  const color = STATUS_COLOR[system.status] ?? "var(--mn-text-muted)";
  return (
    <article
      data-testid="portfolio-card"
      style={{ ...cardStyle, borderInlineStartWidth: 4, borderInlineStartStyle: "solid", borderInlineStartColor: color }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 data-testid="portfolio-label" style={cardTitleStyle}>
          {system.label}
        </h3>
        <span data-testid="portfolio-status" style={{ ...chipStyle, color, borderColor: color }}>
          {system.status}
        </span>
      </div>
      <p style={{ ...cardWhyStyle, color: "var(--mn-text-body)" }}>{system.headline}</p>
      {system.risk && (
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--mn-warning)" }}>⚠ {system.risk}</p>
      )}
      {system.next_action && (
        <div style={recommendationStyle}>
          <span style={{ color: "var(--mn-text-muted)", fontSize: 12 }}>הצעד הבא: </span>
          {system.next_action}
        </div>
      )}
      {system.recommendation && (
        <div style={recommendationStyle}>
          <span style={{ color: "var(--mn-text-muted)", fontSize: 12 }}>המלצה: </span>
          {system.recommendation.recommendation}
          <span style={{ marginInlineStart: 8 }}>
            <ConfidenceChip confidence={system.recommendation.confidence} />
          </span>
        </div>
      )}
      {system.needs_me > 0 && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--mn-critical)", fontWeight: 600 }}>
          {system.needs_me} פריטים דורשים אותך
        </div>
      )}
      <EvidenceDisclosure refs={system.evidence_refs} />
    </article>
  );
}

export function ResolvedRow({ card }: { card: ResolvedCard }) {
  const decided = (() => {
    try {
      return new Date(card.decided_at).toLocaleDateString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "";
    }
  })();
  return (
    <div data-testid="resolved-row" style={resolvedRowStyle}>
      <span style={{ color: "var(--mn-text-body)" }}>{card.title}</span>
      <span style={{ color: "var(--mn-text-muted)", whiteSpace: "nowrap" }}>
        {card.decision}
        {decided ? ` · ${decided}` : ""}
      </span>
    </div>
  );
}

export function FreshnessNote({ freshness }: { freshness: string }) {
  const degraded = freshness !== "FRESH" && freshness !== "OK";
  return (
    <div
      data-testid="freshness-note"
      style={{ fontSize: 12, color: degraded ? "var(--mn-warning)" : "var(--mn-text-muted)", marginTop: 2 }}
    >
      {degraded ? "חלק מהמקורות אינם עדכניים — מסומן ביושר, ללא ניחוש." : "המקורות עדכניים."}
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const chipStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  border: "1px solid",
  borderRadius: 999,
  padding: "2px 8px",
  whiteSpace: "nowrap",
};
const cardStyle: React.CSSProperties = {
  background: "var(--mn-surface-guidance)",
  border: "1px solid var(--mn-border-fold)",
  borderRadius: "var(--mn-radius-card)",
  padding: "12px 14px",
  boxShadow: "var(--mn-shadow-card)",
};
const recoCardStyle: React.CSSProperties = {
  background: "var(--mn-brand-teal-soft)",
  borderColor: "var(--mn-brand-teal)",
};
const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15.5,
  fontWeight: 700,
  color: "var(--mn-text-strong)",
  lineHeight: 1.3,
};
const cardWhyStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13.5,
  color: "var(--mn-text-body)",
  lineHeight: 1.45,
};
const recommendationStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13.5,
  fontWeight: 600,
  color: "var(--mn-text-strong)",
};
const routeLinkStyle: React.CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 4px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--mn-brand-teal)",
  textDecoration: "none",
  marginInlineStart: "auto",
};
const evidenceToggleStyle: React.CSSProperties = {
  minHeight: 44,
  border: "none",
  background: "transparent",
  color: "var(--mn-text-muted)",
  fontSize: 12.5,
  cursor: "pointer",
  padding: "0 2px",
  font: "inherit",
};
const evidenceListStyle: React.CSSProperties = {
  margin: "4px 0 0",
  padding: "8px 12px",
  listStyle: "none",
  background: "var(--mn-surface-sheet)",
  border: "1px solid var(--mn-border-fold)",
  borderRadius: "var(--mn-radius-card)",
  fontSize: 11.5,
  fontFamily: "monospace",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const sectionTitleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "0 0 10px",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--mn-text-strong)",
};
const sectionCountStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--mn-text-muted)",
  background: "var(--mn-surface-sheet)",
  borderRadius: 999,
  padding: "1px 8px",
};
const resolvedRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 12.5,
  padding: "7px 0",
  borderBottom: "1px solid var(--mn-border-fold)",
};
