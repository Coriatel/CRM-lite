import { useCallback, useEffect, useState } from "react";

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  /** True once the load resolved, also when the value itself is null. */
  loaded: boolean;
  reload: () => void;
}

/** Load one thing; each section of a screen loads and fails on its own. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoaded(false);
    load()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoaded(true);
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loaded, reload };
}
