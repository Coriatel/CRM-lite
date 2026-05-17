import { useCallback, useEffect, useState } from "react";
import {
  bucketAttention,
  loadAmutaAttention,
  type AttentionBuckets,
} from "./amutaAttention";
import { loadAmutaAttentionItems } from "./amutaAttentionItems";
import { loadAmutaAttentionProjection } from "./amutaAttentionProjection";

export interface UseAmutaAttention {
  buckets: AttentionBuckets | null;
  source: string | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export function useAmutaAttention(): UseAmutaAttention {
  const [buckets, setBuckets] = useState<AttentionBuckets | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const stored = await loadAmutaAttentionItems();
        if (cancelled) return;
        if (stored.items.length > 0) {
          setBuckets(bucketAttention(stored.items));
          setSource(stored.source);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to projection
      }
      try {
        const projection = await loadAmutaAttentionProjection();
        if (cancelled) return;
        if (projection.items.length > 0) {
          setBuckets(bucketAttention(projection.items));
          setSource(projection.source);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to mock
      }
      try {
        const payload = await loadAmutaAttention();
        if (cancelled) return;
        setBuckets(bucketAttention(payload.items));
        setSource(payload.source);
      } catch {
        if (!cancelled) setError("שגיאה בטעינת מוקדי תשומת לב");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { buckets, source, error, loading, refresh };
}
