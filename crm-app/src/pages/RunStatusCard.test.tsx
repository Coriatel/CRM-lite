import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RunStatusCard, isRunStatusDefault, type RunStatusDoc } from "./RunStatusCard";

const DEFAULT_DOC: RunStatusDoc = {
  _meta: { generated_default: true, generated_at: "2026-06-02T05:00:00Z", active_count: 0, queued_count: 0, done_count: 0 },
  active: [],
  queued: [],
  done: [],
};

const EMPTY_REAL_DOC: RunStatusDoc = {
  _meta: { generated_at: "2026-06-02T05:00:00Z", read_only: true, active_count: 0, queued_count: 0, done_count: 0 },
  active: [],
  queued: [],
  done: [],
};

const POPULATED_DOC: RunStatusDoc = {
  _meta: { generated_at: "2026-06-02T05:00:00Z", read_only: true, active_count: 1, queued_count: 1, done_count: 1 },
  active: [{ run_id: "run-active-1", leased_at: "2026-06-02T04:55:00Z" }],
  queued: [{ run_id: "run-queued-1", requested_at: "2026-06-02T04:50:00Z", owner_gated: true }],
  done: [{ run_id: "run-done-1", status: "completed", requested_at: "2026-06-02T04:00:00Z" }],
};

describe("isRunStatusDefault", () => {
  it("is true for null and generated_default, false for real output", () => {
    expect(isRunStatusDefault(null)).toBe(true);
    expect(isRunStatusDefault(DEFAULT_DOC)).toBe(true);
    expect(isRunStatusDefault(EMPTY_REAL_DOC)).toBe(false);
  });
});

describe("RunStatusCard", () => {
  it("renders honest 'projection not synced' for a generated_default envelope", () => {
    render(<RunStatusCard doc={DEFAULT_DOC} />);
    expect(screen.getByTestId("run-status-card").getAttribute("data-display-state")).toBe("no_source");
    expect(screen.getByTestId("run-status-empty")).toBeTruthy();
    expect(screen.queryByTestId("run-status-metrics")).toBeNull();
  });

  it("renders zeroed metrics + 'no runs' for real-but-empty output", () => {
    render(<RunStatusCard doc={EMPTY_REAL_DOC} />);
    expect(screen.getByTestId("run-status-card").getAttribute("data-display-state")).toBe("empty");
    expect(screen.getByTestId("run-status-metrics")).toBeTruthy();
    expect(screen.getByTestId("run-status-empty")).toBeTruthy();
  });

  it("renders active/queued/done groups for a populated doc (no execution buttons)", () => {
    render(<RunStatusCard doc={POPULATED_DOC} />);
    const card = screen.getByTestId("run-status-card");
    expect(card.getAttribute("data-display-state")).toBe("populated");
    expect(within(screen.getByTestId("run-status-active")).getByText("run-active-1")).toBeTruthy();
    expect(within(screen.getByTestId("run-status-queued")).getByText(/run-queued-1/)).toBeTruthy();
    expect(within(screen.getByTestId("run-status-done")).getByText("run-done-1")).toBeTruthy();
    expect(card.querySelector("button")).toBeNull();
  });
});
