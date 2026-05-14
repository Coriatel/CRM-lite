import { describe, it, expect } from "vitest";
import {
  detectActiveCollisions,
  globsOverlap,
  topCollisionPairs,
} from "./OpsPage";

describe("globsOverlap", () => {
  it("dir-prefix vs concrete file under that dir → overlap", () => {
    expect(globsOverlap("src/pages/**", "src/pages/OpsPage.tsx")).toBe(true);
    expect(globsOverlap("src/pages/OpsPage.tsx", "src/pages/**")).toBe(true);
  });
  it("disjoint dirs → no overlap", () => {
    expect(globsOverlap("foo/**", "bar/**")).toBe(false);
    expect(globsOverlap("src/pages/Foo.tsx", "src/components/Bar.tsx")).toBe(false);
  });
  it("equal patterns → overlap", () => {
    expect(globsOverlap("foo/bar.md", "foo/bar.md")).toBe(true);
  });
  it("prefix collision but NOT a path-segment ancestor → no overlap", () => {
    // "foo" must not match "foobar/**" — segment-aware check.
    expect(globsOverlap("foo", "foobar/x")).toBe(false);
    expect(globsOverlap("foo/**", "foobar/**")).toBe(false);
  });
  it("tolerates parenthetical commentary (preflight contract)", () => {
    expect(globsOverlap("src/pages/** (writes only)", "src/pages/OpsPage.tsx (UI)")).toBe(true);
  });
  it("empty / whitespace globs → no overlap", () => {
    expect(globsOverlap("", "foo/**")).toBe(false);
    expect(globsOverlap("foo/**", " ")).toBe(false);
  });
  it("globs whose literal prefix is empty (start with *) → no overlap", () => {
    expect(globsOverlap("**/Foo.tsx", "src/Foo.tsx")).toBe(false);
  });
});

describe("detectActiveCollisions", () => {
  const mkSession = (id: string, paths: string[]) => ({
    id,
    owned_paths_globs: paths,
  });

  it("returns [] for null/empty/single-session lists", () => {
    expect(detectActiveCollisions(null)).toEqual([]);
    expect(detectActiveCollisions(undefined)).toEqual([]);
    expect(detectActiveCollisions([])).toEqual([]);
    expect(detectActiveCollisions([mkSession("a", ["foo/**"])])).toEqual([]);
  });
  it("detects two-session overlap on shared directory", () => {
    const result = detectActiveCollisions([
      mkSession("track-a", ["src/pages/**"]),
      mkSession("track-b", ["src/pages/OpsPage.tsx"]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].a).toBe("track-a");
    expect(result[0].b).toBe("track-b");
    expect(result[0].overlaps).toEqual([
      { aGlob: "src/pages/**", bGlob: "src/pages/OpsPage.tsx" },
    ]);
  });
  it("symmetric: id ordering normalized lexicographically", () => {
    const result = detectActiveCollisions([
      mkSession("zzz", ["src/pages/**"]),
      mkSession("aaa", ["src/pages/Foo.tsx"]),
    ]);
    expect(result[0].a).toBe("aaa");
    expect(result[0].b).toBe("zzz");
  });
  it("disjoint sessions → no collision", () => {
    expect(
      detectActiveCollisions([
        mkSession("a", ["foo/**"]),
        mkSession("b", ["bar/**"]),
      ]),
    ).toEqual([]);
  });
  it("session with empty owned_paths_globs contributes no collisions", () => {
    expect(
      detectActiveCollisions([
        mkSession("a", []),
        mkSession("b", ["foo/**"]),
      ]),
    ).toEqual([]);
  });
  it("three sessions: surfaces only pairs with literal-prefix overlap", () => {
    // a=dir glob, b/c=concrete files. a∩b and a∩c overlap.
    // b∩c: neither file path is segment-prefix of the other → no overlap.
    const result = detectActiveCollisions([
      mkSession("a", ["src/pages/**"]),
      mkSession("b", ["src/pages/Foo.tsx"]),
      mkSession("c", ["src/pages/Bar.tsx"]),
    ]);
    expect(result).toHaveLength(2);
    const pairs = result.map((c) => [c.a, c.b].join("∩")).sort();
    expect(pairs).toEqual(["a∩b", "a∩c"]);
  });
});

describe("topCollisionPairs", () => {
  it("returns [] when there are no collisions", () => {
    expect(topCollisionPairs([])).toEqual([]);
  });
  it("returns sorted (lexicographic) glob pair", () => {
    const pairs = topCollisionPairs([
      { a: "x", b: "y", overlaps: [{ aGlob: "src/pages/OpsPage.tsx", bGlob: "src/pages/**" }] },
    ]);
    expect(pairs).toEqual([
      { aGlob: "src/pages/**", bGlob: "src/pages/OpsPage.tsx" },
    ]);
  });
  it("dedupes the same pair coming from multiple session collisions", () => {
    const pairs = topCollisionPairs([
      { a: "x", b: "y", overlaps: [{ aGlob: "src/pages/**", bGlob: "src/pages/Foo.tsx" }] },
      { a: "x", b: "z", overlaps: [{ aGlob: "src/pages/Foo.tsx", bGlob: "src/pages/**" }] },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ aGlob: "src/pages/**", bGlob: "src/pages/Foo.tsx" });
  });
  it("caps output at max (default 2)", () => {
    const pairs = topCollisionPairs([
      {
        a: "x",
        b: "y",
        overlaps: [
          { aGlob: "a/**", bGlob: "a/file.ts" },
          { aGlob: "b/**", bGlob: "b/file.ts" },
          { aGlob: "c/**", bGlob: "c/file.ts" },
        ],
      },
    ]);
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.aGlob)).toEqual(["a/**", "b/**"]);
  });
  it("strips parenthetical commentary", () => {
    const pairs = topCollisionPairs([
      {
        a: "x",
        b: "y",
        overlaps: [
          { aGlob: "src/pages/** (writes only)", bGlob: "src/pages/OpsPage.tsx (UI)" },
        ],
      },
    ]);
    expect(pairs).toEqual([
      { aGlob: "src/pages/**", bGlob: "src/pages/OpsPage.tsx" },
    ]);
  });
});
