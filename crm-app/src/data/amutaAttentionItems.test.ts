import { describe, it, expect } from "vitest";
import { mapDirectusAttentionItem } from "./amutaAttentionItems";
import type { DirectusAttentionItem } from "../services/directus";

const row = (over: Partial<DirectusAttentionItem>): DirectusAttentionItem =>
  ({
    id: "ai-1",
    title: "אישור תקציב",
    owner: "elron",
    urgency: "high",
    status: "waiting",
    domain: "finance",
    next_action: "לעבור על טבלת תקציב",
    href: "/dashboard",
    source: "manual",
    source_ref: null,
    pinned: false,
    snoozed_until: null,
    dismissed_at: null,
    note: null,
    ...over,
  }) as DirectusAttentionItem;

describe("mapDirectusAttentionItem", () => {
  it("maps required fields straight through", () => {
    const item = mapDirectusAttentionItem(row({}));
    expect(item).toEqual({
      id: "ai-1",
      title: "אישור תקציב",
      owner: "elron",
      urgency: "high",
      status: "waiting",
      domain: "finance",
      next_action: "לעבור על טבלת תקציב",
      href: "/dashboard",
    });
  });

  it("normalizes null href to undefined so optional UI props stay tidy", () => {
    const item = mapDirectusAttentionItem(row({ href: null }));
    expect(item.href).toBeUndefined();
  });

  it("preserves projection-source rows so they sort with manual rows", () => {
    const item = mapDirectusAttentionItem(
      row({ source: "projection", source_ref: "followup:c1" }),
    );
    expect(item.id).toBe("ai-1");
    expect(item.owner).toBe("elron");
  });
});
