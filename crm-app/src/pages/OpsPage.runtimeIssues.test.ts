import { describe, it, expect } from "vitest";
import { openRuntimeIssues, parseSeverity } from "./OpsPage";

describe("parseSeverity", () => {
  it("returns unknown for null/undefined/empty", () => {
    expect(parseSeverity(null)).toBe("unknown");
    expect(parseSeverity(undefined)).toBe("unknown");
    expect(parseSeverity("")).toBe("unknown");
  });
  it("parses bare words", () => {
    expect(parseSeverity("high")).toBe("high");
    expect(parseSeverity("Medium")).toBe("medium");
    expect(parseSeverity("LOW")).toBe("low");
  });
  it("parses descriptive prefixes", () => {
    expect(parseSeverity("medium — does not block execution")).toBe("medium");
    expect(parseSeverity("low (work-around exists)")).toBe("low");
    expect(parseSeverity("critical: production-down")).toBe("high");
  });
  it("returns unknown for unrecognized strings", () => {
    expect(parseSeverity("totally-unknown")).toBe("unknown");
  });
});

describe("openRuntimeIssues", () => {
  it("returns [] for null doc / no issues", () => {
    expect(openRuntimeIssues(null)).toEqual([]);
    expect(openRuntimeIssues({})).toEqual([]);
  });
  it("hides issues with resolved/closed/wontfix dispositions", () => {
    const doc = {
      issues: [
        { id: "a", disposition: "resolved 2026-05-01" },
        { id: "b", disposition: "Closed by owner" },
        { id: "c", disposition: "wontfix — out of scope" },
        { id: "d", disposition: "capture-and-continue" },
        { id: "e", disposition: null },
      ],
    };
    expect(openRuntimeIssues(doc).map((i) => i.id).sort()).toEqual(["d", "e"]);
  });
  it("sorts high → medium → low → unknown, then by date desc", () => {
    const doc = {
      issues: [
        { id: "u", severity: null, date: "2026-05-14" },
        { id: "l", severity: "low (note)", date: "2026-05-14" },
        { id: "h", severity: "high — production", date: "2026-05-10" },
        { id: "m1", severity: "medium — friction", date: "2026-05-13" },
        { id: "m2", severity: "medium", date: "2026-05-14" },
      ],
    };
    expect(openRuntimeIssues(doc).map((i) => i.id)).toEqual([
      "h",
      "m2",
      "m1",
      "l",
      "u",
    ]);
  });
});
