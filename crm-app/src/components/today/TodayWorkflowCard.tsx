import type { AttentionItem } from "../../data/amutaAttention";

const domainLabel: Record<AttentionItem["domain"], string> = {
  people: "קשר וקהילה",
  lessons: "שיעורים",
  tasks: "משימות",
  content: "תכנים",
  finance: "כספים",
  automation: "אוטומציה",
  runtime: "Runtime",
};

const urgencyLabel: Record<AttentionItem["urgency"], string> = {
  critical: "דחוף",
  high: "גבוה",
  normal: "רגיל",
  low: "נמוך",
};

function accentFor(item: AttentionItem): string {
  if (item.urgency === "critical") return "var(--mn-critical)";
  if (item.urgency === "high") return "var(--mn-warning)";
  return "var(--mn-brand-teal)";
}

interface TodayWorkflowCardProps {
  item: AttentionItem;
  onOpen: (item: AttentionItem) => void;
}

export function TodayWorkflowCard({ item, onOpen }: TodayWorkflowCardProps) {
  return (
    <button
      type="button"
      className="today-card"
      style={{ "--mn-card-accent": accentFor(item) } as React.CSSProperties}
      onClick={() => onOpen(item)}
      data-testid="today-workflow-card"
      aria-label={`פתח הקשר תפעולי: ${item.title}`}
    >
      <div className="today-card__kicker">
        <span>{domainLabel[item.domain]}</span>
        <span>{urgencyLabel[item.urgency]}</span>
      </div>
      <h3 className="today-card__title">{item.title}</h3>
      <p className="today-card__reason">
        {item.context?.why_now ?? "עלה לתשומת לב כי הוא פתוח במערכת."}
      </p>
      <p className="today-card__action">{item.next_action}</p>
      <div className="today-card__footer">
        <span>הבנת ההקשר</span>
        <span aria-hidden="true">←</span>
      </div>
    </button>
  );
}

interface TodayWorkflowSheetProps {
  item: AttentionItem | null;
  onClose: () => void;
}

export function TodayWorkflowSheet({ item, onClose }: TodayWorkflowSheetProps) {
  if (!item) return null;
  return (
    <div
      className="today-sheet-backdrop"
      role="presentation"
      onClick={onClose}
      data-testid="today-workflow-sheet-backdrop"
    >
      <section
        className="today-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="today-workflow-sheet-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="today-workflow-sheet"
      >
        <div className="today-sheet__handle" aria-hidden="true" />
        <div className="today-sheet__topline">L2 · הקשר תפעולי</div>
        <h2 id="today-workflow-sheet-title" className="today-sheet__title">
          {item.title}
        </h2>

        <div className="today-sheet__section">
          <h3>מצב</h3>
          <p>{item.status === "waiting" ? "ממתין לגורם אחר." : "פתוח ודורש הבנה לפני פעולה."}</p>
        </div>
        <div className="today-sheet__section">
          <h3>למה זה כאן</h3>
          <p>{item.context?.why_now ?? "הפריט נמצא בתור תשומת הלב הפעיל."}</p>
        </div>
        <div className="today-sheet__section">
          <h3>הצעד הבא</h3>
          <p>{item.next_action}</p>
        </div>
        <div className="today-sheet__section">
          <h3>קישורים וחומרים</h3>
          <p>{item.href ? item.href : "אין קישור מקור זמין בפריט הזה."}</p>
        </div>

        <div className="today-sheet__actions">
          {item.href ? (
            <a className="today-sheet__button" href={item.href} style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
              פתיחת מקור
            </a>
          ) : null}
          <button type="button" className="today-sheet__button today-sheet__button--quiet" onClick={onClose}>
            חזרה להיום
          </button>
        </div>
      </section>
    </div>
  );
}
