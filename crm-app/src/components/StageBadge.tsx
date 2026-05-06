import { LifecycleStage } from "../types";

interface StageBadgeProps {
  stage: Pick<LifecycleStage, "name" | "color">;
  size?: "sm" | "md";
}

/**
 * Read-only lifecycle stage badge (Slice #1).
 * Renders the stage name with its configured color as a left dot + label chip.
 */
export function StageBadge({ stage, size = "sm" }: StageBadgeProps) {
  const color = stage.color || "#94a3b8";
  const padding = size === "sm" ? "2px 8px" : "4px 10px";
  const fontSize = size === "sm" ? 11 : 13;

  return (
    <span
      title={`שלב: ${stage.name}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding,
        borderRadius: 999,
        background: `${color}1A`,
        border: `1px solid ${color}66`,
        color: "var(--color-text)",
        fontSize,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        maxWidth: "100%",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {stage.name}
      </span>
    </span>
  );
}
