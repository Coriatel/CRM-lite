const DAY = 86_400_000;

/** +972501234567 -> 050-123-4567. Placeholder phones (no real number) -> "". */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164 || e164.startsWith("_no_phone_")) return "";
  const local = e164.startsWith("+972") ? "0" + e164.slice(4) : e164;
  const m = /^(0\d{2})(\d{3})(\d{4})$/.exec(local);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : local;
}

/** tel: target for a stored phone, or "" when there is no real number. */
export function telHref(e164: string | null | undefined): string {
  return !e164 || e164.startsWith("_no_phone_") ? "" : `tel:${e164}`;
}

/** WhatsApp chat link for a stored phone, or "" when it is not a mobile number we can address.
 *  Builds the international form for the link only; the stored number is never changed. */
export function waHref(phone: string | null | undefined): string {
  if (!phone || phone.startsWith("_no_phone_")) return "";
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "972" + d.slice(1);
  if (d.startsWith("972") && !/^9725\d{8}$/.test(d)) return ""; // Israeli landline: no WhatsApp
  return /^\d{9,15}$/.test(d) ? `https://wa.me/${d}` : "";
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole local days from `iso` to `now` (0 = today, 1 = yesterday). */
export function daysAgo(iso: string, now: Date = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
}

/** "היום" / "אתמול" / "לפני N ימים" / "לפני N חודשים" / full date beyond a year. */
export function relDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const n = daysAgo(iso, now);
  if (n <= 0) return "היום";
  if (n === 1) return "אתמול";
  if (n === 2) return "לפני יומיים";
  if (n < 31) return `לפני ${n} ימים`;
  if (n < 61) return "לפני חודש";
  if (n < 365) return `לפני ${Math.floor(n / 30)} חודשים`;
  return fullDate(iso);
}

/** 24.9.2026 */
export function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

const CLASSIFICATION: Record<string, string> = {
  donor: "תורם/ת",
  lead: "מתעניין/ת",
};

export function classificationLabel(value: string | null | undefined): string {
  if (!value) return "";
  return CLASSIFICATION[value] ?? value;
}

export function shekels(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} ₪`;
}

export interface Freshness {
  /** Date of the newest record, as text; "" when there are no records. */
  until: string;
  stale: boolean;
  label: string;
}

const STALE_AFTER_DAYS = 7;

/**
 * How current a data set is, judged from its own newest record and not from
 * when the page was loaded. Money screens show this next to every total.
 */
export function freshness(latestIso: string | null | undefined, now: Date = new Date()): Freshness {
  if (!latestIso) return { until: "", stale: true, label: "אין נתונים" };
  const until = fullDate(latestIso);
  const age = daysAgo(latestIso, now);
  if (age < 0) return { until, stale: true, label: `נתונים עד ${until} · תאריך עתידי, לבדיקה` };
  if (age <= STALE_AFTER_DAYS) return { until, stale: false, label: `נתונים עד ${until}` };
  return { until, stale: true, label: `נתונים עד ${until} · לא התעדכנו מאז (${age} ימים)` };
}
