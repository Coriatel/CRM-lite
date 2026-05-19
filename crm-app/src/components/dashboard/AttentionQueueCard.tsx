import { Link } from "react-router-dom";
import {
  Activity,
  Bot,
  CalendarClock,
  CheckSquare,
  Coins,
  Flame,
  GraduationCap,
  PhoneCall,
  PlaySquare,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type {
  AttentionContext,
  AttentionDomain,
  AttentionItem,
  AttentionStatus,
  AttentionUrgency,
} from "../../data/amutaAttention";

const URGENCY_LABEL: Record<AttentionUrgency, string> = {
  critical: "דחוף מאוד",
  high: "דחוף",
  normal: "רגיל",
  low: "נמוך",
};

const URGENCY_COLOR: Record<AttentionUrgency, string> = {
  critical: "var(--color-danger)",
  high: "var(--color-danger)",
  normal: "var(--color-text-secondary)",
  low: "var(--color-text-secondary)",
};

// Tooltip / accessible label that explains what each urgency level means
// operationally. Same `title` + `aria-label` pattern as the status pill
// (#90) and domain icon (#98). Purely descriptive — does not change the
// label text, color, or rank semantics.
const URGENCY_TITLE: Record<AttentionUrgency, string> = {
  critical: "דחיפות קריטית — דרוש מענה מיידי",
  high: "דחיפות גבוהה — עדיף לטפל היום",
  normal: "דחיפות רגילה — נכלל בקצב העבודה הרגיל",
  low: "דחיפות נמוכה — אפשר להמתין",
};

// Only render a status pill when the status carries operational meaning
// beyond "this item is in the queue". `open` is the default actionable
// state and `done` items are filtered out of buckets upstream — a pill
// for either would be visual noise.
interface StatusPillSpec {
  label: string;
  color: string;
  title: string;
  testId: string;
}

// Subtle domain micro-icon next to the title — helps the operator visually
// group items by "what kind of work" without reading. Supporting role only:
// muted color, small size, paired with an accessible label.
interface DomainIconSpec {
  Icon: LucideIcon;
  label: string;
}

const DOMAIN_ICON: Record<AttentionDomain, DomainIconSpec> = {
  people: { Icon: UserRound, label: "תחום: אנשים" },
  lessons: { Icon: GraduationCap, label: "תחום: שיעורים" },
  tasks: { Icon: CheckSquare, label: "תחום: משימות" },
  content: { Icon: PlaySquare, label: "תחום: תכנים" },
  finance: { Icon: Coins, label: "תחום: כספים" },
  automation: { Icon: Bot, label: "תחום: אוטומציה" },
  runtime: { Icon: Activity, label: "תחום: מערכת" },
};

const STATUS_PILL: Partial<Record<AttentionStatus, StatusPillSpec>> = {
  blocked: {
    label: "חסום",
    color: "var(--color-danger)",
    title: "חסום — לא ניתן להתקדם עד שמשהו אחר ייפתר",
    testId: "attention-status-blocked",
  },
  waiting: {
    label: "ממתין",
    color: "var(--color-text-secondary)",
    title: "ממתין — תלוי בגורם חיצוני או בהחלטה",
    testId: "attention-status-waiting",
  },
  stale: {
    label: "ישן",
    color: "var(--color-text-secondary)",
    title: "ישן — הפריט יושב בתור זמן רב ולא נוגעו בו",
    testId: "attention-status-stale",
  },
};

export interface AttentionQueueCardProps {
  item: AttentionItem;
  /** Compact rendering for embedded /today bucket previews. Default: false. */
  dense?: boolean;
  /** Optional slot for disabled/enabled action buttons (e.g. on /rabbi). */
  actions?: React.ReactNode;
  /** Wrap as `<li>` (default) or `<div>`. */
  as?: "li" | "div";
}

export function AttentionQueueCard({
  item,
  dense = false,
  actions,
  as = "li",
}: AttentionQueueCardProps) {
  const Tag = as;
  const titleSize = dense ? 14 : 16;
  const bodySize = dense ? 12 : 13;
  const stripeWidth = dense ? 3 : 4;
  const paddingInlineStart = dense ? 10 : undefined;
  const statusPill = STATUS_PILL[item.status];
  const domainIcon = DOMAIN_ICON[item.domain];
  const DomainIcon = domainIcon.Icon;
  const domainIconSize = dense ? 12 : 14;

  return (
    <Tag
      className={dense ? undefined : "card"}
      style={{
        borderInlineStart: `${stripeWidth}px solid ${URGENCY_COLOR[item.urgency]}`,
        ...(dense ? { paddingInlineStart } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 600,
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          <span
            data-testid={`attention-domain-${item.domain}`}
            title={domainIcon.label}
            aria-label={domainIcon.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              color: "var(--color-text-secondary)",
              flexShrink: 0,
            }}
          >
            <DomainIcon size={domainIconSize} aria-hidden />
          </span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.href ? (
              <Link
                to={item.href}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {item.title}
              </Link>
            ) : (
              item.title
            )}
          </span>
        </div>
        {statusPill ? (
          <span
            data-testid={statusPill.testId}
            title={statusPill.title}
            aria-label={statusPill.title}
            style={{
              fontSize: 11,
              color: statusPill.color,
              border: `1px solid ${statusPill.color}`,
              borderRadius: 999,
              padding: "1px 8px",
              whiteSpace: "nowrap",
              lineHeight: 1.4,
            }}
          >
            {statusPill.label}
          </span>
        ) : null}
        <span
          data-testid={`attention-urgency-${item.urgency}`}
          title={URGENCY_TITLE[item.urgency]}
          aria-label={URGENCY_TITLE[item.urgency]}
          style={{
            fontSize: 11,
            color: URGENCY_COLOR[item.urgency],
            fontWeight: 600,
          }}
        >
          {URGENCY_LABEL[item.urgency]}
        </span>
      </div>
      <p
        style={{
          fontSize: bodySize,
          color: "var(--color-text-secondary)",
          margin: `0 0 ${dense ? 6 : "var(--spacing-sm)"} 0`,
        }}
      >
        {item.next_action}
      </p>
      {item.context ? (
        <QuickContext context={item.context} dense={dense} />
      ) : null}
      {actions ? (
        <div
          role="group"
          aria-label="פעולות"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: dense ? 4 : undefined,
          }}
        >
          {actions}
        </div>
      ) : null}
    </Tag>
  );
}

function QuickContext({
  context,
  dense,
}: {
  context: AttentionContext;
  dense: boolean;
}) {
  const badges: { icon: React.ReactNode; text: string; key: string }[] = [];
  if (context.last_call_date)
    badges.push({
      key: "last",
      icon: <PhoneCall size={12} />,
      text: `שיחה אחרונה: ${context.last_call_date}`,
    });
  if (context.follow_up_date)
    badges.push({
      key: "due",
      icon: <CalendarClock size={12} />,
      text: `יעד מעקב: ${context.follow_up_date}`,
    });
  if (typeof context.interest_level === "number")
    badges.push({
      key: "interest",
      icon: <Flame size={12} />,
      text: `עניין: ${context.interest_level}/5`,
    });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: dense ? 4 : 6,
        marginBottom: dense ? 0 : "var(--spacing-sm)",
      }}
    >
      {badges.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {badges.map((b) => (
            <span
              key={b.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--color-text-secondary)",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              {b.icon}
              {b.text}
            </span>
          ))}
        </div>
      ) : null}
      {context.why_now ? (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          <strong style={{ color: "var(--color-text)" }}>למה עכשיו: </strong>
          {context.why_now}
        </div>
      ) : null}
      {context.recommended_step ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: "var(--color-primary)",
          }}
        >
          <Sparkles size={12} />
          <span>{context.recommended_step}</span>
        </div>
      ) : null}
    </div>
  );
}
