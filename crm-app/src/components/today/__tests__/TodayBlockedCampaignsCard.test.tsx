import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TodayBlockedCampaignsCard } from "../TodayBlockedCampaignsCard";

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const DOC = {
  campaigns: [
    {
      id: "stuck-campaign",
      status: "BLOCKED",
      last_terminal_state: "BLOCKED",
      owner_user: "elron",
      last_written_at: "2026-05-29T00:00:00Z",
    },
    { id: "fine", status: "ACTIVE", last_written_at: "2026-05-30T00:00:00Z" },
  ],
};

describe("TodayBlockedCampaignsCard", () => {
  it("surfaces only BLOCKED campaigns from campaigns.json", async () => {
    mockFetchOnce(() =>
      Promise.resolve(new Response(JSON.stringify(DOC), { status: 200 })),
    );
    render(<TodayBlockedCampaignsCard />);
    await waitFor(() =>
      expect(screen.getByTestId("today-blocked-campaigns")).toBeTruthy(),
    );
    expect(screen.getByText("stuck-campaign")).toBeTruthy();
    expect(screen.queryByText("fine")).toBeNull();
  });

  it("renders an honest empty state when nothing is blocked", async () => {
    mockFetchOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ campaigns: [{ id: "a", status: "ACTIVE" }] }), {
          status: 200,
        }),
      ),
    );
    render(<TodayBlockedCampaignsCard />);
    await waitFor(() =>
      expect(screen.getByTestId("today-blocked-campaigns-empty")).toBeTruthy(),
    );
  });

  it("renders an honest error state when the feed is unavailable", async () => {
    mockFetchOnce(() => Promise.resolve(new Response("nope", { status: 404 })));
    render(<TodayBlockedCampaignsCard />);
    await waitFor(() =>
      expect(screen.getByTestId("today-blocked-campaigns-error")).toBeTruthy(),
    );
  });
});
