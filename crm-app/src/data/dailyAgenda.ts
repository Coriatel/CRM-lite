/**
 * Rabbi daily agenda (A4 Time Management — core).
 *
 * Derives the Rabbi's time-ordered daily plan from the EXISTING CRM-lite
 * substrate rather than a new calendar system: today's slice consumes
 * follow-up dates that already live on `contacts` (and, once applied,
 * `care_reports.followup_due`). Meetings and reminders are modelled as
 * first-class `AgendaItemKind`s so dedicated collections slot in later
 * without reshaping consumers.
 *
 * `buildDailyAgenda` is pure for unit testing; `fetchDailyAgenda` wraps it over
 * the Directus reader in `services/directus.ts`.
 *
 * Bucketing is by calendar date in UTC, matching the convention in
 * `donorSummary.ts`. Israel-local timezone refinement is a tracked follow-up.
 */

import {
  getContacts,
  getCareReports,
  getMeetings,
  getReminders,
  type DirectusContact,
  type DirectusCareReport,
  type DirectusMeeting,
  type DirectusReminder,
} from "../services/directus";

export type AgendaItemKind = "follow_up" | "care_followup" | "meeting" | "reminder";

export type AgendaBucket = "overdue" | "today" | "upcoming";

export interface AgendaSourceItem {
  id: string;
  kind: AgendaItemKind;
  title: string;
  /** ISO date ("YYYY-MM-DD") or datetime; null = not schedulable (excluded). */
  due: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  status?: string | null;
}

export interface AgendaItem extends AgendaSourceItem {
  bucket: AgendaBucket;
}

export interface DailyAgenda {
  /** The "today" reference date, YYYY-MM-DD (UTC). */
  date: string;
  overdue: AgendaItem[];
  today: AgendaItem[];
  upcoming: AgendaItem[];
  counts: { overdue: number; today: number; upcoming: number; total: number };
  generated_at: string;
  source: "substrate-derived";
}

export interface BuildDailyAgendaOptions {
  /** How many days ahead of today count as "upcoming". Default 7. */
  upcomingDays?: number;
}

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole-day difference (b - a) in UTC calendar days. */
function dayDiff(aDay: string, bDay: string): number {
  const a = Date.parse(`${aDay}T00:00:00Z`);
  const b = Date.parse(`${bDay}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function buildDailyAgenda(
  items: AgendaSourceItem[],
  now: Date = new Date(),
  opts: BuildDailyAgendaOptions = {},
): DailyAgenda {
  const upcomingDays = opts.upcomingDays ?? 7;
  const todayStr = dayString(now);

  const overdue: AgendaItem[] = [];
  const today: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];

  for (const it of items) {
    if (!it.due) continue; // not schedulable
    const dueDay = it.due.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) continue; // unparseable
    const diff = dayDiff(todayStr, dueDay);
    if (diff < 0) overdue.push({ ...it, bucket: "overdue" });
    else if (diff === 0) today.push({ ...it, bucket: "today" });
    else if (diff <= upcomingDays) upcoming.push({ ...it, bucket: "upcoming" });
    // beyond horizon -> excluded
  }

  const byDueThenTitle = (a: AgendaItem, b: AgendaItem): number => {
    const ad = a.due ?? "";
    const bd = b.due ?? "";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.title.localeCompare(b.title);
  };
  overdue.sort(byDueThenTitle);
  today.sort(byDueThenTitle);
  upcoming.sort(byDueThenTitle);

  return {
    date: todayStr,
    overdue,
    today,
    upcoming,
    counts: {
      overdue: overdue.length,
      today: today.length,
      upcoming: upcoming.length,
      total: overdue.length + today.length + upcoming.length,
    },
    generated_at: now.toISOString(),
    source: "substrate-derived",
  };
}

/** today + n calendar days, as YYYY-MM-DD (UTC). */
function addDaysUtc(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** A `contacts` row with a follow_up_date → a follow_up agenda item. */
export function contactFollowUpToItem(c: DirectusContact): AgendaSourceItem {
  return {
    id: `follow_up:${c.id}`,
    kind: "follow_up",
    title: c.full_name?.trim() || "Follow up",
    due: c.follow_up_date ?? null,
    contact_id: c.id,
    contact_name: c.full_name ?? null,
    status: c.call_status ?? null,
  };
}

/**
 * A pending `care_reports` row → a care_followup agenda item.
 *
 * PRIVACY: the pastoral `summary` is deliberately NOT mapped. The agenda is a
 * broad surface (RabbiDayCard on /today + /rabbi), so care items carry only a
 * generic title, due date, and contact_id for linking — never the summary.
 */
export function careFollowUpToItem(r: DirectusCareReport): AgendaSourceItem {
  return {
    id: `care_followup:${r.id}`,
    kind: "care_followup",
    title: "מעקב טיפול רוחני",
    due: r.followup_due ?? null,
    contact_id: r.contact_id,
    contact_name: null,
    status: r.followup_status ?? null,
  };
}

/**
 * A scheduled `meetings` row → a meeting agenda item, anchored on `starts_at`.
 *
 * PRIVACY: `notes` is deliberately not mapped (it is not even requested by the
 * reader). `title` does surface — meetings are owner-scoped at the reader
 * (`owner_id = $CURRENT_USER`), so only the viewer sees their own.
 */
export function meetingToItem(m: DirectusMeeting): AgendaSourceItem {
  return {
    id: `meeting:${m.id}`,
    kind: "meeting",
    title: m.title,
    due: m.starts_at ?? null,
    contact_id: m.contact_id ?? null,
    contact_name: null,
    status: m.status ?? null,
  };
}

/**
 * A pending `reminders` row → a reminder agenda item, anchored on `due_at`.
 * Same privacy + owner-scoping posture as meetings; `notes` never mapped.
 */
export function reminderToItem(r: DirectusReminder): AgendaSourceItem {
  return {
    id: `reminder:${r.id}`,
    kind: "reminder",
    title: r.title,
    due: r.due_at ?? null,
    contact_id: r.contact_id ?? null,
    contact_name: null,
    status: r.status ?? null,
  };
}

/**
 * Build the Rabbi daily agenda from live data. Four substrate sources are read
 * in parallel and merged before bucketing, all within [past .. today+upcomingDays]:
 * (1) `contacts.follow_up_date`, (2) pending `care_reports.followup_due`,
 * (3) scheduled `meetings.starts_at`, (4) pending `reminders.due_at`.
 * Meetings/reminders are owner-scoped at the reader (`owner_id = $CURRENT_USER`).
 */
export async function fetchDailyAgenda(
  now: Date = new Date(),
  opts: BuildDailyAgendaOptions = {},
): Promise<DailyAgenda> {
  const upcomingDays = opts.upcomingDays ?? 7;
  const horizon = addDaysUtc(now, upcomingDays);
  const [contacts, careReports, meetings, reminders] = await Promise.all([
    getContacts({ followUpBefore: horizon, limit: 500 }),
    getCareReports({ followupDueBefore: horizon }),
    getMeetings({ startsBefore: horizon, status: "scheduled" }),
    getReminders({ dueBefore: horizon, status: "pending" }),
  ]);
  const items: AgendaSourceItem[] = [
    ...contacts.filter((c) => c.follow_up_date).map(contactFollowUpToItem),
    ...careReports.filter((r) => r.followup_due).map(careFollowUpToItem),
    ...meetings.filter((m) => m.starts_at).map(meetingToItem),
    ...reminders.filter((r) => r.due_at).map(reminderToItem),
  ];
  return buildDailyAgenda(items, now, { upcomingDays });
}
