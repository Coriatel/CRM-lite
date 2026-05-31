import { describe, it, expect } from "vitest";
import {
  createLocalTaskStore,
  dueBucket,
  effectiveStatus,
  STORAGE_KEY,
  type RabbiTask,
  type StorageAdapter,
} from "./rabbiTasks";

function fakeStorage(): StorageAdapter & { raw: () => string | null } {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
    raw: () => value,
  };
}

function fixedClock(iso: string) {
  return () => new Date(iso);
}

function counterIds() {
  let n = 0;
  return () => `t${++n}`;
}

describe("createLocalTaskStore", () => {
  it("creates an open task with defaults and trims the title", async () => {
    const store = createLocalTaskStore({
      storage: fakeStorage(),
      now: fixedClock("2026-05-31T08:00:00.000Z"),
      genId: counterIds(),
    });
    const t = await store.create({ title: "  להתקשר לאינסטלטור  ", domain: "personal" });
    expect(t.id).toBe("t1");
    expect(t.title).toBe("להתקשר לאינסטלטור");
    expect(t.domain).toBe("personal");
    expect(t.status).toBe("open");
    expect(t.priority).toBe(2);
    expect(t.snoozedUntil).toBeNull();
    expect(t.createdAt).toBe("2026-05-31T08:00:00.000Z");
  });

  it("lists newest-first and persists across store instances over the same storage", async () => {
    const storage = fakeStorage();
    const a = createLocalTaskStore({ storage, now: fixedClock("2026-05-31T08:00:00.000Z"), genId: counterIds() });
    await a.create({ title: "first", domain: "merkaz" });
    await a.create({ title: "second", domain: "business" });

    const b = createLocalTaskStore({ storage });
    const tasks = await b.list();
    expect(tasks.map((t) => t.title)).toEqual(["second", "first"]);
  });

  it("updates fields and bumps updatedAt; returns undefined for unknown id", async () => {
    const store = createLocalTaskStore({
      storage: fakeStorage(),
      now: fixedClock("2026-05-31T08:00:00.000Z"),
      genId: counterIds(),
    });
    const t = await store.create({ title: "edit me", domain: "family", priority: 3 });
    const upd = await store.update(t.id, { title: "edited", domain: "learning" });
    expect(upd?.title).toBe("edited");
    expect(upd?.domain).toBe("learning");
    expect(upd?.priority).toBe(3); // unchanged
    expect(await store.update("nope", { title: "x" })).toBeUndefined();
  });

  it("completes and removes tasks", async () => {
    const store = createLocalTaskStore({ storage: fakeStorage(), genId: counterIds() });
    const t = await store.create({ title: "done soon", domain: "personal" });
    await store.update(t.id, { status: "done" });
    expect((await store.list())[0].status).toBe("done");
    await store.remove(t.id);
    expect(await store.list()).toHaveLength(0);
  });

  it("recovers from malformed storage without throwing", async () => {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const store = createLocalTaskStore({ storage });
    expect(await store.list()).toEqual([]);
  });
});

describe("effectiveStatus", () => {
  const base: RabbiTask = {
    id: "x",
    title: "t",
    domain: "personal",
    status: "open",
    priority: 2,
    dueAt: null,
    snoozedUntil: null,
    notes: null,
    kind: null,
    relatedContactId: null,
    relatedLessonId: null,
    relatedEventId: null,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
  };
  const now = new Date("2026-05-31T12:00:00.000Z");

  it("leaves open/done/canceled unchanged", () => {
    expect(effectiveStatus({ ...base, status: "open" }, now)).toBe("open");
    expect(effectiveStatus({ ...base, status: "done" }, now)).toBe("done");
    expect(effectiveStatus({ ...base, status: "canceled" }, now)).toBe("canceled");
  });

  it("keeps a future-snoozed task snoozed", () => {
    expect(
      effectiveStatus({ ...base, status: "snoozed", snoozedUntil: "2026-06-01T08:00:00.000Z" }, now),
    ).toBe("snoozed");
  });

  it("resurfaces a past-snoozed task as open", () => {
    expect(
      effectiveStatus({ ...base, status: "snoozed", snoozedUntil: "2026-05-31T06:00:00.000Z" }, now),
    ).toBe("open");
  });
});

describe("dueBucket", () => {
  const now = new Date("2026-05-31T12:00:00.000Z");
  it("classifies by date-only relative to now", () => {
    expect(dueBucket(null, now)).toBe("none");
    expect(dueBucket("2026-05-30T00:00:00.000Z", now)).toBe("overdue");
    expect(dueBucket("2026-05-31T23:00:00.000Z", now)).toBe("today");
    expect(dueBucket("2026-06-03T00:00:00.000Z", now)).toBe("week"); // +3d
    expect(dueBucket("2026-06-07T00:00:00.000Z", now)).toBe("week"); // +7d boundary
    expect(dueBucket("2026-06-09T00:00:00.000Z", now)).toBe("later"); // +9d
  });
});
