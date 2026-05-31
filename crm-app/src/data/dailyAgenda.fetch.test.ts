import { describe, it, expect, vi, beforeEach } from "vitest";

const getContacts = vi.fn();
const getCareReports = vi.fn();
const getMeetings = vi.fn();
const getReminders = vi.fn();
vi.mock("../services/directus", () => ({
  getContacts: (...a: unknown[]) => getContacts(...a),
  getCareReports: (...a: unknown[]) => getCareReports(...a),
  getMeetings: (...a: unknown[]) => getMeetings(...a),
  getReminders: (...a: unknown[]) => getReminders(...a),
}));

import {
  fetchDailyAgenda,
  contactFollowUpToItem,
  careFollowUpToItem,
  meetingToItem,
  reminderToItem,
} from "./dailyAgenda";

const NOW = new Date("2026-05-29T09:00:00.000Z");

function contact(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    full_name: "Dani Cohen",
    phone_e164: "+972500000000",
    status: "active",
    call_status: "pending",
    follow_up_date: "2026-05-29",
    created_at: "x",
    updated_at: "x",
    ...over,
  };
}

function careReport(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    contact_id: "c9",
    interaction_type: "meeting",
    interaction_at: "2026-05-20T10:00:00.000Z",
    summary: "תוכן פסטורלי רגיש שאסור שידלוף",
    followup_status: "pending",
    followup_due: "2026-05-29",
    ...over,
  };
}

function meeting(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    title: "פגישה עם משפחת כהן",
    starts_at: "2026-05-29T11:00:00.000Z",
    ends_at: null,
    location: null,
    status: "scheduled",
    contact_id: "c5",
    owner_id: "u1",
    ...over,
  };
}

function reminder(over: Record<string, unknown> = {}) {
  return {
    id: "rm1",
    title: "להכין שיעור",
    due_at: "2026-05-29T08:00:00.000Z",
    status: "pending",
    contact_id: null,
    owner_id: "u1",
    ...over,
  };
}

beforeEach(() => {
  getContacts.mockReset();
  getCareReports.mockReset();
  getMeetings.mockReset();
  getReminders.mockReset();
  // defaults: no extra sources unless a test sets them
  getCareReports.mockResolvedValue([]);
  getMeetings.mockResolvedValue([]);
  getReminders.mockResolvedValue([]);
});

describe("contactFollowUpToItem", () => {
  it("maps a contact row to a follow_up agenda item", () => {
    const it_ = contactFollowUpToItem(contact() as never);
    expect(it_).toMatchObject({
      id: "follow_up:c1",
      kind: "follow_up",
      title: "Dani Cohen",
      due: "2026-05-29",
      contact_id: "c1",
      contact_name: "Dani Cohen",
      status: "pending",
    });
  });

  it("falls back to a generic title when full_name is blank", () => {
    expect(contactFollowUpToItem(contact({ full_name: "  " }) as never).title).toBe(
      "Follow up",
    );
  });
});

describe("fetchDailyAgenda", () => {
  it("queries contacts within the horizon and buckets them", async () => {
    getContacts.mockResolvedValue([
      contact({ id: "o", full_name: "Overdue", follow_up_date: "2026-05-27" }),
      contact({ id: "t", full_name: "Today", follow_up_date: "2026-05-29" }),
      contact({ id: "u", full_name: "Upcoming", follow_up_date: "2026-06-02" }),
    ]);
    const a = await fetchDailyAgenda(NOW);
    expect(getContacts).toHaveBeenCalledWith({ followUpBefore: "2026-06-05", limit: 500 });
    expect(a.overdue.map((x) => x.contact_id)).toEqual(["o"]);
    expect(a.today.map((x) => x.contact_id)).toEqual(["t"]);
    expect(a.upcoming.map((x) => x.contact_id)).toEqual(["u"]);
    expect(a.counts.total).toBe(3);
  });

  it("drops contacts with no follow_up_date defensively", async () => {
    getContacts.mockResolvedValue([
      contact({ id: "ok", follow_up_date: "2026-05-29" }),
      contact({ id: "nope", follow_up_date: null }),
    ]);
    const a = await fetchDailyAgenda(NOW);
    expect(a.counts.total).toBe(1);
  });

  it("passes a custom horizon through to the query", async () => {
    getContacts.mockResolvedValue([]);
    await fetchDailyAgenda(NOW, { upcomingDays: 14 });
    expect(getContacts).toHaveBeenCalledWith({ followUpBefore: "2026-06-12", limit: 500 });
  });
});

describe("careFollowUpToItem", () => {
  it("maps a pending care report to a care_followup agenda item", () => {
    const it_ = careFollowUpToItem(careReport() as never);
    expect(it_).toMatchObject({
      id: "care_followup:r1",
      kind: "care_followup",
      due: "2026-05-29",
      contact_id: "c9",
      status: "pending",
    });
  });

  it("never carries the pastoral summary into the agenda item (privacy)", () => {
    const it_ = careFollowUpToItem(
      careReport({ summary: "סודי ביותר" }) as never,
    ) as unknown as Record<string, unknown>;
    // No summary field, and the title is a safe generic label — not the summary.
    expect(it_.summary).toBeUndefined();
    expect(JSON.stringify(it_)).not.toContain("סודי ביותר");
    expect(it_.title).not.toContain("סודי");
  });
});

describe("fetchDailyAgenda — care follow-up join (A4)", () => {
  it("queries pending care follow-ups within the horizon", async () => {
    getContacts.mockResolvedValue([]);
    getCareReports.mockResolvedValue([]);
    await fetchDailyAgenda(NOW);
    expect(getCareReports).toHaveBeenCalledWith({ followupDueBefore: "2026-06-05" });
  });

  it("merges care_followup items alongside contact follow_ups and buckets both", async () => {
    getContacts.mockResolvedValue([
      contact({ id: "ct", full_name: "Contact Today", follow_up_date: "2026-05-29" }),
    ]);
    getCareReports.mockResolvedValue([
      careReport({ id: "co", contact_id: "p1", followup_due: "2026-05-27" }), // overdue
      careReport({ id: "cu", contact_id: "p2", followup_due: "2026-06-01" }), // upcoming
    ]);
    const a = await fetchDailyAgenda(NOW);
    expect(a.overdue.map((x) => x.id)).toEqual(["care_followup:co"]);
    expect(a.today.map((x) => x.kind)).toEqual(["follow_up"]);
    expect(a.upcoming.map((x) => x.id)).toEqual(["care_followup:cu"]);
    expect(a.counts.total).toBe(3);
  });

  it("does not leak any care summary into the built agenda (privacy)", async () => {
    getContacts.mockResolvedValue([]);
    getCareReports.mockResolvedValue([
      careReport({ summary: "מידע רגיש מאוד שאסור להופיע" }),
    ]);
    const a = await fetchDailyAgenda(NOW);
    expect(JSON.stringify(a)).not.toContain("מידע רגיש מאוד שאסור להופיע");
  });

  it("leaves contact follow_up behavior unchanged when there are no care reports", async () => {
    getContacts.mockResolvedValue([
      contact({ id: "t", follow_up_date: "2026-05-29" }),
    ]);
    getCareReports.mockResolvedValue([]);
    const a = await fetchDailyAgenda(NOW);
    expect(a.counts.total).toBe(1);
    expect(a.today.map((x) => x.kind)).toEqual(["follow_up"]);
  });
});

describe("meetingToItem / reminderToItem (A5)", () => {
  it("maps a meeting to a meeting agenda item anchored on starts_at", () => {
    expect(meetingToItem(meeting() as never)).toMatchObject({
      id: "meeting:m1",
      kind: "meeting",
      title: "פגישה עם משפחת כהן",
      due: "2026-05-29T11:00:00.000Z",
      contact_id: "c5",
      status: "scheduled",
    });
  });

  it("maps a reminder to a reminder agenda item anchored on due_at", () => {
    expect(reminderToItem(reminder() as never)).toMatchObject({
      id: "reminder:rm1",
      kind: "reminder",
      title: "להכין שיעור",
      due: "2026-05-29T08:00:00.000Z",
      contact_id: null,
      status: "pending",
    });
  });

  it("never carries notes into the agenda item (privacy — type has no notes field)", () => {
    const m = meetingToItem(meeting({ notes: "תוכן רגיש בפגישה" } as never) as never) as unknown as Record<string, unknown>;
    const r = reminderToItem(reminder({ notes: "תזכורת סודית" } as never) as never) as unknown as Record<string, unknown>;
    expect(m.notes).toBeUndefined();
    expect(r.notes).toBeUndefined();
    expect(JSON.stringify(m)).not.toContain("תוכן רגיש בפגישה");
    expect(JSON.stringify(r)).not.toContain("תזכורת סודית");
  });
});

describe("fetchDailyAgenda — meetings + reminders join (A5)", () => {
  it("reads meetings + reminders owner-scoped within the horizon", async () => {
    getContacts.mockResolvedValue([]);
    await fetchDailyAgenda(NOW);
    expect(getMeetings).toHaveBeenCalledWith({ startsBefore: "2026-06-05", status: "scheduled" });
    expect(getReminders).toHaveBeenCalledWith({ dueBefore: "2026-06-05", status: "pending" });
  });

  it("merges all four sources and buckets meetings/reminders correctly", async () => {
    getContacts.mockResolvedValue([
      contact({ id: "ct", full_name: "Contact Today", follow_up_date: "2026-05-29" }),
    ]);
    getCareReports.mockResolvedValue([
      careReport({ id: "cr", contact_id: "p1", followup_due: "2026-05-29" }),
    ]);
    getMeetings.mockResolvedValue([
      meeting({ id: "mo", starts_at: "2026-05-27T11:00:00.000Z" }), // overdue
    ]);
    getReminders.mockResolvedValue([
      reminder({ id: "ru", due_at: "2026-06-01T08:00:00.000Z" }), // upcoming
    ]);
    const a = await fetchDailyAgenda(NOW);
    expect(a.overdue.map((x) => x.id)).toEqual(["meeting:mo"]);
    expect(a.today.map((x) => x.kind).sort()).toEqual(["care_followup", "follow_up"]);
    expect(a.upcoming.map((x) => x.id)).toEqual(["reminder:ru"]);
    expect(a.counts.total).toBe(4);
  });

  it("does not leak meeting/reminder notes into the built agenda (privacy)", async () => {
    getContacts.mockResolvedValue([]);
    getMeetings.mockResolvedValue([meeting({ notes: "סוד פגישה" } as never)]);
    getReminders.mockResolvedValue([reminder({ notes: "סוד תזכורת" } as never)]);
    const a = await fetchDailyAgenda(NOW);
    const s = JSON.stringify(a);
    expect(s).not.toContain("סוד פגישה");
    expect(s).not.toContain("סוד תזכורת");
  });

  it("leaves contact-only agenda unchanged when meetings/reminders are empty", async () => {
    getContacts.mockResolvedValue([contact({ id: "t", follow_up_date: "2026-05-29" })]);
    const a = await fetchDailyAgenda(NOW);
    expect(a.counts.total).toBe(1);
    expect(a.today.map((x) => x.kind)).toEqual(["follow_up"]);
  });
});
