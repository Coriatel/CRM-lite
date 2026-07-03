import { useState } from "react";
import type React from "react";
import { Link, useParams } from "react-router-dom";
import {
  DECISIONS_ENABLED,
  DECISION_INBOX_URL,
  type DecisionCard,
  type DecisionInboxPacket,
} from "./decisionTypes";
import { ConfidenceChip, EvidenceDisclosure, UrgencyChip } from "./decisionUi";
import { relatedSystem } from "./decisionLogic";
import { useDarkChrome, useOpsPacket } from "./useOpsPacket";
import { footerStyle, pageStyle } from "./DecisionInboxPage";

// P1-B — Owner Decision View `/decision/:id` (flag OFF by default).
// A cockpit-native intermediary so the owner understands and acts on a decision WITHOUT
// being dropped into the legacy /ops pages. The only path to /ops is an explicit
// "advanced details" link inside this view.

const IMPACT_LABEL: Record<string, string> = { high: "גבוהה — דורש הכרעה", medium: "בינונית", low: "מידע בלבד" };

function findCard(doc: DecisionInboxPacket, id: string): DecisionCard | null {
  const pools: DecisionCard[] = [
    ...(doc.recommended_next ? [doc.recommended_next] : []),
    ...doc.requires_decision,
    ...doc.blocked_waiting,
    ...doc.high_risk,
    ...doc.alternatives,
  ];
  return pools.find((c) => c.id === id) ?? null;
}

export function OwnerDecisionView({ doc, id }: { doc: DecisionInboxPacket | null; id: string }) {
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  if (!doc) {
    return (
      <div dir="rtl" style={pageStyle}>
        <p style={{ color: "var(--mn-text-muted)" }}>טוען…</p>
      </div>
    );
  }
  const card = findCard(doc, id);
  if (!card) {
    return (
      <div dir="rtl" style={pageStyle} data-testid="decision-view-missing">
        <Link to="/decisions" style={backStyle}>→ חזרה</Link>
        <p style={{ marginTop: 16, color: "var(--mn-text-muted)" }}>ההחלטה לא נמצאה (ייתכן שכבר טופלה).</p>
      </div>
    );
  }
  const sys = relatedSystem(card);
  return (
    <div dir="rtl" style={pageStyle} data-testid="owner-decision-view">
      <Link to="/decisions" data-testid="decision-back" style={backStyle}>→ חזרה להחלטות</Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
        <h1 data-testid="dv-title" style={titleStyle}>{card.title}</h1>
        <UrgencyChip urgency={String(card.urgency)} />
      </div>

      <dl style={{ margin: "14px 0 0" }}>
        <Field label="למה זה חשוב" testid="dv-why">{card.why_it_matters}</Field>
        <Field label="השפעה" testid="dv-impact">{IMPACT_LABEL[String(card.urgency)] ?? String(card.urgency)}</Field>
        <Field label="המלצה" testid="dv-recommendation" strong>{card.recommendation}</Field>
        {card.if_ignored && <Field label="אם מתעלמים" testid="dv-ifignored">{card.if_ignored}</Field>}
        {sys && <Field label="מערכת קשורה" testid="dv-system">{sys}</Field>}
        <Field label="ודאות" testid="dv-confidence"><ConfidenceChip confidence={card.confidence} /></Field>
        {typeof card.age_days === "number" && <Field label="ממתין" testid="dv-age">{Math.round(card.age_days)} ימים</Field>}
      </dl>

      <EvidenceDisclosure refs={card.evidence_refs} />

      {/* primary owner actions — placeholders until wired (no write-back in this build) */}
      <div style={actionRowStyle}>
        <button type="button" data-testid="dv-approve" onClick={() => setActionMsg("אישור יחווט בשלב ההפעלה — לעת עתה הפעולה אינה מבוצעת.")} style={approveStyle}>
          אשר ✓
        </button>
        <button type="button" data-testid="dv-reject" onClick={() => setActionMsg("דחייה תחווט בשלב ההפעלה — לעת עתה הפעולה אינה מבוצעת.")} style={rejectStyle}>
          דחה ✕
        </button>
      </div>
      {actionMsg && <p data-testid="dv-action-msg" style={{ marginTop: 8, fontSize: 12.5, color: "var(--mn-text-muted)" }}>{actionMsg}</p>}

      {/* the ONLY route to the legacy /ops detail — explicit, owner-initiated, secondary */}
      {card.route && (
        <Link to={card.route} data-testid="dv-open-details" style={openDetailsStyle}>
          פתח פרטים מתקדמים ←
        </Link>
      )}

      <footer style={footerStyle}>קריאה בלבד · החלטה במבט אחד</footer>
    </div>
  );
}

function Field({ label, children, testid, strong }: { label: string; children: React.ReactNode; testid: string; strong?: boolean }) {
  return (
    <div style={fieldStyle}>
      <dt style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mn-text-muted)" }}>{label}</dt>
      <dd data-testid={testid} style={{ margin: "2px 0 0", fontSize: strong ? 14.5 : 13.5, fontWeight: strong ? 700 : 500, color: "var(--mn-text-strong)", lineHeight: 1.45 }}>
        {children}
      </dd>
    </div>
  );
}

export function OwnerDecisionViewPage() {
  if (!DECISIONS_ENABLED) return null;
  return <OwnerDecisionViewFetcher />;
}

function OwnerDecisionViewFetcher() {
  useDarkChrome();
  const { id = "" } = useParams();
  const { doc } = useOpsPacket<DecisionInboxPacket>(DECISION_INBOX_URL);
  return <OwnerDecisionView doc={doc} id={decodeURIComponent(id)} />;
}

const backStyle: React.CSSProperties = { display: "inline-flex", minHeight: 44, alignItems: "center", color: "var(--mn-brand-teal)", textDecoration: "none", fontSize: 13.5, fontWeight: 600 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 800, color: "var(--mn-text-strong)", lineHeight: 1.25 };
const fieldStyle: React.CSSProperties = { padding: "9px 0", borderBottom: "1px solid var(--mn-border-fold)" };
const actionRowStyle: React.CSSProperties = { display: "flex", gap: 10, marginTop: 18 };
const approveStyle: React.CSSProperties = { flex: 1, minHeight: 48, border: "none", borderRadius: "var(--mn-radius-card)", background: "var(--mn-brand-teal)", color: "var(--ct-on-accent)", fontWeight: 800, fontSize: 15, cursor: "pointer", font: "inherit" };
const rejectStyle: React.CSSProperties = { flex: 1, minHeight: 48, borderRadius: "var(--mn-radius-card)", border: "1px solid var(--mn-critical)", background: "transparent", color: "var(--mn-critical)", fontWeight: 800, fontSize: 15, cursor: "pointer", font: "inherit" };
const openDetailsStyle: React.CSSProperties = { display: "inline-flex", minHeight: 44, alignItems: "center", marginTop: 14, color: "var(--mn-text-muted)", textDecoration: "underline", fontSize: 13 };

export default OwnerDecisionViewPage;
