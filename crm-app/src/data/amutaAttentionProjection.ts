import type { DirectusContact } from "../services/directus";
import {
  getFollowUpCandidates,
  getContacts,
} from "../services/directus";
import type {
  AttentionContext,
  AttentionItem,
  AttentionPayload,
} from "./amutaAttention";

const STALE_DAYS = 7;
const PROJECTION_LIMIT = 8;

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function contactTitle(c: DirectusContact): string {
  return c.full_name || c.first_name || c.phone_e164 || c.id;
}

interface ProjectInput {
  followUpCandidates: DirectusContact[];
  neverCalled: DirectusContact[];
  today: string;
}

export function projectFromContacts(input: ProjectInput): AttentionItem[] {
  const { followUpCandidates, neverCalled, today } = input;
  const items: AttentionItem[] = [];

  for (const c of followUpCandidates.slice(0, PROJECTION_LIMIT)) {
    const due = c.follow_up_date;
    const overdueDays =
      due ? Math.max(0, daysBetween(due, today)) : undefined;
    const stale = overdueDays !== undefined && overdueDays > STALE_DAYS;
    const noteSuffix = c.follow_up_note ? ` — ${c.follow_up_note}` : "";
    const context: AttentionContext = {
      person_name: contactTitle(c),
      phone: c.phone_e164,
      last_call_date: c.last_call_date,
      follow_up_date: due,
      interest_level: c.interest_level,
      why_now:
        overdueDays === undefined
          ? "מעקב פתוח ללא תאריך יעד"
          : overdueDays === 0
            ? "תאריך מעקב להיום"
            : `איחור של ${overdueDays} ימים מתאריך מעקב`,
      recommended_step: c.phone_e164
        ? `להתקשר ל־${c.phone_e164}`
        : "לפתוח כרטיס איש קשר",
    };
    items.push({
      id: `followup:${c.id}`,
      title: `מעקב: ${contactTitle(c)}`,
      owner: "elron",
      urgency: stale ? "high" : "normal",
      status: stale ? "stale" : "waiting",
      domain: "people",
      next_action: due
        ? `יעד מעקב ${due}${noteSuffix}`
        : `לעקוב${noteSuffix}`,
      href: "/people",
      context,
    });
  }

  for (const c of neverCalled.slice(0, PROJECTION_LIMIT)) {
    const interest = c.interest_level ?? 0;
    const hot = interest >= 4;
    const context: AttentionContext = {
      person_name: contactTitle(c),
      phone: c.phone_e164,
      last_call_date: c.last_call_date,
      follow_up_date: c.follow_up_date,
      interest_level: c.interest_level,
      why_now: hot
        ? `מעולם לא הותקשר; רמת עניין ${interest}`
        : "מעולם לא הותקשר",
      recommended_step: c.phone_e164
        ? `להתקשר ל־${c.phone_e164}`
        : "להשיג מספר טלפון",
    };
    items.push({
      id: `firstcontact:${c.id}`,
      title: `יצירת קשר ראשונית: ${contactTitle(c)}`,
      owner: "rav",
      urgency: hot ? "high" : "normal",
      status: "open",
      domain: "people",
      next_action: c.phone_e164
        ? `להתקשר ל־${c.phone_e164}`
        : "ליצור קשר ראשון",
      href: "/people",
      context,
    });
  }

  return items;
}

export async function loadAmutaAttentionProjection(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<AttentionPayload> {
  const [followUpCandidates, neverCalled] = await Promise.all([
    getFollowUpCandidates(PROJECTION_LIMIT),
    getContacts({
      neverCalled: true,
      limit: PROJECTION_LIMIT,
      sort: "-interest_level",
    }),
  ]);
  const items = projectFromContacts({
    followUpCandidates,
    neverCalled,
    today,
  });
  return {
    ts: new Date().toISOString(),
    source: "projection",
    items,
  };
}
