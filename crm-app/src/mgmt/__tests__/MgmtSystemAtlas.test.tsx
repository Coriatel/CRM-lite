import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const api = vi.hoisted(() => ({ map: null as unknown, fail: 0 }));
vi.mock("../system/systemApi", () => ({
  getSystem: async () => {
    if (api.fail) throw new Error(`Server error (${api.fail})`);
    return api.map;
  },
}));

import { MgmtSystemAtlas } from "../system/MgmtSystemAtlas";

afterEach(() => {
  cleanup();
  api.map = null;
  api.fail = 0;
});

// The live shape (GET /api/system/map): generated_at under _meta, a site's address as {url}, optional newness fields.
function map(extra: { isNew?: boolean } = {}) {
  return {
    _meta: { generated_at: "2026-11-26T09:41:34Z" },
    groups: [
      { id: "crm", name_he: "CRM ותורמים", light: "yellow", purpose_he: "אנשי קשר" },
      { id: "infra", name_he: "תשתית שרת", light: "green", purpose_he: "השרת" },
    ],
    nodes: [
      { id: "site:give.example.org", kind: "site", name: "give.example.org", group: "crm", state: "works", purpose_he: "עמוד התרומות",
        address: { url: "https://give.example.org/" }, last_checked: "2026-11-26T09:41:34Z", ...(extra.isNew ? { is_new: true } : {}) },
      { id: "n8n:wf-1", kind: "workflow", name: "Donation intake", group: "crm", state: "failing", purpose_he: "קליטת תרומה", last_checked: "2026-11-26T09:41:34Z" },
      { id: "container:db", kind: "container", name: "db", group: "infra", state: "off on purpose", purpose_he: "מסד הנתונים" },
      { id: "orphan", kind: "script", name: "x", group: "no-such-group", state: "works" },
      { id: "site:heshbon.merkazneshama.co.il", kind: "site", name: "heshbon.merkazneshama.co.il", group: "crm", state: "failing", purpose_he: "מערכת הנהלת החשבונות" },
    ],
    edges: [{ from: "n8n:wf-1", to: "container:db", rel: "depends_on", state: "works", confidence: "high" }],
    findings: [
      { kind: "broken", text: "something new the scan found" },
      { kind: "broken", node: "n8n:wf-1", text: "workflow Donation intake failing" },
      { kind: "broken", node: "site:heshbon.merkazneshama.co.il", text: "site heshbon.merkazneshama.co.il not answering" },
      { kind: "broken", node: "container:db", text: "db reported broken" },
    ],
  };
}

const page = () =>
  render(
    <MemoryRouter initialEntries={["/m/system/atlas"]}>
      <Routes>
        <Route path="m/system/atlas" element={<MgmtSystemAtlas />} />
        <Route path="m/system" element={<p>בית המערכת</p>} />
      </Routes>
    </MemoryRouter>,
  );
const atlas = () => (document.querySelector(".atl") as HTMLElement & { __atlas: { go: (p: object) => void } }).__atlas;

describe("System atlas (beside the existing System screens)", () => {
  it("draws from the API data; nodes of an unknown group and unknown findings do not break it", async () => {
    api.map = map();
    page();
    await waitFor(() => expect(document.querySelector(".atl h1")?.textContent).toBe("אטלס המערכת"));
    // a finding about a component reads as its Hebrew title, state and group; raw scan text only inside the fold
    const rows = Array.from(document.querySelectorAll("#v0 .rows")[0].querySelectorAll(":scope > li > button .a")).map((x) => x.textContent);
    expect(rows).toEqual(["קליטת תרומה"]);
    expect(document.querySelector("#v0 .rows")!.textContent).toContain("נכשל");
    expect(document.querySelector("#v0 .rows")!.textContent).toContain("CRM ותורמים");
    expect(document.querySelector("#fraw")!.textContent).toContain("something new the scan found");
    expect(document.querySelector("#fraw")!.textContent).not.toContain("Donation intake failing");
    // the owner's decision: the accounting site is private on purpose, not urgent
    expect(document.querySelector("#fpriv")!.textContent).toContain("פרטי בכוונה");
    expect(document.querySelector("#v0 .rows")!.textContent).not.toContain("מערכת הנהלת החשבונות");
    // a component off on purpose is not urgent either, whatever kind the finding carries
    expect(document.querySelector("#fpriv")!.textContent).toContain("מסד הנתונים");
    const lenses = Array.from(document.querySelectorAll("#lensbar button")).map((b) => b.getAttribute("data-lens"));
    expect(lenses).toEqual(["all", "auto", "code", "infra", "access", "sites", "proc", "new"]);
  });

  it("sites: name and address, status, checked, domain; the address opens the site in a new tab", async () => {
    api.map = map();
    page();
    await waitFor(() => expect(atlas()).toBeTruthy());
    atlas().go({ V: "T", lens: "sites" });
    const heads = Array.from(document.querySelectorAll(".tb th")).map((t) => t.textContent);
    expect(heads).toEqual(["שם וכתובת", "מצב ▾", "נבדק", "תחום"]);
    const a = document.querySelector(".tb a.url") as HTMLAnchorElement;
    expect(a.href).toBe("https://give.example.org/");
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    expect(document.querySelector(".tb td.g")?.textContent).toBe("CRM ותורמים");
    expect(document.querySelectorAll(".tb tbody tr")).toHaveLength(2);
  });

  it("a row tap opens the item on the map with its sheet", async () => {
    api.map = map();
    page();
    await waitFor(() => expect(atlas()).toBeTruthy());
    atlas().go({ V: "T", lens: "auto" });
    fireEvent.click(document.querySelector('tr[data-row="n8n:wf-1"] .nm')!);
    expect(atlas().S).toMatchObject({ V: "C", sel: { t: "n", id: "n8n:wf-1" } });
    expect(document.querySelector("#sheet h2")?.textContent).toContain("קליטת תרומה");
  });

  it("new: empty state without newness data; a new item carries the chip", async () => {
    api.map = map();
    const r = page();
    await waitFor(() => expect(atlas()).toBeTruthy());
    atlas().go({ V: "T", lens: "new" });
    expect(screen.getByText("אין רכיבים חדשים השבוע")).toBeTruthy();
    r.unmount();
    api.map = map({ isNew: true });
    page();
    await waitFor(() => expect(atlas()).toBeTruthy());
    atlas().go({ V: "T", lens: "new" });
    expect(document.querySelectorAll(".tb tbody tr")).toHaveLength(1);
    expect(document.querySelector(".tb .tag.new")?.textContent).toBe("חדש");
  });

  it("the sample steps stay labelled as sample", async () => {
    api.map = map();
    page();
    await waitFor(() => expect(atlas()).toBeTruthy());
    atlas().go({ V: "W" });
    expect(document.querySelector("#vx")?.textContent).toContain("דוגמה");
  });

  it("exit returns to the System home; the API failure is worded like the other System screens", async () => {
    api.map = map();
    page();
    await waitFor(() => expect(atlas()).toBeTruthy());
    fireEvent.click(document.querySelector("#exit")!);
    expect(screen.getByText("בית המערכת")).toBeTruthy();
    cleanup();
    api.fail = 403;
    page();
    await waitFor(() => expect(document.querySelector(".mg-panel")).toBeTruthy());
    expect(document.querySelector(".atl")).toBeNull();
  });

  it("the bundle carries no map data", () => {
    const src = readFileSync(join(__dirname, "../system/atlas/engine.js"), "utf8");
    expect(src).not.toMatch(/"nodes"\s*:\s*\[/);
    expect(src).not.toMatch(/"last_checked"\s*:/);
    expect(src.length).toBeLessThan(120_000);
    // no scan texts either: findings arrive from the API, so internal hosts and paths never ship in the public bundle
    expect(src).not.toMatch(/ts\.net|\/srv\/|secrets\.|did not run as expected/);
  });
});
