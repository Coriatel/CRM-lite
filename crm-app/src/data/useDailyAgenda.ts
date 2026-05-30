import { useCallback, useEffect, useState } from "react";
import {
  fetchDailyAgenda,
  type DailyAgenda,
  type BuildDailyAgendaOptions,
} from "./dailyAgenda";

export interface UseDailyAgenda {
  agenda: DailyAgenda | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDailyAgenda(opts: BuildDailyAgendaOptions = {}): UseDailyAgenda {
  const [agenda, setAgenda] = useState<DailyAgenda | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const upcomingDays = opts.upcomingDays;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const next = await fetchDailyAgenda(new Date(), { upcomingDays });
        if (!cancelled) setAgenda(next);
      } catch {
        if (!cancelled) setError("שגיאה בטעינת סדר היום");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, upcomingDays]);

  return { agenda, loading, error, refresh };
}
