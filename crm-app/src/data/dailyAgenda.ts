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
 * `buildDailyAgenda` is pure for unit testing; a `fetchDailyAgenda` wrapper
 * over `services/directus.ts` lands in the next slice.
 *
 * Bucketing is by calendar date in UTC, matching the convention in
 * `donorSummary.ts`. Israel-local timezone refinement is a tracked follow-up.
 */

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
