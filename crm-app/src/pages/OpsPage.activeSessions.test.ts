import { describe, it, expect } from "vitest";
import { shortenSlice } from "./OpsPage";

describe("shortenSlice", () => {
  it("returns em-dash for null/undefined/empty", () => {
    expect(shortenSlice(null)).toBe("—");
    expect(shortenSlice(undefined)).toBe("—");
    expect(shortenSlice("")).toBe("—");
  });
  it("strips parenthetical commentary", () => {
    expect(shortenSlice("rebase PR #45 (post-#46/#47)")).toBe("rebase PR #45");
    expect(shortenSlice("foo (a) bar (b)")).toBe("foobar");
  });
  it("passes through short strings unchanged", () => {
    expect(shortenSlice("ship card")).toBe("ship card");
  });
  it("truncates >60 chars with ellipsis at 57", () => {
    const long = "a".repeat(80);
    const out = shortenSlice(long);
    expect(out).toHaveLength(58);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, 57)).toBe("a".repeat(57));
  });
  it("trims whitespace left by parenthetical stripping", () => {
    expect(shortenSlice("  hello  ")).toBe("hello");
  });
});
