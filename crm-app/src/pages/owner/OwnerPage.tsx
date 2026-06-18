import { useControlTowerPacket } from "../../hooks/useControlTowerPacket";
import type { CtConfidence } from "../../hooks/useControlTowerPacket";
import { StaleChip } from "../../components/runtime/StaleChip";
import { PortalCard } from "./PortalCard";

// Shared vocabulary with the /ops Mission view (#179) and the Telegram shift
// manager, so all three surfaces speak ONE language. Kept in sync by convention;
// a future slice can extract this + the packet types into one shared module
// (blocked today only by the L0 card living inline in the OpsPage monolith).
const ACTION_HE: Record<string, string> = {
  continue: "המשך",
  inspect: "בדוק",
  approve: "אשר",
  reject: "דחה",
  answer_false_gate: "ענה לשער שגוי",
  open_session: "פתח סשן",
  close_ready: "סגור מוכנים",
};

function confLabel(c?: CtConfidence): string | null {
  if (!c) return null;
  return c === "FACT" ? "עובדה" : "הסקה";
}

function healthColor(verdict?: string): string {
  if (verdict === "OK") return "var(--color-success)";
  if (verdict === "DEGRADED") return "var(--color-warning)";
  return "var(--color-text-secondary)";
}

function healthHe(verdict?: string): string {
  if (verdict === "OK") return "תקין";
  if (verdict === "DEGRADED") return "פגום חלקית";
  return verdict ?? "לא ידוע";
}

const wrap: React.CSSProperties = { overflowWrap: "anywhere" };

export function OwnerPage() {
  const { packet, fetchedAt, loading, unavailable } = useControlTowerPacket();

  const now = packet?.now;
  const needs = packet?.needs_you;
  const next = packet?.next;
  const health = packet?.health;

  const gateCount = needs?.gate_count ?? needs?.gates?.length ?? 0;
  const blockerCount = needs?.owner_blockers?.length ?? 0;
  const oldest = needs?.oldest_age_days;

  return (
    <main
      dir="rtl"
      className="main-content"
      style={{ maxWidth: 760, margin: "0 auto", paddingBottom: "var(--spacing-xl)" }}
    >
      {/* Sticky orientation header — always tells you where you are. */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: "var(--z-nav)" as unknown as number,
          background: "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          padding: "var(--spacing-md) 0",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>
          🛰️ מרכז בקרה — מבט בעלים
        </span>
        <StaleChip fetchedAt={fetchedAt} thresholdMs={10 * 60 * 1000} />
        {health?.verdict && (
          <span
            data-testid="owner-health-pill"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              background: healthColor(health.verdict),
              borderRadius: "var(--radius-full)",
              padding: "2px 10px",
            }}
          >
            {healthHe(health.verdict)}
          </span>
        )}
      </header>

      {loading && (
        <div style={{ padding: "var(--spacing-lg)", textAlign: "center" }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && unavailable && (
        <section
          data-testid="owner-unavailable"
          className="card"
          style={{ padding: "var(--spacing-lg)", textAlign: "center" }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>המידע אינו זמין כעת</div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6 }}>
            לא ניתן לטעון את מבט-העל. הלוח ינסה שוב אוטומטית.
          </div>
        </section>
      )}

      {!loading && !unavailable && packet && (
        <>
          {/* L0 — Overview: the single thing to look at now. */}
          <section
            data-testid="owner-l0-now"
            className="card"
            aria-label="עכשיו — מבט על"
            style={{ padding: "var(--spacing-md)" }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>
              עכשיו · NOW
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, ...wrap }}>
              {now?.label ?? "—"}
              {confLabel(now?.confidence) && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-full)",
                    padding: "1px 8px",
                    marginInlineStart: 6,
                  }}
                >
                  {confLabel(now?.confidence)}
                </span>
              )}
            </div>
            {now?.rationale && (
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, ...wrap }}>
                {now.rationale}
              </div>
            )}
            {now?.actions && now.actions.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {now.actions.slice(0, 4).map((v) => (
                  <span
                    key={v}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-primary)",
                      background: "var(--color-bg-secondary)",
                      borderRadius: "var(--radius-sm)",
                      padding: "2px 8px",
                    }}
                  >
                    {ACTION_HE[v] ?? v}
                  </span>
                ))}
              </div>
            )}
            {now?.source && (
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 8 }}>
                מקור: {now.source}
              </div>
            )}
          </section>

          {/* L1 — Domain portals. Every card drills down. */}
          <div style={{ display: "grid", gap: "var(--spacing-sm)", marginTop: "var(--spacing-md)" }}>
            <PortalCard
              testId="portal-needs-you"
              icon="🔴"
              label="צריך אותך"
              count={needs?.count ?? 0}
              countTone={(needs?.count ?? 0) > 0 ? "danger" : "ok"}
              summary={`החלטות ${gateCount} · חסימות ${blockerCount}${
                oldest != null ? ` · הוותיק ${oldest} ימים` : ""
              }`}
              why="פריטים שממתינים להחלטה או לפעולה שלך"
              to={needs?.route ?? "/ops#owner-gates"}
            />
            <PortalCard
              testId="portal-decisions"
              icon="🗳️"
              label="החלטות ושערים"
              count={gateCount}
              countTone={gateCount > 0 ? "warn" : "ok"}
              why="אישורים שממתינים להכרעה שלך"
              to="/ops#owner-gates"
            />
            <PortalCard
              testId="portal-blockers"
              icon="⛔"
              label="חסימות"
              count={blockerCount}
              countTone={blockerCount > 0 ? "danger" : "ok"}
              why="דברים שתקועים עד שתפעל"
              to="/ops#ops-card-blockers"
            />
            <PortalCard
              testId="portal-next"
              icon="⚡"
              label="הצעד הבא"
              count={next?.planned_total ?? next?.items?.length ?? 0}
              countTone="muted"
              summary={next?.items?.[0]?.label}
              why="העבודה הבאה בתור"
              to={next?.route ?? "/ops#operational-queue"}
            />
            <PortalCard
              testId="portal-campaigns"
              icon="📋"
              label="קמפיינים"
              why="כל הקמפיינים הפעילים"
              to="/control"
            />
            <PortalCard
              testId="portal-automations"
              icon="🤖"
              label="אוטומציות"
              why="מצב האוטומציות והסגמנטים"
              to="/control"
            />
            <PortalCard
              testId="portal-health"
              icon="🩺"
              label="בריאות המערכת"
              count={healthHe(health?.verdict)}
              countTone={health?.verdict === "OK" ? "ok" : "warn"}
              summary={
                health
                  ? `${health.surfaces_fresh ?? "—"}/${health.surfaces_total ?? "—"} מקורות טריים · ${
                      health.producer_violations ?? 0
                    } חריגות`
                  : undefined
              }
              why="מצב הצינורות שמזינים את הלוח"
              to={health?.route ?? "/ops#producer-health"}
            />
          </div>
        </>
      )}
    </main>
  );
}
