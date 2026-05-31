import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { summarizeHealthPulse, HealthPulseRow } from "../HealthPulseRow";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("summarizeHealthPulse", () => {
  it("derives tone per dimension from purpose-built feeds", () => {
    const chips = summarizeHealthPulse({
      health: { ok: false, failed: ["api"], endpoints: [{ ok: true }, { ok: false }] },
      automations: { _meta: { health_counts: { failing: 5, degraded: 3, stale: 1, healthy: 59 } } },
      producers: { violation_count: 27 },
      freshness: { files: { a: { age_seconds: 100 }, b: { age_seconds: 90000 }, _meta: { age_seconds: 90000 } } },
    });
    const by = Object.fromEntries(chips.map((c) => [c.key, c]));
    expect(by.services.tone).toBe("bad"); // required failure
    expect(by.services.value).toBe("1/2");
    expect(by.automations.tone).toBe("bad"); // failing > 0
    expect(by.automations.value).toBe("9 לטיפול");
    expect(by.producers.tone).toBe("warn");
    expect(by.feeds.value).toBe("1 מיושנים"); // b stale; _meta excluded
  });

  it("reports all-clear when feeds are healthy", () => {
    const chips = summarizeHealthPulse({
      health: { ok: true, failed: [], endpoints: [{ ok: true }] },
      automations: { _meta: { health_counts: { healthy: 10 } } },
      producers: { violation_count: 0 },
      freshness: { files: { a: { age_seconds: 10 } } },
    });
    expect(chips.every((c) => c.tone === "ok")).toBe(true);
  });
});

describe("HealthPulseRow", () => {
  it("renders pulse chips from fetched feeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ violation_count: 0, endpoints: [], files: {} }), { status: 200 })),
      ),
    );
    render(
      <MemoryRouter>
        <HealthPulseRow />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("today-health-pulse")).toBeTruthy());
    expect(screen.getByTestId("pulse-services")).toBeTruthy();
    expect(screen.getByTestId("pulse-feeds")).toBeTruthy();
    // P3.3: automations chip drills into /ops
    expect(screen.getByTestId("pulse-automations").getAttribute("href")).toBe("/ops");
  });
});
