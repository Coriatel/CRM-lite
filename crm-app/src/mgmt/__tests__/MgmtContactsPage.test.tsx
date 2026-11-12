import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MgmtContactsPage } from "../MgmtContactsPage";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const ROWS = [
  { id: "a", full_name: "נועה בדויה", phone_e164: "+972501234567", email: null, city: null, classification: "donor", assigned_to: null, last_call_date: null },
  { id: "b", full_name: "דוד בדוי", phone_e164: "_no_phone_x", email: null, city: null, classification: null, assigned_to: "יעל", last_call_date: null },
];

let urls: string[] = [];
let respond: (url: string) => Response;

function mount() {
  return render(
    <MemoryRouter>
      <MgmtContactsPage />
    </MemoryRouter>,
  );
}

describe("MgmtContactsPage", () => {
  beforeEach(() => {
    urls = [];
    respond = () => jsonResponse({ data: ROWS, meta: { filter_count: 120 } });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = decodeURIComponent(typeof input === "string" ? input : input.toString());
      urls.push(url);
      return respond(url);
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists contacts with the total that matches and how many are shown", async () => {
    mount();
    await screen.findByText("נועה בדויה");
    expect(screen.getByText("120 אנשים · מוצגים 2")).toBeTruthy();
    expect(screen.getByText("050-123-4567")).toBeTruthy();
    expect(screen.getByText("אין טלפון")).toBeTruthy();
    expect(urls[0]).toContain("/items/contacts?");
    expect(urls[0]).toContain("meta=filter_count");
    expect(urls[0]).toContain("offset=0");
  });

  it("offers a call only when there is a real phone number", async () => {
    mount();
    await screen.findByText("נועה בדויה");
    const calls = screen.getAllByText("חיוג");
    expect(calls).toHaveLength(1);
    expect(calls[0].getAttribute("href")).toBe("tel:+972501234567");
  });

  it("searches name, phones and email on the server", async () => {
    mount();
    await screen.findByText("נועה בדויה");
    fireEvent.change(screen.getByLabelText("חיפוש"), { target: { value: "noa@" } });
    await waitFor(() => expect(urls.some((u) => u.includes("[email][_icontains]=noa@"))).toBe(true));
    const u = urls.find((x) => x.includes("[email][_icontains]"))!;
    expect(u).toContain("filter[_or][0][full_name][_icontains]=noa@");
    expect(u).toContain("filter[_or][1][phone_e164][_contains]=noa@");
  });

  it("filters by classification, including contacts with none", async () => {
    mount();
    await screen.findByText("נועה בדויה");
    fireEvent.click(screen.getByRole("button", { name: "תורמים" }));
    await waitFor(() => expect(urls.some((u) => u.includes("filter[classification][_eq]=donor"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "בלי סיווג" }));
    await waitFor(() => expect(urls.some((u) => u.includes("filter[classification][_null]=true"))).toBe(true));
  });

  it("loads the next page by offset and appends it", async () => {
    mount();
    await screen.findByText("נועה בדויה");
    respond = () =>
      jsonResponse({
        data: [{ ...ROWS[0], id: "c", full_name: "מיכל בדויה" }],
        meta: { filter_count: 120 },
      });
    fireEvent.click(screen.getByRole("button", { name: "הצגת 50 הבאים" }));
    await screen.findByText("מיכל בדויה");
    expect(screen.getByText("נועה בדויה")).toBeTruthy();
    expect(urls[urls.length - 1]).toContain("offset=2");
    expect(screen.getByText("120 אנשים · מוצגים 3")).toBeTruthy();
  });

  it("says so when the server refuses, instead of showing an empty list", async () => {
    respond = () => jsonResponse({ errors: [] }, 403);
    mount();
    await screen.findByText(/אין לך הרשאה/);
    expect(screen.queryByText(/לא נמצאו/)).toBeNull();
  });

  it("offers a retry when loading fails", async () => {
    respond = () => jsonResponse({}, 500);
    mount();
    await screen.findByText("לא הצלחנו לטעון את הנתונים כרגע.");
    respond = () => jsonResponse({ data: ROWS, meta: { filter_count: 2 } });
    fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" }));
    await screen.findByText("נועה בדויה");
  });
});
