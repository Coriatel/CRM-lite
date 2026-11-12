import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newContactSaver } from "../newContact";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let calls: { url: string; method: string; body: any }[] = [];
let existingPhone = false;
let tagFails = false;
let createFails = false;

const creates = () => calls.filter((c) => c.method === "POST" && c.url.endsWith("/items/contacts"));

describe("newContactSaver", () => {
  beforeEach(() => {
    calls = [];
    existingPhone = false;
    tagFails = false;
    createFails = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = decodeURIComponent(String(input));
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === "GET" && url.includes("/items/contacts?"))
        return jsonResponse({ data: existingPhone ? [{ id: "old", full_name: "קיים בדוי" }] : [] });
      if (method === "POST" && url.endsWith("/items/contacts"))
        return createFails ? jsonResponse({}, 500) : jsonResponse({ data: { id: "new1" } });
      if (url.includes("/items/tags")) {
        return tagFails ? jsonResponse({}, 500) : jsonResponse({ data: [{ id: "tg", name: "אנשי_קשר" }] });
      }
      return jsonResponse({ data: [] });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("stores the same fields as the old screen, with the phone exactly as typed", async () => {
    const r = await newContactSaver().save({ fullName: "נועה בדויה", phone1: "050-1234567", email: "n@example.org" });
    expect(r).toEqual({ kind: "created", id: "new1", name: "נועה בדויה" });
    expect(creates()[0].body).toMatchObject({
      full_name: "נועה בדויה",
      first_name: "נועה",
      last_name: "בדויה",
      phone_e164: "050-1234567",
      email: "n@example.org",
      call_status: "not_checked",
    });
  });

  it("does not create a contact whose phone already belongs to someone", async () => {
    existingPhone = true;
    const r = await newContactSaver().save({ fullName: "נועה בדויה", phone1: "+972501234567" });
    expect(r).toEqual({ kind: "exists", id: "old", name: "קיים בדוי" });
    expect(creates()).toHaveLength(0);
    expect(calls[0].url).toContain("filter[phone_e164][_eq]=+972501234567");
  });

  it("repeats only the category step when the contact was already saved", async () => {
    const saver = newContactSaver();
    tagFails = true;
    const first = await saver.save({ fullName: "דוד בדוי", phone1: "" });
    expect(first.kind).toBe("untagged");
    tagFails = false;
    const again = await saver.save({ fullName: "דוד בדוי", phone1: "" });
    expect(again).toEqual({ kind: "created", id: "new1", name: "דוד בדוי" });
    expect(creates()).toHaveLength(1);
  });

  it("offers a category-only retry, and nothing to retry once it is done", async () => {
    const saver = newContactSaver();
    tagFails = true;
    await saver.save({ fullName: "דוד בדוי", phone1: "" });
    tagFails = false;
    expect((await saver.retryTag())!.kind).toBe("created");
    expect(saver.retryTag()).toBeNull();
    expect(creates()).toHaveLength(1);
  });

  it("creates nothing and throws when the save itself fails, so a retry is safe", async () => {
    const saver = newContactSaver();
    createFails = true;
    await expect(saver.save({ fullName: "רות בדויה", phone1: "" })).rejects.toThrow();
    createFails = false;
    expect((await saver.save({ fullName: "רות בדויה", phone1: "" })).kind).toBe("created");
    expect(creates()).toHaveLength(2); // the first attempt was refused by the server
  });
});
