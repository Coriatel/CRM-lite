import { relativeTimeHe } from "./OpsPage";

// Shape contract:
//   automation-registry/scripts/build-run-history.py (Phase G1) → state/run_history.json.
// Read-only operator visibility of recent harness runs. Public-safe: ids, statuses,
// decisions and the evidence record path only — no secrets, no worker args, no command
// execution. This card NEVER triggers a run; the Play affordance lives elsewhere.

export type RunHistoryRow = {
  run_id?: string | null;
  status?: string | null;
  mode?: string | null;
  requested_by?: string | null;
  final_decision?: string | null;
  stop_reason?: string | null;
  requested_at?: string | null;
  claimed_at?: string | null;
  finished_at?: string | null;
  timestamp?: string | null;
  dispatched?: number | null;
  owner_gated?: boolean | null;
  evidence?: string | null;
};

export type RunHistoryDoc = {
  _meta?: {
    schema_version?: string;
    writer?: string;
    source?: string;
    generated_at?: string | null;
    generated_default?: boolean;
    read_only?: boolean;
    total?: number;
    shown?: number;
    note?: string;
  };
  runs?: RunHistoryRow[];
};

// generated_default ⇒ the sync wrote a placeholder; no producer has run.
export function isRunHistoryDefault(doc: RunHistoryDoc | null): boolean {
  if (!doc) return true;
  return doc._meta?.generated_default === true;
}

const MAX_ROWS = 8;

// Operator-safe status palette. Unknown statuses fall back to neutral grey.
const STATUS_COLOR: Record<string, string> = {
  completed: "#15803d",
  failed: "#b91c1c",
  "owner-gate-skipped": "#a16207",
  invalid: "#b45309",
};

function statusColor(status: string | null | undefined): string {
  return (status && STATUS_COLOR[status]) || "#525252";
}

export function RunHistoryCard({ doc }: { doc: RunHistoryDoc | null }) {
  const isDefault = isRunHistoryDefault(doc);
  const runs = doc?.runs ?? [];
  const total = doc?._meta?.total ?? runs.length;
  const generatedAt = doc?._meta?.generated_at ?? null;
  const shown = runs.slice(0, MAX_ROWS);

  return (
    <section
      aria-label="היסטוריית ריצות — Harness"
      data-testid="run-history-card"
      data-display-state={isDefault ? "no_source" : runs.length === 0 ? "empty" : "populated"}
      style={{ border: "1px solid #e5e7eb", background: "#fafafa", borderRadius: 10, padding: 12, marginBottom: 14 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#1f2937" }}>
        <span>היסטוריית ריצות · Harness</span>
        <span data-testid="run-history-count" style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>
          {isDefault ? "פרויקציה טרם נוצרה" : `${total} ריצות`}
        </span>
      </div>

      {isDefault ? (
        <div data-testid="run-history-empty" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
          פרויקציית <code style={{ fontSize: 11 }}>run_history.json</code> טרם סונכרנה — אין נתוני ריצה להצגה.
        </div>
      ) : runs.length === 0 ? (
        <div data-testid="run-history-empty" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
          טרם נצפו ריצות. כשתירשם ריצה דרך ה-runtime היא תופיע כאן.
        </div>
      ) : (
        <ul data-testid="run-history-list" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.map((r, i) => (
            <li
              key={r.run_id ?? i}
              data-testid="run-history-row"
              style={{ borderTop: i === 0 ? "none" : "1px solid #eee", paddingTop: i === 0 ? 0 : 6, fontSize: 12, color: "#374151" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <code style={{ fontSize: 11, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>
                  {r.run_id ?? "—"}
                </code>
                <span data-testid="run-history-status" style={{ color: statusColor(r.status), fontWeight: 600 }}>
                  {r.status ?? "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#6b7280", marginTop: 2 }}>
                <span>
                  {r.final_decision ? <strong>{r.final_decision}</strong> : null}
                  {r.stop_reason ? ` · ${r.stop_reason}` : ""}
                  {r.owner_gated ? " · owner-gate" : ""}
                </span>
                <span>{r.timestamp ? relativeTimeHe(r.timestamp) : "—"}</span>
              </div>
              {r.evidence ? (
                <div data-testid="run-history-evidence" style={{ marginTop: 2, color: "#6b7280" }}>
                  עדות: <code style={{ fontSize: 11 }}>{r.evidence}</code>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!isDefault && runs.length > MAX_ROWS ? (
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
          מציג {MAX_ROWS} מתוך {total} ריצות.
        </div>
      ) : null}

      <div data-testid="run-history-freshness" style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
        {generatedAt ? `עודכן: ${relativeTimeHe(generatedAt)}` : "עודכן: לא ידוע"}
      </div>
    </section>
  );
}
