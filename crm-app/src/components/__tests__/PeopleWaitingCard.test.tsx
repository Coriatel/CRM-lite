import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DirectusContact } from "../../services/directus";

const usePeopleWaiting = vi.fn();
vi.mock("../../data/usePeopleWaiting", () => ({
  usePeopleWaiting: () => usePeopleWaiting(),
}));

import { PeopleWaitingCard } from "../dashboard/PeopleWaitingCard";

function person(over: Partial<DirectusContact> = {}): DirectusContact {
  return {
    id: over.id ?? "c1",
    full_name: over.full_name ?? "דוד כהן",
    phone_e164: over.phone_e164 ?? "+972501234567",
    follow_up_date: over.follow_up_date,
    follow_up_note: over.follow_up_note,
    ...over,
  } as DirectusContact;
}

function state(over: Partial<ReturnType<typeof base>> = {}) {
  usePeopleWaiting.mockReturnValue({ ...base(), ...over });
}
function base() {
  return { people: [] as DirectusContact[] | null, loading: false, error: null as string | null, refresh: vi.fn() };
}

describe("PeopleWaitingCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading state when people is null", () => {
    state({ people: null, loading: true });
    render(<PeopleWaitingCard />);
    expect(screen.getByTestId("people-waiting-loading")).toBeTruthy();
  });

  it("shows error state", () => {
    state({ error: "שגיאה בטעינת אנשים שממתינים" });
    render(<PeopleWaitingCard />);
    expect(screen.getByTestId("people-waiting-error").textContent).toContain("שגיאה");
  });

  it("shows empty state when no one is waiting", () => {
    state({ people: [] });
    render(<PeopleWaitingCard />);
    expect(screen.getByTestId("people-waiting-empty")).toBeTruthy();
  });

  it("renders rows with name, count, and tel/wa actions for contacts with a phone", () => {
    state({
      people: [
        person({ id: "a", full_name: "דוד כהן", follow_up_date: "2020-01-01", follow_up_note: "להחזיר טלפון" }),
        person({ id: "b", full_name: "שרה לוי", phone_e164: "+972529876543" }),
      ],
    });
    render(<PeopleWaitingCard />);
    expect(screen.getAllByTestId("people-waiting-row").length).toBe(2);
    expect(screen.getByTestId("people-waiting-count").textContent).toContain("2");
    expect(screen.getByText("דוד כהן")).toBeTruthy();
    expect(screen.getByText("להחזיר טלפון")).toBeTruthy();
    const call = screen.getAllByTestId("people-waiting-call")[0] as HTMLAnchorElement;
    expect(call.getAttribute("href")).toBe("tel:+972501234567");
    const wa = screen.getAllByTestId("people-waiting-whatsapp")[0] as HTMLAnchorElement;
    expect(wa.getAttribute("href")).toBe("https://wa.me/972501234567");
  });

  it("shows overdue badge for a past follow_up_date", () => {
    state({ people: [person({ follow_up_date: "2020-01-01" })] });
    render(<PeopleWaitingCard />);
    expect(screen.getByTestId("people-waiting-overdue").textContent).toContain("באיחור");
  });

  it("shows 'no phone' instead of actions when phone is missing", () => {
    state({ people: [person({ phone_e164: "", phone_raw: "" })] });
    render(<PeopleWaitingCard />);
    expect(screen.queryByTestId("people-waiting-call")).toBeNull();
    expect(screen.getByText("אין טלפון")).toBeTruthy();
  });
});
