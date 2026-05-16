export type AttentionOwner = "elron" | "rav" | "system";
export type AttentionUrgency = "low" | "normal" | "high" | "critical";
export type AttentionStatus =
  | "open"
  | "blocked"
  | "waiting"
  | "stale"
  | "done";
export type AttentionDomain =
  | "people"
  | "lessons"
  | "tasks"
  | "content"
  | "finance"
  | "automation"
  | "runtime";

export interface AttentionContext {
  person_name?: string;
  phone?: string;
  last_call_date?: string;
  follow_up_date?: string;
  interest_level?: number;
  why_now?: string;
  recommended_step?: string;
}

export interface AttentionItem {
  id: string;
  title: string;
  owner: AttentionOwner;
  urgency: AttentionUrgency;
  status: AttentionStatus;
  domain: AttentionDomain;
  next_action: string;
  href?: string;
  context?: AttentionContext;
}

export interface AttentionPayload {
  ts: string;
  source: "mock" | "projection" | "directus";
  items: AttentionItem[];
}

export interface AttentionBuckets {
  needsElron: AttentionItem[];
  needsRav: AttentionItem[];
  stuck: AttentionItem[];
}

const URGENCY_RANK: Record<AttentionUrgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function byUrgency(a: AttentionItem, b: AttentionItem): number {
  return URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
}

export function bucketAttention(items: AttentionItem[]): AttentionBuckets {
  const stuck = items
    .filter((i) => i.status === "blocked" || i.status === "stale")
    .slice()
    .sort(byUrgency);
  const needsElron = items
    .filter((i) => i.owner === "elron" && i.status !== "done")
    .slice()
    .sort(byUrgency);
  const needsRav = items
    .filter((i) => i.owner === "rav" && i.status !== "done")
    .slice()
    .sort(byUrgency);
  return { needsElron, needsRav, stuck };
}

const MOCK_PAYLOAD: AttentionPayload = {
  ts: "2026-05-16T06:00:00Z",
  source: "mock",
  items: [
    {
      id: "att-001",
      title: "אישור תקציב חודשי לעמותה",
      owner: "elron",
      urgency: "high",
      status: "waiting",
      domain: "finance",
      next_action: "לעבור על טבלת תקציב מאי ולאשר",
      href: "/dashboard",
    },
    {
      id: "att-002",
      title: "תשובה לשאלת הלכה ממשתתף",
      owner: "rav",
      urgency: "normal",
      status: "open",
      domain: "people",
      next_action: "להחזיר טלפון לאליהו כהן",
      href: "/people",
    },
    {
      id: "att-003",
      title: "שיעור 'תיקון המידות' תקוע בעיבוד",
      owner: "system",
      urgency: "high",
      status: "blocked",
      domain: "content",
      next_action: "בלוק בצינור Windmill",
      href: "/ops",
    },
    {
      id: "att-004",
      title: "הרשמה לקבוצת לימוד חדשה",
      owner: "rav",
      urgency: "critical",
      status: "waiting",
      domain: "lessons",
      next_action: "להחליט על פתיחת מחזור חדש",
      href: "/today",
    },
    {
      id: "att-005",
      title: "אוטומציה של תזכורות שבועיות נכשלה אתמול",
      owner: "elron",
      urgency: "normal",
      status: "stale",
      domain: "automation",
      next_action: "לבדוק לוג n8n של אתמול",
      href: "/ops",
    },
  ],
};

export async function loadAmutaAttention(): Promise<AttentionPayload> {
  return MOCK_PAYLOAD;
}
