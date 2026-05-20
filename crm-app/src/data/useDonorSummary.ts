import { useCallback, useEffect, useState } from "react";
import { fetchDonorSummary, type DonorSummaryFeed } from "./donorSummary";

export interface UseDonorSummary {
  feed: DonorSummaryFeed | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDonorSummary(): UseDonorSummary {
  const [feed, setFeed] = useState<DonorSummaryFeed | null>(null);
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
        const next = await fetchDonorSummary();
        if (!cancelled) setFeed(next);
      } catch {
        if (!cancelled) setError("שגיאה בטעינת נתוני תרומות");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { feed, loading, error, refresh };
}
