import { useCallback, useEffect, useState } from "react";
import {
  getCallQueueInRange,
  DirectusCallQueueItem,
} from "../services/directus";
import {
  israelDateStr,
  agendaDayStrs,
  assembleSchedule,
  type AssembledSchedule,
} from "../utils/scheduleWindow";

export type RabbiSchedule = AssembledSchedule<DirectusCallQueueItem>;

export interface UseRabbiScheduleResult {
  schedule: RabbiSchedule | null;
  error: string | null;
  refresh: () => void;
}

// Forward-looking agenda for the Rabbi: pending call_queue work bucketed into an
// overdue list plus one bucket per day across the next `daysCount` days. Reuses
// getCallQueueInRange (same source as the Today card) so the schedule never
// drifts from the today/overdue numbers shown elsewhere.
export function useRabbiSchedule(
  daysCount: number = 7,
  softCap: number = 200,
): UseRabbiScheduleResult {
  const [schedule, setSchedule] = useState<RabbiSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setError(null);
    setSchedule(null);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const at = new Date();
        const todayStr = israelDateStr(at);
        // Exclusive upper bound = the day after the last agenda day. scheduled_date
        // is a DATE column, so date-string bounds filter exactly on day.
        const window = agendaDayStrs(daysCount + 1, at);
        const endExclusive = window[window.length - 1];
        const [upcoming, overdue] = await Promise.all([
          getCallQueueInRange({
            status: "pending",
            fromInclusive: todayStr,
            toExclusive: endExclusive,
            limit: softCap,
          }),
          getCallQueueInRange({
            status: "pending",
            toExclusive: todayStr,
            limit: softCap,
          }),
        ]);
        if (cancelled) return;
        setSchedule(assembleSchedule(upcoming, overdue, daysCount, at));
      } catch {
        if (!cancelled) setError("שגיאה בטעינת לוח הזמנים");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, daysCount, softCap]);

  return { schedule, error, refresh };
}
