import { describe, it, expect } from "vitest";
import { dependenciesSummary } from "./OpsPage";

describe("dependenciesSummary", () => {
  it("returns zero counts for null doc", () => {
    expect(dependenciesSummary(null)).toEqual({
      open: 0,
      resolved: 0,
      total: 0,
      errors: 0,
      failingChecks: 0,
    });
  });

  it("returns zero counts for empty dependencies", () => {
    expect(dependenciesSummary({ _meta: {}, dependencies: [] })).toEqual({
      open: 0,
      resolved: 0,
      total: 0,
      errors: 0,
      failingChecks: 0,
    });
  });

  it("counts resolved vs open by resolved flag", () => {
    const r = dependenciesSummary({
      dependencies: [
        { dependency_id: "a#1", resolved: true },
        { dependency_id: "a#2", resolved: false },
        { dependency_id: "a#3" },
      ],
    });
    expect(r.open).toBe(2);
    expect(r.resolved).toBe(1);
    expect(r.total).toBe(3);
  });

  it("counts failing checks only on unresolved deps", () => {
    const r = dependenciesSummary({
      dependencies: [
        // resolved with failing checks → not counted (history)
        {
          dependency_id: "a#1",
          resolved: true,
          checks_summary: { pass: 0, fail: 2, pending: 0, total: 2 },
        },
        // open with failing checks → counted
        {
          dependency_id: "a#2",
          resolved: false,
          checks_summary: { pass: 1, fail: 1, pending: 0, total: 2 },
        },
        // open with passing checks → not counted
        {
          dependency_id: "a#3",
          resolved: false,
          checks_summary: { pass: 3, fail: 0, pending: 0, total: 3 },
        },
      ],
    });
    expect(r.failingChecks).toBe(1);
  });

  it("surfaces _meta.errors count", () => {
    expect(
      dependenciesSummary({
        _meta: { errors: ["foo failed", "bar failed"] },
        dependencies: [],
      }).errors,
    ).toBe(2);
  });

  it("handles missing checks_summary safely", () => {
    const r = dependenciesSummary({
      dependencies: [{ dependency_id: "a#1", resolved: false }],
    });
    expect(r.failingChecks).toBe(0);
  });
});
