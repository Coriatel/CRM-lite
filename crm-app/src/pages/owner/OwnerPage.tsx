import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useControlTowerPacket } from "../../hooks/useControlTowerPacket";
import {
  verdictHe,
  verdictTone,
  confidenceHe,
  gateKindHe,
  gateSummaryHe,
  reversibilityHe,
  actionsHe,
  humanizeRationale,
  humanizeLabel,
  humanizeSuggestedAction,
  fmtClock,
  fmtAgeDays,
} from "./ownerCopy";

const TONE_COLOR: Record<string, string> = {
  ok: "var(--color-success)",
  warn: "var(--color-warning)",
  danger: "var(--color-danger)",
  muted: "var(--color-text-secondary)",
};

const wrap: React.CSSProperties = { overflowWrap: "anywhere" };

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)", margin: "0 0 8px" }}>
      {children}
    </h2>
  );
}

function Card({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <section
      className="card"
      style={{
        padding: "var(--spacing-md)",
        borderInlineStart: accent ? `4px solid ${accent}` : undefined,
      }}
    >
      {children}
    </section>
  );
}

/** Evidence/notes fold — explicit toggle (no hover, no hidden control). */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          padding: "6px 0",
          minHeight: 44,
          color: "var(--color-primary)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {open ? "הסתר פרטים" : label}
      </button>
      {open && (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", ...wrap }}>{children}</div>
      )}
    </div>
  );
}

function DrillRow({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-sm)",
        textDecoration: "none",
        color: "var(--color-text)",
        minHeight: 44,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      <ChevronLeft size={18} aria-hidden style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
    </Link>
  );
}

export function OwnerPage() {
  const { packet, fetchedAt, loading, unavailable } = useControlTowerPacket();
  const now = packet?.now;
  const needs = packet?.needs_you;
  const next = packet?.next;
  const health = packet?.health;

  const gates = needs?.gates ?? [];
  const blockers = needs?.owner_blockers ?? [];
  const recommendation = humanizeLabel(now?.label ?? undefined);
  const why = humanizeRationale(now?.rationale);
  const actions = actionsHe(now?.actions);

  return (
    <main
      dir="rtl"
      className="main-content"
      style={{ maxWidth: 760, margin: "0 auto", paddingBottom: "var(--spacing-xl)" }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: "var(--z-nav)" as unknown as number,
          background: "var(--color-bg)",
          padding: "var(--spacing-md) 0 var(--spacing-sm)",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700 }}>מרכז בקרה</span>
      </header>

      {loading && (
        <div style={{ padding: "var(--spacing-lg)", textAlign: "center" }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && unavailable && (
        <Card>
          <div data-testid="owner-unavailable" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>המידע אינו זמין כעת</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6 }}>
              לא ניתן לטעון את תמונת המצב. הלוח ינסה שוב אוטומטית.
            </div>
          </div>
        </Card>
      )}

      {!loading && !unavailable && packet && (
        <div style={{ display: "grid", gap: "var(--spacing-md)" }}>
          {/* תמונת מצב */}
          <section data-testid="owner-status">
            <SectionHeading>תמונת מצב</SectionHeading>
            <Card accent={TONE_COLOR[verdictTone(health?.verdict)]}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
                <span
                  data-testid="owner-health"
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: TONE_COLOR[verdictTone(health?.verdict)],
                    flex: 1,
                  }}
                >
                  {verdictHe(health?.verdict)}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{fmtClock(fetchedAt ?? undefined)}</span>
              </div>
              <div style={{ fontSize: 14, marginTop: 6, ...wrap }}>{recommendation}</div>
            </Card>
          </section>

          {/* מה אני ממליץ */}
          <section data-testid="owner-recommend">
            <SectionHeading>מה אני ממליץ</SectionHeading>
            <Card accent="var(--color-primary)">
              <div style={{ fontSize: 15, fontWeight: 600, ...wrap }}>{recommendation}</div>
              {why && (
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4, ...wrap }}>{why}</div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                {actions.map((a) => (
                  <span
                    key={a}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      background: "var(--color-primary)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 12px",
                    }}
                  >
                    {a}
                  </span>
                ))}
                {confidenceHe(now?.confidence) && (
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    רמת ודאות: {confidenceHe(now?.confidence)}
                  </span>
                )}
              </div>
              {now?.route && (
                <div style={{ marginTop: 8 }}>
                  <DrillRow to={now.route}>פתח את הפריט</DrillRow>
                </div>
              )}
              {(now?.label || now?.rationale) && (
                <Fold label="פרטים">
                  {now?.label && <div>הפעולה המלאה: {now.label}</div>}
                  {now?.rationale && <div style={{ marginTop: 4 }}>נימוק: {now.rationale}</div>}
                  {now?.source && <div style={{ marginTop: 4 }}>מקור: {now.source}</div>}
                </Fold>
              )}
            </Card>
          </section>

          {/* מה תקוע */}
          <section data-testid="owner-blocked">
            <SectionHeading>מה תקוע</SectionHeading>
            <Card>
              <DrillRow to="/ops#ops-card-owner-gates">
                <span style={{ fontWeight: 600 }}>החלטות שממתינות לך</span>
                <span style={{ color: "var(--color-warning)", fontWeight: 700, marginInlineStart: 8 }}>
                  {needs?.gate_count ?? gates.length}
                </span>
              </DrillRow>
              {gates.slice(0, 3).map((g, i) => (
                <div
                  key={g.id ?? i}
                  data-testid="owner-gate-row"
                  style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 8 }}
                >
                  <div style={{ fontSize: 14, ...wrap }}>{gateSummaryHe(g.summary, g.kind)}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                    {gateKindHe(g.kind)}
                    {fmtAgeDays(g.age_days) ? ` · ${fmtAgeDays(g.age_days)}` : ""}
                    {reversibilityHe(g.reversibility) ? ` · ${reversibilityHe(g.reversibility)}` : ""}
                  </div>
                  {humanizeSuggestedAction(g.suggested_action) && (
                    <div style={{ fontSize: 13, color: "var(--color-primary)", fontWeight: 600, marginTop: 4 }}>
                      {humanizeSuggestedAction(g.suggested_action)}
                    </div>
                  )}
                </div>
              ))}

              <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 10, paddingTop: 10 }}>
                <DrillRow to="/ops#ops-card-blockers">
                  <span style={{ fontWeight: 600 }}>חסימות שדורשות פעולה</span>
                  <span style={{ color: "var(--color-danger)", fontWeight: 700, marginInlineStart: 8 }}>
                    {blockers.length}
                  </span>
                </DrillRow>
                {blockers.slice(0, 3).map((b, i) => (
                  <div
                    key={b.id ?? i}
                    data-testid="owner-blocker-row"
                    style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 8 }}
                  >
                    <div style={{ fontSize: 14, ...wrap }}>
                      <span style={{ fontWeight: 700 }}>{i + 1}. </span>
                      {b.summary && !/^[a-z0-9_:-]+$/i.test(b.summary) ? b.summary : "חסימה פתוחה"}
                    </div>
                    {b.needs && (
                      <div style={{ fontSize: 13, color: "var(--color-primary)", fontWeight: 600, marginTop: 4, ...wrap }}>
                        {b.needs}
                      </div>
                    )}
                    {fmtAgeDays(b.age_days) && (
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                        {fmtAgeDays(b.age_days)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* מה רץ עכשיו */}
          <section data-testid="owner-running">
            <SectionHeading>מה רץ עכשיו</SectionHeading>
            <Card>
              <DrillRow to="/ops#ops-card-operational-queue">
                <span style={{ fontWeight: 600 }}>עבודות בתור</span>
                <span style={{ fontWeight: 700, marginInlineStart: 8 }}>{next?.planned_total ?? next?.items?.length ?? 0}</span>
              </DrillRow>
              {next?.items?.[0]?.label && (
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 6, ...wrap }}>
                  הבא בתור: {humanizeLabel(next.items[0].label, 70)}
                </div>
              )}
            </Card>
          </section>

          {/* הערות */}
          {health && (
            <section data-testid="owner-notes">
              <SectionHeading>הערות</SectionHeading>
              <Card>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  {fmtClock(fetchedAt ?? undefined)} · {verdictHe(health.verdict)}
                </div>
                <Fold label="מצב מקורות הנתונים">
                  <div>
                    {health.surfaces_fresh ?? "—"} מתוך {health.surfaces_total ?? "—"} מקורות עדכניים
                  </div>
                  {(health.surfaces_degraded ?? 0) > 0 && (
                    <div style={{ marginTop: 4 }}>{health.surfaces_degraded} מקורות לא התעדכנו</div>
                  )}
                </Fold>
              </Card>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
