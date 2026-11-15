import { useCallback, useEffect, useState } from "react";
import { getFollowUpCandidates, type DirectusContact } from "../services/directus";

/**
 * People waiting for the Rabbi to make contact: contacts whose follow_up_date
 * is due (<= today) and status != inactive. Reuses the proven
 * getFollowUpCandidates reader (RPOS Phase 1, reconcile-and-wire — no new
 * service code). Mirrors useDailyAgenda's loading/error/refresh shape.
 */
export interface UsePeopleWaiting {
  people: DirectusContact[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePeopleWaiting(limit = 20): UsePeopleWaiting {
  const [people, setPeople] = useState<DirectusContact[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const next = await getFollowUpCandidates(limit);
        if (!cancelled) setPeople(next);
      } catch {
        if (!cancelled) setError("שגיאה בטעינת אנשים שממתינים");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, limit]);

  return { people, loading, error, refresh };
}
