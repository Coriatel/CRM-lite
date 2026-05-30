import { describe, it, expect, vi, beforeEach } from "vitest";

const getContacts = vi.fn();
vi.mock("../services/directus", () => ({ getContacts: (...a: unknown[]) => getContacts(...a) }));

import { fetchDailyAgenda, contactFollowUpToItem } from "./dailyAgenda";

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

beforeEach(() => getContacts.mockReset());

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
