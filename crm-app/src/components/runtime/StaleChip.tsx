/*
 * StaleChip — universal freshness/staleness chip for runtime surfaces.
 *
 * Replaces ad-hoc inline pills scattered across /today, /ops, and workflow
 * surfaces ("מידע מלפני N דק׳", "רוענן Xh", etc.) with one primitive whose
 * grammar is shared across MN-OS. Returns null when the source is fresh
 * (or fetchedAt is unknown) so callsites can drop conditionals.
 *
 * Variant:
 *   quiet — neutral gray pill, low-noise (default). Matches /today header style.
 *   warn  — amber pill for moderate-age stale (>= 1× threshold, < 6×).
 *   alert — red pill for severe stale (>= 6× threshold).
 *
 * Severity tiering is computed from age vs threshold so the same primitive
 * can serve "10-minute" surfaces and "1-day" surfaces without per-callsite
 * palette logic.
 */

import type { CSSProperties } from "react";

export type StaleChipVariant = "quiet" | "warn" | "alert";

interface StaleChipProps {
  /** When the data was produced. ISO string, Date, or null/undefined. */
  fetchedAt: string | Date | null | undefined;
  /** Stale threshold in milliseconds. Below this, chip renders nothing. Default 10 min. */
  thresholdMs?: number;
  /** Force a variant. When omitted, severity is derived from age vs threshold. */
  variant?: StaleChipVariant;
  /** data-testid passthrough for callsite-specific selectors. */
  testId?: string;
  /** Optional className for additional spacing/positioning. */
  className?: string;
}

const DEFAULT_THRESHOLD_MS = 10 * 60 * 1000;

const PALETTE: Record<StaleChipVariant, { fg: string; bg: string; border: string }> = {
  quiet: { fg: "#737373", bg: "transparent", border: "#d4d4d4" },
  warn: { fg: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  alert: { fg: "#991b1b", bg: "#fef2f2", border: "#fecaca" },
};

function parseFetchedAt(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `מידע מלפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `מידע מלפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  return `מידע מלפני ${days} ימים`;
}

function deriveVariant(ageMs: number, thresholdMs: number): StaleChipVariant {
  if (ageMs >= thresholdMs * 6) return "alert";
  if (ageMs >= thresholdMs * 2) return "warn";
  return "quiet";
}

export function StaleChip({
  fetchedAt,
  thresholdMs = DEFAULT_THRESHOLD_MS,
  variant,
  testId,
  className,
}: StaleChipProps) {
  const at = parseFetchedAt(fetchedAt);
  if (at === null) return null;
  const ageMs = Date.now() - at.getTime();
  if (ageMs < thresholdMs) return null;

  const v = variant ?? deriveVariant(ageMs, thresholdMs);
  const palette = PALETTE[v];
  const label = formatAge(ageMs);
  const minutes = Math.floor(ageMs / 60_000);

  const style: CSSProperties = {
    fontSize: 11,
    color: palette.fg,
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    borderRadius: 999,
    padding: "1px 8px",
    whiteSpace: "nowrap",
    display: "inline-block",
  };

  return (
    <span
      data-testid={testId}
      data-stale-variant={v}
      title={`עודכן: ${at.toISOString()}`}
      aria-label={`מידע מלפני ${minutes} דקות`}
      className={className}
      style={style}
    >
      {label}
    </span>
  );
}
