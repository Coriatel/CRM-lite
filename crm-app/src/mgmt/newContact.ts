import {
  createContact,
  findContactByPhone,
  getTags,
  setContactTags,
} from "../services/directus";
import { IS_DEMO_MODE } from "../config";
import type { Contact } from "../types";

export type NewContactResult =
  | { kind: "created"; id: string; name: string }
  | { kind: "exists"; id: string; name: string }
  | { kind: "untagged"; id: string; name: string };

/**
 * Saves a new contact so that trying again can never create it twice.
 *
 * The save has two server steps (the contact, then its category tag). If the
 * tag step fails the contact is reported as saved-but-untagged and only the tag
 * step can be repeated (retryTag), so the contact is never posted twice. A phone
 * whose exact stored text already belongs to a contact is reported instead of
 * saved. Stored values are the same as on the old screen.
 *
 * Not covered: a create that reached the server while its answer was lost.
 */
export function newContactSaver() {
  let saved: { id: string; name: string; tagName: string } | null = null;

  async function tag(): Promise<NewContactResult> {
    const s = saved!;
    try {
      const found = (await getTags()).find((t) => t.name === s.tagName);
      if (found) await setContactTags(s.id, [found.id]);
    } catch {
      return { kind: "untagged", id: s.id, name: s.name };
    }
    saved = null;
    return { kind: "created", id: s.id, name: s.name };
  }

  return {
    async save(data: Partial<Contact>): Promise<NewContactResult> {
      const name = (data.fullName ?? "").trim();
      // Stored exactly as typed, as the old screen does: no trimming, no reformatting.
      const phone = data.phone1 ?? "";
      if (IS_DEMO_MODE) return { kind: "created", id: "", name };
      // Every save through the form is a new person. A half-finished earlier
      // save is finished only through retryTag(), never by matching name and phone.
      saved = null;
      {
        if (phone) {
          const existing = await findContactByPhone(phone);
          if (existing) return { kind: "exists", id: existing.id, name: existing.full_name };
        }
        const parts = name.split(" ");
        const created = await createContact({
          full_name: name,
          first_name: parts[0] || "",
          last_name: parts.slice(1).join(" ") || "",
          phone_e164: phone || `_no_phone_${crypto.randomUUID()}`,
          phone2: data.phone2 || "",
          email: data.email || "",
          call_status: "not_checked",
          original_note: data.originalNote || "",
        });
        saved = { id: created.id, name, tagName: data.source || "אנשי_קשר" };
      }
      return tag();
    },
    /** Repeat only the category step for a contact that is already saved. */
    retryTag(): Promise<NewContactResult> | null {
      return saved ? tag() : null;
    },
  };
}
