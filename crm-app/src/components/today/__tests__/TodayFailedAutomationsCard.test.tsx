import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayFailedAutomationsCard } from "../TodayFailedAutomationsCard";

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderCard() {
  return render(
    <MemoryRouter>
      <TodayFailedAutomationsCard />
    </MemoryRouter>,
  );
}

const INV_DOC = {
  automations: [
    { id: "wf-1", name: "ניקוי תור", health_status: "failing", platform: "n8n" },
    { id: "wf-2", name: "סנכרון תורמים", health_status: "degraded", platform: "windmill" },
    { id: "wf-3", name: "בריא", health_status: "healthy", platform: "cron" },
  ],
};

describe("TodayFailedAutomationsCard", () => {
  it("surfaces the attention set (failing/degraded) and links to the drilldown", async () => {
    mockFetchOnce(() =>
      Promise.resolve(new Response(JSON.stringify(INV_DOC), { status: 200 })),
    );
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId("today-failed-automations")).toBeTruthy(),
    );
    expect(screen.getByText("ניקוי תור")).toBeTruthy();
    expect(screen.getByText("סנכרון תורמים")).toBeTruthy();
    // healthy row is not in the attention set
    expect(screen.queryByText("בריא")).toBeNull();
    // links target the same-feed drilldown route
    const link = screen.getByText("ניקוי תור").closest("a");
    expect(link?.getAttribute("href")).toBe("/ops/automations/wf-1");
  });

  it("renders an honest empty state when nothing needs attention", async () => {
    mockFetchOnce(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ automations: [{ id: "ok", health_status: "healthy" }] }),
          { status: 200 },
        ),
      ),
    );
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId("today-failed-automations-empty")).toBeTruthy(),
    );
  });

  it("renders an honest error state when the feed is unavailable", async () => {
    mockFetchOnce(() => Promise.resolve(new Response("nope", { status: 404 })));
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId("today-failed-automations-error")).toBeTruthy(),
    );
  });
});
