import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePerson } from "../usePerson";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const CONTACT = {
  id: "c-42",
  full_name: "ישראל ישראלי",
  phone_e164: "+972500000000",
  call_status: "follow_up",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("usePerson", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/items/contacts/")) {
        return jsonResponse({ data: CONTACT });
      }
      return jsonResponse({ data: [] });
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads and maps a contact by id", async () => {
    const { result } = renderHook(() => usePerson("c-42"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact?.id).toBe("c-42");
    expect(result.current.contact?.fullName).toBe("ישראל ישראלי");
    expect(result.current.contact?.status).toBe("follow_up");
    expect(result.current.error).toBeNull();
  });

  it("errors without crashing when id is missing", async () => {
    const { result } = renderHook(() => usePerson(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact).toBeNull();
    expect(result.current.error).toMatch(/חסר/);
  });

  it("sets a Hebrew error on fetch failure", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ errors: [{ message: "boom" }] }, 500),
    );
    const { result } = renderHook(() => usePerson("c-42"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/שגיאה/);
  });
});
