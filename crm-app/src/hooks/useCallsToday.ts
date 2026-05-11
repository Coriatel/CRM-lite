import { useCallback, useEffect, useState } from "react";
import {
  getCallQueueInRange,
  DirectusCallQueueItem,
} from "../services/directus";
import { todayWindowIsrael } from "../utils/dateWindow";

export interface CallsTodayBuckets {
  today: DirectusCallQueueItem[];
  overdue: DirectusCallQueueItem[];
}

export interface UseCallsTodayResult {
  buckets: CallsTodayBuckets | null;
  error: string | null;
  refresh: () => void;
}

// Shared source of truth for "pending calls due today + overdue" used by both
// the Today dashboard card and the /calls-today page. Keeps the date-window
// math and filter shape in one place so the two views never drift.
export function useCallsToday(softCap: number = 100): UseCallsTodayResult {
  const [buckets, setBuckets] = useState<CallsTodayBuckets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setError(null);
    setBuckets(null);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { startIso, endIso } = todayWindowIsrael();
        const [today, overdue] = await Promise.all([
          getCallQueueInRange({
            status: "pending",
            fromInclusive: startIso,
            toExclusive: endIso,
            limit: softCap,
          }),
          getCallQueueInRange({
            status: "pending",
            toExclusive: startIso,
            limit: softCap,
          }),
        ]);
        if (cancelled) return;
        setBuckets({ today, overdue });
      } catch {
        if (!cancelled) setError("שגיאה בטעינת תור השיחות");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, softCap]);

  return { buckets, error, refresh };
}
