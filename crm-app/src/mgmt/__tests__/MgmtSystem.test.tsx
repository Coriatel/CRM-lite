import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u", email: "x@example.org", displayName: "יעל בדויה", role: "Administrator" } }),
}));
const api = vi.hoisted(() => ({ ok: null as null | { published_at: string | null }, map: null as unknown, sec: null as unknown, fail: 0, secFail: 0 }));
vi.mock("../system/systemApi", () => ({
  systemAvailable: async () => api.ok,
  getSystem: async (kind: string) => {
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
import { buildModel, groupStatus, nodeStatus, title, W } from "../system/model";

afterEach(() => {
  cleanup();
  api.ok = null;
  api.map = null;
  api.sec = null;
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
    render(<MgmtSystemPage />);
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
    render(<MgmtSystemPage />);
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
    render(<MgmtSystemPage />);
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
    render(<MgmtSystemPage />);
    const hi = await screen.findByRole("list", { name: "ממצאי אבטחה דחופים" });
    expect(hi.textContent).toContain("שם ציבורי מצביע על שרת ישן");
    expect(hi.textContent).toContain("צריך אותך");
    expect(document.body.textContent).not.toContain("ממצא קטן");
    cleanup();
    api.secFail = 503;
    render(<MgmtSystemPage />);
    await screen.findByRole("list", { name: "מה מופרע" });
    await screen.findByText(/ממצאי האבטחה לא נטענו/);
  });
  it("403 is worded as no permission, not as an error", async () => {
    api.fail = 403;
    render(<MgmtSystemPage />);
    await waitFor(() => expect(screen.getByText(/אין לך הרשאה/)).toBeTruthy());
  });
  it("other failures offer a retry", async () => {
    api.fail = 503;
    render(<MgmtSystemPage />);
    await waitFor(() => expect(screen.getByText("ניסיון נוסף")).toBeTruthy());
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
