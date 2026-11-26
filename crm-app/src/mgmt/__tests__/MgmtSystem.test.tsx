import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u", email: "x@example.org", displayName: "יעל בדויה", role: "Administrator" } }),
}));
const api = vi.hoisted(() => ({ ok: null as null | { published_at: string | null }, map: null as unknown, sec: null as unknown, perm: null as unknown, fail: 0, secFail: 0 }));
vi.mock("../system/systemApi", () => ({
  systemAvailable: async () => api.ok,
  getSystem: async (kind: string) => {
    if (kind === "permissions") return api.perm;
    if (kind === "security") {
      if (api.secFail) throw new Error(`Server error (${api.secFail})`);
      return api.sec ?? { generated_at: null, findings: [] };
    }
    if (api.fail) throw new Error(`Server error (${api.fail})`);
    return api.map;
  },
}));

import { MgmtShell } from "../MgmtShell";
import { MgmtSystemPage } from "../system/MgmtSystemPage";
import { MgmtSystemAll } from "../system/MgmtSystemAll";
import { MgmtSystemItem } from "../system/MgmtSystemItem";
import { MgmtSystemMap } from "../system/MgmtSystemMap";
import { itemHref } from "../system/SystemHead";
import { buildModel, groupStatus, nodeStatus, title, W } from "../system/model";

afterEach(() => {
  cleanup();
  api.ok = null;
  api.map = null;
  api.sec = null;
  api.perm = null;
  api.fail = 0;
  api.secFail = 0;
});

const shell = () =>
  render(
    <MemoryRouter initialEntries={["/m/today"]}>
      <Routes>
        <Route path="m" element={<MgmtShell />}>
          <Route path="today" element={<p>היום</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
const links = () => Array.from(document.querySelectorAll('a[href="/m/system"]'));

describe("System tab in the shell", () => {
  it("is hidden when the API does not answer this session (not the owner, offline, no route)", async () => {
    api.ok = null;
    shell();
    await new Promise((r) => setTimeout(r, 0));
    expect(links()).toHaveLength(0);
  });
  it("appears in the side rail and the phone bar when the API answers", async () => {
    api.ok = { published_at: "2026-11-26T12:00:00Z" };
    shell();
    await waitFor(() => expect(links()).toHaveLength(2));
  });
});

describe("System page (home)", () => {
  const node = (id: string, extra: Record<string, unknown>) => ({ id, kind: "site", name: id, ...extra });
  const map = () => ({
    _meta: { generated_at: new Date().toISOString() },
    nodes: [
      node("a", { state: "works", title_he: "אתר עובד" }),
      node("b", { state: "failing", title_he: "אתר שנופל" }),
      node("c", { kind: "service", state: "not running", verdict: "needed", title_he: "שירות נחוץ", owner_label_he: "עדי" }),
      node("d", { kind: "workflow", state: "not running", verdict: "candidate to retire", title_he: "תהליך ישן" }),
      node("site:heshbon.merkazneshama.co.il", { state: "failing", title_he: "חשבונות" }),
      node("e", { state: "unknown", kind: "external", title_he: "שירות חיצוני: Vimeo" }),
    ],
    edges: [],
    groups: [
      { id: "g1", name_he: "תחום תקין", purpose_he: "עושה משהו", node_ids: ["a"] },
      { id: "g2", name_he: "תחום עם תקלה", node_ids: ["a", "b"] },
    ],
  });

  it("lists what is broken first, with its consequence and owner, in the owner's words", async () => {
    api.map = map();
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    const broken = await screen.findByRole("list", { name: "מה מופרע" });
    const text = broken.textContent || "";
    expect(text).toContain("אתר שנופל");
    expect(text).toContain("לא נפתח");
    expect(text).toContain("שירות נחוץ");
    expect(text).toContain("לא רץ, ומישהו צריך אותו");
    expect(text).toContain("של עדי");
    expect(text).not.toContain("אתר עובד");
    expect(text).not.toContain("חשבונות"); // owner 12.11: private on purpose, not broken
    expect(document.body.textContent).not.toContain("מושבת");
  });
  it("parks retire candidates in a fold, and counts domains", async () => {
    api.map = map();
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    await screen.findByText(/לא רצים, ומחכים לניקוי או להחלטה/);
    const body = document.body.textContent || "";
    expect(body).toContain("תהליך ישן");
    expect(body).toMatch(/2\s*תחומים:\s*1\s*עובדים,\s*1\s*צריכים טיפול/);
    expect(body).toMatch(/1\s*דברים במצב „לא ידוע”/);
  });
  it("says what can be done now: an outcome is not fine while a part of its chain is broken", async () => {
    const m = map();
    m.nodes.push(node("site:give.merkazneshama.co.il", { state: "failing", title_he: "עמוד התרומה", failing_since: m._meta.generated_at }));
    api.map = m;
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    const out = await screen.findByRole("list", { name: "מה אפשר לעשות עכשיו" });
    const rows = Array.from(out.querySelectorAll("li")).map((li) => li.textContent || "");
    expect(rows).toHaveLength(4);
    const give = rows.find((r) => r.includes("תרומה הופכת להכנסה")) || "";
    expect(give).toContain(W.down);
    expect(give).toContain("עמוד התרומה: לא נפתח");
    expect(rows.find((r) => r.includes("שאלה מקבלת תשובה"))).toContain("לא נבדק");
    const broken = (await screen.findByRole("list", { name: "מה מופרע" })).textContent || "";
    expect(broken).toMatch(/עמוד התרומה.*מאז היום/);
    expect(broken).toContain("עבר בהצלחה לאחרונה: לא ידוע");
    expect(broken).toContain("משפיע על: תרומה הופכת להכנסה");
  });
  it("shows only the high security findings, and a security failure does not hide the rest", async () => {
    api.map = map();
    api.sec = { generated_at: new Date().toISOString(), findings: [
      { id: "f1", severity: "high", what_he: "שם ציבורי מצביע על שרת ישן", needs_owner: true },
      { id: "f2", severity: "low", what_he: "ממצא קטן" },
    ] };
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    const hi = await screen.findByRole("list", { name: "ממצאי אבטחה דחופים" });
    expect(hi.textContent).toContain("שם ציבורי מצביע על שרת ישן");
    expect(hi.textContent).toContain("צריך אותך");
    expect(document.body.textContent).not.toContain("ממצא קטן");
    cleanup();
    api.secFail = 503;
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    await screen.findByRole("list", { name: "מה מופרע" });
    await screen.findByText(/ממצאי האבטחה לא נטענו/);
  });
  it("403 is worded as no permission, not as an error", async () => {
    api.fail = 403;
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/אין לך הרשאה/)).toBeTruthy());
  });
  it("other failures offer a retry", async () => {
    api.fail = 503;
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("ניסיון נוסף")).toBeTruthy());
  });
});

describe("System list (כל מה שיש במערכת)", () => {
  const nodes = [
    { id: "s1", kind: "site", name: "a.example.org", state: "works", title_he: "אתר אחד", owner_label_he: "עדי" },
    { id: "s2", kind: "site", name: "b.example.org", state: "failing", title_he: "אתר שנופל", owner_label_he: "המערכת" },
    { id: "w1", kind: "workflow", name: "flow", state: "works", title_he: "תהליך לילה", owner_label_he: "המערכת", schedule_he: "כל לילה" },
    { id: "x1", kind: "external", name: "vimeo", state: "unknown", title_he: "Vimeo", owner_label_he: "המערכת" },
  ];
  const all = (q = "") =>
    render(
      <MemoryRouter initialEntries={[`/m/system/all${q}`]}>
        <Routes>
          <Route path="/m/system/all" element={<MgmtSystemAll />} />
        </Routes>
      </MemoryRouter>,
    );
  const count = () => (document.querySelector(".sy-count")?.textContent || "").replace(/\s+/g, " ");

  it("lists everything, the broken first, and the sub-tabs link home", async () => {
    api.map = { _meta: { generated_at: new Date().toISOString() }, nodes, edges: [], groups: [] };
    all();
    await screen.findByText(/מציג/);
    expect(count()).toContain("מציג 4 מתוך 4");
    const titles = Array.from(document.querySelectorAll(".sy-cards summary .sy-t")).map((e) => e.textContent);
    expect(titles[0]).toContain("אתר שנופל");
    expect(document.querySelector('a[href="/m/system"]')?.textContent).toBe("תמונת מצב");
  });
  it("saved view, whose chips and search narrow the list", async () => {
    api.map = { _meta: { generated_at: new Date().toISOString() }, nodes, edges: [], groups: [] };
    all("?view=sites");
    await screen.findByText(/מציג/);
    expect(count()).toContain("מציג 2 מתוך 2");
    screen.getAllByRole("button", { name: /^עדי/ })[0].click();
    await waitFor(() => expect(count()).toContain("מציג 1 מתוך 2"));
    cleanup();
    all("?q=לילה");
    await screen.findByText(/מציג/);
    expect(count()).toContain("מציג 1 מתוך 4");
  });
  it("the phone table mode sorts by a header", async () => {
    api.map = { _meta: { generated_at: new Date().toISOString() }, nodes, edges: [], groups: [] };
    all("?sort=name");
    await screen.findByText(/מציג/);
    screen.getByRole("button", { name: "טבלה" }).click();
    const th = await screen.findByRole("columnheader", { name: /שם/ });
    expect(th.getAttribute("aria-sort")).toBe("ascending");
    const first = () => document.querySelector("tbody tr td")?.textContent || "";
    expect(first()).toContain("אתר אחד");
    th.querySelector("button")!.click();
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /שם/ }).getAttribute("aria-sort")).toBe("descending"));
    expect(first()).not.toContain("אתר אחד");
  });
});

describe("side-by-side fixes (#236 review)", () => {
  const gen = new Date().toISOString();
  const twins = [
    { id: "s:1", kind: "site", name: "dev.flow.one.example", state: "works", title_he: "סביבת פיתוח של Flow" },
    { id: "s:2", kind: "site", name: "dev.flow.two.example", state: "works", title_he: "סביבת פיתוח של Flow" },
    { id: "s:3", kind: "site", name: "solo.example", state: "works", title_he: "אתר יחיד", serves: { text_he: "הלומדים" } },
  ];
  const all = () =>
    render(
      <MemoryRouter initialEntries={["/m/system/all"]}>
        <Routes>
          <Route path="/m/system/all" element={<MgmtSystemAll />} />
        </Routes>
      </MemoryRouter>,
    );
  it("two records with the same title show their technical names; a unique title does not", async () => {
    api.map = { _meta: { generated_at: gen }, nodes: twins, edges: [], groups: [] };
    all();
    await screen.findByText(/מציג/);
    const body = document.body.textContent || "";
    expect(body).toContain("dev.flow.one.example");
    expect(body).toContain("dev.flow.two.example");
    const solo = Array.from(document.querySelectorAll(".sy-cards summary")).find((s) => s.textContent?.includes("אתר יחיד"));
    expect(solo?.textContent).not.toContain("solo.example");
  });
  it("a purpose inferred from the domain says so", async () => {
    api.map = { _meta: { generated_at: gen }, nodes: twins, edges: [], groups: [] };
    all();
    await screen.findByText(/מציג/);
    screen.getByRole("button", { name: "טבלה" }).click();
    await screen.findByRole("table");
    expect(document.querySelector("tbody")?.textContent).toContain("לפי התחום: הלומדים");
  });
  it("security layers are numbered outside-in", async () => {
    api.map = { _meta: { generated_at: gen }, nodes: [], edges: [], groups: [] };
    api.sec = { generated_at: gen, layers: {}, findings: [] };
    render(
      <MemoryRouter initialEntries={["/m/system/map?v=sec"]}>
        <Routes>
          <Route path="/m/system/map" element={<MgmtSystemMap />} />
        </Routes>
      </MemoryRouter>,
    );
    const ol = await screen.findByRole("list", { name: "שכבות ההגנה" });
    const first = ol.querySelector("li")?.textContent || "";
    expect(first).toMatch(/^1\s*הכניסה מהאינטרנט/);
    expect(ol.querySelectorAll("li")).toHaveLength(12);
  });
});

describe("System item sheet", () => {
  const id = "windmill:flow:f/media_pipeline/x";
  const data = () => ({
    _meta: { generated_at: new Date().toISOString() },
    nodes: [
      { id, kind: "workflow", name: "f/media_pipeline/x", state: "failing", title_he: "מסלול בדיקה", why_he: "מעביר הקלטה הלאה", group: "g1", schedule_he: "כל שעה", failing_since: new Date().toISOString() },
      { id: "site:a", kind: "site", name: "a.example.org", state: "works", title_he: "אתר שתלוי בו" },
    ],
    edges: [{ from: "site:a", to: id, rel: "uses" }],
    groups: [{ id: "g1", name_he: "תחום בדיקה", node_ids: [id] }],
  });
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m/system/item/*" element={<MgmtSystemItem />} />
        </Routes>
      </MemoryRouter>,
    );

  it("opens a record whose id has slashes and colons, in the mockup's sections", async () => {
    api.map = data();
    at(itemHref(id));
    await screen.findByRole("heading", { level: 1, name: /מסלול בדיקה/ });
    const body = document.body.textContent || "";
    for (const t of ["מה זה עושה ולמי זה עוזר", "צריך אותו?", "מצב עכשיו", "מקומו במסלול השירות", "של מי", "רץ אוטומטית ואיפה בשרת", "מזהה, תאריכים ומקורות"]) expect(body).toContain(t);
    expect(body).toContain("נכשל מאז");
    expect(body).toContain("כל שעה");
    const dep = screen.getAllByRole("link", { name: "אתר שתלוי בו" })[0];
    expect(dep.getAttribute("href")).toBe(itemHref("site:a"));
    expect(screen.getByRole("link", { name: "תחום בדיקה" }).getAttribute("href")).toBe("/m/system/all?g=g1");
  });
  it("an unknown id says so", async () => {
    api.map = data();
    at(itemHref("nope:1"));
    await screen.findByText(/לא נמצא בשם/);
  });
  it("home rows link to the sheet", async () => {
    api.map = data();
    render(<MemoryRouter><MgmtSystemPage /></MemoryRouter>);
    const broken = await screen.findByRole("list", { name: "מה מופרע" });
    expect(broken.querySelector("a")?.getAttribute("href")).toBe(itemHref(id));
  });
});

describe("System map (list form)", () => {
  const data = () => ({
    _meta: { generated_at: new Date().toISOString() },
    nodes: [
      { id: "site:give.merkazneshama.co.il", kind: "site", name: "give", state: "failing", title_he: "עמוד התרומה" },
      { id: "ext:takbull", kind: "external", name: "takbull", state: "unknown", title_he: "תקבול" },
    ],
    edges: [{ from: "site:give.merkazneshama.co.il", to: "ext:takbull", rel: "uses" }],
    groups: [],
  });
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m/system/map" element={<MgmtSystemMap />} />
        </Routes>
      </MemoryRouter>,
    );
  it("starts from the four outcomes; a broken key service marks its outcome down", async () => {
    api.map = data();
    at("/m/system/map?det=1");
    const list = await screen.findByRole("list", { name: "התוצאות" });
    const rows = Array.from(list.querySelectorAll("li")).map((li) => li.textContent || "");
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.includes("תרומה הופכת להכנסה"))).toContain(W.down);
    expect(list.querySelector('a[href="/m/system/map?o=donation"]')).toBeTruthy();
  });
  it("an outcome shows its chain with verified and unverified links; a service shows what depends on it", async () => {
    api.map = data();
    at("/m/system/map?o=donation&s=give");
    const chain = await screen.findByRole("list", { name: "השירותים של תרומה הופכת להכנסה" });
    expect(chain.textContent).toContain("עמוד התרומה גובה דרך תקבול");
    expect(chain.textContent).not.toMatch(/גובה דרך תקבול · עוד לא אימתנו/);
    expect(chain.textContent).toMatch(/מודיע על תשלום אל.*עוד לא אימתנו/);
    const focus = screen.getByRole("region", { name: "עמוד התרומה" });
    expect(focus.textContent).toContain("עמוד התרומה: לא נפתח");
  });
});

describe("System map: the drawn atlas (S7b)", () => {
  const data = () => ({
    _meta: { generated_at: new Date().toISOString() },
    nodes: [
      { id: "site:give.merkazneshama.co.il", kind: "site", name: "give", state: "failing", title_he: "עמוד התרומה", group: "crm", owner_label_he: "עדי" },
      { id: "a1", kind: "workflow", name: "a1", state: "works", title_he: "תהליך שיעור", group: "nekuda", owner_label_he: "הרב" },
      { id: "b1", kind: "timer", name: "b1", state: "unknown", title_he: "משימת גיבוי", group: "backups" },
    ],
    edges: [{ from: "a1", to: "site:give.merkazneshama.co.il", rel: "calls", confidence: "high", purpose_he: "לומדים תורמים" }],
    groups: [
      { id: "crm", name_he: "אנשי קשר", purpose_he: "רשימת אנשים", node_ids: ["site:give.merkazneshama.co.il"] },
      { id: "nekuda", name_he: "נקודה שלי", purpose_he: "אתר הלמידה", node_ids: ["a1"] },
      { id: "backups", name_he: "גיבויים", purpose_he: "עותקים", node_ids: ["b1"] },
    ],
  });
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m/system/map" element={<MgmtSystemMap />} />
        </Routes>
      </MemoryRouter>,
    );
  it("is the default: five areas from above, the four layers, and the list form one link away", async () => {
    api.map = data();
    at("/m/system/map");
    const box = await screen.findByTestId("atlas");
    expect(box.querySelectorAll("[data-z]")).toHaveLength(5);
    expect(box.querySelectorAll("svg.sy-al > path")).toHaveLength(1);
    const nav = screen.getByRole("navigation", { name: "שכבות המפה" });
    expect(Array.from(nav.querySelectorAll("a")).map((a) => a.textContent)).toEqual(["מבנה", "מצב", "מסלולים", "של מי"]);
    expect(box.querySelector('[data-z="reach"]')?.textContent).toContain("תקלה אחת");
    expect(box.querySelector('[data-z="learn"]')?.textContent).toContain("נקודה שלי");
    expect(document.querySelector('a[href="/m/system/map?det=1"]')).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "מבט על" }).textContent).toContain("עמוד התרומה");
  });
  it("an area opens its domains; the crumbs go back up", async () => {
    api.map = data();
    at("/m/system/map?z=reach");
    const box = await screen.findByTestId("atlas");
    const dom = Array.from(box.querySelectorAll("a")).find((a) => a.getAttribute("href") === "/m/system/map?z=reach&d=crm");
    expect(dom?.textContent).toContain("אנשי קשר");
    expect(screen.getByRole("navigation", { name: "איפה אני במפה" }).querySelector('a[href="/m/system/map"]')).toBeTruthy();
  });
  it("routes number the steps of one chain and grey the areas it does not pass; whose counts per person", async () => {
    api.map = data();
    const r = at("/m/system/map?ly=routes&o=donation");
    const box = await screen.findByTestId("atlas");
    expect(box.querySelector('[data-z="reach"] .sy-steps')?.textContent).toContain("עמוד התרומה");
    expect(box.querySelector('[data-z="agents"]')?.className).toContain("sy-off");
    expect(screen.getByRole("link", { name: /התרשים המפורט/ }).getAttribute("href")).toBe("/m/system/map?o=donation");
    r.unmount();
    at("/m/system/map?ly=whose&pw=%D7%A2%D7%93%D7%99");
    const b2 = await screen.findByTestId("atlas");
    expect(b2.querySelector('[data-z="reach"]')?.textContent).toMatch(/עדי\s*1/);
    expect(b2.querySelector('[data-z="learn"]')?.className).toContain("sy-off");
  });
});

describe("System map: access and security segments", () => {
  const base = { _meta: { generated_at: new Date().toISOString() }, nodes: [{ id: "site:a", kind: "site", name: "a.example.org", short_id: "S-a", state: "works", title_he: "a.example.org" }], edges: [], groups: [] };
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m/system/map" element={<MgmtSystemMap />} />
        </Routes>
      </MemoryRouter>,
    );
  it("access lists identities with their admin rights and groups sites by how they are entered", async () => {
    api.map = base;
    api.perm = { generated_at: base._meta.generated_at, identities: [{ id: "user:x", label_he: "משתמש בדיקה", owner_label_he: "הבעלים", sudo: "limited", authorized_keys: 2 }], sites: [{ id: "S-a", observed: "basic_or_login_401" }], shared_authority: [] };
    at("/m/system/map?v=access");
    const ids = await screen.findByRole("list", { name: "אנשים וזהויות" });
    expect(ids.textContent).toContain("הרשאת מנהל: מוגבלת");
    expect(document.body.textContent).toMatch(/כניסה בסיסמה\s*1/);
  });
  it("security lists the layers and the findings, high first", async () => {
    api.map = base;
    api.sec = { generated_at: base._meta.generated_at, layers: { firewall: { active: true, rules: 7 } }, findings: [
      { id: "f1", severity: "low", what_he: "ממצא קטן" },
      { id: "f2", severity: "high", what_he: "ממצא דחוף", needs_owner: true },
    ] };
    at("/m/system/map?v=sec");
    const f = await screen.findByRole("list", { name: "ממצאים" });
    const items = Array.from(f.querySelectorAll(":scope > li")).map((li) => li.textContent || "");
    expect(items[0]).toContain("ממצא דחוף");
    expect((screen.getByRole("list", { name: "שכבות ההגנה" }).textContent || "")).toContain("פעילה");
  });
});

describe("model", () => {
  const n = (state: string, extra: Record<string, unknown> = {}) => ({ id: "x", kind: "site", name: "x", state, ...extra });
  it("maps states to the mockup's words", () => {
    expect(nodeStatus(n("works")).k).toBe("ok");
    expect(nodeStatus(n("failing")).k).toBe("down");
    expect(nodeStatus(n("stale")).k).toBe("unk");
    expect(nodeStatus(n("off on purpose")).k).toBe("off");
    expect(nodeStatus(n("off on purpose", { exposure_decision: { value: "internal only" } })).k).toBe("priv");
    expect(W.down).toBe("לא עובד עכשיו");
  });
  it("a domain is down only when a site in it is broken", () => {
    const m = buildModel({ _meta: {}, edges: [], nodes: [n("failing", { id: "s" }), n("failing", { id: "w", kind: "workflow" })], groups: [{ id: "a", name_he: "א", node_ids: ["s"] }, { id: "b", name_he: "ב", node_ids: ["w"] }] });
    expect(groupStatus(m.groups[0], m).k).toBe("down");
    expect(groupStatus(m.groups[1], m).k).toBe("care");
  });
  it("title drops guessed brackets and the outside-service prefix", () => {
    expect(title(n("works", { title_he: "שירות חיצוני: Vimeo" }))).toBe("Vimeo");
    expect(title(n("works", { purpose_he: "משהו (ניחוש)", purpose_source: "guess" }))).toBe("משהו");
    expect(title(n("works"))).toBe("x");
  });
});

describe("the map data never ships in the web build", () => {
  const app = join(__dirname, "..", "..", "..");
  const NAMES = ["SYSTEM_MAP.json", "permissions_map.json", "security_map.json", "components.json"];
  const walk = (d: string): string[] =>
    existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : [];
  it("no map file under public/ or dist/", () => {
    const hits = [...walk(join(app, "public")), ...walk(join(app, "dist"))].filter((f) => NAMES.some((n) => f.endsWith(n)));
    expect(hits).toEqual([]);
  });
  it("the build-time ops-data copier does not copy them", () => {
    const src = readFileSync(join(app, "scripts", "sync-ops-data.mjs"), "utf8");
    for (const n of NAMES) expect(src).not.toContain(n);
  });
  it("no source file under src/ imports a map JSON", () => {
    const hits = walk(join(app, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("MgmtSystem.test.tsx") && NAMES.some((n) => readFileSync(f, "utf8").includes(n)));
    expect(hits).toEqual([]);
  });
});
