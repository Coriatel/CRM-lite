import { describe, it, expect } from "vitest";
import { actionableHandoffs, handoffDisplayPath } from "./OpsPage";

describe("actionableHandoffs (verifier_status schema)", () => {
  it("returns [] for null doc", () => {
    expect(actionableHandoffs(null)).toEqual([]);
  });
  it("returns [] when no entries/handoffs", () => {
    expect(actionableHandoffs({})).toEqual([]);
  });
  it("keeps only drift and error states", () => {
    const doc = {
      entries: [
        { handoff_path: "/a", verifier_status: "ok" as const },
        { handoff_path: "/b", verifier_status: "ancestor" as const },
        { handoff_path: "/c", verifier_status: "drift" as const },
        { handoff_path: "/d", verifier_status: "error" as const },
        { handoff_path: "/e", verifier_status: "not_applicable" as const },
        { handoff_path: "/f", verifier_status: "missing_state" as const },
      ],
    };
    expect(actionableHandoffs(doc).map((h) => h.handoff_path)).toEqual([
      "/c",
      "/d",
    ]);
  });
  it("sorts by written_at desc", () => {
    const doc = {
      entries: [
        { handoff_path: "/old", verifier_status: "drift" as const, written_at: "2026-01-01T00:00:00Z" },
        { handoff_path: "/new", verifier_status: "drift" as const, written_at: "2026-05-14T00:00:00Z" },
        { handoff_path: "/mid", verifier_status: "error" as const, written_at: "2026-03-01T00:00:00Z" },
      ],
    };
    expect(actionableHandoffs(doc).map((h) => h.handoff_path)).toEqual([
      "/new",
      "/mid",
      "/old",
    ]);
  });
  it("falls back to verified=false on legacy handoffs schema", () => {
    const doc = {
      handoffs: [
        { path: "/x", verified: true },
        { path: "/y", verified: false },
      ],
    };
    expect(actionableHandoffs(doc).map((h) => h.path)).toEqual(["/y"]);
  });
});

describe("handoffDisplayPath", () => {
  it("shortens /home/USER/work/handoffs/", () => {
    expect(handoffDisplayPath({ handoff_path: "/home/devuserr/work/handoffs/CURRENT.md" }))
      .toBe("devuserr/CURRENT.md");
  });
  it("shortens /home/USER/", () => {
    expect(handoffDisplayPath({ handoff_path: "/home/root/state/foo.md" }))
      .toBe("root/state/foo.md");
  });
  it("passes through unknown paths", () => {
    expect(handoffDisplayPath({ handoff_path: "/srv/ops-vault/x.md" }))
      .toBe("/srv/ops-vault/x.md");
  });
  it("returns empty for empty entry", () => {
    expect(handoffDisplayPath({})).toBe("");
  });
});
