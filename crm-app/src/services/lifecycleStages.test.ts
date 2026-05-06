import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setContactStage,
  getLifecycleStages,
  getStageHistory,
  setAuthToken,
  StageChangeFailedError,
} from "./directus";

const CONTACT_ID = "00000000-0000-4000-8000-000000000001";
const STAGE_ID = "00000000-0000-4000-8000-000000000002";
const FROM_STAGE_ID = "00000000-0000-4000-8000-000000000003";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("lifecycle stage service (Slice #1)", () => {
  beforeEach(() => {
    setAuthToken("test-token");
    vi.restoreAllMocks();
  });

  it("setContactStage POSTs the audit row FIRST, then PATCHes the contact", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        jsonResponse({
          data: {
            id: "trans-1",
            contact_id: CONTACT_ID,
            from_stage_id: FROM_STAGE_ID,
            to_stage_id: STAGE_ID,
            transitioned_at: "2026-05-06T00:00:00.000Z",
            trigger_type: "manual",
            reason: "test",
          },
        }),
      )
      .mockImplementationOnce(async () =>
        jsonResponse({
          data: { id: CONTACT_ID, lifecycle_stage_id: STAGE_ID },
        }),
      );

    const result = await setContactStage(CONTACT_ID, STAGE_ID, {
      fromStageId: FROM_STAGE_ID,
      triggerType: "manual",
      reason: "test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // call 1: audit POST
    const [postUrl, postInit] = fetchMock.mock.calls[0];
    expect(String(postUrl)).toContain(`/items/stage_transitions`);
    expect(postInit?.method).toBe("POST");
    expect(JSON.parse(postInit?.body as string)).toMatchObject({
      contact_id: CONTACT_ID,
      from_stage_id: FROM_STAGE_ID,
      to_stage_id: STAGE_ID,
      trigger_type: "manual",
      reason: "test",
    });

    // call 2: contact PATCH
    const [patchUrl, patchInit] = fetchMock.mock.calls[1];
    expect(String(patchUrl)).toContain(`/items/contacts/${CONTACT_ID}`);
    expect(patchInit?.method).toBe("PATCH");
    expect(JSON.parse(patchInit?.body as string)).toEqual({
      lifecycle_stage_id: STAGE_ID,
    });

    expect(result.contact.lifecycle_stage_id).toBe(STAGE_ID);
    expect(result.transition.to_stage_id).toBe(STAGE_ID);
  });

  it("setContactStage defaults trigger_type=manual and from_stage_id=null", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        jsonResponse({
          data: {
            id: "trans-2",
            contact_id: CONTACT_ID,
            from_stage_id: null,
            to_stage_id: STAGE_ID,
            transitioned_at: "2026-05-06T00:00:00.000Z",
            trigger_type: "manual",
          },
        }),
      )
      .mockImplementationOnce(async () =>
        jsonResponse({ data: { id: CONTACT_ID, lifecycle_stage_id: STAGE_ID } }),
      );

    await setContactStage(CONTACT_ID, STAGE_ID);

    const postBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(postBody.from_stage_id).toBeNull();
    expect(postBody.trigger_type).toBe("manual");
    expect(postBody.reason).toBeNull();
  });

  it("setContactStage rolls back the audit row when the contact PATCH fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // 1: audit POST succeeds
      .mockImplementationOnce(async () =>
        jsonResponse({
          data: {
            id: "trans-rb-1",
            contact_id: CONTACT_ID,
            from_stage_id: null,
            to_stage_id: STAGE_ID,
            transitioned_at: "2026-05-06T00:00:00.000Z",
            trigger_type: "manual",
          },
        }),
      )
      // 2: contact PATCH fails
      .mockImplementationOnce(async () =>
        jsonResponse({ errors: [{ message: "boom" }] }, 500),
      )
      // 3: compensating DELETE succeeds
      .mockImplementationOnce(async () =>
        jsonResponse(null, 204),
      );

    let caught: unknown;
    try {
      await setContactStage(CONTACT_ID, STAGE_ID);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(StageChangeFailedError);
    const err = caught as StageChangeFailedError;
    expect(err.auditId).toBe("trans-rb-1");
    expect(err.auditRollbackSucceeded).toBe(true);
    expect(err.message).toMatch(/rolled back/);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [delUrl, delInit] = fetchMock.mock.calls[2];
    expect(String(delUrl)).toContain(`/items/stage_transitions/trans-rb-1`);
    expect(delInit?.method).toBe("DELETE");
  });

  it("setContactStage marks audit as orphaned when both PATCH and DELETE fail", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // 1: audit POST succeeds
      .mockImplementationOnce(async () =>
        jsonResponse({
          data: {
            id: "trans-orphan-1",
            contact_id: CONTACT_ID,
            from_stage_id: null,
            to_stage_id: STAGE_ID,
            transitioned_at: "2026-05-06T00:00:00.000Z",
            trigger_type: "manual",
          },
        }),
      )
      // 2: contact PATCH fails
      .mockImplementationOnce(async () =>
        jsonResponse({ errors: [{ message: "boom" }] }, 500),
      )
      // 3: compensating DELETE also fails
      .mockImplementationOnce(async () =>
        jsonResponse({ errors: [{ message: "delete failed" }] }, 503),
      );

    let caught: unknown;
    try {
      await setContactStage(CONTACT_ID, STAGE_ID);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(StageChangeFailedError);
    const err = caught as StageChangeFailedError;
    expect(err.auditId).toBe("trans-orphan-1");
    expect(err.auditRollbackSucceeded).toBe(false);
    expect(err.message).toMatch(/orphan/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("setContactStage propagates audit POST failure WITHOUT touching the contact", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        jsonResponse({ errors: [{ message: "audit boom" }] }, 500),
      );

    await expect(setContactStage(CONTACT_ID, STAGE_ID)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1); // contact PATCH never attempted
    const [postUrl] = fetchMock.mock.calls[0];
    expect(String(postUrl)).toContain(`/items/stage_transitions`);
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
              from_stage_id: null,
              to_stage_id: STAGE_ID,
              transitioned_at: "2026-05-06T00:00:00.000Z",
              trigger_type: "system",
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
