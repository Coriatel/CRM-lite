import { describe, it, expect } from "vitest";
import {
  openRuntimeIssues,
  parseSeverity,
  classifyRuntimeIssuesForOperator,
  SEVERITY_LABEL_HE,
} from "./OpsPage";

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

describe("classifyRuntimeIssuesForOperator", () => {
  it("returns null for empty list (card hides itself in that branch)", () => {
    expect(classifyRuntimeIssuesForOperator([])).toBeNull();
  });

  it("info severity when only low / unknown issues are open", () => {
    const v = classifyRuntimeIssuesForOperator([
      { id: "a", severity: "low" },
      { id: "b", severity: undefined as unknown as string },
    ])!;
    expect(v.severity).toBe("info");
    expect(v.headline).toContain("ייעוצים");
    expect(v.lowCount).toBe(1);
    expect(v.unknownCount).toBe(1);
  });

  it("watch severity when at least one medium issue is open (no highs)", () => {
    const v = classifyRuntimeIssuesForOperator([
      { id: "a", severity: "medium — does not block execution" },
      { id: "b", severity: "low" },
    ])!;
    expect(v.severity).toBe("watch");
    expect(v.headline).toContain("לטיפול");
    expect(v.mediumCount).toBe(1);
    expect(v.lowCount).toBe(1);
  });

  it("action severity when at least one high issue is open", () => {
    const v = classifyRuntimeIssuesForOperator([
      { id: "a", severity: "high — blocking" },
      { id: "b", severity: "medium" },
      { id: "c", severity: "low" },
    ])!;
    expect(v.severity).toBe("action");
    expect(v.headline).toContain("חמורות");
    expect(v.highCount).toBe(1);
    expect(v.nextAction).toContain("חומרה");
  });

  it("critical severity rolls into high (mirrors parseSeverity contract)", () => {
    const v = classifyRuntimeIssuesForOperator([
      { id: "a", severity: "critical: total outage" },
    ])!;
    expect(v.severity).toBe("action");
    expect(v.highCount).toBe(1);
  });

  it("counts are accurate across mixed severities", () => {
    const v = classifyRuntimeIssuesForOperator([
      { id: "1", severity: "high" },
      { id: "2", severity: "high" },
      { id: "3", severity: "medium" },
      { id: "4", severity: "low" },
      { id: "5", severity: "low" },
      { id: "6", severity: "low" },
      { id: "7", severity: "garbage value" },
    ])!;
    expect(v.openCount).toBe(7);
    expect(v.highCount).toBe(2);
    expect(v.mediumCount).toBe(1);
    expect(v.lowCount).toBe(3);
    expect(v.unknownCount).toBe(1);
  });

  it("headline embeds high count under action, total count under watch/info", () => {
    const action = classifyRuntimeIssuesForOperator([
      { id: "a", severity: "high" },
      { id: "b", severity: "low" },
    ])!;
    expect(action.headline).toContain("(1)"); // highCount, not total

    const watch = classifyRuntimeIssuesForOperator([
      { id: "a", severity: "medium" },
      { id: "b", severity: "low" },
    ])!;
    expect(watch.headline).toContain("(2)"); // openCount

    const info = classifyRuntimeIssuesForOperator([
      { id: "a", severity: "low" },
      { id: "b", severity: "low" },
      { id: "c", severity: "low" },
    ])!;
    expect(info.headline).toContain("(3)");
  });
});

describe("SEVERITY_LABEL_HE", () => {
  it("provides Hebrew label for every SeverityLevel", () => {
    expect(SEVERITY_LABEL_HE.high).toBe("חמורה");
    expect(SEVERITY_LABEL_HE.medium).toBe("בינונית");
    expect(SEVERITY_LABEL_HE.low).toBe("נמוכה");
    expect(SEVERITY_LABEL_HE.unknown).toBe("לא ידוע");
  });
});
