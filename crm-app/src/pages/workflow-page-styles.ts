import type { CSSProperties } from "react";

// Shared CSS-in-JS constants for the MN-OS UX workflow pages (OpsIssuePage,
// OpsBlockerPage, OpsGatePage). Extracted after rule-of-3 measurement on the
// three live workflow pages confirmed these 5 constants are byte-identical
// across all consumers. Scope is intentionally narrow: styles only — no
// shared shell, no shared hook, no generic typing, no chip abstraction, no
// section-body movement. See ~/work/handoffs/crm-lite/CURRENT.md for the
// divergence audit verdict that authorized this extraction.

export const sectionBox: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 10,
};

export const sectionHead: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#525252",
  margin: "0 0 6px 0",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export const bodyLine: CSSProperties = {
  fontSize: 13,
  color: "#262626",
  margin: "0 0 4px 0",
  lineHeight: 1.5,
};

export const subLine: CSSProperties = {
  fontSize: 12,
  color: "#525252",
  margin: "0 0 2px 0",
};

export const chipDisabled: CSSProperties = {
  display: "inline-block",
  background: "#f5f5f5",
  color: "#737373",
  border: "1px solid #e5e5e5",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  marginInlineEnd: 6,
  marginBottom: 6,
  cursor: "not-allowed",
};
