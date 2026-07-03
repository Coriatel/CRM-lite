import { useState } from "react";
import { useOpsPacket } from "./useOpsPacket";

// SEG-11 slice 5 — mission-progress fold on /portfolio (flag rides DECISIONS_ENABLED via the page).
// Owner-language default view: Hebrew verdict counts + per-mission rows without raw identifiers;
// raw goal ids appear only under the expandable "מקור" toggle, per OWNER_LANGUAGE_CANONICAL_STANDARD.

export const MISSION_PROGRESS_URL =
  "/ops-data/projections/control-tower/mission_progress.json";

export interface MissionRecord {
  campaign_id: string;
  verdict: "ON_TRACK" | "GATED" | "BLOCKED" | "STALLED" | "DONE";
  slices: { done: number; total: number } | null;
  freshness: { age_days: number | null } | null;
}

export interface MissionProgressDoc {
  missions: MissionRecord[];
  summary: {
    packaged: number;
    unauthored_active: number;
    by_verdict: Record<string, number>;
  };
}

const VERDICT_HE: Record<MissionRecord["verdict"], { label: string; color: string }> = {
  ON_TRACK: { label: "מתקדם", color: "var(--ct-ok, #2fbf9b)" },
  GATED: { label: "ממתין לך", color: "var(--ct-critical, #ff6b5e)" },
  BLOCKED: { label: "תקוע", color: "var(--ct-critical, #ff6b5e)" },
  STALLED: { label: "עומד במקום", color: "var(--ct-warn, #f0b429)" },
  DONE: { label: "הושלם", color: "var(--ct-ok, #2fbf9b)" },
};

export function MissionProgressView({ doc }: { doc: MissionProgressDoc | null }) {
  const [showSource, setShowSource] = useState(false);
  if (!doc || !doc.missions?.length) return null;
  const counts = doc.summary.by_verdict || {};
  const parts = (Object.keys(VERDICT_HE) as MissionRecord["verdict"][])
    .filter((v) => (counts[v] || 0) > 0)
    .map((v) => `${counts[v]} ${VERDICT_HE[v].label}`);
  return (
    <section data-testid="mission-progress" style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>מצב המשימות</h2>
      <p style={{ margin: "0 0 10px", color: "var(--mn-text-muted)", fontSize: 13 }}>
        {doc.summary.packaged} משימות מנוהלות · {parts.join(" · ")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {doc.missions.map((m) => (
          <div
            key={m.campaign_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: 10,
              background: "var(--ct-card-bg, rgba(255,255,255,0.04))",
            }}
          >
            <span style={{ fontWeight: 600, color: VERDICT_HE[m.verdict].color, fontSize: 13 }}>
              {VERDICT_HE[m.verdict].label}
            </span>
            <span style={{ fontSize: 13, color: "var(--mn-text-muted)" }}>
              {m.slices && m.slices.total > 0
                ? `${m.slices.done} מתוך ${m.slices.total} שלבים`
                : "טרם דווחו שלבים"}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="הצג מקור"
        onClick={() => setShowSource((s) => !s)}
        style={{
          marginTop: 8,
          background: "none",
          border: "none",
          color: "var(--mn-text-muted)",
          fontSize: 12,
          minHeight: 44,
          cursor: "pointer",
        }}
      >
        מקור {showSource ? "▲" : "▼"}
      </button>
      {showSource && (
        <ul data-testid="mission-source" style={{ fontSize: 12, color: "var(--mn-text-muted)" }}>
          {doc.missions.map((m) => (
            <li key={m.campaign_id}>
              {m.campaign_id} — {m.verdict}
            </li>
          ))}
          <li>{doc.summary.unauthored_active} יוזמות פעילות ללא תוכנית ביצוע (לא נכללות)</li>
        </ul>
      )}
    </section>
  );
}

export function MissionProgressSection() {
  const { doc } = useOpsPacket<MissionProgressDoc>(MISSION_PROGRESS_URL);
  return <MissionProgressView doc={doc} />;
}
