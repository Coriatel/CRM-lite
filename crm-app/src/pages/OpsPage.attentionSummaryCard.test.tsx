import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import {
  AttentionSummaryCard,
  type AttentionSummaryInput,
} from "./AttentionSummaryCard";

function baseInput(): AttentionSummaryInput {
  return {
    ownerGates: [],
    activeIncidents: [],
    blockers: [],
    freshness: null,
    runtimeIssues: null,
    pushIsolation: null,
    processes: null,
    dependencies: null,
    workflows: null,
    orchestratorIntegrity: null,
    queueRoutes: null,
  };
}

describe("<AttentionSummaryCard>", () => {
  it("renders honest empty-data state when no projections are loaded", () => {
    render(<AttentionSummaryCard {...baseInput()} />);
    expect(screen.getByTestId("attention-summary-card")).toBeTruthy();
    expect(screen.getByTestId("attention-summary-empty-state").textContent).toMatch(
      /אין נתונים זמינים/,
    );
  });

  it("renders all-clear state when there's data but no attention items", () => {
    const input = baseInput();
    input.freshness = { files: {} }; // present but empty → hasAnyData=true
    render(<AttentionSummaryCard {...input} />);
    expect(screen.getByTestId("attention-summary-clear")).toBeTruthy();
    expect(screen.getByTestId("attention-summary-total").textContent).toMatch(
      /אין פריט דורש תשומת לב כרגע/,
    );
  });

  it("renders all 5 category cells with counts", () => {
    const input = baseInput();
    input.ownerGates = ["g1", "g2"];
    input.activeIncidents = ["INC-1"];
    input.blockers = [{ id: "b1", summary: "auth gate" }];
    input.queueRoutes = {
      summary: { autonomous: 4, owner: 0, escalate: 2, defer: 0 },
    };
    input.runtimeIssues = {
      issues: [{ id: "ri-1", severity: "high" }],
    };
    input.freshness = {
      files: {
        "queue.json": { mtime: "", age_seconds: 8 * 3600 },
      },
    };
    render(<AttentionSummaryCard {...input} />);
    expect(screen.getByTestId("attention-summary-owner_required-count").textContent).toBe(
      "3",
    );
    expect(screen.getByTestId("attention-summary-escalate-count").textContent).toBe(
      "3",
    );
    expect(screen.getByTestId("attention-summary-autonomous_ready-count").textContent).toBe(
      "4",
    );
    expect(screen.getByTestId("attention-summary-stale-count").textContent).toBe(
      "1",
    );
    expect(screen.getByTestId("attention-summary-blockers-count").textContent).toBe(
      "1",
    );
  });

  it("surfaces top reason for owner-required category", () => {
    const input = baseInput();
    input.activeIncidents = ["INC-9 outbound mail dead"];
    render(<AttentionSummaryCard {...input} />);
    const owner = screen.getByTestId("attention-summary-owner_required");
    expect(within(owner).getByTestId("attention-summary-owner_required-reason").textContent).toMatch(
      /INC-9/,
    );
  });

  it("renders explicit 'producer missing' reason in cells when their source is null", () => {
    const input = baseInput();
    // Force hasAnyData=true via one input so we render the grid rather than empty-state.
    input.ownerGates = ["g1"];
    render(<AttentionSummaryCard {...input} />);
    expect(
      screen.getByTestId("attention-summary-stale-reason").textContent,
    ).toMatch(/freshness\.json/);
    expect(
      screen.getByTestId("attention-summary-autonomous_ready-reason").textContent,
    ).toMatch(/queue_routes\.json/);
    // Count badge replaced by "—" when hasData=false — operators must NOT see "0".
    expect(screen.getByTestId("attention-summary-stale-count").textContent).toBe(
      "—",
    );
    expect(screen.getByTestId("attention-summary-autonomous_ready-count").textContent).toBe(
      "—",
    );
  });

  it("total badge reflects attention count summed across action/watch categories", () => {
    const input = baseInput();
    input.ownerGates = ["g1"];
    input.queueRoutes = {
      summary: { autonomous: 3, owner: 0, escalate: 0, defer: 0 },
    };
    render(<AttentionSummaryCard {...input} />);
    expect(screen.getByTestId("attention-summary-total").textContent).toMatch(
      /4 פריטים/,
    );
  });
});

describe("<AttentionSummaryCard> — tap-to-expand", () => {
  it("cells are collapsed by default — no impact/source visible", () => {
    const input = baseInput();
    input.ownerGates = ["g1"];
    render(<AttentionSummaryCard {...input} />);
    expect(
      screen.queryByTestId("attention-summary-owner_required-impact"),
    ).toBeNull();
    expect(
      screen.queryByTestId("attention-summary-owner_required-source"),
    ).toBeNull();
    expect(
      screen.getByTestId("attention-summary-owner_required-toggle").getAttribute(
        "aria-expanded",
      ),
    ).toBe("false");
  });

  it("clicking a cell expands it to reveal impact + nextAction + source", () => {
    const input = baseInput();
    input.activeIncidents = ["INC-9 mail down"];
    render(<AttentionSummaryCard {...input} />);
    fireEvent.click(screen.getByTestId("attention-summary-owner_required-toggle"));
    const details = screen.getByTestId(
      "attention-summary-owner_required-details",
    );
    expect(within(details).getByTestId("attention-summary-owner_required-impact").textContent).toMatch(
      /סלייסים/,
    );
    expect(
      within(details).getByTestId("attention-summary-owner_required-next-action").textContent,
    ).toMatch(/אירוע/);
    expect(within(details).getByTestId("attention-summary-owner_required-source").textContent).toMatch(
      /sessions\.json/,
    );
    expect(
      screen.getByTestId("attention-summary-owner_required-toggle").getAttribute(
        "aria-expanded",
      ),
    ).toBe("true");
  });

  it("clicking an expanded cell collapses it again", () => {
    const input = baseInput();
    input.ownerGates = ["g1"];
    render(<AttentionSummaryCard {...input} />);
    const toggle = screen.getByTestId("attention-summary-owner_required-toggle");
    fireEvent.click(toggle);
    expect(screen.queryByTestId("attention-summary-owner_required-details")).not.toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("attention-summary-owner_required-details")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("multiple cells can be expanded independently", () => {
    const input = baseInput();
    input.ownerGates = ["g1"];
    input.blockers = [{ id: "b1", summary: "x" }];
    render(<AttentionSummaryCard {...input} />);
    fireEvent.click(screen.getByTestId("attention-summary-owner_required-toggle"));
    fireEvent.click(screen.getByTestId("attention-summary-blockers-toggle"));
    expect(screen.getByTestId("attention-summary-owner_required-details")).toBeTruthy();
    expect(screen.getByTestId("attention-summary-blockers-details")).toBeTruthy();
  });

  it("expanded cell suppresses nextAction row when category has no actionable next step", () => {
    const input = baseInput();
    // freshness loaded but no stale files → stale category has hasData but nextAction=null
    input.freshness = { files: {} };
    render(<AttentionSummaryCard {...input} />);
    fireEvent.click(screen.getByTestId("attention-summary-stale-toggle"));
    expect(screen.getByTestId("attention-summary-stale-impact")).toBeTruthy();
    expect(screen.getByTestId("attention-summary-stale-source")).toBeTruthy();
    // No next-action row should render when nextAction is null.
    expect(screen.queryByTestId("attention-summary-stale-next-action")).toBeNull();
  });
});
