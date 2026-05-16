import { describe, it, expect } from "vitest";
import { projectFromContacts } from "./amutaAttentionProjection";
import type { DirectusContact } from "../services/directus";

const contact = (over: Partial<DirectusContact>): DirectusContact =>
  ({
    id: "c1",
    full_name: "Avi",
    phone_e164: "+972500000000",
    status: "active",
    call_status: "pending",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...over,
  }) as DirectusContact;

describe("projectFromContacts", () => {
  const today = "2026-05-16";

  it("routes overdue follow-up to Elron (waiting)", () => {
    const items = projectFromContacts({
      followUpCandidates: [
        contact({ id: "a", full_name: "Yosi", follow_up_date: "2026-05-14" }),
      ],
      neverCalled: [],
      today,
    });
    expect(items).toHaveLength(1);
    expect(items[0].owner).toBe("elron");
    expect(items[0].status).toBe("waiting");
    expect(items[0].id).toBe("followup:a");
  });

  it("marks follow-up older than 7 days as stale (stuck bucket)", () => {
    const items = projectFromContacts({
      followUpCandidates: [
        contact({ id: "b", follow_up_date: "2026-05-01" }),
      ],
      neverCalled: [],
      today,
    });
    expect(items[0].status).toBe("stale");
    expect(items[0].urgency).toBe("high");
  });

  it("attaches quick-context with overdue days and recommended step", () => {
    const items = projectFromContacts({
      followUpCandidates: [
        contact({
          id: "p",
          full_name: "Sara",
          phone_e164: "+972500000123",
          last_call_date: "2026-05-01",
          follow_up_date: "2026-05-10",
          interest_level: 3,
        }),
      ],
      neverCalled: [],
      today,
    });
    const ctx = items[0].context!;
    expect(ctx.person_name).toBe("Sara");
    expect(ctx.phone).toBe("+972500000123");
    expect(ctx.last_call_date).toBe("2026-05-01");
    expect(ctx.follow_up_date).toBe("2026-05-10");
    expect(ctx.interest_level).toBe(3);
    expect(ctx.why_now).toMatch(/איחור של 6 ימים/);
    expect(ctx.recommended_step).toMatch(/\+972500000123/);
  });

  it("routes never-called to Rav and bumps urgency for hot interest", () => {
    const items = projectFromContacts({
      followUpCandidates: [],
      neverCalled: [
        contact({ id: "h", interest_level: 5 }),
        contact({ id: "c", interest_level: 1 }),
      ],
      today,
    });
    expect(items.map((i) => i.owner)).toEqual(["rav", "rav"]);
    expect(items[0].urgency).toBe("high");
    expect(items[1].urgency).toBe("normal");
  });
});
