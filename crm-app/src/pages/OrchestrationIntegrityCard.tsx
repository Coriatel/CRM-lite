import { relativeTimeHe } from "./OpsPage";

// Shape contract:
//   /srv/ops-vault/state/orchestrator_integrity.schema.json (v0).
// Read-only operator-facing "is the orchestrator trustworthy right now?"
// projection. Consumed via /ops-data/orchestrator_integrity.json.
//
// Cross-lane slice 3 of the orchestration-visibility track:
//   slice 1 (ops-vault cba537e)  — build-orchestration.py writer (scheduler telemetry projection)
//   slice 2 (crm-lite PR #84)    — sync-ops-data.mjs wiring + safe-empty envelope default
//   slice 3 (this card)          — operator-visible IntegrityCard
//
// Three display states:
//   not_published   : fetch returned null (typically HTTP 404 in production
//                     because the host Caddy serves /ops-data/* directly from
//                     /srv/ops-vault/state/ and ops-vault PR #89 hasn't merged
//                     yet, so the producer file does not exist). Card explicitly
//                     surfaces the PR gate.
//   default_envelope: doc._meta.generated_default === true. The sync-ops-data
//                     build wrote a safe-empty envelope because the vault file
//                     was missing at build time. Honesty rule per schema:
//                     integrity_status=red, safe_parallelism.confidence=unknown.
//   live            : real producer output. Status pill colored by
//                     integrity_status.status.

export type OrchestratorIntegrityMeta = {
  schema_version?: string;
  writer?: string;
  source?: string;
  generated_at?: string | null;
  generated_default?: boolean;
  note?: string;
};

export type OrchestratorIntegrityRegistry = {
  canonical_readable: boolean;
  canonical_mtime: string | null;
  canonical_age_seconds: number | null;
  heartbeat_ttl_seconds: number;
  canonical_stale: boolean;
  derived_projection_present: boolean;
  derived_mtime: string | null;
  derived_age_seconds: number | null;
  derived_provenance: string | null;
  fallback_used: boolean;
};

export type OrchestratorIntegritySessions = {
  active_count: number;
  stale_count: number;
  ownerless_count: number;
  ownerless_stale_count: number;
  stale_ids: string[];
};

export type OrchestratorIntegrityMerger = {
  timer_active: boolean;
  last_health_ts: string | null;
  last_health_age_seconds: number | null;
  last_applied: number;
  last_rejected: number;
  spool_depth_after: number;
  last_error: string | null;
  merger_healthy: boolean;
};

export type OrchestratorIntegrityProjectionDrift = {
  meta_manifest_regenerated_at: string | null;
  meta_manifest_age_seconds: number | null;
  meta_manifest_stale: boolean;
  drift_threshold_seconds: number;
  drifted_files: Array<{
    file: string;
    meta_mtime: string | null;
    freshness_mtime: string | null;
    delta_seconds: number;
  }>;
};

export type OrchestratorIntegrityRuntimeIssues = {
  open_count: number;
  by_severity: Record<string, number>;
  by_class: Record<string, number>;
};

export type OrchestratorIntegritySafeParallelism = {
  confidence: "high" | "degraded" | "unknown";
  reasons: string[];
};

export type OrchestratorIntegrityStatus = {
  status: "green" | "yellow" | "red";
  reasons: string[];
};

export type OrchestratorIntegrityDoc = {
  _meta?: OrchestratorIntegrityMeta;
  registry?: OrchestratorIntegrityRegistry;
  sessions?: OrchestratorIntegritySessions;
  merger?: OrchestratorIntegrityMerger;
  projection_drift?: OrchestratorIntegrityProjectionDrift;
  runtime_issues?: OrchestratorIntegrityRuntimeIssues;
  safe_parallelism?: OrchestratorIntegritySafeParallelism;
  integrity_status?: OrchestratorIntegrityStatus;
};

export type OrchestrationIntegrityDisplayState =
  | "not_published"
  | "default_envelope"
  | "live";

export function orchestrationIntegrityDisplayState(
  doc: OrchestratorIntegrityDoc | null,
): OrchestrationIntegrityDisplayState {
  if (!doc) return "not_published";
  if (doc._meta?.generated_default === true) return "default_envelope";
  return "live";
}

export function isOrchestrationIntegrityMissing(
  doc: OrchestratorIntegrityDoc | null,
): boolean {
  const state = orchestrationIntegrityDisplayState(doc);
  return state === "not_published" || state === "default_envelope";
}

const PALETTE = {
  green: { bg: "#f0fdf4", border: "#bbf7d0", head: "#166534", sub: "#15803d" },
  yellow: { bg: "#fffbeb", border: "#fde68a", head: "#78350f", sub: "#92400e" },
  red: { bg: "#fef2f2", border: "#fecaca", head: "#991b1b", sub: "#b91c1c" },
};

const STATUS_LABEL_HE: Record<"green" | "yellow" | "red", string> = {
  green: "תקין",
  yellow: "אזהרה",
  red: "מושבת",
};

const CONFIDENCE_LABEL_HE: Record<"high" | "degraded" | "unknown", string> = {
  high: "גבוהה",
  degraded: "ירודה",
  unknown: "לא ידועה",
};

export function OrchestrationIntegrityCard({
  doc,
}: {
  doc: OrchestratorIntegrityDoc | null;
}) {
  const state = orchestrationIntegrityDisplayState(doc);
  const status: "green" | "yellow" | "red" =
    state === "live" ? doc?.integrity_status?.status ?? "red" : "red";
  const p = PALETTE[status];
  const generatedAt = doc?._meta?.generated_at ?? null;

  const headerCount =
    state === "not_published"
      ? "טרם פורסם"
      : state === "default_envelope"
        ? "ברירת מחדל · מקור חסר"
        : `${STATUS_LABEL_HE[status]} · אמינות ${
            CONFIDENCE_LABEL_HE[doc?.safe_parallelism?.confidence ?? "unknown"]
          }`;

  return (
    <section
      aria-label="Orchestrator Integrity"
      data-testid="orchestration-integrity-card"
      data-display-state={state}
      data-integrity-status={state === "live" ? status : "red"}
      style={{
        border: `1px solid ${p.border}`,
        background: p.bg,
        borderRadius: 10,
        padding: 12,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 8,
          color: p.head,
        }}
      >
        <span>אמינות תזמורת · MN-OS</span>
        <span
          data-testid="orchestration-integrity-header-count"
          style={{ fontSize: 12, fontWeight: 400, color: p.sub }}
        >
          {headerCount}
        </span>
      </div>

      {state === "not_published" && (
        <div
          data-testid="orchestration-integrity-empty"
          style={{ fontSize: 12, color: p.head, lineHeight: 1.5 }}
        >
          ה־projection טרם פורסם. PR #89 על <code style={{ fontSize: 11 }}>ops-vault</code>{" "}
          (<code style={{ fontSize: 11 }}>feat/orchestrator-integrity-v0</code>) עדיין פתוח —{" "}
          הקובץ <code style={{ fontSize: 11 }}>state/orchestrator_integrity.json</code>{" "}
          לא קיים ב־<code style={{ fontSize: 11 }}>/srv/ops-vault/state/</code>.
          הכרטיס יתעדכן אוטומטית ברגע ש־PR ימוזג ל־main.
        </div>
      )}

      {state === "default_envelope" && (
        <div
          data-testid="orchestration-integrity-default"
          style={{ fontSize: 12, color: p.head, lineHeight: 1.5 }}
        >
          ה־projection חסר מה־vault בעת ה־build. נכתב envelope ברירת מחדל לשמירת חוזה הסכימה.
          לפי <code style={{ fontSize: 11 }}>_meta.generated_default=true</code> כל הקריאות
          וכל סימני הבריאוּת מוצגים כ־false וה־integrity_status="red".
        </div>
      )}

      {state === "live" && (
        <>
          {doc?.integrity_status?.reasons &&
            doc.integrity_status.reasons.length > 0 &&
            status !== "green" && (
              <ul
                data-testid="orchestration-integrity-reasons"
                style={{
                  listStyle: "disc inside",
                  padding: 0,
                  margin: "4px 0 8px",
                  fontSize: 12,
                  color: p.sub,
                }}
              >
                {doc.integrity_status.reasons.map((r, i) => (
                  <li key={`${i}-${r}`}>{r}</li>
                ))}
              </ul>
            )}

          <div
            data-testid="orchestration-integrity-counts"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 6,
              marginTop: 8,
              fontSize: 12,
              color: p.head,
            }}
          >
            <IntegrityCount
              label="פעילים"
              value={doc?.sessions?.active_count ?? null}
            />
            <IntegrityCount
              label="מיותמים"
              value={doc?.sessions?.ownerless_stale_count ?? null}
            />
            <IntegrityCount
              label="drift"
              value={doc?.projection_drift?.drifted_files?.length ?? null}
            />
            <IntegrityCount
              label="issues"
              value={doc?.runtime_issues?.open_count ?? null}
            />
          </div>

          <div
            data-testid="orchestration-integrity-merger"
            style={{ marginTop: 8, fontSize: 12, color: p.head, lineHeight: 1.5 }}
          >
            <div data-testid="orchestration-integrity-merger-timer">
              merger timer:{" "}
              <strong>
                {doc?.merger?.timer_active === true ? "פעיל" : "לא פעיל"}
              </strong>
              {" · "}
              merger health:{" "}
              <strong>
                {doc?.merger?.merger_healthy === true ? "תקין" : "ירוד"}
              </strong>
            </div>
            <div>
              last merger health:{" "}
              {doc?.merger?.last_health_ts ? (
                <span>
                  {relativeTimeHe(doc.merger.last_health_ts)} · applied=
                  {doc.merger.last_applied} · rejected={doc.merger.last_rejected}
                </span>
              ) : (
                <span style={{ color: "#a3a3a3" }}>never</span>
              )}
            </div>
            {doc?.merger?.last_error ? (
              <div
                data-testid="orchestration-integrity-merger-error"
                style={{ color: p.sub }}
              >
                last error:{" "}
                <code style={{ fontSize: 11 }}>{doc.merger.last_error}</code>
              </div>
            ) : null}
          </div>

          {doc?.safe_parallelism?.reasons &&
            doc.safe_parallelism.reasons.length > 0 &&
            (doc.safe_parallelism.confidence === "degraded" ||
              doc.safe_parallelism.confidence === "unknown") && (
              <div
                data-testid="orchestration-integrity-parallelism-reasons"
                style={{ marginTop: 8, fontSize: 12, color: p.sub, lineHeight: 1.5 }}
              >
                safe_parallelism (
                {CONFIDENCE_LABEL_HE[doc.safe_parallelism.confidence]}):
                <ul
                  style={{
                    listStyle: "disc inside",
                    padding: 0,
                    margin: "2px 0 0",
                  }}
                >
                  {doc.safe_parallelism.reasons.map((r, i) => (
                    <li key={`${i}-${r}`}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
        </>
      )}

      <div
        data-testid="orchestration-integrity-freshness"
        style={{ marginTop: 8, fontSize: 12, color: p.sub }}
      >
        {generatedAt ? (
          <>generated: {relativeTimeHe(generatedAt)}</>
        ) : (
          <span style={{ color: "#a3a3a3" }}>generated: unknown</span>
        )}
      </div>
    </section>
  );
}

function IntegrityCount({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const display = value === null || value === undefined ? "—" : String(value);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "4px 2px",
        borderRadius: 6,
        background: "rgba(0,0,0,0.04)",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 16 }}>{display}</span>
      <span style={{ fontSize: 10 }}>{label}</span>
    </div>
  );
}
