import { relativeTimeHe } from "./OpsPage";

// Shape contract:
//   automation-registry/scripts/build-run-status.py (Phase G2) → state/run_status.json.
// Read-only multi-run visibility: what is in flight (leased), what is queued (dropped,
// not yet claimed), and what recently finished. Public-safe, no execution.

export type RunStatusActive = {
  run_id?: string | null;
  leased_at?: string | null;
  lease_path?: string | null;
};

export type RunStatusQueued = {
  run_id?: string | null;
  mode?: string | null;
  requested_by?: string | null;
  requested_at?: string | null;
  owner_gated?: boolean | null;
  request_path?: string | null;
  status?: string | null;
};

export type RunStatusDoc = {
  _meta?: {
    schema_version?: string;
    writer?: string;
    source?: string;
    generated_at?: string | null;
    generated_default?: boolean;
    read_only?: boolean;
    active_count?: number;
    queued_count?: number;
    done_count?: number;
    note?: string;
  };
  active?: RunStatusActive[];
  queued?: RunStatusQueued[];
  done?: RunStatusQueued[];
};

export function isRunStatusDefault(doc: RunStatusDoc | null): boolean {
  if (!doc) return true;
  return doc._meta?.generated_default === true;
}

const MAX_PER_GROUP = 5;

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      data-testid={`run-status-metric-${label}`}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 2px", borderRadius: 6, background: "rgba(0,0,0,0.04)" }}
    >
      <span style={{ fontWeight: 600, fontSize: 18, color }}>{value}</span>
      <span style={{ fontSize: 10, color: "#6b7280" }}>{label}</span>
    </div>
  );
}

export function RunStatusCard({ doc }: { doc: RunStatusDoc | null }) {
  const isDefault = isRunStatusDefault(doc);
  const active = doc?.active ?? [];
  const queued = doc?.queued ?? [];
  const done = doc?.done ?? [];
  const activeCount = doc?._meta?.active_count ?? active.length;
  const queuedCount = doc?._meta?.queued_count ?? queued.length;
  const doneCount = doc?._meta?.done_count ?? done.length;
  const generatedAt = doc?._meta?.generated_at ?? null;
  const anyRun = active.length + queued.length + done.length > 0;

  return (
    <section
      aria-label="מצב ריצות — Harness"
      data-testid="run-status-card"
      data-display-state={isDefault ? "no_source" : anyRun ? "populated" : "empty"}
      style={{ border: "1px solid #e5e7eb", background: "#fafafa", borderRadius: 10, padding: 12, marginBottom: 14 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#1f2937" }}>
        <span>מצב ריצות · Harness</span>
        <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>
          {isDefault ? "פרויקציה טרם נוצרה" : "ראות רב-ריצתית"}
        </span>
      </div>

      {isDefault ? (
        <div data-testid="run-status-empty" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
          פרויקציית <code style={{ fontSize: 11 }}>run_status.json</code> טרם סונכרנה — אין מצב ריצה להצגה.
        </div>
      ) : (
        <>
          <div data-testid="run-status-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            <Metric label="פעילות" value={activeCount} color={activeCount > 0 ? "#15803d" : "#525252"} />
            <Metric label="ממתינות" value={queuedCount} color={queuedCount > 0 ? "#a16207" : "#525252"} />
            <Metric label="הושלמו" value={doneCount} color="#525252" />
          </div>

          {!anyRun ? (
            <div data-testid="run-status-empty" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, marginTop: 8 }}>
              אין ריצות פעילות, ממתינות או שהושלמו לאחרונה.
            </div>
          ) : null}

          {active.length > 0 ? (
            <div data-testid="run-status-active" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 2 }}>פעילות (lease)</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "#374151" }}>
                {active.slice(0, MAX_PER_GROUP).map((r, i) => (
                  <li key={r.run_id ?? i} data-testid="run-status-active-row" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <code style={{ fontSize: 11 }}>{r.run_id ?? "—"}</code>
                    <span style={{ color: "#6b7280" }}>{r.leased_at ? relativeTimeHe(r.leased_at) : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {queued.length > 0 ? (
            <div data-testid="run-status-queued" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 2 }}>ממתינות</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "#374151" }}>
                {queued.slice(0, MAX_PER_GROUP).map((r, i) => (
                  <li key={r.run_id ?? i} data-testid="run-status-queued-row" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <code style={{ fontSize: 11 }}>
                      {r.run_id ?? "—"}
                      {r.owner_gated ? " · owner-gate" : ""}
                    </code>
                    <span style={{ color: "#6b7280" }}>{r.requested_at ? relativeTimeHe(r.requested_at) : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {done.length > 0 ? (
            <div data-testid="run-status-done" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 2 }}>הושלמו לאחרונה</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "#374151" }}>
                {done.slice(0, MAX_PER_GROUP).map((r, i) => (
                  <li key={r.run_id ?? i} data-testid="run-status-done-row" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <code style={{ fontSize: 11 }}>{r.run_id ?? "—"}</code>
                    <span style={{ color: "#6b7280" }}>{r.status ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <div data-testid="run-status-freshness" style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
        {generatedAt ? `עודכן: ${relativeTimeHe(generatedAt)}` : "עודכן: לא ידוע"}
      </div>
    </section>
  );
}
