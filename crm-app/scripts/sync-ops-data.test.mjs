import { describe, expect, it } from "vitest";
import {
  ENVELOPE_DEFAULT_FILES,
  envelopeDefault,
  missingDefaultBytes,
} from "./sync-ops-data.mjs";
import { parseReceipts } from "../src/pages/OpsPage";

const FIXED_ISO = "2026-05-17T14:00:00.000Z";

describe("missingDefaultBytes", () => {
  it("returns bare '{}' for legacy files (unchanged behavior)", () => {
    expect(missingDefaultBytes("projects.json", FIXED_ISO)).toBe("{}");
    expect(missingDefaultBytes("queue_routes.json", FIXED_ISO)).toBe("{}");
    expect(missingDefaultBytes("operational_queue.json", FIXED_ISO)).toBe("{}");
  });

  it("returns truthful empty envelope for queue_plan.json", () => {
    const bytes = missingDefaultBytes("queue_plan.json", FIXED_ISO);
    const doc = JSON.parse(bytes);
    expect(doc).toMatchObject({
      _meta: {
        source: "missing",
        executor_inactive: true,
        generated_default: true,
        generated_at: FIXED_ISO,
        file: "queue_plan.json",
        writer: "scripts/sync-ops-data.mjs",
      },
      receipts: [],
    });
  });

  it("returns truthful empty envelope for queue_receipts.json", () => {
    const bytes = missingDefaultBytes("queue_receipts.json", FIXED_ISO);
    const doc = JSON.parse(bytes);
    expect(doc._meta.executor_inactive).toBe(true);
    expect(doc._meta.generated_default).toBe(true);
    expect(doc._meta.file).toBe("queue_receipts.json");
    expect(Array.isArray(doc.receipts)).toBe(true);
    expect(doc.receipts).toHaveLength(0);
  });
});

describe("envelopeDefault wire contract", () => {
  it("is consumed by OpsPage.parseReceipts as an empty receipts list", () => {
    const doc = envelopeDefault("queue_plan.json", FIXED_ISO);
    expect(parseReceipts(doc)).toEqual([]);
  });

  it("does not imply automation: receipts is empty, executor_inactive is true", () => {
    const doc = envelopeDefault("queue_receipts.json", FIXED_ISO);
    expect(doc.receipts).toEqual([]);
    expect(doc._meta.executor_inactive).toBe(true);
  });

  it("preserves explicit nowIso for deterministic output", () => {
    const a = envelopeDefault("queue_plan.json", FIXED_ISO);
    const b = envelopeDefault("queue_plan.json", FIXED_ISO);
    expect(a).toEqual(b);
  });
});

describe("ENVELOPE_DEFAULT_FILES", () => {
  it("covers exactly the two new envelope files", () => {
    expect(ENVELOPE_DEFAULT_FILES.has("queue_plan.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("queue_receipts.json")).toBe(true);
    expect(ENVELOPE_DEFAULT_FILES.has("queue_routes.json")).toBe(false);
    expect(ENVELOPE_DEFAULT_FILES.has("operational_queue.json")).toBe(false);
  });
});
