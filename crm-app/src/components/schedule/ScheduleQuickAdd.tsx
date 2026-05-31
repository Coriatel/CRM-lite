import { useState } from "react";
import { CalendarPlus, BellPlus } from "lucide-react";
import { MeetingForm } from "./MeetingForm";
import { ReminderForm } from "./ReminderForm";

interface ScheduleQuickAddProps {
  /** Called after a meeting/reminder is created — e.g. refresh the agenda. */
  onCreated?: () => void;
}

/** Two compact triggers to add a meeting or a reminder, with their modals. */
export function ScheduleQuickAdd({ onCreated }: ScheduleQuickAddProps) {
  const [open, setOpen] = useState<null | "meeting" | "reminder">(null);

  return (
    <div
      style={{ display: "flex", gap: "var(--spacing-sm)", margin: "8px 0 0" }}
      data-testid="schedule-quick-add"
    >
      <button
        type="button"
        className="btn btn-sm btn-outline"
        style={{ minHeight: 44, flex: 1 }}
        onClick={() => setOpen("meeting")}
      >
        <CalendarPlus size={16} /> פגישה
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        style={{ minHeight: 44, flex: 1 }}
        onClick={() => setOpen("reminder")}
      >
        <BellPlus size={16} /> תזכורת
      </button>

      {open === "meeting" && (
        <MeetingForm onClose={() => setOpen(null)} onCreated={onCreated} />
      )}
      {open === "reminder" && (
        <ReminderForm onClose={() => setOpen(null)} onCreated={onCreated} />
      )}
    </div>
  );
}
