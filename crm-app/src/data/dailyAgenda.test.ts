import { describe, it, expect } from "vitest";
import { buildDailyAgenda, type AgendaSourceItem } from "./dailyAgenda";

const NOW = new Date("2026-05-29T09:00:00.000Z");

function item(over: Partial<AgendaSourceItem>): AgendaSourceItem {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "follow_up",
    title: "Follow up",
    due: "2026-05-29",
    contact_id: null,
    contact_name: null,
    status: null,
    ...over,
  };
}

describe("buildDailyAgenda", () => {
  it("buckets by due date relative to now (overdue / today / upcoming)", () => {
    const a = buildDailyAgenda(
      [
        item({ id: "o1", due: "2026-05-27", title: "overdue A" }),
        item({ id: "t1", due: "2026-05-29", title: "today A" }),
        item({ id: "u1", due: "2026-05-31", title: "upcoming A" }),
      ],
      NOW,
    );
    expect(a.overdue.map((x) => x.id)).toEqual(["o1"]);
    expect(a.today.map((x) => x.id)).toEqual(["t1"]);
    expect(a.upcoming.map((x) => x.id)).toEqual(["u1"]);
    expect(a.counts).toEqual({ overdue: 1, today: 1, upcoming: 1, total: 3 });
    expect(a.date).toBe("2026-05-29");
    expect(a.source).toBe("substrate-derived");
  });

  it("excludes items with no due date (not schedulable in a daily plan)", () => {
    const a = buildDailyAgenda([item({ id: "n1", due: null })], NOW);
    expect(a.counts.total).toBe(0);
  });

  it("excludes upcoming items beyond the horizon (default 7 days)", () => {
    const a = buildDailyAgenda(
      [
        item({ id: "near", due: "2026-06-04" }), // +6d -> in
        item({ id: "far", due: "2026-06-10" }), // +12d -> out
      ],
      NOW,
    );
    expect(a.upcoming.map((x) => x.id)).toEqual(["near"]);
  });

  it("respects a custom upcoming horizon", () => {
    const a = buildDailyAgenda([item({ id: "far", due: "2026-06-10" })], NOW, {
      upcomingDays: 14,
    });
    expect(a.upcoming.map((x) => x.id)).toEqual(["far"]);
  });

  it("sorts each bucket by due ascending then title", () => {
    const a = buildDailyAgenda(
      [
        item({ id: "o-late", due: "2026-05-28", title: "b" }),
        item({ id: "o-early", due: "2026-05-20", title: "a" }),
        item({ id: "t-z", due: "2026-05-29T15:00:00Z", title: "z" }),
        item({ id: "t-a", due: "2026-05-29T08:00:00Z", title: "a" }),
      ],
      NOW,
    );
    expect(a.overdue.map((x) => x.id)).toEqual(["o-early", "o-late"]);
    expect(a.today.map((x) => x.id)).toEqual(["t-a", "t-z"]);
  });

  it("preserves item kind so meetings/reminders slot in alongside follow-ups", () => {
    const a = buildDailyAgenda(
      [
        item({ id: "m", kind: "meeting", due: "2026-05-29", title: "meet" }),
        item({ id: "r", kind: "reminder", due: "2026-05-29", title: "remind" }),
      ],
      NOW,
    );
    const kinds = a.today.map((x) => x.kind).sort();
    expect(kinds).toEqual(["meeting", "reminder"]);
  });

  it("is empty-safe", () => {
    const a = buildDailyAgenda([], NOW);
    expect(a.counts.total).toBe(0);
    expect(a.overdue).toEqual([]);
    expect(typeof a.generated_at).toBe("string");
  });
});
