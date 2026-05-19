import { describe, it, expect } from "vitest";
import {
  activeOwnerGates,
  classifyOwnerGatesForOperator,
  plainifyGate,
} from "./OpsPage";

describe("plainifyGate", () => {
  it("drops strikethrough segments entirely", () => {
    expect(plainifyGate("~~resolved decision~~")).toBe("");
  });
  it("unwraps bold and inline code without losing inner text", () => {
    expect(plainifyGate("**Option A** with `cohorts` enum")).toBe(
      "Option A with cohorts enum",
    );
  });
  it("collapses whitespace runs", () => {
    expect(plainifyGate("foo    bar\n\tbaz")).toBe("foo bar baz");
  });
});

describe("activeOwnerGates", () => {
  it("returns [] for empty input", () => {
    expect(activeOwnerGates([])).toEqual([]);
  });
  it("drops entries that collapse to empty after plainify", () => {
    expect(activeOwnerGates(["~~done~~", "real gate"])).toEqual(["real gate"]);
  });
  it("preserves entry order for survivors", () => {
    expect(
      activeOwnerGates(["first", "~~resolved~~", "second", "third"]),
    ).toEqual(["first", "second", "third"]);
  });
});

describe("classifyOwnerGatesForOperator", () => {
  it("returns null when no gates", () => {
    expect(classifyOwnerGatesForOperator([])).toBeNull();
  });

  it("returns null when every gate is fully resolved", () => {
    expect(
      classifyOwnerGatesForOperator(["~~one~~", "~~two~~"]),
    ).toBeNull();
  });

  it("single pending gate → watch / pending, count=1", () => {
    const v = classifyOwnerGatesForOperator(["choose schema A or B"])!;
    expect(v.severity).toBe("watch");
    expect(v.topCategory).toBe("pending");
    expect(v.count).toBe(1);
    expect(v.headline).toContain("אחת");
  });

  it("2-4 pending gates → watch / pending with count in headline", () => {
    const v = classifyOwnerGatesForOperator(["a", "b", "c", "d"])!;
    expect(v.severity).toBe("watch");
    expect(v.topCategory).toBe("pending");
    expect(v.count).toBe(4);
    expect(v.headline).toContain("(4)");
  });

  it("5+ pending gates → action / backlog with count in headline", () => {
    const v = classifyOwnerGatesForOperator([
      "a",
      "b",
      "c",
      "d",
      "e",
    ])!;
    expect(v.severity).toBe("action");
    expect(v.topCategory).toBe("backlog");
    expect(v.count).toBe(5);
    expect(v.headline).toContain("(5)");
  });

  it("resolved entries are not counted toward backlog threshold", () => {
    // 4 resolved + 1 real = pending, not backlog
    const v = classifyOwnerGatesForOperator([
      "real",
      "~~r1~~",
      "~~r2~~",
      "~~r3~~",
      "~~r4~~",
    ])!;
    expect(v.severity).toBe("watch");
    expect(v.topCategory).toBe("pending");
    expect(v.count).toBe(1);
  });

  it("Hebrew strings present for every category", () => {
    const variants = [
      classifyOwnerGatesForOperator(["one"])!,
      classifyOwnerGatesForOperator(["one", "two"])!,
      classifyOwnerGatesForOperator(["a", "b", "c", "d", "e", "f"])!,
    ];
    for (const v of variants) {
      expect(v.headline.length).toBeGreaterThan(0);
      expect(v.meaning.length).toBeGreaterThan(0);
      expect(v.nextAction.length).toBeGreaterThan(0);
      // Hebrew Unicode block 0590–05FF
      expect(/[֐-׿]/.test(v.headline)).toBe(true);
      expect(/[֐-׿]/.test(v.meaning)).toBe(true);
      expect(/[֐-׿]/.test(v.nextAction)).toBe(true);
    }
  });

  it("the backlog threshold is strictly >=5 (4 is still pending)", () => {
    const four = classifyOwnerGatesForOperator(["a", "b", "c", "d"])!;
    const five = classifyOwnerGatesForOperator(["a", "b", "c", "d", "e"])!;
    expect(four.topCategory).toBe("pending");
    expect(five.topCategory).toBe("backlog");
  });
});
