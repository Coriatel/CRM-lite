import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u", email: "x@example.org", displayName: "יעל בדויה", role: "Administrator" } }),
}));
const api = vi.hoisted(() => ({ ok: null as null | { published_at: string | null }, map: null as unknown, fail: 0 }));
vi.mock("../system/systemApi", () => ({
  systemAvailable: async () => api.ok,
  getSystem: async () => {
    if (api.fail) throw new Error(`Server error (${api.fail})`);
    return api.map;
  },
}));

import { MgmtShell } from "../MgmtShell";
import { MgmtSystemPage, statusKey } from "../system/MgmtSystemPage";

afterEach(() => {
  cleanup();
  api.ok = null;
  api.map = null;
  api.fail = 0;
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

describe("System page", () => {
  const map = (nodes: { state: string }[]) => ({ _meta: { generated_at: new Date().toISOString() }, nodes: nodes.map((n, i) => ({ id: `n${i}`, kind: "site", name: `s${i}`, ...n })), edges: [], groups: [] });

  it("counts in the owner's words", async () => {
    api.map = map([{ state: "works" }, { state: "works" }, { state: "failing" }, { state: "not running" }, { state: "stale" }, { state: "maintenance" }]);
    render(<MgmtSystemPage />);
    await waitFor(() => expect(screen.getByText(/לא עובד עכשיו/)).toBeTruthy());
    const text = document.body.textContent || "";
    expect(text).toContain("2 לא עובד עכשיו");
    expect(text).toContain("1 עובד, צריך טיפול");
    expect(text).toContain("1 תחזוקה");
    expect(text).toContain("מתוך 6 רכיבים");
    expect(text).not.toContain("מושבת");
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
  it("maps states to words without inventing a status", () => {
    expect(statusKey({ id: "a", kind: "x", name: "a", state: "off on purpose" })).toBe("other");
    expect(statusKey({ id: "a", kind: "x", name: "a", state: "works" })).toBe("ok");
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
