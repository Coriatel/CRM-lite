// Shared visual grammar for /ops cards.
//
// Extracted from byte-identical duplicates in HybridBlockersCard and
// AttentionSynthesisCard (Phase A4 — card grammar unification, mn-os-
// runtime-refinement-continuous). Future ops cards should import these
// rather than redefining locally so the surface keeps a single grammar
// without per-card drift.
//
// Anti-scope: AttentionSummaryCard, SafeSwarmCard, and OpsPage's inline
// `card` style use intentionally distinct frames (different palette,
// dynamic per-status borders) — those stay as-is.

import type { CSSProperties } from "react";

export const opsCardStyle: CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
  background: "var(--color-card, #fff)",
};

export const opsCardHeadStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
  gap: 8,
  flexWrap: "wrap",
};

export const opsCardBadge: CSSProperties = {
  color: "#fff",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};
