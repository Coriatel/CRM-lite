import { describe, it, expect } from "vitest";
import { formatOwnedPaths, heartbeatAgeLabelHe } from "./OpsPage";

describe("formatOwnedPaths", () => {
  it("returns '' for null/undefined/empty", () => {
    expect(formatOwnedPaths(null)).toBe("");
    expect(formatOwnedPaths(undefined)).toBe("");
    expect(formatOwnedPaths([])).toBe("");
  });
  it("returns '' when all entries collapse to empty after cleaning", () => {
    expect(formatOwnedPaths(["", "   ", " ( only commentary )"])).toBe("");
  });
  it("joins short list inline with ' · '", () => {
    expect(formatOwnedPaths(["foo/**", "bar.md"])).toBe("foo/** · bar.md");
  });
  it("strips parenthetical commentary on each glob", () => {
    expect(formatOwnedPaths(["foo/** (only writes)", "bar.md"])).toBe(
      "foo/** · bar.md",
    );
  });
  it("shows first + +N when joined exceeds maxChars", () => {
    const globs = [
      "src/pages/OpsPage.tsx",
      "src/pages/CallsTodayPage.tsx",
      "src/pages/TodayPage.tsx",
    ];
    expect(formatOwnedPaths(globs, 30)).toBe("src/pages/OpsPage.tsx · +2");
  });
  it("truncates a single long glob with ellipsis when it exceeds maxChars", () => {
    expect(
      formatOwnedPaths(["/srv/ops-vault/automation-registry/scripts/**/*.py"], 24),
    ).toBe("/srv/ops-vault/automati…");
  });
  it("no overflow suffix when single short glob fits", () => {
    expect(formatOwnedPaths(["foo"], 30)).toBe("foo");
  });
});

describe("heartbeatAgeLabelHe", () => {
  it("returns '' for null/undefined/negative/NaN", () => {
    expect(heartbeatAgeLabelHe(null)).toBe("");
    expect(heartbeatAgeLabelHe(undefined)).toBe("");
    expect(heartbeatAgeLabelHe(-1)).toBe("");
    expect(heartbeatAgeLabelHe(Number.NaN)).toBe("");
  });
  it("returns 'טרי' under 60s", () => {
    expect(heartbeatAgeLabelHe(0)).toBe("טרי");
    expect(heartbeatAgeLabelHe(59)).toBe("טרי");
  });
  it("returns minutes between 60s and 1h", () => {
    expect(heartbeatAgeLabelHe(60)).toBe("לפני 1 דק׳");
    expect(heartbeatAgeLabelHe(3599)).toBe("לפני 59 דק׳");
  });
  it("returns hours between 1h and 24h", () => {
    expect(heartbeatAgeLabelHe(3600)).toBe("לפני 1 שע׳");
    expect(heartbeatAgeLabelHe(86399)).toBe("לפני 23 שע׳");
  });
  it("returns days at 24h+", () => {
    expect(heartbeatAgeLabelHe(86400)).toBe("לפני 1 ימים");
    expect(heartbeatAgeLabelHe(172800)).toBe("לפני 2 ימים");
  });
});
