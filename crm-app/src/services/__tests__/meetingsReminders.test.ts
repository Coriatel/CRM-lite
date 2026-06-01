import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMeetings,
  getReminders,
  createMeeting,
  createReminder,
  updateMeeting,
  updateReminder,
} from "../directus";

// URL-shape tests: confirm the meetings/reminders readers compose the agenda
// filters correctly — owner-scoped (Q2: owner_id = $CURRENT_USER by default),
// status-filtered, and date-bounded. No network in vitest; fetch is mocked.

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("getMeetings", () => {
  let urls: string[] = [];
  beforeEach(() => {
    urls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      urls.push(typeof input === "string" ? input : input.toString());
      return jsonResponse({ data: [] });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("owner-scopes to $CURRENT_USER, filters status + starts_before, sorts by starts_at", async () => {
    await getMeetings({ startsBefore: "2026-06-05", status: "scheduled" });
    const u = urls[0];
    expect(u).toContain("/items/meetings");
    expect(u).toContain("filter%5Bowner_id%5D%5B_eq%5D=%24CURRENT_USER");
    expect(u).toContain("filter%5Bstatus%5D%5B_eq%5D=scheduled");
    expect(u).toContain("filter%5Bstarts_at%5D%5B_lte%5D=2026-06-05");
    expect(u).toContain("sort=starts_at");
  });

  it("uses an explicit ownerId override when provided", async () => {
    await getMeetings({ ownerId: "u-123" });
    expect(urls[0]).toContain("filter%5Bowner_id%5D%5B_eq%5D=u-123");
  });

  it("requests scope in the read field list (A7 Phase 3)", async () => {
    await getMeetings({});
    expect(urls[0]).toContain("scope");
  });

  it("filters by scope=amuta when a broad/org read asks for it", async () => {
    await getMeetings({ scope: "amuta" });
    expect(urls[0]).toContain("filter%5Bscope%5D%5B_eq%5D=amuta");
  });
});

describe("getReminders", () => {
  let urls: string[] = [];
  beforeEach(() => {
    urls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      urls.push(typeof input === "string" ? input : input.toString());
      return jsonResponse({ data: [] });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("owner-scopes to $CURRENT_USER, filters status + due_before, sorts by due_at", async () => {
    await getReminders({ dueBefore: "2026-06-05", status: "pending" });
    const u = urls[0];
    expect(u).toContain("/items/reminders");
    expect(u).toContain("filter%5Bowner_id%5D%5B_eq%5D=%24CURRENT_USER");
    expect(u).toContain("filter%5Bstatus%5D%5B_eq%5D=pending");
    expect(u).toContain("filter%5Bdue_at%5D%5B_lte%5D=2026-06-05");
    expect(u).toContain("sort=due_at");
  });
});

describe("createMeeting / createReminder", () => {
  let bodies: string[] = [];
  beforeEach(() => {
    bodies = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_i, init) => {
      if (init?.body) bodies.push(init.body as string);
      return jsonResponse({ data: { id: "new" } });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs a meeting with owner_id and defaults status to scheduled", async () => {
    await createMeeting({
      title: "פגישה",
      starts_at: "2026-05-31T10:00:00.000Z",
      owner_id: "u1",
    });
    const b = JSON.parse(bodies[0]);
    expect(b.title).toBe("פגישה");
    expect(b.owner_id).toBe("u1");
    expect(b.status).toBe("scheduled");
  });

  it("POSTs a reminder with owner_id and defaults status to pending", async () => {
    await createReminder({
      title: "לזכור",
      due_at: "2026-05-31T10:00:00.000Z",
      owner_id: "u1",
    });
    const b = JSON.parse(bodies[0]);
    expect(b.title).toBe("לזכור");
    expect(b.owner_id).toBe("u1");
    expect(b.status).toBe("pending");
  });

  it("defaults scope to private on create (fail-safe, never NULL/unknown)", async () => {
    await createMeeting({ title: "פגישה", starts_at: "2026-05-31T10:00:00.000Z" });
    expect(JSON.parse(bodies[0]).scope).toBe("private");
    await createReminder({ title: "לזכור", due_at: "2026-05-31T10:00:00.000Z" });
    expect(JSON.parse(bodies[1]).scope).toBe("private");
  });

  it("carries an explicit scope=amuta when chosen", async () => {
    await createMeeting({
      title: "ישיבת עמותה",
      starts_at: "2026-05-31T10:00:00.000Z",
      scope: "amuta",
    });
    expect(JSON.parse(bodies[0]).scope).toBe("amuta");
  });
});

describe("updateMeeting / updateReminder", () => {
  let calls: { url: string; method?: string; body?: string }[] = [];
  beforeEach(() => {
    calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({
        url: typeof input === "string" ? input : input.toString(),
        method: init?.method,
        body: init?.body as string | undefined,
      });
      return jsonResponse({ data: { id: "x" } });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("PATCHes a meeting by id and edits fields", async () => {
    await updateMeeting("m1", {
      title: "פגישה מעודכנת",
      starts_at: "2026-06-01T09:00:00.000Z",
    });
    const c = calls[0];
    expect(c.url).toContain("/items/meetings/m1");
    expect(c.method).toBe("PATCH");
    const b = JSON.parse(c.body!);
    expect(b.title).toBe("פגישה מעודכנת");
    expect(b.starts_at).toBe("2026-06-01T09:00:00.000Z");
  });

  it("PATCHes meeting status only (mark done) and never reads notes back", async () => {
    await updateMeeting("m2", { status: "done" });
    const c = calls[0];
    expect(c.url).toContain("/items/meetings/m2");
    // returned fields are owner-scoped agenda fields — notes excluded by design
    expect(c.url).toContain("fields=");
    expect(c.url).not.toContain("notes");
    expect(JSON.parse(c.body!).status).toBe("done");
  });

  it("PATCHes reminder status only (mark done)", async () => {
    await updateReminder("r1", { status: "done" });
    const c = calls[0];
    expect(c.url).toContain("/items/reminders/r1");
    expect(c.method).toBe("PATCH");
    expect(JSON.parse(c.body!).status).toBe("done");
  });

  it("allows editing reminder notes (write-only field) in the patch body", async () => {
    await updateReminder("r2", { notes: "פרטי לרב" });
    expect(JSON.parse(calls[0].body!).notes).toBe("פרטי לרב");
  });

  it("PATCHes scope when re-classifying a meeting private↔amuta", async () => {
    await updateMeeting("m3", { scope: "amuta" });
    expect(JSON.parse(calls[0].body!).scope).toBe("amuta");
  });
});
