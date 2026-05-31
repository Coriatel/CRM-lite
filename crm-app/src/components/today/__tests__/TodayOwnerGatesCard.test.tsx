import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TodayOwnerGatesCard } from "../TodayOwnerGatesCard";

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const STATUS_DOC = {
  summary: { open_gates: 2, new_escalate: 1, must_reconfirm: 1 },
  gates: [
    {
      gate_id: "runtime_issue:lane-b-write-side-registration-blocked",
      gate_kind: "product_direction",
      summary: "Lane B — write-side registration blocked",
      status: "NEW_ESCALATE",
      reason: "no matching standing decision in ledger",
    },
    {
      gate_id: "owner_gate:telemetry-activation-T2",
      gate_kind: "destructive",
      summary: "telemetry activation T2",
      status: "MUST_RECONFIRM",
    },
  ],
};

describe("TodayOwnerGatesCard", () => {
  it("surfaces the open owner gates from owner_gate_status.json", async () => {
    mockFetchOnce(() =>
      Promise.resolve(new Response(JSON.stringify(STATUS_DOC), { status: 200 })),
    );
    render(<TodayOwnerGatesCard />);
    await waitFor(() => expect(screen.getByTestId("today-owner-gates")).toBeTruthy());
    expect(screen.getByText("Lane B — write-side registration blocked")).toBeTruthy();
    expect(screen.getByText("telemetry activation T2")).toBeTruthy();
  });

  it("does not render broken /ops/gates drilldown links (keyspace mismatch)", async () => {
    mockFetchOnce(() =>
      Promise.resolve(new Response(JSON.stringify(STATUS_DOC), { status: 200 })),
    );
    const { container } = render(<TodayOwnerGatesCard />);
    await waitFor(() => expect(screen.getByTestId("today-owner-gates")).toBeTruthy());
    expect(container.querySelector('a[href*="/ops/gates/"]')).toBeNull();
  });

  it("renders an honest empty state when there are no open gates", async () => {
    mockFetchOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ summary: { open_gates: 0 }, gates: [] }), {
          status: 200,
        }),
      ),
    );
    render(<TodayOwnerGatesCard />);
    await waitFor(() =>
      expect(screen.getByTestId("today-owner-gates-empty")).toBeTruthy(),
    );
  });

  it("renders an honest error state when the feed is unavailable", async () => {
    mockFetchOnce(() => Promise.resolve(new Response("nope", { status: 404 })));
    render(<TodayOwnerGatesCard />);
    await waitFor(() =>
      expect(screen.getByTestId("today-owner-gates-error")).toBeTruthy(),
    );
  });
});
