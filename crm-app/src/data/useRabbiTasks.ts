import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createLocalTaskStore,
  effectiveStatus,
  type NewTaskInput,
  type RabbiTask,
  type TaskPatch,
  type TaskStore,
} from "./rabbiTasks";

const defaultStore = createLocalTaskStore();

/** +1 day from now, as ISO. */
function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

const PRIORITY_THEN_CREATED = (a: RabbiTask, b: RabbiTask): number =>
  a.priority - b.priority || b.createdAt.localeCompare(a.createdAt);

/**
 * Rabbi task runtime over the internal store. `store` is injectable so the
 * Directus-backed store can replace localStorage without touching consumers.
 */
export function useRabbiTasks(store: TaskStore = defaultStore) {
  const [tasks, setTasks] = useState<RabbiTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setTasks(await store.list());
    setLoading(false);
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: NewTaskInput) => {
      await store.create(input);
      await refresh();
    },
    [store, refresh],
  );

  const update = useCallback(
    async (id: string, patch: TaskPatch) => {
      await store.update(id, patch);
      await refresh();
    },
    [store, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await store.remove(id);
      await refresh();
    },
    [store, refresh],
  );

  const complete = useCallback((id: string) => update(id, { status: "done" }), [update]);
  const snooze = useCallback(
    (id: string, until: string = tomorrowIso()) => update(id, { status: "snoozed", snoozedUntil: until }),
    [update],
  );
  const reopen = useCallback((id: string) => update(id, { status: "open", snoozedUntil: null }), [update]);

  const active = useMemo(
    () => tasks.filter((t) => effectiveStatus(t) === "open").sort(PRIORITY_THEN_CREATED),
    [tasks],
  );
  const snoozed = useMemo(
    () => tasks.filter((t) => effectiveStatus(t) === "snoozed").sort(PRIORITY_THEN_CREATED),
    [tasks],
  );

  return { tasks, active, snoozed, loading, refresh, create, update, remove, complete, snooze, reopen };
}
