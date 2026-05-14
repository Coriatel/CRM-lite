import type { ReactNode } from "react";
import { Inbox, Clock, Database, AlertTriangle } from "lucide-react";

/*
 * EmptyState — single component for all "nothing here yet" / "blocked" / "error" surfaces.
 *
 * Variants:
 *   no-data            — surface has data wiring but currently empty (default neutral).
 *   coming-soon        — feature shell, not yet wired up.
 *   blocked-on-schema  — waiting on Directus collection / pipeline; shows `requires` chip.
 *   error              — load failure; shows danger color.
 *
 * RTL-first Hebrew. Mobile-safe. Uses design tokens — no hard-coded colors.
 */

export type EmptyStateVariant =
  | "no-data"
  | "coming-soon"
  | "blocked-on-schema"
  | "error";

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  message?: string;
  /** For `blocked-on-schema`: technical dependency string shown in a code chip. */
  requires?: string;
  /** Optional override for the icon. */
  icon?: ReactNode;
  /** Optional CTA (e.g. retry button). */
  action?: ReactNode;
  /** Compact layout for small inline cards (smaller icon + tighter padding). */
  compact?: boolean;
}

const VARIANT_DEFAULTS: Record<
  EmptyStateVariant,
  { title: string; message: string; icon: ReactNode; tone: string }
> = {
  "no-data": {
    title: "אין נתונים להצגה",
    message: "כשיהיו נתונים הם יופיעו כאן.",
    icon: <Inbox size={28} aria-hidden="true" />,
    tone: "var(--color-text-secondary)",
  },
  "coming-soon": {
    title: "בקרוב",
    message: "התצוגה הזו עוד בתהליך.",
    icon: <Clock size={28} aria-hidden="true" />,
    tone: "var(--color-text-secondary)",
  },
  "blocked-on-schema": {
    title: "ממתין לנתונים",
    message: "אין נתונים עדיין. צריך:",
    icon: <Database size={28} aria-hidden="true" />,
    tone: "var(--color-text-secondary)",
  },
  error: {
    title: "שגיאה",
    message: "טעינת הנתונים נכשלה.",
    icon: <AlertTriangle size={28} aria-hidden="true" />,
    tone: "var(--color-danger)",
  },
};

export function EmptyState({
  variant = "no-data",
  title,
  message,
  requires,
  icon,
  action,
  compact = false,
}: EmptyStateProps) {
  const d = VARIANT_DEFAULTS[variant];
  const heading = title ?? d.title;
  const body = message ?? d.message;
  const displayIcon = icon ?? d.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      data-empty-variant={variant}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: compact ? 4 : 8,
        padding: compact ? "var(--spacing-sm) 0" : "var(--spacing-md) 0",
        color: d.tone,
        textAlign: "right",
      }}
    >
      <span
        style={{
          opacity: 0.6,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        {displayIcon}
      </span>
      <div style={{ fontSize: 14, fontWeight: 600, color: d.tone }}>
        {heading}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        {body}
        {variant === "blocked-on-schema" && requires ? (
          <>
            {" "}
            <code
              style={{
                background: "var(--color-bg-secondary)",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--color-text)",
              }}
            >
              {requires}
            </code>
          </>
        ) : null}
      </div>
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
    </div>
  );
}
