import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AUTOMATION_HEALTH_LABEL_HE,
  automationHealthColor,
  type AutomationInventoryDoc,
  type AutomationRow,
} from "./OpsPage";
import { bodyLine, chipDisabled, sectionBox, sectionHead, subLine } from "./workflow-page-styles";

// Layer-3 drilldown for a single automation row from automation_runtime_inventory.json.
// Read-only consumer; copy-then-vary from OpsWorkflowPage (same 5-section grammar).
// Action chips are DISABLED — the act-plane (rerun/pause/disable) is owner-gated per C6.

type LoadState = "loading" | "ready" | "error";

export function findAutomation(
  doc: AutomationInventoryDoc | null,
  id: string,
): AutomationRow | null {
  return (doc?.automations ?? []).find((a) => a.id === id) ?? null;
}

export function relatedAutomations(
  doc: AutomationInventoryDoc | null,
  current: AutomationRow,
  limit = 5,
): AutomationRow[] {
  return (doc?.automations ?? [])
    .filter((a) => a.id !== current.id && a.platform === current.platform)
    .slice(0, limit);
}

async function fetchInventory(): Promise<AutomationInventoryDoc | null> {
  try {
    const r = await fetch("/ops-data/automation_runtime_inventory.json", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as AutomationInventoryDoc;
  } catch {
    return null;
  }
}

function healthLabel(h: string | undefined): string {
  return AUTOMATION_HEALTH_LABEL_HE[(h ?? "").toLowerCase()] ?? h ?? "לא ידוע";
}

function nextActionFor(a: AutomationRow): string {
  const h = (a.health_status ?? "").toLowerCase();
  if (h === "disabled") return "מושבת. אין צורך בפעולה.";
  if (h === "deprecated") return "מיושן. שקול הסרה אחרי אימות שאין צרכן פעיל.";
  if (h === "healthy") {
    const t = a.last_success_at ?? a.last_run_at;
    return t ? `אין צורך בפעולה. הצלחה אחרונה ב-${t}.` : "אין צורך בפעולה.";
  }
  if (h === "failing" || h === "broken_confirmed") {
    const t = a.last_failure_at ?? a.last_run_at;
    return t ? `בדוק את הלוגים והרץ מחדש. כשל אחרון ב-${t}.` : "בדוק את הלוגים והרץ מחדש.";
  }
  if (h === "degraded") return "ביצועים ירודים. בדוק את הריצה האחרונה והתלויות.";
  if (h === "broken_suspected") return "חשש לתקלה. עקוב אחרי הריצה הבאה וודא הצלחה.";
  if (h === "stale" || h === "stale_or_unhit") return "אין דיווח טרי. ודא ידנית שהאוטומציה רצה.";
  return "מצב לא ידוע. פתח את המקור ובדוק את הריצה האחרונה.";
}

function List({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <p style={subLine}>
      <strong>{label}: </strong>
      {items.join(" · ")}
    </p>
  );
}

export function OpsAutomationPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const [doc, setDoc] = useState<AutomationInventoryDoc | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchInventory().then((d) => {
      if (cancelled) return;
      setDoc(d);
      setState(d == null ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const a = state === "ready" ? findAutomation(doc, id) : null;

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-automation-page"
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
          data-testid="ops-automation-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      {state === "loading" && (
        <div data-testid="ops-automation-loading" style={bodyLine}>
          טוען נתוני אוטומציה…
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-automation-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את מצאי האוטומציות. נסה לרענן את הדף.
        </div>
      )}

      {state === "ready" && !a && (
        <div data-testid="ops-automation-not-found" role="status" style={sectionBox}>
          <h1 style={{ fontSize: 16, margin: "0 0 6px 0" }}>אוטומציה לא נמצאה</h1>
          <p style={bodyLine}>
            לא נמצאה אוטומציה עם המזהה <code>{id}</code>.
          </p>
        </div>
      )}

      {state === "ready" && a && <AutomationDetail a={a} doc={doc} />}
    </main>
  );
}

function AutomationDetail({ a, doc }: { a: AutomationRow; doc: AutomationInventoryDoc | null }) {
  const h = (a.health_status ?? "").toLowerCase();
  const related = relatedAutomations(doc, a);
  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <h1 data-testid="ops-automation-title" style={{ fontSize: 17, margin: "0 0 4px 0", lineHeight: 1.35 }}>
          {a.name ?? a.id}
        </h1>
        <div
          style={{
            fontSize: 11,
            color: "#737373",
            direction: "ltr",
            unicodeBidi: "isolate",
            overflowWrap: "anywhere",
          }}
        >
          <code>{a.id}</code>
        </div>
      </header>

      <section data-testid="section-situation" style={sectionBox}>
        <h2 style={sectionHead}>מצב נוכחי</h2>
        <p style={bodyLine}>
          <strong>בריאות: </strong>
          <span style={{ color: automationHealthColor(h) }}>{healthLabel(h)}</span>
          {a.health_status && !AUTOMATION_HEALTH_LABEL_HE[h] ? ` (${a.health_status})` : ""}
        </p>
        <p style={subLine}><strong>פלטפורמה: </strong>{a.platform ?? "—"}</p>
        {a.runtime_state ? <p style={subLine}><strong>מצב ריצה: </strong>{a.runtime_state}</p> : null}
        {a.owner ? <p style={subLine}><strong>בעלים: </strong>{a.owner}</p> : null}
        {a.last_success_at ? <p style={subLine}><strong>הצלחה אחרונה: </strong>{a.last_success_at}</p> : null}
        {a.last_failure_at ? <p style={subLine}><strong>כשל אחרון: </strong>{a.last_failure_at}</p> : null}
      </section>

      <section data-testid="section-trigger" style={sectionBox}>
        <h2 style={sectionHead}>מה מפעיל אותה</h2>
        <p style={bodyLine}>
          <strong>טריגר: </strong>
          {a.trigger_type ?? "—"}
          {a.trigger_detail ? ` · ${a.trigger_detail}` : ""}
        </p>
        {a.cadence ? <p style={subLine}><strong>קצב: </strong>{a.cadence}</p> : null}
      </section>

      <section data-testid="section-io" style={sectionBox}>
        <h2 style={sectionHead}>קלט / פלט / תלויות</h2>
        <List label="קלט" items={a.inputs} />
        <List label="פלט" items={a.outputs} />
        <List label="פרויקציות שנכתבות" items={a.projections_written} />
        <List label="תלויות" items={a.dependencies} />
        {a.source_path ? (
          <p style={subLine}>
            <strong>נתיב מקור: </strong>
            <code style={{ fontSize: 12, overflowWrap: "anywhere" }}>{a.source_path}</code>
          </p>
        ) : null}
      </section>

      <section data-testid="section-related" style={sectionBox}>
        <h2 style={sectionHead}>אוטומציות נוספות באותה פלטפורמה</h2>
        {related.length === 0 ? (
          <p style={bodyLine}>אין אוטומציות נוספות באותה פלטפורמה.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {related.map((r) => (
              <li key={r.id} style={subLine}>
                <Link
                  to={`/ops/automations/${encodeURIComponent(r.id)}`}
                  data-testid="related-automation-link"
                  style={{ color: "#2563eb", textDecoration: "none" }}
                >
                  {r.name ?? r.id}
                </Link>
                {r.health_status ? ` · ${healthLabel(r.health_status)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="section-resolution" style={sectionBox}>
        <h2 style={sectionHead}>הצעד הבא</h2>
        <p style={bodyLine}>{nextActionFor(a)}</p>
        {a.failure_mode ? <p style={subLine}><strong>מצב כשל: </strong>{a.failure_mode}</p> : null}
        {a.rollback_recovery ? (
          <p style={subLine}><strong>שחזור / החזרה: </strong>{a.rollback_recovery}</p>
        ) : null}
        {a.notes ? <p style={subLine}><strong>הערות: </strong>{a.notes}</p> : null}

        <p style={{ ...subLine, marginTop: 8 }}>קריאה-בלבד. בקרת הרצה/השבתה מחייבת אישור בעלים.</p>
        <div>
          <span style={chipDisabled} title="מחייב אישור בעלים">פתח לוגים</span>
          <span style={chipDisabled} title="מחייב אישור בעלים">הרץ מחדש</span>
          <span style={chipDisabled} title="מחייב אישור בעלים">השבת</span>
        </div>
      </section>
    </>
  );
}
