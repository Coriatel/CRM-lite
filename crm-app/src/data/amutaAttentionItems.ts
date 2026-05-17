import {
  getAttentionItems,
  type DirectusAttentionItem,
} from "../services/directus";
import type { AttentionItem, AttentionPayload } from "./amutaAttention";

export function mapDirectusAttentionItem(
  row: DirectusAttentionItem,
): AttentionItem {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    urgency: row.urgency,
    status: row.status,
    domain: row.domain,
    next_action: row.next_action,
    href: row.href ?? undefined,
  };
}

/**
 * Phase 6c read-through: load attention from the persisted attention_items
 * collection. Returns an empty payload when the collection has no visible
 * rows so the caller can fall through to the projection / mock loaders.
 */
export async function loadAmutaAttentionItems(): Promise<AttentionPayload> {
  const rows = await getAttentionItems();
  return {
    ts: new Date().toISOString(),
    source: "directus",
    items: rows.map(mapDirectusAttentionItem),
  };
}
