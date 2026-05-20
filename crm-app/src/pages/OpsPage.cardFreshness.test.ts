import { describe, it, expect } from "vitest";
import { cardFreshLevel } from "./OpsPage";

describe("cardFreshLevel", () => {
  it("returns 'unknown' when age is null or undefined", () => {
    expect(cardFreshLevel(null)).toBe("unknown");
    expect(cardFreshLevel(undefined)).toBe("unknown");
  });
  it("buckets by tiers (6h aging / 48h stale)", () => {
    expect(cardFreshLevel(0)).toBe("fresh");
    expect(cardFreshLevel(60)).toBe("fresh");
    expect(cardFreshLevel(6 * 3600 - 1)).toBe("fresh");
    expect(cardFreshLevel(6 * 3600)).toBe("aging");
    expect(cardFreshLevel(24 * 3600)).toBe("aging");
    expect(cardFreshLevel(48 * 3600 - 1)).toBe("aging");
    expect(cardFreshLevel(48 * 3600)).toBe("stale");
    expect(cardFreshLevel(7 * 86400)).toBe("stale");
  });
});
