import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import {
  openRuntimeIssues,
  parseSeverity,
  SEVERITY_LABEL_HE,
  type RuntimeIssue,
  type RuntimeIssuesDoc,
} from "./OpsPage";

// Layer-3 Workflow Page for a single runtime issue. Lane A slice 1 of the
// MN-OS UX runtime (5-section grammar: situation · next action · assets ·
// related context · resolution actions). Read-only against the producer-
// backed runtime-issues.json projection. v0 surfaces resolution actions as
// disabled chips — writes deferred to a later slice.

type LoadState = "loading" | "ready" | "error";

const sectionBox: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 10,
};

const sectionHead: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#525252",
  margin: "0 0 6px 0",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const bodyLine: CSSProperties = {
  fontSize: 13,
  color: "#262626",
  margin: "0 0 4px 0",
  lineHeight: 1.5,
};

const subLine: CSSProperties = {
  fontSize: 12,
  color: "#525252",
  margin: "0 0 2px 0",
};

const chipDisabled: CSSProperties = {
  display: "inline-block",
  background: "#f5f5f5",
  color: "#737373",
  border: "1px solid #e5e5e5",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  marginInlineEnd: 6,
  marginBottom: 6,
  cursor: "not-allowed",
};

// Group key for "related context" — issues that share a stable component
// family. For lock-contention-<hash> rows the family is "lock-contention";
// for everything else fall back to the id prefix before the last hyphen.
export function issueFamily(id: string): string {
  if (id.startsWith("lock-contention-")) return "lock-contention";
  const lastDash = id.lastIndexOf("-");
  if (lastDash <= 0) return id;
  return id.slice(0, lastDash);
}

export function findIssue(
  doc: RuntimeIssuesDoc | null,
  id: string,
): RuntimeIssue | null {
  const all = doc?.issues ?? [];
  return all.find((i) => i.id === id) ?? null;
}

export function relatedIssues(
  doc: RuntimeIssuesDoc | null,
  current: RuntimeIssue,
  limit = 5,
): RuntimeIssue[] {
  const fam = issueFamily(current.id);
  return openRuntimeIssues(doc)
    .filter((i) => i.id !== current.id && issueFamily(i.id) === fam)
    .slice(0, limit);
}

async function fetchIssues(): Promise<RuntimeIssuesDoc | null> {
  try {
    const r = await fetch("/ops-data/runtime-issues.json", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as RuntimeIssuesDoc;
  } catch {
    return null;
  }
}

export function OpsIssuePage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const [doc, setDoc] = useState<RuntimeIssuesDoc | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchIssues().then((d) => {
      if (cancelled) return;
      setDoc(d);
      setState(d == null ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const issue = state === "ready" ? findIssue(doc, id) : null;

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-issue-page"
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
          data-testid="ops-issue-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      {state === "loading" && (
        <div data-testid="ops-issue-loading" style={bodyLine}>
          טוען נתוני תקלה…
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-issue-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את נתוני תקלות ה-runtime. נסה לרענן את הדף.
        </div>
      )}

      {state === "ready" && !issue && (
        <div data-testid="ops-issue-not-found" role="status" style={sectionBox}>
          <h1 style={{ fontSize: 16, margin: "0 0 6px 0" }}>תקלה לא נמצאה</h1>
          <p style={bodyLine}>
            לא נמצאה תקלה פתוחה עם המזהה <code>{id}</code>. ייתכן שהיא נסגרה,
            עברה שינוי בקובץ המקור, או שהקישור שגוי.
          </p>
        </div>
      )}

      {state === "ready" && issue && (
        <IssueWorkflow issue={issue} doc={doc} />
      )}
    </main>
  );
}

function IssueWorkflow({
  issue,
  doc,
}: {
  issue: RuntimeIssue;
  doc: RuntimeIssuesDoc | null;
}) {
  const lvl = parseSeverity(issue.severity);
  const related = relatedIssues(doc, issue);

  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <h1
          data-testid="ops-issue-title"
          style={{ fontSize: 17, margin: "0 0 4px 0", lineHeight: 1.35 }}
        >
          {issue.title ?? issue.id}
        </h1>
        <div style={{ fontSize: 11, color: "#737373" }}>
          <code>{issue.id}</code>
        </div>
      </header>

      <section data-testid="section-situation" style={sectionBox}>
        <h2 style={sectionHead}>מצב נוכחי</h2>
        <p style={bodyLine}>
          <strong>חומרה: </strong>
          {SEVERITY_LABEL_HE[lvl]}
          {issue.severity && lvl === "unknown" ? ` (${issue.severity})` : ""}
        </p>
        {issue.date && (
          <p style={subLine}>
            <strong>תאריך זיהוי: </strong>
            {issue.date}
          </p>
        )}
        {issue.reporter && (
          <p style={subLine}>
            <strong>דווח על-ידי: </strong>
            {issue.reporter}
          </p>
        )}
        {issue.severity && lvl !== "unknown" && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 12, color: "#525252", cursor: "pointer" }}>
              פירוט חומרה
            </summary>
            <p style={{ ...subLine, marginTop: 4 }}>{issue.severity}</p>
          </details>
        )}
      </section>

      <section data-testid="section-next-action" style={sectionBox}>
        <h2 style={sectionHead}>הצעד הבא</h2>
        {issue.disposition ? (
          <p style={bodyLine}>{issue.disposition}</p>
        ) : (
          <p style={bodyLine}>אין הכוונה תפעולית מוגדרת. בדוק את קובץ המקור.</p>
        )}
      </section>

      <section data-testid="section-assets" style={sectionBox}>
        <h2 style={sectionHead}>חומרים רלוונטיים</h2>
        {issue.file ? (
          <p style={bodyLine}>
            <strong>מקור: </strong>
            <code style={{ fontSize: 12 }}>{issue.file}</code>
          </p>
        ) : (
          <p style={bodyLine}>אין קישור לקובץ מקור.</p>
        )}
      </section>

      <section data-testid="section-related" style={sectionBox}>
        <h2 style={sectionHead}>הקשר קשור</h2>
        {related.length === 0 ? (
          <p style={bodyLine}>אין תקלות פתוחות נוספות באותה משפחה.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {related.map((r) => (
              <li key={r.id} style={subLine}>
                <Link
                  to={`/ops/issues/${encodeURIComponent(r.id)}`}
                  data-testid="related-issue-link"
                  style={{ color: "#2563eb", textDecoration: "none" }}
                >
                  {r.title ?? r.id}
                </Link>
                {r.date ? ` · ${r.date}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="section-resolution" style={sectionBox}>
        <h2 style={sectionHead}>פעולות סיום</h2>
        <p style={subLine}>קריאה-בלבד בגרסה זו. כתיבה תוטמע בסליס הבא.</p>
        <div>
          <span style={chipDisabled} title="בקרוב">
            סמן כמטופל
          </span>
          <span style={chipDisabled} title="בקרוב">
            סמן כישן
          </span>
          <span style={chipDisabled} title="בקרוב">
            קישור runbook
          </span>
        </div>
      </section>
    </>
  );
}
