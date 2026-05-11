import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCallQueueInRange } from "../directus";

// Pure URL-shape test: confirms the helper composes Directus filters correctly
// for the three signals the Today card needs — today's window, overdue, and
// the limit knob. No network in vitest; fetch is mocked per case.

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("getCallQueueInRange", () => {
  let urls: string[] = [];

  beforeEach(() => {
    urls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      urls.push(typeof input === "string" ? input : input.toString());
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits _gte + _lt + status when given a today window", async () => {
    await getCallQueueInRange({
      status: "pending",
      fromInclusive: "2026-05-11T00:00:00+03:00",
      toExclusive: "2026-05-12T00:00:00+03:00",
      limit: 50,
    });
    const u = urls[0];
    expect(u).toContain("/items/call_queue");
    expect(u).toContain("filter%5Bstatus%5D%5B_eq%5D=pending");
    expect(u).toContain("filter%5Bscheduled_date%5D%5B_gte%5D");
    expect(u).toContain("filter%5Bscheduled_date%5D%5B_lt%5D");
    expect(u).toContain("limit=50");
  });

  it("emits only _lt when overdue (no fromInclusive)", async () => {
    await getCallQueueInRange({
      status: "pending",
      toExclusive: "2026-05-11T00:00:00+03:00",
    });
    const u = urls[0];
    expect(u).toContain("filter%5Bscheduled_date%5D%5B_lt%5D");
    expect(u).not.toContain("filter%5Bscheduled_date%5D%5B_gte%5D");
  });

  it("defaults limit to 200 when not specified", async () => {
    await getCallQueueInRange({ status: "pending" });
    expect(urls[0]).toContain("limit=200");
  });

  it("omits status filter when not provided", async () => {
    await getCallQueueInRange({ toExclusive: "2026-05-11T00:00:00+03:00" });
    expect(urls[0]).not.toContain("filter%5Bstatus%5D%5B_eq%5D");
  });
});
