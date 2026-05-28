import { useCallback, useState } from "react";

// Submits a mutation to the S3 queue-actions endpoint. v1: no retry, no
// optimistic update; the substrate runs merger+reducer synchronously, so
// `accepted: true` means a fresh state is already on disk.

export type QueueActionVerb =
  | "ack"
  | "snooze"
  | "dismiss"
  | "escalate"
  | "assign"
  | "annotate";

export interface QueueActionRequest {
  action: QueueActionVerb;
  queue_item_id: string;
  fields?: Record<string, unknown>;
}

export interface QueueActionResponse {
  accepted: boolean;
  spool_path?: string;
  merger?: { code: number };
  reducer?: { code: number };
  error?: string;
}

export type QueueActionStatus = "idle" | "submitting" | "success" | "error";

export interface UseQueueAction {
  status: QueueActionStatus;
  error: string | null;
  lastResponse: QueueActionResponse | null;
  submit: (req: QueueActionRequest) => Promise<QueueActionResponse | null>;
  reset: () => void;
}

export function useQueueAction(): UseQueueAction {
  const [status, setStatus] = useState<QueueActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<QueueActionResponse | null>(null);

  const submit = useCallback(
    async (req: QueueActionRequest): Promise<QueueActionResponse | null> => {
      setStatus("submitting");
      setError(null);
      try {
        const r = await fetch("/api/queue-actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req),
        });
        let body: QueueActionResponse | null = null;
        try {
          body = (await r.json()) as QueueActionResponse;
        } catch {
          body = null;
        }
        if (!r.ok || !body?.accepted) {
          const msg = body?.error || `שגיאה ${r.status}`;
          setError(msg);
          setLastResponse(body);
          setStatus("error");
          return body;
        }
        setLastResponse(body);
        setStatus("success");
        return body;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "שגיאת רשת";
        setError(msg);
        setStatus("error");
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, lastResponse, submit, reset };
}
