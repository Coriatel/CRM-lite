import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Workflow, WorkflowsDoc } from "./OpsPage";
import {
  bodyLine,
  chipDisabled,
  sectionBox,
  sectionHead,
  subLine,
} from "./workflow-page-styles";

// Layer-3 Workflow Page for a single automation row. Slice 4 of the MN-OS UX
// runtime (5-section grammar). Read-only consumer of /ops-data/workflows.json.
// Copy-then-vary from OpsBlockerPage / OpsIssuePage: same grammar, different
// data contract (Workflow vs Blocker / RuntimeIssue), different severity axis
// (health × criticality vs age vs explicit severity), different family
// heuristic (dotted-prefix vs lane vs id prefix). §5 ships with the four
// closure-semantics fields inline (DoneCriteria / PressureRetired /
// UnblocksDownstream / RiskIfIgnored) per the UX activation plan §10.3 — not
// a retrofit, not a shared abstraction. The third concrete inline copy of
// closure-semantics earns the right to be factored; this is the first.

type LoadState = "loading" | "ready" | "error";

// Family = first two dotted segments when present (e.g. "wm.media"), else the
// first segment (e.g. "cron"), else the whole key. Operationally: workflows
// inside the same family share a producer/consumer chain; failures in one
// usually point at the same upstream.
export function workflowFamily(key: string): string {
  const parts = key.split(".");
  if (parts.length >= 3) return `${parts[0]}.${parts[1]}`;
  if (parts.length === 2) return parts[0];
  return key;
}

export function findWorkflow(
  doc: WorkflowsDoc | null,
  key: string,
): Workflow | null {
  const all = doc?.workflows ?? [];
  return all.find((w) => w.workflow_key === key) ?? null;
}

export function relatedWorkflows(
  doc: WorkflowsDoc | null,
  current: Workflow,
  limit = 5,
): Workflow[] {
  const fam = workflowFamily(current.workflow_key);
  const all = doc?.workflows ?? [];
  return all
    .filter(
      (w) =>
        w.workflow_key !== current.workflow_key &&
        workflowFamily(w.workflow_key) === fam,
    )
    .slice(0, limit);
}

async function fetchWorkflows(): Promise<WorkflowsDoc | null> {
  try {
    const r = await fetch("/ops-data/workflows.json", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as WorkflowsDoc;
  } catch {
    return null;
  }
}

const HEALTH_LABEL_HE: Record<string, string> = {
  healthy: "תקין",
  unknown: "לא ידוע",
  disabled: "מושבת",
  deprecated: "מיושן",
  stale: "ללא דיווח טרי",
  broken_suspected: "חשש לתקלה",
  broken_confirmed: "שבור (מאומת)",
  failing: "נכשל",
};

const CRITICALITY_LABEL_HE: Record<string, string> = {
  production_critical: "קריטי לפרודקשן",
  important: "חשוב",
  normal: "רגיל",
  low: "נמוך",
  unknown: "לא מסומן",
};

function isEnabled(w: Workflow): boolean {
  if (w.enabled === true) return true;
  if (w.enabled === false) return false;
  return (w.enabled ?? "").toString().toLowerCase() === "true";
}

function nextActionFor(w: Workflow): string {
  const h = (w.health ?? "").toLowerCase();
  if (!isEnabled(w) || h === "disabled") {
    return "מושבת. אין צורך בפעולה.";
  }
  if (h === "deprecated") {
    return "מיושן. שקול הסרה אחרי אימות שאין צרכן פעיל.";
  }
  if (h === "healthy") {
    const t = w.last_success_at ?? w.last_run_at;
    return t
      ? `אין צורך בפעולה. הצלחה אחרונה ב-${t}.`
      : "אין צורך בפעולה.";
  }
  if (h === "broken_confirmed" || h === "failing") {
    const t = w.last_failure_at ?? w.last_run_at;
    return t
      ? `בדוק את הלוגים והרץ מחדש. כשל אחרון ב-${t}.`
      : "בדוק את הלוגים והרץ מחדש.";
  }
  if (h === "broken_suspected") {
    return "חשש לתקלה. עקוב אחרי הריצה הבאה וודא הצלחה.";
  }
  if (h === "stale") {
    return "אין דיווח בריאות טרי. ודא ידנית שהתזרים אכן רץ.";
  }
  return "מצב לא ידוע. פתח את המקור ובדוק את הריצה האחרונה.";
}

// Hardcoded per-tenant lookup keyed by workflow_key — only for production_critical
// dependencies whose downstream string in workflows.json is too terse to be
// operator-meaningful. Keep this tiny; abstract only after 3 entries prove the
// shape. Fallback is the raw downstream field.
const DOWNSTREAM_NARRATIVE: Record<string, string> = {
  "wm.media.renew_drive_watch":
    "התראות push של Drive חוזרות; אין צורך בפולינג של 15 דקות.",
};

function unblocksDownstreamText(w: Workflow): string {
  const narrative = DOWNSTREAM_NARRATIVE[w.workflow_key];
  if (narrative) return narrative;
  const d = (w.downstream ?? "").trim();
  if (!d || d === "—") return "אין צרכנים מתועדים במורד הזרם.";
  return d;
}

export function OpsWorkflowPage() {
  const { workflow_key: rawKey } = useParams<{ workflow_key: string }>();
  const key = rawKey ? decodeURIComponent(rawKey) : "";
  const [doc, setDoc] = useState<WorkflowsDoc | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchWorkflows().then((d) => {
      if (cancelled) return;
      setDoc(d);
      setState(d == null ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const workflow = state === "ready" ? findWorkflow(doc, key) : null;

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-workflow-page"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "12px 14px 32px",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <nav style={{ marginBottom: 12 }}>
        <Link
          to="/ops"
          data-testid="ops-workflow-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      {state === "loading" && (
        <div data-testid="ops-workflow-loading" style={bodyLine}>
          טוען נתוני תזרים…
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-workflow-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את נתוני התזרימים. נסה לרענן את הדף.
        </div>
      )}

      {state === "ready" && !workflow && (
        <div data-testid="ops-workflow-not-found" role="status" style={sectionBox}>
          <h1 style={{ fontSize: 16, margin: "0 0 6px 0" }}>תזרים לא נמצא</h1>
          <p style={bodyLine}>
            לא נמצא תזרים עם המזהה <code>{key}</code>. ייתכן שהוא הוסר
            מ-workflows.json, שונה בשם, או שהקישור שגוי.
          </p>
        </div>
      )}

      {state === "ready" && workflow && (
        <WorkflowWorkflow workflow={workflow} doc={doc} />
      )}
    </main>
  );
}

function WorkflowWorkflow({
  workflow,
  doc,
}: {
  workflow: Workflow;
  doc: WorkflowsDoc | null;
}) {
  const h = (workflow.health ?? "").toLowerCase();
  const crit = (workflow.criticality ?? "").toLowerCase();
  const isProdCrit = crit === "production_critical";
  const related = relatedWorkflows(doc, workflow);
  const healthLabel = HEALTH_LABEL_HE[h] ?? workflow.health ?? "לא ידוע";
  const critLabel = CRITICALITY_LABEL_HE[crit] ?? workflow.criticality ?? "—";

  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <h1
          data-testid="ops-workflow-title"
          style={{ fontSize: 17, margin: "0 0 4px 0", lineHeight: 1.35 }}
        >
          {workflow.name ?? workflow.workflow_key}
        </h1>
        <div style={{ fontSize: 11, color: "#737373", direction: "ltr", unicodeBidi: "isolate" }}>
          <code>{workflow.workflow_key}</code>
        </div>
      </header>

      <section data-testid="section-situation" style={sectionBox}>
        <h2 style={sectionHead}>מצב נוכחי</h2>
        <p style={bodyLine}>
          <strong>בריאות: </strong>
          {healthLabel}
          {workflow.health && !HEALTH_LABEL_HE[h] ? ` (${workflow.health})` : ""}
        </p>
        <p style={subLine}>
          <strong>קריטיות: </strong>
          {critLabel}
        </p>
        {workflow.source_system && (
          <p style={subLine}>
            <strong>מערכת מקור: </strong>
            {workflow.source_system}
          </p>
        )}
        {workflow.owner && (
          <p style={subLine}>
            <strong>בעלים: </strong>
            {workflow.owner}
          </p>
        )}
        {workflow.last_success_at && (
          <p style={subLine}>
            <strong>הצלחה אחרונה: </strong>
            {workflow.last_success_at}
          </p>
        )}
        {workflow.last_failure_at && (
          <p style={subLine}>
            <strong>כשל אחרון: </strong>
            {workflow.last_failure_at}
          </p>
        )}
      </section>

      <section data-testid="section-next-action" style={sectionBox}>
        <h2 style={sectionHead}>הצעד הבא</h2>
        <p style={bodyLine}>{nextActionFor(workflow)}</p>
      </section>

      <section data-testid="section-assets" style={sectionBox}>
        <h2 style={sectionHead}>חומרים רלוונטיים</h2>
        {workflow.source_path ? (
          <p style={bodyLine}>
            <strong>נתיב מקור: </strong>
            <code style={{ fontSize: 12 }}>{workflow.source_path}</code>
          </p>
        ) : (
          <p style={bodyLine}>אין נתיב מקור מתועד.</p>
        )}
        {workflow.upstream && workflow.upstream !== "—" && (
          <p style={subLine}>
            <strong>במעלה הזרם: </strong>
            {workflow.upstream}
          </p>
        )}
        {workflow.downstream && workflow.downstream !== "—" && (
          <p style={subLine}>
            <strong>במורד הזרם: </strong>
            {workflow.downstream}
          </p>
        )}
        {workflow.artifacts && workflow.artifacts !== "—" && (
          <p style={subLine}>
            <strong>פלטים: </strong>
            {workflow.artifacts}
          </p>
        )}
        {workflow.logs && workflow.logs !== "—" && (
          <p style={subLine}>
            <strong>לוגים: </strong>
            {workflow.logs}
          </p>
        )}
      </section>

      <section data-testid="section-related" style={sectionBox}>
        <h2 style={sectionHead}>תזרימים נוספים באותה משפחה</h2>
        {related.length === 0 ? (
          <p style={bodyLine}>אין תזרימים נוספים באותה משפחה.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {related.map((r) => (
              <li key={r.workflow_key} style={subLine}>
                <Link
                  to={`/ops/workflows/${encodeURIComponent(r.workflow_key)}`}
                  data-testid="related-workflow-link"
                  style={{ color: "#2563eb", textDecoration: "none" }}
                >
                  {r.name ?? r.workflow_key}
                </Link>
                {r.health ? ` · ${HEALTH_LABEL_HE[r.health.toLowerCase()] ?? r.health}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="section-resolution" style={sectionBox}>
        <h2 style={sectionHead}>פעולות סיום</h2>

        <p style={subLine} data-testid="closure-done-criteria">
          <strong>סיום נראה כך: </strong>
          {h === "broken_confirmed" || h === "failing"
            ? "last_run_at טרי יותר מ-last_failure_at."
            : h === "broken_suspected"
              ? "הריצה הבאה מסתיימת בהצלחה ללא התרעה."
              : h === "stale"
                ? "last_success_at חוזר לפי הקצב המצופה."
                : h === "disabled"
                  ? "enabled=true ו-last_run_at קיים אחרי ההפעלה."
                  : h === "deprecated"
                    ? "התזרים מוסר אחרי שמוודאים שאין צרכן פעיל."
                    : "אין פעולה נדרשת — הדף אינפורמטיבי."}
        </p>

        <p style={subLine} data-testid="closure-pressure-retired">
          <strong>הלחץ שמתפנה: </strong>
          {isProdCrit
            ? "סיכון לדממה שקטה בצינור פרודקשן יורד מהשולחן."
            : crit === "important"
              ? "רעש תזרים פוחת בלוח התפעול."
              : "אין לחץ תפעולי משמעותי שמתפנה."}
        </p>

        <p style={subLine} data-testid="closure-unblocks-downstream">
          <strong>מה משחרר במורד הזרם: </strong>
          {unblocksDownstreamText(workflow)}
        </p>

        <p style={subLine} data-testid="closure-risk-if-ignored">
          <strong>הסיכון אם מתעלמים: </strong>
          {isProdCrit && h !== "healthy"
            ? "פגיעה שקטה בפרודקשן; כשלים אילמים לבעלים; אפשר זליגת נתונים."
            : crit === "important" && h !== "healthy"
              ? "אובדן נראות תפעולית; בלבול אפשרי למפעיל."
              : "נמוך; אינפורמטיבי בלבד."}
        </p>

        <p style={{ ...subLine, marginTop: 8 }}>קריאה-בלבד בגרסה זו. כתיבה תוטמע בסליס נפרד.</p>
        <div>
          <span style={chipDisabled} title="בקרוב">
            פתח לוגים
          </span>
          <span style={chipDisabled} title="בקרוב">
            הרץ מחדש
          </span>
          <span style={chipDisabled} title="בקרוב">
            סמן בטוח לבדיקה
          </span>
        </div>
      </section>
    </>
  );
}
