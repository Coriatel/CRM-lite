import { describe, it, expect } from "vitest";
import { MANUAL_CONFIG_FILES, isSchemaFile, stalenessEntries } from "./OpsPage";

const SEC_PER_HOUR = 3600;

describe("stalenessEntries", () => {
  it("returns [] when freshness doc is null or missing files", () => {
    expect(stalenessEntries(null, 6)).toEqual([]);
    expect(stalenessEntries({ files: undefined } as never, 6)).toEqual([]);
  });

  it("excludes files newer than threshold", () => {
    const out = stalenessEntries(
      {
        files: {
          "writer-a.json": { age_seconds: 2 * SEC_PER_HOUR }, // 2h fresh
        },
      } as never,
      6,
    );
    expect(out).toEqual([]);
  });

  it("includes writer-files older than threshold, sorted descending", () => {
    const out = stalenessEntries(
      {
        files: {
          "writer-a.json": { age_seconds: 50 * SEC_PER_HOUR },
          "writer-b.json": { age_seconds: 10 * SEC_PER_HOUR },
          "writer-c.json": { age_seconds: 1 * SEC_PER_HOUR }, // dropped
        },
      } as never,
      6,
    );
    expect(out.map((x) => x.name)).toEqual(["writer-a.json", "writer-b.json"]);
    expect(out[0].hours).toBe(50);
    expect(out[1].hours).toBe(10);
  });

  it("excludes MANUAL_CONFIG files regardless of age", () => {
    const out = stalenessEntries(
      {
        files: {
          "blockers.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "lanes.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "projects.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "processes.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "dependencies.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "services.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "cohorts.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "operational_graph.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "writer-x.json": { age_seconds: 7 * SEC_PER_HOUR },
        },
      } as never,
      6,
    );
    expect(out.map((x) => x.name)).toEqual(["writer-x.json"]);
  });

  it("excludes *.schema.json files regardless of age", () => {
    const out = stalenessEntries(
      {
        files: {
          "queue_item.schema.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "management_cockpit.schema.json": { age_seconds: 1000 * SEC_PER_HOUR },
          "writer-x.json": { age_seconds: 7 * SEC_PER_HOUR },
        },
      } as never,
      6,
    );
    expect(out.map((x) => x.name)).toEqual(["writer-x.json"]);
  });

  it("isSchemaFile recognises validator schemas by suffix", () => {
    expect(isSchemaFile("queue_item.schema.json")).toBe(true);
    expect(isSchemaFile("anything.schema.json")).toBe(true);
    expect(isSchemaFile("queue_item.json")).toBe(false);
    expect(isSchemaFile("schema.json")).toBe(false);
    expect(isSchemaFile("")).toBe(false);
  });

  it("MANUAL_CONFIG_FILES contract: all 8 known owner-config files are present", () => {
    expect(MANUAL_CONFIG_FILES.has("blockers.json")).toBe(true);
    expect(MANUAL_CONFIG_FILES.has("dependencies.json")).toBe(true);
    expect(MANUAL_CONFIG_FILES.has("lanes.json")).toBe(true);
    expect(MANUAL_CONFIG_FILES.has("projects.json")).toBe(true);
    expect(MANUAL_CONFIG_FILES.has("processes.json")).toBe(true);
    expect(MANUAL_CONFIG_FILES.has("services.json")).toBe(true);
    expect(MANUAL_CONFIG_FILES.has("cohorts.json")).toBe(true);
    expect(MANUAL_CONFIG_FILES.has("operational_graph.json")).toBe(true);
  });
});
