import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export type PortalTone = "danger" | "warn" | "ok" | "muted";

const TONE_COLOR: Record<PortalTone, string> = {
  danger: "var(--color-danger)",
  warn: "var(--color-warning)",
  ok: "var(--color-success)",
  muted: "var(--color-text-secondary)",
};

interface PortalCardProps {
  icon: ReactNode;
  /** Domain name in human Hebrew (e.g. "צריך אותך"). */
  label: string;
  /** Headline number or short status. Optional for pure navigation tiles. */
  count?: number | string;
  countTone?: PortalTone;
  /** One-line status, e.g. "החלטות 13 · חסימות 3". */
  summary?: string;
  /** Business meaning — why this matters to the owner, plain language. */
  why?: string;
  /** Drill target (an existing route or /ops#anchor). The whole card is the control. */
  to: string;
  testId?: string;
}

/**
 * L1 domain portal. The whole card is one large tap target that drills into the
 * domain. No hover-only affordances, no hidden controls, text wraps (never clipped).
 * In RTL the chevron points to the inline-start (visual left) = "go deeper".
 */
export function PortalCard({
  icon,
  label,
  count,
  countTone = "muted",
  summary,
  why,
  to,
  testId,
}: PortalCardProps) {
  return (
    <Link
      to={to}
      data-testid={testId}
      aria-label={`${label}${count != null ? ` — ${count}` : ""}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "var(--color-text)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--spacing-md)",
        minHeight: 44,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden>
          {icon}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>
          {label}
        </span>
        {count != null && (
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: TONE_COLOR[countTone],
            }}
          >
            {count}
          </span>
        )}
        <ChevronLeft size={18} aria-hidden style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
      </div>

      {summary && (
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text)",
            marginTop: 6,
            overflowWrap: "anywhere",
          }}
        >
          {summary}
        </div>
      )}
      {why && (
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-secondary)",
            marginTop: 4,
            overflowWrap: "anywhere",
          }}
        >
          {why}
        </div>
      )}
    </Link>
  );
}
