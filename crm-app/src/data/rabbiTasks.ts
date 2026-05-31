// Rabbi Personal OS — internal task substrate (Lane R, Phase R2: internal-store-first).
//
// localStorage-backed. The async TaskStore interface mirrors a future Directus
// `tasks`-collection store so migration is a backend swap, not a consumer rewrite.
// Field-level mapping to slice5 `tasks` is annotated inline and in RABBI_TASKS_MIGRATION.md.
// No production schema is touched by this module.

export type TaskDomain =
  | "personal"
  | "business"
  | "merkaz"
  | "learning"
  | "family"
  | "community";

export type TaskStatus = "open" | "done" | "snoozed" | "canceled"; // mirrors slice5 STATUS_CHOICES
export type TaskPriority = 1 | 2 | 3 | 4 | 5; // mirrors slice5 priority (1 urgent … 5 low)

// slice5 tasks.kind (operational categorization). Optional in the personal store.
export type TaskKind =
  | "call"
  | "followup"
  | "care_action"
  | "rabbi_action"
  | "admin"
  | "lesson_logistics"
  | "contribution_followup"
  | "support_needed"
  | "sponsorship_subsidy"
  | "receipt_needed"
  | "compliance_task"
  | "donor_admin"
  | "rent_utility"
  | "technical_project";

export interface RabbiTask {
  id: string;
  title: string; // NEW vs slice5 — personal tasks need a free title
  domain: TaskDomain; // NEW life-domain (R2 headline; not in slice5)
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null; // ISO; → slice5 due_at
  snoozedUntil: string | null; // NEW — slice5 has status=snoozed but no timestamp
  notes: string | null; // → slice5 notes
  kind: TaskKind | null; // → slice5 kind
  relatedContactId: string | null; // → slice5 subject_contact_id
  relatedLessonId: string | null; // → slice5 related_lesson_id
  relatedEventId: string | null; // NEW — calendar phase; no slice5 equivalent yet
  createdAt: string;
  updatedAt: string;
}

export interface NewTaskInput {
  title: string;
  domain: TaskDomain;
  priority?: TaskPriority;
  dueAt?: string | null;
  notes?: string | null;
  kind?: TaskKind | null;
  relatedContactId?: string | null;
  relatedLessonId?: string | null;
  relatedEventId?: string | null;
}

export type TaskPatch = Partial<Omit<RabbiTask, "id" | "createdAt">>;

export const TASK_DOMAINS: { value: TaskDomain; label: string }[] = [
  { value: "personal", label: "אישי" },
  { value: "business", label: "עסקי" },
  { value: "merkaz", label: "מרכז נשמה" },
  { value: "learning", label: "לימוד" },
  { value: "family", label: "משפחה" },
  { value: "community", label: "קהילה" },
];

const DOMAIN_LABEL: Record<TaskDomain, string> = Object.fromEntries(
  TASK_DOMAINS.map((d) => [d.value, d.label]),
) as Record<TaskDomain, string>;

export function domainLabel(domain: TaskDomain): string {
  return DOMAIN_LABEL[domain] ?? domain;
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export const DUE_BUCKET_ORDER: DueBucket[] = ["overdue", "today", "week", "later", "none"];

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "באיחור",
  today: "היום",
  week: "השבוע",
  later: "בהמשך",
  none: "ללא תאריך",
};

/** Classify a task's due date relative to `now` (date-only comparison, UTC). */
export function dueBucket(dueAt: string | null, now: Date = new Date()): DueBucket {
  if (!dueAt) return "none";
  const day = dueAt.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  if (day < today) return "overdue";
  if (day === today) return "today";
  const diffDays = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return diffDays <= 7 ? "week" : "later";
}

/** A snoozed task whose snoozedUntil has passed resurfaces as open. */
export function effectiveStatus(task: RabbiTask, now: Date = new Date()): TaskStatus {
  if (
    task.status === "snoozed" &&
    task.snoozedUntil &&
    Date.parse(task.snoozedUntil) <= now.getTime()
  ) {
    return "open";
  }
  return task.status;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TaskStore {
  list(): Promise<RabbiTask[]>;
  create(input: NewTaskInput): Promise<RabbiTask>;
  update(id: string, patch: TaskPatch): Promise<RabbiTask | undefined>;
  remove(id: string): Promise<void>;
}

export const STORAGE_KEY = "rabbi.tasks.v1";

interface LocalStoreOptions {
  storage?: StorageAdapter;
  now?: () => Date;
  genId?: () => string;
}

export function createLocalTaskStore(opts: LocalStoreOptions = {}): TaskStore {
  const storage = opts.storage ?? window.localStorage;
  const now = opts.now ?? (() => new Date());
  const genId = opts.genId ?? (() => crypto.randomUUID());

  const read = (): RabbiTask[] => {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RabbiTask[]) : [];
    } catch {
      return [];
    }
  };
  const write = (tasks: RabbiTask[]) => storage.setItem(STORAGE_KEY, JSON.stringify(tasks));

  return {
    async list() {
      return read();
    },
    async create(input) {
      const ts = now().toISOString();
      const task: RabbiTask = {
        id: genId(),
        title: input.title.trim(),
        domain: input.domain,
        status: "open",
        priority: input.priority ?? 2,
        dueAt: input.dueAt ?? null,
        snoozedUntil: null,
        notes: input.notes ?? null,
        kind: input.kind ?? null,
        relatedContactId: input.relatedContactId ?? null,
        relatedLessonId: input.relatedLessonId ?? null,
        relatedEventId: input.relatedEventId ?? null,
        createdAt: ts,
        updatedAt: ts,
      };
      write([task, ...read()]);
      return task;
    },
    async update(id, patch) {
      const tasks = read();
      const i = tasks.findIndex((t) => t.id === id);
      if (i === -1) return undefined;
      const updated: RabbiTask = { ...tasks[i], ...patch, id, updatedAt: now().toISOString() };
      tasks[i] = updated;
      write(tasks);
      return updated;
    },
    async remove(id) {
      write(read().filter((t) => t.id !== id));
    },
  };
}
