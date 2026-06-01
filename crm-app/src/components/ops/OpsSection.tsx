import { useState } from "react";

/*
 * OpsSection — collapsible grouping for the /ops control plane.
 * Tames the long flat card scroll into progressive-disclosure sections
 * (canon: mn-os-ux-runtime-v1 §Progressive Disclosure). Mirrors TodaySection's
 * visual grammar but adds collapse: the full-width header is the tap target
 * (mobile), nothing is permanently hidden — collapsed sections expand on tap.
 */

interface OpsSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function OpsSection({ title, defaultOpen = true, children }: OpsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-label={title} style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          background: "transparent",
          border: "none",
          borderBottom: "1px solid #e5e5e5",
          cursor: "pointer",
          padding: "6px 0",
          margin: "4px 0 8px",
          textAlign: "right",
          font: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 13, color: "#737373", width: 14 }}>
          {open ? "▾" : "▸"}
        </span>
        <h2 style={{ fontSize: 15, margin: 0, fontWeight: 600 }}>{title}</h2>
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
