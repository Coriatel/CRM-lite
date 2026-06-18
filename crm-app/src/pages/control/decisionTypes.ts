// Phase E — Owner-facing decision surfaces (Decision Inbox / Portfolio / Executive).
// Read-only views over the frozen Phase-E packets (E1/E3/E4). No producer logic here:
// the data layer (decision-inbox-builder, owner-portfolio-builder, owner_language) owns
// derivation; these types only describe what the UI renders.

// Dev/staging flag. OFF by default — the three routes do not mount unless explicitly
// enabled, mirroring the staged-beside-/ops posture of the Control Panel.
export const DECISIONS_ENABLED = import.meta.env.VITE_DECISIONS_ENABLED === "true";

// Canonical fetch paths (served from public/ops-data in dev; live promotion is gated).
export const DECISION_INBOX_URL =
  "/ops-data/projections/control-tower/decision_inbox_packet.json";
export const PORTFOLIO_URL =
  "/ops-data/projections/control-tower/owner_portfolio_packet.json";

export type Urgency = "high" | "medium" | "low";

export interface DecisionCard {
  id: string;
  category: string;
  title: string;
  why_it_matters: string;
  recommendation: string;
  urgency: Urgency | string;
  confidence: string;
  evidence_refs: string[];
  age_days?: number;
  route?: string;
  if_ignored?: string;
}

export interface ResolvedCard {
  id: string;
  category: string;
  title: string;
  decision: string;
  decided_at: string;
  evidence_refs: string[];
}

export interface DecisionInboxMeta {
  writer: string;
  computed_at: string;
  read_only: boolean;
  freshness: string;
  stale_sources?: string[];
}

export interface DecisionInboxPacket {
  _meta: DecisionInboxMeta;
  header: { needs_you_count: number; oldest_age_days: number; any_stale: boolean };
  requires_decision: DecisionCard[];
  blocked_waiting: DecisionCard[];
  high_risk: DecisionCard[];
  recommended_next: DecisionCard | null;
  alternatives: DecisionCard[];
  recently_resolved: ResolvedCard[];
}

// For needs-you systems the builder embeds a mini recommendation card; otherwise null.
export interface PortfolioRecommendation {
  title: string;
  recommendation: string;
  confidence: string;
}

export interface PortfolioSystem {
  system: string;
  label: string;
  status: string;
  headline: string;
  needs_me: number;
  risk: string | null;
  next_action: string | null;
  recommendation: PortfolioRecommendation | null;
  evidence_refs: string[];
}

export interface PortfolioPacket {
  _meta: { writer: string; computed_at: string; read_only: boolean; freshness: string };
  header: {
    systems_total: number;
    needs_you_systems: number;
    unknown_systems: number;
    needs_me_total: number;
  };
  systems: PortfolioSystem[];
}

// Forbidden technical identifiers in any DEFAULT-VIEW string (canon "One Rule").
// Ported verbatim from builders/owner_language.py::has_identifier so the UI's
// forbidden-token test enforces the same contract the data layer is tested against.
// NOTE: this applies to displayed text only — `route` is an href and `evidence_refs`
// are progressive-disclosure (hidden by default), both intentionally exempt.
const FORBIDDEN = [
  /\/(?:srv|home|tmp|opt|etc|root)\/[^\s,;]+/, // absolute paths
  /\b[\w.-]+\/[\w./-]+\.(?:py|json|md|ts|tsx|sh|js)\b/, // relative paths
  /\b[\w-]+\.(?:py|json|md|ts|tsx|sh|js)\b/, // bare filenames
  /\b(?:req|tg)-[\w-]+\b/i, // request ids
  /\b[0-9a-f]{7,40}\b/, // SHAs
  /(?:operational_priority|score|weight|computed_priority)\s*=?\s*[\w.×*]+/i, // score noise
  /#\d+/, // PR numbers
];

export function hasIdentifier(s: string): boolean {
  if (!s) return false;
  return FORBIDDEN.some((rx) => rx.test(s));
}
