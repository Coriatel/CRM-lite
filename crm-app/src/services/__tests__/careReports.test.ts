import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCareReports, createCareReport } from "../directus";

// URL/body-shape tests: confirm the care_reports reader composes the contact
// timeline + follow-up filters correctly, and that the writer POSTs the right
// payload. No network in vitest; fetch is mocked per case.

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("getCareReports", () => {
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

  it("filters by contact_id and sorts by interaction_at desc (timeline)", async () => {
    await getCareReports({ contactId: "c-123" });
    const u = urls[0];
    expect(u).toContain("/items/care_reports");
    expect(u).toContain("filter%5Bcontact_id%5D%5B_eq%5D=c-123");
    expect(u).toContain("sort=-interaction_at");
  });

  it("filters pending follow-ups due on/before a date when followupDueBefore given", async () => {
    await getCareReports({ followupDueBefore: "2026-05-31" });
    const u = urls[0];
    expect(u).toContain("filter%5Bfollowup_status%5D%5B_eq%5D=pending");
    expect(u).toContain("filter%5Bfollowup_due%5D%5B_lte%5D=2026-05-31");
  });
});

describe("createCareReport", () => {
  let bodies: string[] = [];

  beforeEach(() => {
    bodies = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.body) bodies.push(init.body as string);
      return jsonResponse({ data: { id: "new-1" } });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the care-report payload with required fields", async () => {
    await createCareReport({
      contact_id: "c-1",
      interaction_type: "meeting",
      interaction_at: "2026-05-31T10:00:00.000Z",
      summary: "ביקור בית",
      followup_status: "pending",
      followup_due: "2026-06-07",
    });
    const b = JSON.parse(bodies[0]);
    expect(b.contact_id).toBe("c-1");
    expect(b.interaction_type).toBe("meeting");
    expect(b.summary).toBe("ביקור בית");
    expect(b.followup_status).toBe("pending");
    expect(b.followup_due).toBe("2026-06-07");
  });

  it("defaults followup_status to 'none' when omitted", async () => {
    await createCareReport({
      contact_id: "c-2",
      interaction_type: "call",
      interaction_at: "2026-05-31T10:00:00.000Z",
      summary: "שיחה",
    });
    const b = JSON.parse(bodies[0]);
    expect(b.followup_status).toBe("none");
  });
});
