import { relativeTimeHe } from "./OpsPage";

// Shape contract:
//   automation-registry/scripts/build-run-governance.py (Phase G5) → state/run_governance.json.
// Read-only governance posture: owner-gates the runtime recorded, budget limits hit,
// runtime posture (by status / decision / in-flight), and stop reasons. Reports recorded
// decisions; it does NOT re-decide policy and never executes anything.

export type RunGovernanceBudgetRow = {
  run_id?: string | null;
  stop_reason?: string | null;
  max_iterations?: number | null;
  max_duration_seconds?: number | null;
  dispatched?: number | null;
};

export type RunGovernanceDoc = {
  _meta?: {
    schema_version?: string;
    writer?: string;
    source?: string;
    generated_at?: string | null;
    generated_default?: boolean;
    read_only?: boolean;
    total_runs?: number;
    note?: string;
  };
  owner_gates?: {
    skipped_runs?: string[];
    pending_requests?: string[];
    count?: number;
  };
  budget_posture?: {
    limit_reached_runs?: RunGovernanceBudgetRow[];
    count?: number;
  };
  runtime_posture?: {
    by_status?: Record<string, number>;
    by_decision?: Record<string, number>;
    in_flight?: number;
    total_runs?: number;
  };
  stop_reasons?: Record<string, number>;
};

export function isRunGovernanceDefault(doc: RunGovernanceDoc | null): boolean {
  if (!doc) return true;
  return doc._meta?.generated_default === true;
}

// Attention when the runtime recorded owner-gated or budget-limited runs.
export function runGovernanceSeverity(doc: RunGovernanceDoc | null): "info" | "watch" {
  if (!doc || isRunGovernanceDefault(doc)) return "info";
  const gates = doc.owner_gates?.count ?? 0;
  const budget = doc.budget_posture?.count ?? 0;
  return gates > 0 || budget > 0 ? "watch" : "info";
}

function Breakdown({ label, map }: { label: string; map: Record<string, number> | undefined }) {
  const entries = Object.entries(map ?? {});
  if (entries.length === 0) return null;
  return (
    <div data-testid={`run-governance-breakdown-${label}`} style={{ marginTop: 6, fontSize: 12, color: "#374151" }}>
      <span style={{ fontWeight: 600, color: "#4b5563" }}>{label}: </span>
      {entries.map(([k, v], i) => (
        <span key={k}>
          {i > 0 ? " · " : ""}
          <code style={{ fontSize: 11 }}>{k}</code>={v}
        </span>
      ))}
    </div>
  );
}

export function RunGovernanceCard({ doc }: { doc: RunGovernanceDoc | null }) {
  const isDefault = isRunGovernanceDefault(doc);
  const severity = runGovernanceSeverity(doc);
  const gates = doc?.owner_gates ?? {};
  const budget = doc?.budget_posture ?? {};
  const posture = doc?.runtime_posture ?? {};
  const stopReasons = doc?.stop_reasons ?? {};
  const totalRuns = doc?._meta?.total_runs ?? posture.total_runs ?? 0;
  const generatedAt = doc?._meta?.generated_at ?? null;

  const severityLabel = severity === "watch" ? "במעקב" : "תקין";
  const severityBg = severity === "watch" ? "#a16207" : "#525252";
  const skipped = gates.skipped_runs ?? [];
  const pending = gates.pending_requests ?? [];
  const limitRuns = budget.limit_reached_runs ?? [];

  return (
    <section
      aria-label="מצב ממשל — Harness"
      data-testid="run-governance-card"
      data-display-state={isDefault ? "no_source" : "populated"}
      data-severity={severity}
      style={{ border: "1px solid #e5e7eb", background: "#fafafa", borderRadius: 10, padding: 12, marginBottom: 14 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#1f2937" }}>
        <span>
          {!isDefault ? (
            <span
              data-testid="run-governance-severity"
              style={{ background: severityBg, color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 10, marginInlineEnd: 6 }}
            >
              {severityLabel}
            </span>
          ) : null}
          מצב ממשל · Harness
        </span>
        <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>
          {isDefault ? "פרויקציה טרם נוצרה" : `${totalRuns} ריצות`}
        </span>
      </div>

      {isDefault ? (
        <div data-testid="run-governance-empty" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
          פרויקציית <code style={{ fontSize: 11 }}>run_governance.json</code> טרם סונכרנה — אין מצב ממשל להצגה.
        </div>
      ) : (
        <>
          <div data-testid="run-governance-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            <div data-testid="run-governance-gates" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 2px", borderRadius: 6, background: "rgba(0,0,0,0.04)" }}>
              <span style={{ fontWeight: 600, fontSize: 18, color: (gates.count ?? 0) > 0 ? "#a16207" : "#525252" }}>{gates.count ?? 0}</span>
              <span style={{ fontSize: 10, color: "#6b7280" }}>owner-gates</span>
            </div>
            <div data-testid="run-governance-budget" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 2px", borderRadius: 6, background: "rgba(0,0,0,0.04)" }}>
              <span style={{ fontWeight: 600, fontSize: 18, color: (budget.count ?? 0) > 0 ? "#a16207" : "#525252" }}>{budget.count ?? 0}</span>
              <span style={{ fontSize: 10, color: "#6b7280" }}>חריגות תקציב</span>
            </div>
            <div data-testid="run-governance-inflight" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 2px", borderRadius: 6, background: "rgba(0,0,0,0.04)" }}>
              <span style={{ fontWeight: 600, fontSize: 18, color: "#525252" }}>{posture.in_flight ?? 0}</span>
              <span style={{ fontSize: 10, color: "#6b7280" }}>in-flight</span>
            </div>
          </div>

          <Breakdown label="לפי סטטוס" map={posture.by_status} />
          <Breakdown label="לפי החלטה" map={posture.by_decision} />
          <Breakdown label="סיבות עצירה" map={stopReasons} />

          {skipped.length > 0 ? (
            <div data-testid="run-governance-skipped" style={{ marginTop: 6, fontSize: 12, color: "#92400e" }}>
              נדחו ב-owner-gate: {skipped.map((id) => <code key={id} style={{ fontSize: 11, marginInlineStart: 4 }}>{id}</code>)}
            </div>
          ) : null}
          {pending.length > 0 ? (
            <div data-testid="run-governance-pending" style={{ marginTop: 6, fontSize: 12, color: "#92400e" }}>
              ממתינים לאישור: {pending.map((id) => <code key={id} style={{ fontSize: 11, marginInlineStart: 4 }}>{id}</code>)}
            </div>
          ) : null}
          {limitRuns.length > 0 ? (
            <ul data-testid="run-governance-limit-runs" style={{ listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: 12, color: "#374151" }}>
              {limitRuns.slice(0, 5).map((r, i) => (
                <li key={r.run_id ?? i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <code style={{ fontSize: 11 }}>{r.run_id ?? "—"}</code>
                  <span style={{ color: "#6b7280" }}>{r.stop_reason ?? "—"} · dispatched={r.dispatched ?? 0}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <div data-testid="run-governance-freshness" style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
        {generatedAt ? `עודכן: ${relativeTimeHe(generatedAt)}` : "עודכן: לא ידוע"}
      </div>
    </section>
  );
}
