import {
  classifyAttentionBucketForOperator,
  type AttentionBucketSeverity,
  type AttentionItem,
} from "../../data/amutaAttention";

// Page-level operator-readable summary block for an attention bucket.
// Same #88/#89/#91/#92/#93 contract: severity pill + Hebrew headline +
// "מה זה אומר" + "מה ניתן לעשות". Caller decides when to render — we do
// not render anything special for an empty bucket because the empty
// state's contextual copy is owned by the surrounding page.

const SEVERITY_LABEL: Record<AttentionBucketSeverity, string> = {
  action: "דורש פעולה",
  watch: "במעקב",
  info: "תקין",
};

const SEVERITY_BG: Record<AttentionBucketSeverity, string> = {
  action: "var(--color-danger)",
  watch: "#a16207",
  info: "var(--color-text-secondary)",
};

export interface AttentionBucketOperatorSummaryProps {
  items: AttentionItem[];
  /** Used to namespace `data-testid`s so multiple summaries can coexist. */
  testIdPrefix: string;
}

export function AttentionBucketOperatorSummary({
  items,
  testIdPrefix,
}: AttentionBucketOperatorSummaryProps) {
  const view = classifyAttentionBucketForOperator(items);
  return (
    <div
      style={{
        marginBottom: "var(--spacing-sm)",
        paddingBottom: "var(--spacing-sm)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span
          data-testid={`${testIdPrefix}-operator-severity`}
          style={{
            fontSize: 10,
            color: "#fff",
            background: SEVERITY_BG[view.severity],
            borderRadius: 999,
            padding: "1px 6px",
            whiteSpace: "nowrap",
          }}
        >
          {SEVERITY_LABEL[view.severity]}
        </span>
        <span
          data-testid={`${testIdPrefix}-operator-headline`}
          style={{ fontSize: 14, fontWeight: 600 }}
        >
          {view.headline}
        </span>
      </div>
      <p
        data-testid={`${testIdPrefix}-operator-meaning`}
        style={{
          fontSize: 13,
          color: "var(--color-text-secondary)",
          margin: "0 0 4px 0",
          lineHeight: 1.4,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
          מה זה אומר:{" "}
        </span>
        {view.meaning}
      </p>
      <p
        data-testid={`${testIdPrefix}-operator-next-action`}
        style={{
          fontSize: 13,
          color: "var(--color-text-secondary)",
          margin: 0,
          lineHeight: 1.4,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
          מה ניתן לעשות:{" "}
        </span>
        {view.nextAction}
      </p>
    </div>
  );
}
