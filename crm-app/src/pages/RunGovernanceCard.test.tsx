import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RunGovernanceCard,
  isRunGovernanceDefault,
  runGovernanceSeverity,
  type RunGovernanceDoc,
} from "./RunGovernanceCard";

const DEFAULT_DOC: RunGovernanceDoc = {
  _meta: { generated_default: true, generated_at: "2026-06-02T05:00:00Z", total_runs: 0 },
  owner_gates: { skipped_runs: [], pending_requests: [], count: 0 },
  budget_posture: { limit_reached_runs: [], count: 0 },
  runtime_posture: { by_status: {}, by_decision: {}, in_flight: 0, total_runs: 0 },
  stop_reasons: {},
};

const CLEAN_DOC: RunGovernanceDoc = {
  _meta: { generated_at: "2026-06-02T05:00:00Z", read_only: true, total_runs: 2 },
  owner_gates: { skipped_runs: [], pending_requests: [], count: 0 },
  budget_posture: { limit_reached_runs: [], count: 0 },
  runtime_posture: { by_status: { completed: 2 }, by_decision: { STOP: 2 }, in_flight: 0, total_runs: 2 },
  stop_reasons: { no_safe_adjacent_slice: 2 },
};

const ATTENTION_DOC: RunGovernanceDoc = {
  _meta: { generated_at: "2026-06-02T05:00:00Z", read_only: true, total_runs: 3 },
  owner_gates: { skipped_runs: ["run-gated-1"], pending_requests: ["run-pending-1"], count: 2 },
  budget_posture: {
    limit_reached_runs: [{ run_id: "run-limit-1", stop_reason: "LIMIT_REACHED", dispatched: 5 }],
    count: 1,
  },
  runtime_posture: { by_status: { completed: 1, failed: 1 }, by_decision: { LIMIT_REACHED: 1 }, in_flight: 1, total_runs: 3 },
  stop_reasons: { LIMIT_REACHED: 1 },
};

describe("isRunGovernanceDefault / severity", () => {
  it("default detection", () => {
    expect(isRunGovernanceDefault(null)).toBe(true);
    expect(isRunGovernanceDefault(DEFAULT_DOC)).toBe(true);
    expect(isRunGovernanceDefault(CLEAN_DOC)).toBe(false);
  });

  it("severity is info when clean, watch when gates/budget recorded", () => {
    expect(runGovernanceSeverity(DEFAULT_DOC)).toBe("info");
    expect(runGovernanceSeverity(CLEAN_DOC)).toBe("info");
    expect(runGovernanceSeverity(ATTENTION_DOC)).toBe("watch");
  });
});

describe("RunGovernanceCard", () => {
  it("renders honest 'projection not synced' for a generated_default envelope", () => {
    render(<RunGovernanceCard doc={DEFAULT_DOC} />);
    expect(screen.getByTestId("run-governance-card").getAttribute("data-display-state")).toBe("no_source");
    expect(screen.getByTestId("run-governance-empty")).toBeTruthy();
    expect(screen.queryByTestId("run-governance-metrics")).toBeNull();
  });

  it("renders clean posture (info severity) for real output with no gates/budget hits", () => {
    render(<RunGovernanceCard doc={CLEAN_DOC} />);
    const card = screen.getByTestId("run-governance-card");
    expect(card.getAttribute("data-severity")).toBe("info");
    expect(screen.getByTestId("run-governance-metrics")).toBeTruthy();
    expect(screen.getByTestId("run-governance-breakdown-לפי סטטוס")).toBeTruthy();
  });

  it("surfaces owner-gates, pending, budget rows and watch severity (no execution buttons)", () => {
    render(<RunGovernanceCard doc={ATTENTION_DOC} />);
    const card = screen.getByTestId("run-governance-card");
    expect(card.getAttribute("data-severity")).toBe("watch");
    expect(screen.getByTestId("run-governance-skipped").textContent).toContain("run-gated-1");
    expect(screen.getByTestId("run-governance-pending").textContent).toContain("run-pending-1");
    expect(screen.getByTestId("run-governance-limit-runs").textContent).toContain("run-limit-1");
    expect(card.querySelector("button")).toBeNull();
  });
});
