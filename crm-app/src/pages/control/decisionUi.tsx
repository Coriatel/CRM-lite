import { useState } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import "./controlChrome.css";
import type { DecisionCard, PortfolioSystem, ResolvedCard } from "./decisionTypes";
import { prominenceOf, type Prominence, type PortfolioRollup } from "./decisionLogic";

// ── shared owner-cognition primitives ─────────────────────────────────────────
// A compact command center: collapsed cards show only what's needed to act or decide
// to look closer; detail and evidence open on demand. Critical must dominate;
// informational must recede. Reused across Decision Inbox (E2), Portfolio (E5),
// Executive (E6) so the same fact looks the same everywhere (E7).

const clamp1: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 1,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

// ── identity: this is the MN-OS Control Tower, not another CRM screen ──────────
export function ControlTowerHeader({
  title,
  subtitle,
  freshness,
}: {
  title: string;
  subtitle?: string;
  freshness?: string;
}) {
  return (
    <header style={ctHeaderStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={wordmarkStyle}>MN-OS</span>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: "var(--mn-text-muted)" }}>
          מגדל בקרה
        </span>
      </div>
      <h1 style={ctTitleStyle}>{title}</h1>
      {subtitle && <div style={{ fontSize: 13, color: "var(--mn-text-body)" }}>{subtitle}</div>}
      {freshness && <FreshnessNote freshness={freshness} />}
    </header>
  );
}

// ── owner hero: understand the org state in one second ────────────────────────
export interface HeroMetric {
  value: number | string;
  label: string;
  severity: "critical" | "warn" | "ok" | "muted";
}
const SEV: Record<HeroMetric["severity"], string> = {
  critical: "var(--mn-critical)",
  warn: "var(--mn-warning)",
  ok: "var(--mn-success)",
  muted: "var(--mn-text-muted)",
};

export function OwnerHero({
  metrics,
  action,
}: {
  metrics: HeroMetric[];
  action?: { title: string; route?: string } | null;
}) {
  return (
    <section data-testid="owner-hero" style={heroWrapStyle}>
      <div style={heroMetricsStyle}>
        {metrics.map((m, i) => (
          <div key={i} style={heroTileStyle} data-testid="hero-metric">
            <span style={{ fontSize: 25, fontWeight: 800, color: SEV[m.severity], lineHeight: 1 }}>{m.value}</span>
            <span style={{ fontSize: 11, color: "var(--mn-text-body)", marginTop: 3, textAlign: "center" }}>
              {m.label}
            </span>
          </div>
        ))}
      </div>
      {action && (
        <Link to={action.route ?? "#"} data-testid="hero-action" style={heroActionStyle}>
          <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85 }}>הצעד הבא המומלץ</span>
          <span style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.25 }}>{action.title} ←</span>
        </Link>
      )}
    </section>
  );
}

// ── chips ─────────────────────────────────────────────────────────────────────
const URGENCY_COLOR: Record<string, string> = {
  high: "var(--mn-critical)",
  medium: "var(--mn-warning)",
  low: "var(--mn-text-muted)",
};
const URGENCY_LABEL: Record<string, string> = { high: "דחוף", medium: "בינוני", low: "מידע" };

export function UrgencyChip({ urgency }: { urgency: string }) {
  const color = URGENCY_COLOR[urgency] ?? "var(--mn-text-muted)";
  const filled = urgency === "high";
  return (
    <span
      data-testid="urgency-chip"
      style={{ ...chipStyle, color: filled ? "var(--ct-on-critical)" : color, background: filled ? color : "transparent", borderColor: color }}
    >
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

export function EvidenceDisclosure({ refs }: { refs: string[] }) {
  const [open, setOpen] = useState(false);
  if (!refs?.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" data-testid="evidence-toggle" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-expanded={open} style={evidenceToggleStyle}>
        {open ? "הסתר מקורות" : `מקורות (${refs.length})`}
      </button>
      {open && (
        <ul data-testid="evidence-list" style={evidenceListStyle}>
          {refs.map((r, i) => (
            <li key={i} style={{ direction: "ltr", textAlign: "left", color: "var(--mn-text-muted)" }}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrimaryAction({ route, label = "טפל" }: { route?: string; label?: string }) {
  if (!route) return null;
  return (
    <Link to={route} data-testid="card-action" onClick={(e) => e.stopPropagation()} style={primaryActionStyle}>
      {label} ←
    </Link>
  );
}

// ── decision card: compact by default, expands on tap ─────────────────────────
const TIER: Record<Prominence, React.CSSProperties> = {
  critical: { borderInlineStartColor: "var(--ct-critical-rail, var(--mn-critical))", borderInlineStartWidth: 5 },
  important: { borderInlineStartColor: "var(--mn-warning)", borderInlineStartWidth: 4 },
  info: { borderInlineStartColor: "var(--mn-border-fold)", borderInlineStartWidth: 3 },
};

export function DecisionCardView({ card }: { card: DecisionCard }) {
  const [open, setOpen] = useState(false);
  const tier = prominenceOf(String(card.urgency));
  const titleSize = tier === "critical" ? 15.5 : 14.5;
  return (
    <article
      data-testid="decision-card"
      data-prominence={tier}
      data-open={open}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      style={{ ...cardStyle, cursor: "pointer", borderInlineStartStyle: "solid", ...TIER[tier] }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 data-testid="card-title" style={{ ...cardTitleStyle, fontSize: titleSize, ...(open ? null : clamp1) }}>
          {card.title}
        </h3>
        <UrgencyChip urgency={String(card.urgency)} />
      </div>
      <p data-testid="card-why" style={{ ...cardWhyStyle, ...(open ? null : clamp1) }}>
        {card.why_it_matters}
      </p>

      {open && (
        <>
          <div data-testid="card-recommendation" style={recommendationStyle}>
            <span style={{ color: "var(--mn-text-muted)", fontSize: 12 }}>המלצה: </span>
            {card.recommendation}
          </div>
          {card.if_ignored && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--mn-text-muted)" }}>אם מתעלמים: {card.if_ignored}</p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <ConfidenceChip confidence={card.confidence} />
            {typeof card.age_days === "number" && (
              <span style={{ fontSize: 12, color: "var(--mn-text-muted)" }}>ממתין {Math.round(card.age_days)} ימים</span>
            )}
          </div>
          <EvidenceDisclosure refs={card.evidence_refs} />
        </>
      )}

      <div style={cardFooterStyle}>
        <span style={{ fontSize: 11.5, color: "var(--mn-text-muted)" }}>{open ? "פחות ▴" : "פרטים ▾"}</span>
        <span style={{ marginInlineStart: "auto" }}>
          <PrimaryAction route={card.route} />
        </span>
      </div>
    </article>
  );
}

// The single highest-value move — dominates the screen, shown ready-to-act.
export function RecommendationCard({ card }: { card: DecisionCard }) {
  return (
    <article data-testid="recommendation-card" style={{ ...cardStyle, ...recoCardStyle }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--mn-brand-teal)", marginBottom: 4 }}>★ הצעד הבא המומלץ</div>
      <h3 data-testid="card-title" style={{ ...cardTitleStyle, fontSize: 18, lineHeight: 1.25 }}>{card.title}</h3>
      <p data-testid="card-why" style={{ ...cardWhyStyle, ...clamp1, fontSize: 13.5 }}>{card.why_it_matters}</p>
      {card.route ? (
        <Link to={card.route} data-testid="reco-cta" style={ctaButtonStyle}>{card.recommendation} ←</Link>
      ) : (
        <div data-testid="card-recommendation" style={recommendationStyle}>{card.recommendation}</div>
      )}
      <div style={{ ...cardFooterStyle, marginTop: 10 }}>
        <ConfidenceChip confidence={card.confidence} />
        <span style={{ marginInlineStart: "auto" }}>
          <EvidenceDisclosure refs={card.evidence_refs} />
        </span>
      </div>
    </article>
  );
}

// ── Top-N + "show remaining" — focus the owner, don't dump every card ─────────
export function PriorityList({ cards, top = 3 }: { cards: DecisionCard[]; top?: number }) {
  const [showAll, setShowAll] = useState(false);
  const head = cards.slice(0, top);
  const rest = cards.slice(top);
  return (
    <div data-testid="priority-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {head.map((c) => (
        <DecisionCardView key={c.id} card={c} />
      ))}
      {rest.length > 0 && !showAll && (
        <button type="button" data-testid="show-remaining" onClick={() => setShowAll(true)} style={showMoreStyle}>
          הצג עוד {rest.length} פריטים ▾
        </button>
      )}
      {showAll && rest.map((c) => <DecisionCardView key={c.id} card={c} />)}
      {showAll && rest.length > 0 && (
        <button type="button" data-testid="show-less" onClick={() => setShowAll(false)} style={showMoreStyle}>הצג פחות ▴</button>
      )}
    </div>
  );
}

export function DecisionSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section data-testid="decision-section" style={{ marginTop: 16 }}>
      <h2 style={sectionTitleStyle}>
        {title}
        {typeof count === "number" && <span style={sectionCountStyle}>{count}</span>}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}

// ── portfolio summary (all KPI counters grouped at the top) ───────────────────
export function PortfolioSummary({ rollup }: { rollup: PortfolioRollup }) {
  const tiles = [
    { n: rollup.attention, label: "דורש אותך", color: "var(--mn-critical)", testid: "sum-attention" },
    { n: rollup.warning, label: "בעבודה", color: "var(--mn-warning)", testid: "sum-warning" },
    { n: rollup.healthy, label: "תקין", color: "var(--mn-success)", testid: "sum-healthy" },
  ];
  return (
    <section data-testid="portfolio-summary" style={heroMetricsStyle}>
      {tiles.map((t) => (
        <div key={t.testid} data-testid={t.testid} style={heroTileStyle}>
          <span style={{ fontSize: 25, fontWeight: 800, color: t.color, lineHeight: 1 }}>{t.n}</span>
          <span style={{ fontSize: 11, color: "var(--mn-text-body)", marginTop: 3 }}>{t.label}</span>
        </div>
      ))}
    </section>
  );
}

const STATUS_COLOR: Record<string, string> = {
  תקין: "var(--mn-success)",
  בעבודה: "var(--mn-warning)",
  "דורש אותך": "var(--mn-critical)",
  "לא ידוע": "var(--mn-text-muted)",
};

// portfolio card: compact by default, expands for risk / next action / recommendation.
export function PortfolioCardView({ system }: { system: PortfolioSystem }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[system.status] ?? "var(--mn-text-muted)";
  const attention = system.status === "דורש אותך" || system.needs_me > 0;
  const hasDetail = !!(system.risk || system.next_action || system.recommendation || system.evidence_refs.length);
  return (
    <article
      data-testid="portfolio-card"
      data-open={open}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => hasDetail && setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (hasDetail && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      style={{ ...cardStyle, cursor: hasDetail ? "pointer" : "default", borderInlineStartWidth: attention ? 5 : 4, borderInlineStartStyle: "solid", borderInlineStartColor: color }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 data-testid="portfolio-label" style={cardTitleStyle}>{system.label}</h3>
        <span data-testid="portfolio-status" style={{ ...chipStyle, color: attention ? "var(--ct-on-critical)" : color, background: attention ? color : "transparent", borderColor: color }}>
          {system.status}
        </span>
      </div>
      <p style={{ ...cardWhyStyle, color: "var(--mn-text-body)", ...(open ? null : clamp1) }}>{system.headline}</p>
      {system.needs_me > 0 && !open && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--mn-critical)", fontWeight: 700 }}>{system.needs_me} פריטים דורשים אותך</div>
      )}

      {open && (
        <>
          {system.risk && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--mn-warning)" }}>⚠ {system.risk}</p>}
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
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--mn-critical)", fontWeight: 700 }}>{system.needs_me} פריטים דורשים אותך</div>
          )}
          <EvidenceDisclosure refs={system.evidence_refs} />
        </>
      )}

      {hasDetail && (
        <div style={{ ...cardFooterStyle, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 11.5, color: "var(--mn-text-muted)" }}>{open ? "פחות ▴" : "פרטים ▾"}</span>
        </div>
      )}
    </article>
  );
}

// compact one-line system row for the cockpit (less scroll than full cards)
export function PortfolioRow({ system }: { system: PortfolioSystem }) {
  const color = STATUS_COLOR[system.status] ?? "var(--mn-text-muted)";
  return (
    <div data-testid="portfolio-row" style={portfolioRowStyle}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
        <span style={{ color: "var(--mn-text-strong)", fontWeight: 600 }}>{system.label}</span>
      </span>
      <span style={{ color: "var(--mn-text-muted)", fontSize: 12.5, whiteSpace: "nowrap" }}>
        {system.needs_me > 0 ? `${system.needs_me} דורשים אותך` : system.status}
      </span>
    </div>
  );
}

export function ResolvedRow({ card }: { card: ResolvedCard }) {
  const decided = (() => {
    try {
      return new Date(card.decided_at).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return "";
    }
  })();
  return (
    <div data-testid="resolved-row" style={resolvedRowStyle}>
      <span style={{ color: "var(--mn-text-body)" }}>{card.title}</span>
      <span style={{ color: "var(--mn-text-muted)", whiteSpace: "nowrap" }}>{card.decision}{decided ? ` · ${decided}` : ""}</span>
    </div>
  );
}

// Recently-resolved is history, not a decision — collapsed by default (expandable only).
export function ResolvedHistory({ items }: { items: ResolvedCard[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <section style={{ marginTop: 16 }}>
      <button type="button" data-testid="resolved-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={showMoreStyle}>
        הוכרע לאחרונה ({items.length}) {open ? "▴" : "▾"}
      </button>
      {open && (
        <div data-testid="resolved-body" style={{ marginTop: 8 }}>
          {items.map((c) => (
            <ResolvedRow key={c.id} card={c} />
          ))}
        </div>
      )}
    </section>
  );
}

export function FreshnessNote({ freshness }: { freshness: string }) {
  const degraded = freshness !== "FRESH" && freshness !== "OK";
  return (
    <div data-testid="freshness-note" style={{ fontSize: 12, color: degraded ? "var(--mn-warning)" : "var(--mn-text-muted)", marginTop: 2 }}>
      {degraded ? "חלק מהמקורות אינם עדכניים — מסומן ביושר, ללא ניחוש." : "המקורות עדכניים."}
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const chipStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, border: "1px solid", borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" };
const cardStyle: React.CSSProperties = {
  background: "var(--mn-surface-guidance)",
  border: "1px solid var(--mn-border-fold)",
  borderRadius: "var(--mn-radius-card)",
  padding: "11px 13px",
  boxShadow: "var(--mn-shadow-card)",
};
const cardFooterStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" };
const recoCardStyle: React.CSSProperties = { background: "var(--mn-brand-teal-soft)", border: "2px solid var(--mn-brand-teal)" };
const ctaButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 46,
  marginTop: 10,
  padding: "0 16px",
  background: "var(--mn-brand-teal)",
  color: "var(--ct-on-accent)",
  fontWeight: 800,
  fontSize: 14.5,
  borderRadius: "var(--mn-radius-card)",
  textDecoration: "none",
};
const primaryActionStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  padding: "0 14px",
  background: "var(--mn-brand-teal)",
  color: "var(--ct-on-accent)",
  fontWeight: 700,
  fontSize: 13,
  borderRadius: "var(--mn-radius-card)",
  textDecoration: "none",
};
const cardTitleStyle: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700, color: "var(--mn-text-strong)", lineHeight: 1.3 };
const cardWhyStyle: React.CSSProperties = { margin: "5px 0 0", fontSize: 13, color: "var(--mn-text-body)", lineHeight: 1.4 };
const recommendationStyle: React.CSSProperties = { marginTop: 8, fontSize: 13.5, fontWeight: 600, color: "var(--mn-text-strong)" };
const evidenceToggleStyle: React.CSSProperties = { minHeight: 36, border: "none", background: "transparent", color: "var(--mn-text-muted)", fontSize: 12.5, cursor: "pointer", padding: "0 2px", font: "inherit" };
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
const sectionTitleStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px", fontSize: 13.5, fontWeight: 800, color: "var(--mn-text-strong)", letterSpacing: 0.2 };
const sectionCountStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--mn-text-muted)", background: "var(--mn-surface-sheet)", borderRadius: 999, padding: "1px 8px" };
const resolvedRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "7px 0", borderBottom: "1px solid var(--mn-border-fold)" };
const portfolioRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "11px 13px",
  background: "var(--mn-surface-guidance)",
  border: "1px solid var(--mn-border-fold)",
  borderRadius: "var(--mn-radius-card)",
  fontSize: 13.5,
};
const showMoreStyle: React.CSSProperties = {
  minHeight: 46,
  border: "1px solid var(--mn-border-fold)",
  background: "var(--mn-surface-sheet)",
  borderRadius: "var(--mn-radius-card)",
  color: "var(--mn-brand-teal)",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
  font: "inherit",
};
const ctHeaderStyle: React.CSSProperties = { paddingBottom: 10, borderBottom: "2px solid var(--mn-brand-teal)" };
const wordmarkStyle: React.CSSProperties = { fontSize: 12, fontWeight: 900, letterSpacing: 1, color: "var(--ct-on-accent)", background: "var(--mn-brand-teal)", borderRadius: 6, padding: "2px 7px" };
const ctTitleStyle: React.CSSProperties = { margin: "8px 0 2px", fontSize: 22, fontWeight: 800, color: "var(--mn-text-strong)" };
const heroWrapStyle: React.CSSProperties = { marginTop: 12, display: "flex", flexDirection: "column", gap: 10 };
const heroMetricsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: 8 };
const heroTileStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: "12px 6px",
  background: "var(--mn-surface-guidance)",
  border: "1px solid var(--mn-border-fold)",
  borderRadius: "var(--mn-radius-card)",
  boxShadow: "var(--mn-shadow-card)",
};
const heroActionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "13px 15px",
  background: "var(--mn-brand-teal)",
  color: "var(--ct-on-accent)",
  borderRadius: "var(--mn-radius-card)",
  textDecoration: "none",
  boxShadow: "var(--mn-shadow-card)",
};
