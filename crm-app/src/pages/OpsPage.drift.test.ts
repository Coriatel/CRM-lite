import { describe, it, expect } from "vitest";
import { driftLevel, ageLevel } from "./OpsPage";

describe("driftLevel", () => {
  it("returns 'none' when days is null", () => {
    expect(driftLevel(null)).toBe("none");
  });
  it("buckets by tiers", () => {
    expect(driftLevel(0)).toBe("fresh");
    expect(driftLevel(3)).toBe("fresh");
    expect(driftLevel(4)).toBe("soft");
    expect(driftLevel(7)).toBe("soft");
    expect(driftLevel(8)).toBe("amber");
    expect(driftLevel(14)).toBe("amber");
    expect(driftLevel(15)).toBe("red");
    expect(driftLevel(100)).toBe("red");
  });
});

describe("ageLevel", () => {
  it("treats null as ok", () => {
    expect(ageLevel(null)).toBe("ok");
  });
  it("buckets by tiers", () => {
    expect(ageLevel(0)).toBe("ok");
    expect(ageLevel(7)).toBe("ok");
    expect(ageLevel(8)).toBe("warn");
    expect(ageLevel(30)).toBe("warn");
    expect(ageLevel(31)).toBe("critical");
    expect(ageLevel(365)).toBe("critical");
  });
});
