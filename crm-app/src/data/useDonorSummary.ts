import { useCallback, useEffect, useState } from "react";
import { fetchDonorSummary, type DonorSummaryFeed } from "./donorSummary";
import { getReceiptTransactionIds } from "../services/directus";

export interface UseDonorSummary {
  feed: DonorSummaryFeed | null;
  loading: boolean;
  error: string | null;
  missingReceiptIds: Set<string> | null;
  refresh: () => void;
}

const DEFAULT_TOP_N = 5;

export function useDonorSummary(topN: number = DEFAULT_TOP_N): UseDonorSummary {
  const [feed, setFeed] = useState<DonorSummaryFeed | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [missingReceiptIds, setMissingReceiptIds] = useState<Set<string> | null>(
    null,
  );
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMissingReceiptIds(null);
    (async () => {
      let nextFeed: DonorSummaryFeed | null = null;
      try {
        nextFeed = await fetchDonorSummary();
        if (!cancelled) setFeed(nextFeed);
      } catch {
        if (!cancelled) setError("שגיאה בטעינת נתוני תרומות");
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
      // Receipts-merge is best-effort: failure here must NOT block the feed.
      // The badge is omitted when missingReceiptIds stays null.
      try {
        const topIds = nextFeed.donors
          .slice(0, topN)
          .map((d) => d.last_gift_transaction_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        const present = await getReceiptTransactionIds(topIds);
        if (cancelled) return;
        const missing = new Set(topIds.filter((id) => !present.has(id)));
        setMissingReceiptIds(missing);
      } catch {
        // swallow — badge degrades to omitted, feed stays usable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, topN]);

  return { feed, loading, error, missingReceiptIds, refresh };
}
