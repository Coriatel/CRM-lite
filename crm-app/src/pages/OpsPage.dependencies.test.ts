import { describe, it, expect } from "vitest";
import {
  classifyDependenciesForOperator,
  dependenciesSummary,
} from "./OpsPage";

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

describe("classifyDependenciesForOperator", () => {
  it("returns null when no deps and no collection errors", () => {
    expect(
      classifyDependenciesForOperator(dependenciesSummary(null)),
    ).toBeNull();
    expect(
      classifyDependenciesForOperator(
        dependenciesSummary({ _meta: {}, dependencies: [] }),
      ),
    ).toBeNull();
  });

  it("collection_errors wins when _meta.errors > 0, even with no deps", () => {
    const v = classifyDependenciesForOperator(
      dependenciesSummary({
        _meta: { errors: ["read failed: api 502"] },
        dependencies: [],
      }),
    )!;
    expect(v.severity).toBe("action");
    expect(v.topCategory).toBe("collection_errors");
    expect(v.errors).toBe(1);
    expect(v.headline).toContain("(1)");
  });

  it("collection_errors wins over failing_checks", () => {
    const v = classifyDependenciesForOperator(
      dependenciesSummary({
        _meta: { errors: ["x"] },
        dependencies: [
          {
            dependency_id: "a#1",
            resolved: false,
            checks_summary: { pass: 0, fail: 1, pending: 0, total: 1 },
          },
        ],
      }),
    )!;
    expect(v.topCategory).toBe("collection_errors");
  });

  it("failing_checks → action when no errors and at least one open dep failing", () => {
    const v = classifyDependenciesForOperator(
      dependenciesSummary({
        dependencies: [
          {
            dependency_id: "a#1",
            resolved: false,
            checks_summary: { pass: 1, fail: 2, pending: 0, total: 3 },
          },
          {
            dependency_id: "a#2",
            resolved: false,
            checks_summary: { pass: 3, fail: 0, pending: 0, total: 3 },
          },
        ],
      }),
    )!;
    expect(v.severity).toBe("action");
    expect(v.topCategory).toBe("failing_checks");
    expect(v.failingChecks).toBe(1);
    expect(v.open).toBe(2);
    expect(v.headline).toContain("(1)");
  });

  it("open_only → watch when open deps exist and all checks pass", () => {
    const v = classifyDependenciesForOperator(
      dependenciesSummary({
        dependencies: [
          { dependency_id: "a#1", resolved: false },
          {
            dependency_id: "a#2",
            resolved: false,
            checks_summary: { pass: 5, fail: 0, pending: 0, total: 5 },
          },
        ],
      }),
    )!;
    expect(v.severity).toBe("watch");
    expect(v.topCategory).toBe("open_only");
    expect(v.open).toBe(2);
    expect(v.failingChecks).toBe(0);
    expect(v.headline).toContain("(2)");
  });

  it("all_resolved → info when total > 0 but nothing open", () => {
    const v = classifyDependenciesForOperator(
      dependenciesSummary({
        dependencies: [
          { dependency_id: "a#1", resolved: true },
          { dependency_id: "a#2", resolved: true },
        ],
      }),
    )!;
    expect(v.severity).toBe("info");
    expect(v.topCategory).toBe("all_resolved");
    expect(v.resolved).toBe(2);
    expect(v.open).toBe(0);
    expect(v.headline).toContain("(2)");
  });

  it("resolved deps with old failing-check history are not action", () => {
    // failing checks on resolved deps don't count — they were fixed before merge
    const v = classifyDependenciesForOperator(
      dependenciesSummary({
        dependencies: [
          {
            dependency_id: "a#1",
            resolved: true,
            checks_summary: { pass: 0, fail: 3, pending: 0, total: 3 },
          },
        ],
      }),
    )!;
    expect(v.topCategory).toBe("all_resolved");
    expect(v.severity).toBe("info");
  });

  it("Hebrew strings present for every category", () => {
    const variants = [
      // collection_errors
      classifyDependenciesForOperator(
        dependenciesSummary({
          _meta: { errors: ["x"] },
          dependencies: [],
        }),
      )!,
      // failing_checks
      classifyDependenciesForOperator(
        dependenciesSummary({
          dependencies: [
            {
              dependency_id: "a#1",
              resolved: false,
              checks_summary: { pass: 0, fail: 1, pending: 0, total: 1 },
            },
          ],
        }),
      )!,
      // open_only
      classifyDependenciesForOperator(
        dependenciesSummary({
          dependencies: [{ dependency_id: "a#1", resolved: false }],
        }),
      )!,
      // all_resolved
      classifyDependenciesForOperator(
        dependenciesSummary({
          dependencies: [{ dependency_id: "a#1", resolved: true }],
        }),
      )!,
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
});
