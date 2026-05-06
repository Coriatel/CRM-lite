import { useState, useEffect } from "react";
import {
  DirectusStageTransition,
  DirectusLifecycleStage,
  getStageHistory,
  getLifecycleStages,
} from "../services/directus";

interface StageHistoryProps {
  contactId: string;
}

const TRIGGER_LABEL: Record<string, string> = {
  flow: "אוטומטי",
  system: "מערכת",
  manual: "ידני",
};

function formatHe(dateStr: string) {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export function StageHistory({ contactId }: StageHistoryProps) {
  const [rows, setRows] = useState<DirectusStageTransition[]>([]);
  const [stageMap, setStageMap] = useState<Map<string, DirectusLifecycleStage>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getStageHistory(contactId), getLifecycleStages()])
      .then(([transitions, stageList]) => {
        if (cancelled) return;
        setRows(transitions);
        setStageMap(new Map(stageList.map((s) => [s.id, s])));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <div style={{ marginBottom: "var(--spacing-md)" }}>
      <h3 className="notes-title">היסטוריית שלבים</h3>

      {loading && (
        <div className="loading">
          <div className="spinner" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="empty-state">
          <p>אין שינויי שלב</p>
        </div>
      )}

      {rows.map((row) => {
        const from = row.from_stage_id
          ? stageMap.get(row.from_stage_id)
          : null;
        const to = stageMap.get(row.to_stage_id);
        const triggerLabel =
          TRIGGER_LABEL[row.trigger_type] ?? row.trigger_type;

        return (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              marginBottom: 6,
              borderRadius: 8,
              background: "var(--color-surface, #f8fafc)",
              border: "1px solid var(--color-border, #e2e8f0)",
              fontSize: 13,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                color: from
                  ? "var(--color-text, #1e293b)"
                  : "var(--color-text-muted, #94a3b8)",
                fontStyle: from ? "normal" : "italic",
              }}
            >
              {from?.name ?? "—"}
            </span>
            <span style={{ color: "var(--color-text-muted, #94a3b8)" }}>←</span>
            <span
              style={{
                fontWeight: 600,
                color: to?.color ?? "var(--color-text, #1e293b)",
              }}
            >
              {to?.name ?? row.to_stage_id.slice(0, 8)}
            </span>
            <span
              style={{
                marginInlineStart: "auto",
                fontSize: 11,
                color: "var(--color-text-muted, #94a3b8)",
                whiteSpace: "nowrap",
              }}
            >
              {triggerLabel} · {formatHe(row.transitioned_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
