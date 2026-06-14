import { describe, it, expect } from "vitest";
import {
  catalogDistinct,
  filterCatalogAutomations,
  catalogFreshLevel,
  type CatalogAutomation,
} from "./OpsPage";

const rows: CatalogAutomation[] = [
  { id: "cron:a", name: "Alpha", platform: "cron", type: "scheduled", health: "healthy" },
  { id: "n8n:b", name: "Beta", platform: "n8n", type: "service", health: "degraded" },
  { id: "cron:c", name: "Gamma", platform: "cron", type: "scheduled", health: "failing" },
  { id: "pm2:d", name: "", platform: "pm2", type: undefined, health: "unknown" },
];

describe("catalogDistinct", () => {
  it("returns sorted distinct non-empty values", () => {
    expect(catalogDistinct(rows, (a) => a.platform)).toEqual(["cron", "n8n", "pm2"]);
    expect(catalogDistinct(rows, (a) => a.type)).toEqual(["scheduled", "service"]);
  });
});

describe("filterCatalogAutomations", () => {
  const base = { platform: "", type: "", health: "", query: "" };

  it("pass-through when all filters empty", () => {
    expect(filterCatalogAutomations(rows, base)).toHaveLength(4);
  });
  it("filters by platform", () => {
    expect(filterCatalogAutomations(rows, { ...base, platform: "cron" }).map((r) => r.id)).toEqual([
      "cron:a",
      "cron:c",
    ]);
  });
  it("filters by health", () => {
    expect(filterCatalogAutomations(rows, { ...base, health: "failing" }).map((r) => r.id)).toEqual([
      "cron:c",
    ]);
  });
  it("free-text matches id or name, case-insensitive", () => {
    expect(filterCatalogAutomations(rows, { ...base, query: "beta" }).map((r) => r.id)).toEqual(["n8n:b"]);
    expect(filterCatalogAutomations(rows, { ...base, query: "PM2" }).map((r) => r.id)).toEqual(["pm2:d"]);
  });
  it("combines filters (AND)", () => {
    expect(
      filterCatalogAutomations(rows, { ...base, platform: "cron", type: "scheduled", query: "gamma" }).map(
        (r) => r.id,
      ),
    ).toEqual(["cron:c"]);
  });
});

describe("catalogFreshLevel", () => {
  const now = new Date("2026-06-14T12:00:00Z");
  it("unknown for null/invalid", () => {
    expect(catalogFreshLevel(null, now)).toBe("unknown");
    expect(catalogFreshLevel("not-a-date", now)).toBe("unknown");
  });
  it("fresh under 6h", () => {
    expect(catalogFreshLevel("2026-06-14T09:00:00Z", now)).toBe("fresh");
  });
  it("aging 6-48h", () => {
    expect(catalogFreshLevel("2026-06-13T12:00:00Z", now)).toBe("aging");
  });
  it("stale over 48h", () => {
    expect(catalogFreshLevel("2026-06-10T12:00:00Z", now)).toBe("stale");
  });
});
