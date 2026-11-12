import { getAuthToken } from "../services/directus";

export interface WaContact {
  /** False when the number has no one-to-one chat: "no history available", not "zero messages". */
  match: boolean;
  last_at?: string;
  last_from?: "me" | "them";
  unavailable?: boolean;
}

/**
 * When and in which direction the last WhatsApp message went, for one phone number.
 * Metadata only. The server answers the account owner alone; for everyone else (403),
 * or where the route does not exist, this resolves to null and nothing is shown.
 */
export async function getWaContact(digits: string): Promise<WaContact | null> {
  const token = getAuthToken();
  if (!digits) return null;
  try {
    const res = await fetch(`/api/wa-contact?phone=${digits}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (res.status === 503) return { match: false, unavailable: true };
    if (!res.ok) return null;
    const d = await res.json();
    return d && typeof d.match === "boolean" ? (d as WaContact) : null;
  } catch {
    return null;
  }
}
