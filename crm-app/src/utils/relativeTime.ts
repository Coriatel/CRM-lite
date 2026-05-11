// Hebrew-friendly relative time. Returns short labels meant for dense rows,
// not full sentences. Always rounds toward the closer unit so "23 שעות" stays
// in hours rather than flipping to "yesterday" before the wall day rolls over.

const RTF = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

export function relativeFromNow(
  iso: string | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.round((t - now.getTime()) / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return RTF.format(diffSec, "second");
  if (absSec < 3600) return RTF.format(Math.round(diffSec / 60), "minute");
  if (absSec < 86400) return RTF.format(Math.round(diffSec / 3600), "hour");
  if (absSec < 86400 * 7)
    return RTF.format(Math.round(diffSec / 86400), "day");
  if (absSec < 86400 * 30)
    return RTF.format(Math.round(diffSec / (86400 * 7)), "week");
  if (absSec < 86400 * 365)
    return RTF.format(Math.round(diffSec / (86400 * 30)), "month");
  return RTF.format(Math.round(diffSec / (86400 * 365)), "year");
}

// Local-time clock fragment like "14:30" in Israel time. Useful for
// today-bucketed rows where the day is implied.
export function clockIsrael(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
