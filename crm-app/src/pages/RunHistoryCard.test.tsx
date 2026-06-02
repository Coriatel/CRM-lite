import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RunHistoryCard, isRunHistoryDefault, type RunHistoryDoc } from "./RunHistoryCard";

const DEFAULT_DOC: RunHistoryDoc = {
  _meta: { generated_default: true, generated_at: "2026-06-02T05:00:00Z", total: 0, shown: 0 },
  runs: [],
};

const EMPTY_REAL_DOC: RunHistoryDoc = {
  _meta: { generated_at: "2026-06-02T05:00:00Z", read_only: true, total: 0, shown: 0 },
  runs: [],
};

const POPULATED_DOC: RunHistoryDoc = {
  _meta: { generated_at: "2026-06-02T05:00:00Z", read_only: true, total: 2, shown: 2 },
  runs: [
    {
      run_id: "run-2026-06-02-aaa",
      status: "completed",
      final_decision: "STOP",
      stop_reason: "no_safe_adjacent_slice",
      timestamp: "2026-06-02T04:30:00Z",
      dispatched: 3,
      owner_gated: false,
      evidence: "state/run-records/run-2026-06-02-aaa.json",
    },
    {
      run_id: "run-2026-06-01-bbb",
      status: "owner-gate-skipped",
      final_decision: "OWNER_GATE",
      timestamp: "2026-06-01T10:00:00Z",
      owner_gated: true,
      evidence: "state/run-records/run-2026-06-01-bbb.json",
    },
  ],
};

describe("isRunHistoryDefault", () => {
  it("is true for null and generated_default docs, false for real output", () => {
    expect(isRunHistoryDefault(null)).toBe(true);
    expect(isRunHistoryDefault(DEFAULT_DOC)).toBe(true);
    expect(isRunHistoryDefault(EMPTY_REAL_DOC)).toBe(false);
  });
});

describe("RunHistoryCard", () => {
  it("renders an honest 'projection not synced' state for a generated_default envelope", () => {
    render(<RunHistoryCard doc={DEFAULT_DOC} />);
    expect(screen.getByTestId("run-history-card").getAttribute("data-display-state")).toBe("no_source");
    expect(screen.getByTestId("run-history-empty")).toBeTruthy();
    expect(screen.queryByTestId("run-history-row")).toBeNull();
  });

  it("renders the same honest empty state when doc is null", () => {
    render(<RunHistoryCard doc={null} />);
    expect(screen.getByTestId("run-history-card").getAttribute("data-display-state")).toBe("no_source");
  });

  it("renders an honest 'no runs yet' state for real-but-empty output", () => {
    render(<RunHistoryCard doc={EMPTY_REAL_DOC} />);
    expect(screen.getByTestId("run-history-card").getAttribute("data-display-state")).toBe("empty");
    expect(screen.getByTestId("run-history-empty")).toBeTruthy();
  });

  it("renders run id, status, decision and evidence path for real runs (no execution buttons)", () => {
    render(<RunHistoryCard doc={POPULATED_DOC} />);
    const card = screen.getByTestId("run-history-card");
    expect(card.getAttribute("data-display-state")).toBe("populated");
    const rows = screen.getAllByTestId("run-history-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("run-2026-06-02-aaa")).toBeTruthy();
    expect(within(rows[0]).getByText("completed")).toBeTruthy();
    const evidence = screen.getAllByTestId("run-history-evidence");
    expect(evidence[0].textContent).toContain("state/run-records/run-2026-06-02-aaa.json");
    // operator-safe: no button affordance in the read-only card
    expect(card.querySelector("button")).toBeNull();
  });
});
