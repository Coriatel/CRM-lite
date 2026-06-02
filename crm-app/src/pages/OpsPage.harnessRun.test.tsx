import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HarnessControlCard, type HarnessRunDoc } from "./OpsPage";

// Safe-empty envelope — mirrors sync-ops-data.mjs envelopeDefault("harness_run.json")
// and build-harness-run.py --default: no run observed yet, never a fabricated run.
const safeDefault: HarnessRunDoc = {
  _meta: {
    generated_default: true,
    source: "missing — vault projection not synced",
    generated_at: "2026-06-01T21:00:00.000Z",
  },
  last_run: null,
  next_action: null,
  health: { status: "red", reasons: ["projection_not_synced"] },
};

// A real campaign-advance run summary projected by build-harness-run.py.
const realRun: HarnessRunDoc = {
  _meta: {
    generated_default: false,
    source: "campaign_advance_loop.py --summary-out",
    generated_at: "2026-06-01T20:00:56Z",
  },
  last_run: {
    started_at: "2026-06-01T20:00:43.267346+00:00",
    finished_at: "2026-06-01T20:00:43.293672+00:00",
    final_decision: "NO_NEXT_PACKET",
    dispatched: 2,
    continue_count: 2,
    stop_reason: "no-next-packet",
    scope: { campaign_id: null, item_ids: ["E1", "E2"] },
    evidence: { summary_path: "/tmp/phaseb-evidence/loop-summary.json", iterations: 2 },
  },
  next_action: { code: "queue_drained", text: "אין packet זמין להרצה — התור נוקה" },
  health: { status: "green", reasons: [] },
};

describe("HarnessControlCard — last run surface", () => {
  it("renders an honest 'no run yet' state for a generated_default envelope (no fabricated run)", () => {
    render(<HarnessControlCard doc={safeDefault} />);
    const lastRun = screen.getByTestId("harness-last-run");
    expect(within(lastRun).getByText(/טרם נצפתה ריצה/)).toBeTruthy();
    // never claims a decision / dispatch count when no run happened
    expect(lastRun.textContent).not.toContain("NO_NEXT_PACKET");
  });

  it("renders the same honest state when doc is null (fetch missing)", () => {
    render(<HarnessControlCard doc={null} />);
    expect(screen.getByTestId("harness-last-run").textContent).toMatch(/טרם נצפתה ריצה/);
  });

  it("renders decision, dispatched count, evidence path and next recommendation for a real run", () => {
    render(<HarnessControlCard doc={realRun} />);
    const lastRun = screen.getByTestId("harness-last-run");
    expect(lastRun.textContent).toContain("NO_NEXT_PACKET");
    expect(lastRun.textContent).toContain("2"); // dispatched
    expect(lastRun.textContent).toContain("/tmp/phaseb-evidence/loop-summary.json");
    expect(lastRun.textContent).toContain("אין packet זמין להרצה");
    // not the empty-state copy
    expect(lastRun.textContent).not.toMatch(/טרם נצפתה ריצה/);
  });
});
