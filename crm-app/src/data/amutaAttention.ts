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

// Operator-facing classifier for a single attention bucket (e.g. needsElron,
// needsRav, stuck). Folds (urgency × status) across the bucket into a single
// severity/headline/meaning/nextAction view. Same #88/#89/#91/#92 contract.
// Pure; no rendering coupling. The card decides whether to render this in
// addition to its existing emptyHint when items.length === 0.
export type AttentionBucketCategory =
  | "empty"
  | "critical_present"
  | "blocked_present"
  | "stale_present"
  | "waiting_majority"
  | "actionable_ready";

export type AttentionBucketSeverity = "info" | "watch" | "action";

export interface AttentionBucketOperatorView {
  severity: AttentionBucketSeverity;
  topCategory: AttentionBucketCategory;
  categories: AttentionBucketCategory[];
  headline: string;
  meaning: string;
  nextAction: string;
}

export function classifyAttentionBucketForOperator(
  items: AttentionItem[],
): AttentionBucketOperatorView {
  const total = items.length;
  const critical = items.filter((i) => i.urgency === "critical").length;
  const blocked = items.filter((i) => i.status === "blocked").length;
  const waiting = items.filter((i) => i.status === "waiting").length;
  const stale = items.filter((i) => i.status === "stale").length;

  const cats: AttentionBucketCategory[] = [];
  if (total === 0) {
    cats.push("empty");
  } else {
    if (critical > 0) cats.push("critical_present");
    if (blocked > 0) cats.push("blocked_present");
    if (stale > 0) cats.push("stale_present");
    if (waiting * 2 > total) cats.push("waiting_majority");
    if (cats.length === 0) cats.push("actionable_ready");
  }
  const topCategory = cats[0];

  let severity: AttentionBucketSeverity;
  let headline: string;
  let meaning: string;
  let nextAction: string;
  switch (topCategory) {
    case "empty":
      severity = "info";
      headline = "אין כרגע משימות פתוחות";
      meaning = "התור ריק — לא הצטבר כלום שדורש תשומת לב.";
      nextAction = "אין צורך לפעול.";
      break;
    case "critical_present":
      severity = "action";
      headline = `יש משימות דחופות מאוד (${critical})`;
      meaning =
        "פריט אחד או יותר סומן כקריטי ודורש מענה מיידי לפני שאר התור.";
      nextAction = "פתח את הפריטים הקריטיים והחלט מי מטפל עכשיו.";
      break;
    case "blocked_present":
      severity = "action";
      headline = `יש משימות חסומות שדורשות טיפול (${blocked})`;
      meaning =
        "פריטים תקועים — לא ניתן להתקדם בהם עד שמשהו אחר ייפתר.";
      nextAction =
        "סקור את הפריטים החסומים, הסר את החסם או הקפץ לבעלים.";
      break;
    case "stale_present":
      severity = "watch";
      headline = `יש משימות ישנות שכדאי לבדוק (${stale})`;
      meaning =
        "פריטים יושבים בתור זמן רב מבלי שנגעו בהם — אולי נשכחו.";
      nextAction =
        "סקור את הפריטים הישנים והחלט אם לקדם, לדחות או לסגור.";
      break;
    case "waiting_majority":
      severity = "watch";
      headline = `רוב המשימות ממתינות לאישור (${waiting}/${total})`;
      meaning =
        "התור תלוי בגורם חיצוני או בהחלטה — לא זורם באופן עצמאי.";
      nextAction = "סגור כמה החלטות פתוחות כדי לפתוח את התור.";
      break;
    case "actionable_ready":
    default:
      severity = "info";
      headline = `יש משימות פתוחות לטיפול (${total})`;
      meaning = "התור פעיל ויש פריטים מוכנים לטיפול לפי דחיפות.";
      nextAction = "התחל מהפריט הראשון לפי דחיפות.";
      break;
  }

  return { severity, topCategory, categories: cats, headline, meaning, nextAction };
}
