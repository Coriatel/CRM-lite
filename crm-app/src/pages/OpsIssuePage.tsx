import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  openRuntimeIssues,
  parseSeverity,
  SEVERITY_LABEL_HE,
  type RuntimeIssue,
  type RuntimeIssuesDoc,
} from "./OpsPage";
import {
  bodyLine,
  sectionBox,
  sectionHead,
  subLine,
} from "./workflow-page-styles";
import { useQueueAction } from "../hooks/useQueueAction";

// Layer-3 Workflow Page for a single runtime issue. Lane A slice 1 of the
// MN-OS UX runtime (5-section grammar: situation · next action · assets ·
// related context · resolution actions). Read-only against the producer-
// backed runtime-issues.json projection. v0 surfaces resolution actions as
// disabled chips — writes deferred to a later slice.

type LoadState = "loading" | "ready" | "error";

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

  const refetch = useCallback(async () => {
    const d = await fetchIssues();
    setDoc(d);
    setState(d == null ? "error" : "ready");
  }, []);

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
        <IssueWorkflow issue={issue} doc={doc} onRefetch={refetch} />
      )}
    </main>
  );
}

function IssueWorkflow({
  issue,
  doc,
  onRefetch,
}: {
  issue: RuntimeIssue;
  doc: RuntimeIssuesDoc | null;
  onRefetch: () => Promise<void>;
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

      <ResolutionActions issue={issue} onRefetch={onRefetch} />
    </>
  );
}

const chipBase: React.CSSProperties = {
  display: "inline-block",
  minHeight: 44,
  lineHeight: "44px",
  padding: "0 14px",
  borderRadius: 999,
  fontSize: 13,
  marginInlineEnd: 6,
  marginBottom: 6,
  border: "1px solid #d4d4d4",
  background: "#fff",
  color: "#262626",
  cursor: "pointer",
};

const chipActive: React.CSSProperties = {
  ...chipBase,
  background: "#2563eb",
  color: "#fff",
  borderColor: "#2563eb",
};

const chipBusy: React.CSSProperties = {
  ...chipBase,
  background: "#f5f5f5",
  color: "#737373",
  cursor: "wait",
};

const inputBox: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  minHeight: 44,
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #d4d4d4",
  borderRadius: 6,
  marginTop: 6,
  fontFamily: "inherit",
};

type Mode = "idle" | "snooze" | "dismiss";

function queueItemIdFor(issue: RuntimeIssue): string {
  return `runtime_issue:${issue.id}`;
}

function isoZPlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function ResolutionActions({
  issue,
  onRefetch,
}: {
  issue: RuntimeIssue;
  onRefetch: () => Promise<void>;
}) {
  const { status, error, submit, reset } = useQueueAction();
  const [mode, setMode] = useState<Mode>("idle");
  const [until, setUntil] = useState<string>(isoZPlusDays(1));
  const [reason, setReason] = useState<string>("");
  const submitting = status === "submitting";

  const onAck = async () => {
    if (submitting) return;
    const r = await submit({
      action: "ack",
      queue_item_id: queueItemIdFor(issue),
    });
    if (r?.accepted) {
      await onRefetch();
    }
  };

  const onSnooze = async () => {
    if (submitting || !until) return;
    const r = await submit({
      action: "snooze",
      queue_item_id: queueItemIdFor(issue),
      fields: { until },
    });
    if (r?.accepted) {
      setMode("idle");
      await onRefetch();
    }
  };

  const onDismiss = async () => {
    const trimmed = reason.trim();
    if (submitting || !trimmed) return;
    const r = await submit({
      action: "dismiss",
      queue_item_id: queueItemIdFor(issue),
      fields: { reason: trimmed.slice(0, 256) },
    });
    if (r?.accepted) {
      setMode("idle");
      setReason("");
      await onRefetch();
    }
  };

  const success = status === "success";

  return (
    <section data-testid="section-resolution" style={sectionBox}>
      <h2 style={sectionHead}>פעולות סיום</h2>

      {mode === "idle" && (
        <div>
          <button
            type="button"
            data-testid="action-ack"
            disabled={submitting}
            onClick={onAck}
            style={submitting ? chipBusy : chipBase}
          >
            סמן כמטופל
          </button>
          <button
            type="button"
            data-testid="action-snooze-open"
            disabled={submitting}
            onClick={() => {
              reset();
              setMode("snooze");
            }}
            style={chipBase}
          >
            סמן כישן
          </button>
          <button
            type="button"
            data-testid="action-dismiss-open"
            disabled={submitting}
            onClick={() => {
              reset();
              setMode("dismiss");
            }}
            style={chipBase}
          >
            סגור (סיבה)
          </button>
        </div>
      )}

      {mode === "snooze" && (
        <div data-testid="snooze-picker">
          <p style={subLine}>דחה את הפריט עד מועד עתידי (UTC):</p>
          <div>
            {[1, 3, 7].map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`snooze-preset-${n}d`}
                onClick={() => setUntil(isoZPlusDays(n))}
                style={chipBase}
              >
                +{n}d
              </button>
            ))}
          </div>
          <input
            data-testid="snooze-until-input"
            type="text"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            style={inputBox}
            aria-label="עד מתי"
          />
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              data-testid="snooze-submit"
              disabled={submitting || !until}
              onClick={onSnooze}
              style={submitting ? chipBusy : chipActive}
            >
              שלח דחייה
            </button>
            <button
              type="button"
              data-testid="snooze-cancel"
              disabled={submitting}
              onClick={() => setMode("idle")}
              style={chipBase}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {mode === "dismiss" && (
        <div data-testid="dismiss-form">
          <p style={subLine}>סיבת סגירה (עד 256 תווים):</p>
          <textarea
            data-testid="dismiss-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 256))}
            maxLength={256}
            rows={2}
            style={{ ...inputBox, minHeight: 64, resize: "vertical" }}
            aria-label="סיבת סגירה"
          />
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              data-testid="dismiss-submit"
              disabled={submitting || !reason.trim()}
              onClick={onDismiss}
              style={submitting ? chipBusy : chipActive}
            >
              שלח סגירה
            </button>
            <button
              type="button"
              data-testid="dismiss-cancel"
              disabled={submitting}
              onClick={() => {
                setMode("idle");
                setReason("");
              }}
              style={chipBase}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {submitting && (
        <p data-testid="action-submitting" style={subLine}>
          שולח…
        </p>
      )}
      {success && (
        <p data-testid="action-success" style={{ ...subLine, color: "#15803d" }}>
          נשלח · ממתין לעדכון
        </p>
      )}
      {status === "error" && error && (
        <p data-testid="action-error" role="alert" style={{ ...subLine, color: "#b91c1c" }}>
          השליחה נכשלה: {error}
        </p>
      )}
    </section>
  );
}
