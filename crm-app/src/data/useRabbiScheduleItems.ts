import { useCallback, useEffect, useState } from "react";
import {
  getMeetings,
  getReminders,
  type DirectusMeeting,
  type DirectusReminder,
} from "../services/directus";

// Full-row management feed for the Rabbi schedule surface (A7 Phase 4). Unlike
// the daily agenda (lossy: id/title/due/kind), this reads the complete
// scheduled meetings + pending reminders so rows can be edited without
// null-overwriting unset fields. Owner-scoped server-side ($CURRENT_USER).
// PRIVACY: getMeetings/getReminders never request `notes` — pastoral notes do
// not enter this surface.
export interface UseRabbiScheduleItems {
  meetings: DirectusMeeting[] | null;
  reminders: DirectusReminder[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRabbiScheduleItems(): UseRabbiScheduleItems {
  const [meetings, setMeetings] = useState<DirectusMeeting[] | null>(null);
  const [reminders, setReminders] = useState<DirectusReminder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [m, r] = await Promise.all([
          getMeetings({ status: "scheduled" }),
          getReminders({ status: "pending" }),
        ]);
        if (cancelled) return;
        setMeetings(m);
        setReminders(r);
      } catch {
        if (!cancelled) setError("שגיאה בטעינת לוח הזמנים");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { meetings, reminders, loading, error, refresh };
}
