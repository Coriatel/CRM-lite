import { useState, useEffect, useCallback } from "react";
import {
  getCallQueue as fetchQueue,
  createCallQueueItem as postQueueItem,
  batchCreateCallQueueItems,
  updateCallQueueItem as patchQueueItem,
  getContacts,
  DirectusCallQueueItem,
} from "../services/directus";
import { IS_DEMO_MODE } from "../config";

export interface CallQueueItem {
  id: string;
  contactId: string;
  projectId?: string;
  assignedTo?: string;
  priority: number;
  scheduledDate?: string;
  status: "pending" | "completed" | "skipped";
  result?: string;
  notes?: string;
  dateCreated: string;
}

function mapQueueItem(dq: DirectusCallQueueItem): CallQueueItem {
  return {
    id: dq.id,
    contactId: dq.contact_id,
    projectId: dq.project_id || undefined,
    assignedTo: dq.assigned_to || undefined,
    priority: dq.priority,
    scheduledDate: dq.scheduled_date || undefined,
    status: dq.status,
    result: dq.result || undefined,
    notes: dq.notes || undefined,
    dateCreated: dq.date_created,
  };
}

export function useCallQueue(filters?: {
  status?: string;
  assignedTo?: string;
  projectId?: string;
}) {
  const [queue, setQueue] = useState<CallQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      setQueue([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];

    fetchQueue({
      status: filters?.status || "pending",
      assignedTo: filters?.assignedTo,
      scheduledDate: today,
      projectId: filters?.projectId,
    })
      .then((data) => {
        if (!cancelled) {
          setQueue(data.map(mapQueueItem));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching call queue:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters?.status, filters?.assignedTo, filters?.projectId, refreshKey]);

  return { queue, loading, refresh };
}

export function useCallQueueActions() {
  const addToQueue = async (data: {
    contactId: string;
    projectId?: string;
    assignedTo?: string;
    priority?: number;
    scheduledDate?: string;
  }): Promise<CallQueueItem | null> => {
    if (IS_DEMO_MODE) return null;
    const result = await postQueueItem({
      contact_id: data.contactId,
      project_id: data.projectId,
      assigned_to: data.assignedTo,
      priority: data.priority || 3,
      scheduled_date:
        data.scheduledDate || new Date().toISOString().split("T")[0],
      status: "pending",
    });
    return mapQueueItem(result);
  };

  const markCompleted = async (
    id: string,
    result?: string,
    notes?: string,
  ): Promise<void> => {
    if (IS_DEMO_MODE) return;
    await patchQueueItem(id, {
      status: "completed",
      result: result || "done",
      notes,
    });
  };

  const skip = async (id: string, notes?: string): Promise<void> => {
    if (IS_DEMO_MODE) return;
    await patchQueueItem(id, {
      status: "skipped",
      notes,
    });
  };

  const generateDailyQueue = async (): Promise<number> => {
    if (IS_DEMO_MODE) return 0;

    const today = new Date().toISOString().split("T")[0];

    // Fetch contacts with follow_up_date <= today
    const followUpContacts = await getContacts({
      followUpBefore: today,
      limit: 200,
    });

    // Fetch existing pending queue items to avoid duplicates
    const existingQueue = await fetchQueue({
      status: "pending",
      scheduledDate: today,
    });
    const existingContactIds = new Set(existingQueue.map((q) => q.contact_id));

    // Build batch of new queue items
    const newItems = followUpContacts
      .filter((c) => !existingContactIds.has(c.id))
      .map((c) => ({
        contact_id: c.id,
        priority: 2,
        scheduled_date: today,
        status: "pending" as const,
        notes: c.follow_up_note || undefined,
      }));

    // Batch create in a single API call
    if (newItems.length > 0) {
      await batchCreateCallQueueItems(newItems);
    }
    return newItems.length;
  };

  return { addToQueue, markCompleted, skip, generateDailyQueue };
}
