import {
  DUE_BUCKET_LABEL,
  DUE_BUCKET_ORDER,
  dueBucket,
  type DueBucket,
} from "../data/rabbiTasks";
import type { MgTask } from "../services/directus";
import { fullDate } from "./format";

const KIND_LABEL: Record<string, string> = {
  call: "שיחה",
  followup: "מעקב",
  care_action: "ליווי",
  rabbi_action: "לטיפול הרב",
  admin: "מנהלה",
  lesson_logistics: "שיעורים",
  contribution_followup: "מעקב תרומה",
  support_needed: "בקשת עזרה",
  sponsorship_subsidy: "מלגה",
  receipt_needed: "קבלה",
  compliance_task: "ניהול תקין",
  donor_admin: "תורמים",
  rent_utility: "שכירות וחשבונות",
  technical_project: "טכני",
};

export const NEW_TASK_KINDS = ["followup", "call", "admin"] as const;

export function kindLabel(kind: string | null): string {
  return kind ? (KIND_LABEL[kind] ?? kind) : "";
}

/** What the row says: the note's first line, or the kind when there is no note. */
export function taskTitle(t: MgTask): string {
  const first = (t.notes ?? "").split("\n")[0].trim();
  return first || kindLabel(t.kind) || "משימה";
}

export function taskMeta(t: MgTask, bucket: DueBucket): string {
  const parts: string[] = [];
  if (t.due_at && bucket === "overdue") parts.push(`מ־${fullDate(t.due_at)}`);
  else if (t.due_at && bucket !== "today") parts.push(fullDate(t.due_at));
  const kind = kindLabel(t.kind);
  if (kind && kind !== taskTitle(t)) parts.push(kind);
  return parts.join(" · ");
}

export interface TaskGroup {
  bucket: DueBucket;
  label: string;
  tasks: MgTask[];
}

/**
 * Due bucket by the local calendar day. `due_at` is a timestamp with a zone, so
 * its first ten characters are the UTC day, which is the day before for anything
 * due in the first hours after local midnight.
 */
export function taskBucket(dueAt: string | null, now: Date = new Date()): DueBucket {
  if (!dueAt) return "none";
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return dueBucket(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, now);
}

/** Open tasks grouped overdue → today → week → later → undated; empty groups dropped. */
export function groupTasks(tasks: MgTask[], now: Date = new Date()): TaskGroup[] {
  return DUE_BUCKET_ORDER.map((bucket) => ({
    bucket,
    label: DUE_BUCKET_LABEL[bucket],
    tasks: tasks.filter((t) => taskBucket(t.due_at, now) === bucket),
  })).filter((g) => g.tasks.length > 0);
}
