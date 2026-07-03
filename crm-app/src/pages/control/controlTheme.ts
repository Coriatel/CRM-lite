import type React from "react";

// Control-Tower palette — scoped to the Phase E owner surfaces only. Applied by spreading
// `CONTROL_THEME` onto each page root, which overrides the global `--mn-*` tokens *locally*
// (mn-os-tokens.css untouched, no effect on any other screen — fully reversible).
//
//   A "Operational Steel" — cool neutral light. (kept below for one-line revert)
//   B "Midnight Command"   — dark navy cockpit. APPLIED.
//
// `--ct-on-accent` / `--ct-on-critical` are the text colors that sit ON the teal/red fills,
// so contrast stays AA whether the accent is dark (theme A) or bright (theme B).

export const PALETTE_A: Record<string, string> = {
  "--mn-surface-root": "#e9edf1",
  "--mn-surface-guidance": "#ffffff",
  "--mn-surface-sheet": "#eef2f6",
  "--mn-surface-calm": "#e4eaef",
  "--mn-text-strong": "#0f2531",
  "--mn-text-body": "#33454f",
  "--mn-text-muted": "#5f7180",
  "--mn-border-fold": "#cfd8df",
  "--mn-brand-teal": "#0a6c7e",
  "--mn-brand-teal-soft": "#d2e9ec",
  "--mn-critical": "#bf2e1f",
  "--mn-warning": "#b26a06",
  "--mn-success": "#1d7a48",
  "--mn-shadow-card": "0 1px 2px rgba(15,37,49,0.08)",
  "--ct-critical-rail": "#bf2e1f",
  "--ct-on-accent": "#ffffff",
  "--ct-on-critical": "#ffffff",
};

// B — Midnight Command (dark executive cockpit).
export const PALETTE_B: Record<string, string> = {
  "--mn-surface-root": "#0c161e", // deep navy page
  "--mn-surface-guidance": "#152532", // card
  "--mn-surface-sheet": "#1b2e3c", // raised / evidence
  "--mn-surface-calm": "#11202b",
  "--mn-text-strong": "#eef4f8", // near-white ink
  "--mn-text-body": "#b7c6d2",
  "--mn-text-muted": "#7d93a2",
  "--mn-border-fold": "#26384a", // hairline on dark
  "--mn-brand-teal": "#2bb6cc", // bright cyan accent
  "--mn-brand-teal-soft": "#0e3a44", // dark-teal fill for the hero/reco card
  "--mn-critical": "#ff6b5e", // coral red (pops on dark)
  "--mn-warning": "#f0a83a",
  "--mn-success": "#3fc98a",
  "--mn-shadow-card": "0 1px 3px rgba(0,0,0,0.45)",
  "--ct-critical-rail": "#ff6b5e",
  "--ct-on-accent": "#04161d", // dark text on bright teal — AA
  "--ct-on-critical": "#2a0a06", // dark text on coral chip — AA
};

export const CONTROL_THEME = PALETTE_B as unknown as React.CSSProperties;
