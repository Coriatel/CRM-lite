import { describe, it, expect } from "vitest";
import { actionableHandoffs } from "./OpsPage";

describe("actionableHandoffs", () => {
  it("returns [] for null doc", () => {
    expect(actionableHandoffs(null)).toEqual([]);
  });
  it("returns [] when handoffs missing", () => {
    expect(actionableHandoffs({})).toEqual([]);
  });
  it("keeps only user-canonical / project-scoped that fail verification", () => {
    const doc = {
      handoffs: [
        { user: "a", path: "/x/CURRENT.md", scope: "user-canonical", verified: false },
        { user: "a", path: "/y/CURRENT.md", scope: "user-canonical", verified: true },
        { user: "b", path: "/z/proj/CURRENT.md", scope: "project-scoped", verified: false },
        { user: "c", path: "/x/2026-05-12.md", scope: "flat-dated", verified: false },
        { user: "c", path: "/x/HANDOFF_FOO.md", scope: "other", verified: false },
      ],
    };
    const out = actionableHandoffs(doc);
    expect(out.map((h) => h.path)).toEqual([
      "/x/CURRENT.md",
      "/z/proj/CURRENT.md",
    ]);
  });
  it("sorts by mtime desc", () => {
    const doc = {
      handoffs: [
        { user: "a", path: "/old", scope: "user-canonical", verified: false, mtime: "2026-01-01T00:00:00Z" },
        { user: "a", path: "/new", scope: "user-canonical", verified: false, mtime: "2026-05-14T00:00:00Z" },
        { user: "a", path: "/mid", scope: "project-scoped", verified: false, mtime: "2026-03-01T00:00:00Z" },
      ],
    };
    expect(actionableHandoffs(doc).map((h) => h.path)).toEqual([
      "/new",
      "/mid",
      "/old",
    ]);
  });
});
