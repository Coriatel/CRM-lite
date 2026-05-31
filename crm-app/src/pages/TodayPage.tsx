import { useEffect, useMemo, useState } from "react";
import type { AttentionItem } from "../data/amutaAttention";
import { useAmutaAttention } from "../data/useAmutaAttention";
import { TodaySection } from "../components/today/TodaySection";
import { TodayShell, type TodayPressureChip } from "../components/today/TodayShell";
import {
  TodayWorkflowCard,
  TodayWorkflowSheet,
} from "../components/today/TodayWorkflowCard";
import { LessonRunsCard } from "../components/today/LessonRunsCard";
import { TodayBlockersCard } from "../components/today/TodayBlockersCard";
import { TodayOwnerGatesCard } from "../components/today/TodayOwnerGatesCard";
import { TodayFailedAutomationsCard } from "../components/today/TodayFailedAutomationsCard";
import { TodayBlockedCampaignsCard } from "../components/today/TodayBlockedCampaignsCard";
import { HealthPulseRow } from "../components/today/HealthPulseRow";
import { RabbiDayCard } from "../components/dashboard/RabbiDayCard";

function todayLabel(): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(new Date());
}

function pickPrimaryAttentionItem(
  buckets: ReturnType<typeof useAmutaAttention>["buckets"],
): AttentionItem | null {
  if (!buckets) return null;
  return buckets.needsElron[0] ?? buckets.stuck[0] ?? buckets.needsRav[0] ?? null;
}

function attentionTotal(
  buckets: ReturnType<typeof useAmutaAttention>["buckets"],
): number {
  if (!buckets) return 0;
  const ids = new Set<string>();
  for (const item of [...buckets.needsElron, ...buckets.stuck, ...buckets.needsRav]) {
    ids.add(item.id);
  }
  return ids.size;
}

function attentionMeta(
  buckets: ReturnType<typeof useAmutaAttention>["buckets"],
): string {
  if (!buckets) return "טוען";
  const total = attentionTotal(buckets);
  const stuck = buckets.stuck.length;
  if (total === 0) return "שקט";
  return stuck > 0 ? `${total} פתוחים · ${stuck} תקועים` : `${total} פתוחים`;
}

function pressureChips(
  buckets: ReturnType<typeof useAmutaAttention>["buckets"],
): TodayPressureChip[] {
  if (!buckets) return [{ id: "loading", label: "תשומת לב", value: "טוען" }];
  const total = attentionTotal(buckets);
  return [
    { id: "attention", label: "תשומת לב", value: total === 0 ? "שקט" : String(total) },
    { id: "elron", label: "אלרון", value: String(buckets.needsElron.length) },
    { id: "rabbi", label: "הרב", value: String(buckets.needsRav.length) },
  ];
}

export function TodayPage() {
  const { buckets, error, loading } = useAmutaAttention();
  const [attentionFetchedAt, setAttentionFetchedAt] = useState<Date | null>(null);
  const [openItem, setOpenItem] = useState<AttentionItem | null>(null);

  useEffect(() => {
    if (buckets) setAttentionFetchedAt(new Date());
  }, [buckets]);

  const primaryItem = useMemo(() => pickPrimaryAttentionItem(buckets), [buckets]);
  const chips = useMemo(() => pressureChips(buckets), [buckets]);

  return (
    <TodayShell
      dateLabel={todayLabel()}
      fetchedAt={attentionFetchedAt}
      pressureChips={chips}
    >
      {/* Cockpit order = operator priority (P5.4): what requires the owner →
          what needs attention next → what is critical → what failed →
          what is blocked → operational health pulse → content → rabbi. */}
      <TodayOwnerGatesCard />

      <TodaySection title="תשומת לב" meta={attentionMeta(buckets)}>
        {error ? (
          <div className="today-empty" role="alert" data-testid="today-attention-error">
            לא ניתן לטעון את תור תשומת הלב כעת. הנתונים לא הומצאו.
          </div>
        ) : loading || !buckets ? (
          <div className="today-empty" data-testid="today-attention-loading">
            טוען מוקדי תשומת לב…
          </div>
        ) : primaryItem ? (
          <TodayWorkflowCard item={primaryItem} onOpen={setOpenItem} />
        ) : (
          <div className="today-empty" data-testid="today-attention-empty">
            אין כרגע מוקד תשומת לב פתוח. היום נשאר שקט עד שה-runtime יעלה פריט אמיתי.
          </div>
        )}
      </TodaySection>

      <TodayBlockersCard />

      <TodayFailedAutomationsCard />

      <TodayBlockedCampaignsCard />

      <HealthPulseRow />

      <TodaySection title="תכנים">
        <LessonRunsCard />
      </TodaySection>

      <TodaySection title="סדר היום של הרב">
        <RabbiDayCard hideHeading />
      </TodaySection>

      <TodayWorkflowSheet item={openItem} onClose={() => setOpenItem(null)} />
    </TodayShell>
  );
}
