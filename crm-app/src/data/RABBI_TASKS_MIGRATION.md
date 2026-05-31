# Rabbi Personal OS — Task Store Migration Path (R2 → Directus)

Lane R Phase R2 ships an **internal localStorage task store** (`rabbiTasks.ts`) so the task
runtime is proven reversibly before any production schema migration. This documents how to
migrate it to the Directus `tasks` collection (slice5) when the owner authorizes it.

## The seam

Consumers (`useRabbiTasks`, `RabbiTasksCard`) depend only on the **async `TaskStore` interface**:

```ts
interface TaskStore {
  list(): Promise<RabbiTask[]>;
  create(input: NewTaskInput): Promise<RabbiTask>;
  update(id, patch): Promise<RabbiTask | undefined>;
  remove(id): Promise<void>;
}
```

Migration = implement `createDirectusTaskStore()` against the same interface and swap the
`defaultStore` in `useRabbiTasks.ts`. No consumer code changes. The interface is already async
(localStorage calls are sync but wrapped in Promises) precisely so the HTTP-backed store drops in.

## Field mapping: `RabbiTask` → slice5 `tasks` collection

| RabbiTask field      | slice5 `tasks` column   | Notes |
|----------------------|-------------------------|-------|
| `id`                 | `id` (uuid)             | localStorage uses `crypto.randomUUID()`; compatible |
| `status`             | `status`                | identical enum: open/done/snoozed/canceled |
| `priority`           | `priority`              | identical 1–5 |
| `dueAt`              | `due_at`                | ISO ↔ timestamp |
| `notes`              | `notes`                 | direct |
| `kind`               | `kind`                  | same 14-value enum; nullable here, required (default `call`) there |
| `relatedContactId`   | `subject_contact_id`    | direct |
| `relatedLessonId`    | `related_lesson_id`     | direct |
| `createdAt`/`updatedAt` | `created_at`/`updated_at` | Directus manages via special date fields |

## Columns to ADD to slice5 before migration (not in current schema)

1. **`domain`** (string enum) — the Personal/Business/Merkaz/learning/family/community **life-domain**.
   slice5's existing `domain` concept lives on `attention_items` and is *operational*
   (people/lessons/tasks/…), NOT life-domains. A new `domain` column on `tasks` is required.
2. **`title`** (string) — slice5 derives display from `kind` + `subject_contact_id` and has no free
   title. Personal tasks need one. Add a `title` column (or map to `notes` if the owner prefers).
3. **`snoozed_until`** (timestamp) — slice5 has `status=snoozed` but no resurface timestamp.
   `effectiveStatus()` resurfaces a snoozed task once `snoozed_until` passes; this column carries it.
4. **`related_event_id`** — calendar phase (R3+); no slice5 equivalent yet.

## Data migration

One-time export: `JSON.parse(localStorage["rabbi.tasks.v1"])` → POST each to `/items/tasks`.
Low volume (single operator), so a simple script suffices; no batch tooling needed.

## Gate

Applying slice5 + the 4 added columns to the production Directus instance is **authority gate #5
(schema/data migration)** and requires explicit owner approval. R2 does not perform it.
