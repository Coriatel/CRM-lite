import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setContactStage,
  getLifecycleStages,
  getStageHistory,
  getStageStats,
  getRecentStageTransitions,
  getFollowUpCandidates,
  setAuthToken,
} from "./directus";

const CONTACT_ID = "00000000-0000-4000-8000-000000000001";
const STAGE_ID = "00000000-0000-4000-8000-000000000002";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("lifecycle stage service (Slice #3 + #4)", () => {
  beforeEach(() => {
    setAuthToken("test-token");
    vi.restoreAllMocks();
  });

  it("setContactStage issues exactly one PATCH to contacts", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        jsonResponse({ data: { id: CONTACT_ID, lifecycle_stage_id: STAGE_ID } }),
      );

    const result = await setContactStage(CONTACT_ID, STAGE_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/items/contacts/${CONTACT_ID}`);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({
      lifecycle_stage_id: STAGE_ID,
    });
    expect(result.contact.lifecycle_stage_id).toBe(STAGE_ID);
  });

  it("setContactStage propagates server errors to the caller", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () =>
      jsonResponse({ errors: [{ message: "boom" }] }, 500),
    );

    await expect(setContactStage(CONTACT_ID, STAGE_ID)).rejects.toThrow();
  });

  it("getLifecycleStages requests is_active=true sorted by sort_order", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        jsonResponse({
          data: [
            {
              id: STAGE_ID,
              slug: "lead",
              name: "ליד",
              sort_order: 20,
              color: "#fbbf24",
              is_active: true,
            },
          ],
        }),
    );

    const stages = await getLifecycleStages();
    expect(stages).toHaveLength(1);
    expect(stages[0].slug).toBe("lead");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/items/lifecycle_stages");
    expect(url).toContain("filter%5Bis_active%5D%5B_eq%5D=true");
    expect(url).toContain("sort=sort_order");
  });

  it("getStageHistory filters by contact_id and sorts desc", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        jsonResponse({
          data: [
            {
              id: "t1",
              contact_id: CONTACT_ID,
              from_stage_id: "00000000-0000-4000-8000-000000000099",
              to_stage_id: STAGE_ID,
              transitioned_at: "2026-05-06T00:00:00.000Z",
              trigger_type: "flow",
            },
          ],
        }),
    );

    await getStageHistory(CONTACT_ID);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/items/stage_transitions");
    expect(url).toContain(`filter%5Bcontact_id%5D%5B_eq%5D=${CONTACT_ID}`);
    expect(url).toContain("sort=-transitioned_at");
  });
});

describe("lifecycle dashboard service (Slice #7 + #8)", () => {
  beforeEach(() => {
    setAuthToken("test-token");
    vi.restoreAllMocks();
  });

  it("getStageStats calls aggregate endpoint and parses count correctly", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        jsonResponse({
          data: [
            { lifecycle_stage_id: STAGE_ID, count: { id: "12" } },
            { lifecycle_stage_id: null, count: { id: "3" } },
          ],
        }),
    );

    const stats = await getStageStats();

    expect(stats).toHaveLength(2);
    expect(stats[0]).toEqual({ stageId: STAGE_ID, count: 12 });
    expect(stats[1]).toEqual({ stageId: null, count: 3 });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/items/contacts");
    expect(url).toContain("aggregate");
    expect(url).toContain("groupBy");
  });

  it("getRecentStageTransitions requests sort=-transitioned_at with given limit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        jsonResponse({
          data: [
            {
              id: "t1",
              contact_id: CONTACT_ID,
              from_stage_id: null,
              to_stage_id: STAGE_ID,
              transitioned_at: "2026-05-06T12:00:00.000Z",
              trigger_type: "flow",
            },
          ],
        }),
    );

    const transitions = await getRecentStageTransitions(5);

    expect(transitions).toHaveLength(1);
    expect(transitions[0].to_stage_id).toBe(STAGE_ID);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/items/stage_transitions");
    expect(url).toContain("sort=-transitioned_at");
    expect(url).toContain("limit=5");
  });

  it("getFollowUpCandidates filters by follow_up_date lte today and excludes inactive", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        jsonResponse({
          data: [
            {
              id: CONTACT_ID,
              full_name: "ישראל ישראלי",
              phone_e164: "+972501234567",
              phone_raw: null,
              follow_up_date: "2026-05-05",
              follow_up_note: null,
              lifecycle_stage_id: null,
              status: "active",
            },
          ],
        }),
    );

    const candidates = await getFollowUpCandidates(10);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].full_name).toBe("ישראל ישראלי");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/items/contacts");
    expect(url).toContain("follow_up_date");
    expect(url).toContain("_lte");
    expect(url).toContain("_neq");
    expect(url).toContain("limit=10");
  });
});
