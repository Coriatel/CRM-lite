import type React from "react";

// Control-Tower palette — scoped to the Phase E owner surfaces only. Applied by spreading
// `CONTROL_THEME` onto each page's root element, which overrides the global `--mn-*` tokens
// *locally* (no change to mn-os-tokens.css, no effect on any other screen — fully reversible).
//
// Three options were prepared (see OWNER_EXPERIENCE_FIX_PASS_REPORT.md / PALETTE_DECISION.md):
//   A "Operational Steel"  — cool neutral light, deep navy ink, teal accent. EXECUTIVE, low-risk.
//   B "Midnight Command"   — dark navy cockpit, light text. Strongest control-room feel, higher risk.
//   C "Slate & Bronze"     — cool slate + bronze/gold executive accent.
// Applied: A. Rationale: removes the warm-cream/pink softness, reads operational and
// executive, keeps the MN brand teal, and preserves AA contrast without a risky full dark
// inversion. Critical emphasis comes from a bold rail + filled chip, not a pink fill.

export const PALETTE_A: Record<string, string> = {
  "--mn-surface-root": "#e9edf1", // cool light grey (was warm cream)
  "--mn-surface-guidance": "#ffffff", // clean white cards
  "--mn-surface-sheet": "#eef2f6",
  "--mn-surface-calm": "#e4eaef",
  "--mn-text-strong": "#0f2531", // deep navy ink
  "--mn-text-body": "#33454f",
  "--mn-text-muted": "#5f7180",
  "--mn-border-fold": "#cfd8df", // cool grey hairline
  "--mn-brand-teal": "#0a6c7e",
  "--mn-brand-teal-soft": "#d2e9ec",
  "--mn-critical": "#bf2e1f", // strong operational red
  "--mn-warning": "#b26a06",
  "--mn-success": "#1d7a48",
  // card emphasis tints (cool/neutral — never pink)
  "--ct-critical-tint": "#ffffff",
  "--ct-critical-rail": "#bf2e1f",
  "--ct-hero-ink": "#0f2531",
};

export const CONTROL_THEME = PALETTE_A as unknown as React.CSSProperties;
