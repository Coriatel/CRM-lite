import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { activeOwnerGates, plainifyGate } from "./OpsPage";
import {
  bodyLine,
  chipDisabled,
  sectionBox,
  sectionHead,
  subLine,
} from "./workflow-page-styles";

// Layer-3 Workflow Page for a single owner gate. Slice 3 of the MN-OS UX
// runtime — the rule-of-3 measurement slice. Copy-then-vary from
// OpsIssuePage / OpsBlockerPage so a three-way divergence audit can run
// after this ships. Read-only consumer of /ops-data/session_index.json's
// owner_gates array — no schema/DB writes, no producer changes.
//
// Identifier model differs from slices 1+2: gates have no producer-supplied
// id field; they are bullet text. The route :id is the URL-encoded
// plainified gate text. Stable for as long as the gate exists; resolved
// gates collapse to "" via plainifyGate and naturally fall through to the
// not-found state.

type LoadState = "loading" | "ready" | "error";

type SessionIndexDoc = {
  owner_gates?: string[];
};

// Topic family extraction. Most gates start with a backtick-wrapped project
// token (`crm-lite`, `mayenotecha`, `transcriptor-api`) in the raw text.
// Fall back to the first significant word when no backtick token exists.
// Used for the "Related gates" section grouping.
export function gateTopic(rawGate: string): string {
  const ticked = /`([^`\s]+)`/.exec(rawGate);
  if (ticked) return ticked[1].toLowerCase();
  const plain = plainifyGate(rawGate);
  const firstWord = plain.split(/[\s—:,.]/)[0] ?? "";
  return firstWord.toLowerCase() || "unlabeled";
}

// Lookup a gate by plainified-text id. Returns the raw gate (with markdown
// preserved) so the topic heuristic can still see backticks. Resolved gates
// (~~strikethrough~~ → empty plain text) cannot match any non-empty id and
// will return null — correct behavior; the workflow page renders not-found.
export function findGateByPlainText(
  gates: string[],
  plainId: string,
): string | null {
  if (!plainId) return null;
  return gates.find((g) => plainifyGate(g) === plainId) ?? null;
}

export function relatedGates(
  gates: string[],
  currentRaw: string,
  limit = 5,
): { plain: string; raw: string }[] {
  const fam = gateTopic(currentRaw);
  const currentPlain = plainifyGate(currentRaw);
  return activeOwnerGates(gates)
    .map((plain) => ({
      plain,
      raw: gates.find((g) => plainifyGate(g) === plain) ?? plain,
    }))
    .filter(({ plain, raw }) => plain !== currentPlain && gateTopic(raw) === fam)
    .slice(0, limit);
}

async function fetchSessionIndex(): Promise<SessionIndexDoc | null> {
  try {
    const r = await fetch("/ops-data/session_index.json", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as SessionIndexDoc;
  } catch {
    return null;
  }
}

export function OpsGatePage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const [doc, setDoc] = useState<SessionIndexDoc | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchSessionIndex().then((d) => {
      if (cancelled) return;
      setDoc(d);
      setState(d == null ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const gates = doc?.owner_gates ?? [];
  const rawGate = state === "ready" ? findGateByPlainText(gates, id) : null;

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-gate-page"
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
          data-testid="ops-gate-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      {state === "loading" && (
        <div data-testid="ops-gate-loading" style={bodyLine}>
          טוען נתוני החלטה…
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-gate-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את נתוני ההחלטות. נסה לרענן את הדף.
        </div>
      )}

      {state === "ready" && !rawGate && (
        <div data-testid="ops-gate-not-found" role="status" style={sectionBox}>
          <h1 style={{ fontSize: 16, margin: "0 0 6px 0" }}>החלטה לא נמצאה</h1>
          <p style={bodyLine}>
            לא נמצאה החלטה פתוחה התואמת לקישור. ייתכן שההחלטה התקבלה, נמחקה
            מקובץ המקור, או שהקישור שגוי.
          </p>
        </div>
      )}

      {state === "ready" && rawGate && (
        <GateWorkflow rawGate={rawGate} gates={gates} />
      )}
    </main>
  );
}

function GateWorkflow({ rawGate, gates }: { rawGate: string; gates: string[] }) {
  const plain = plainifyGate(rawGate);
  const topic = gateTopic(rawGate);
  const related = relatedGates(gates, rawGate);

  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <h1
          data-testid="ops-gate-title"
          style={{ fontSize: 17, margin: "0 0 4px 0", lineHeight: 1.35 }}
        >
          {plain}
        </h1>
        <div style={{ fontSize: 11, color: "#737373" }}>
          <code>{topic}</code>
        </div>
      </header>

      <section data-testid="section-situation" style={sectionBox}>
        <h2 style={sectionHead}>מצב נוכחי</h2>
        <p style={bodyLine}>
          <strong>סוג: </strong>
          החלטה הממתינה לבעלים
        </p>
        <p style={subLine}>
          <strong>נושא: </strong>
          {topic}
        </p>
        <p style={subLine}>
          <strong>חומרה: </strong>
          {gates.length >= 5 ? "דורש פעולה" : "במעקב"} · סה"כ {gates.length} החלטות פתוחות
        </p>
      </section>

      <section data-testid="section-next-action" style={sectionBox}>
        <h2 style={sectionHead}>הצעד הבא</h2>
        <p style={bodyLine}>
          {gateNextActionHint(rawGate, plain)}
        </p>
      </section>

      <section data-testid="section-assets" style={sectionBox}>
        <h2 style={sectionHead}>חומרים רלוונטיים</h2>
        <p style={bodyLine}>
          <strong>טקסט מלא: </strong>
        </p>
        <pre
          style={{
            ...subLine,
            background: "#fafafa",
            border: "1px solid #f0f0f0",
            padding: 8,
            borderRadius: 4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 12,
            margin: 0,
          }}
        >
          {rawGate}
        </pre>
      </section>

      <section data-testid="section-related" style={sectionBox}>
        <h2 style={sectionHead}>החלטות נוספות באותו נושא</h2>
        {related.length === 0 ? (
          <p style={bodyLine}>אין החלטות נוספות באותו נושא.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {related.map((r) => (
              <li key={r.plain} style={subLine}>
                <Link
                  to={`/ops/gates/${encodeURIComponent(r.plain)}`}
                  data-testid="related-gate-link"
                  style={{ color: "#2563eb", textDecoration: "none" }}
                >
                  {r.plain}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="section-resolution" style={sectionBox}>
        <h2 style={sectionHead}>פעולות סיום</h2>
        <p style={subLine}>קריאה-בלבד בגרסה זו. כתיבה תוטמע בסליס נפרד.</p>
        <div>
          <span style={chipDisabled} title="בקרוב">
            סמן כהוכרע
          </span>
          <span style={chipDisabled} title="בקרוב">
            דחה לדיון
          </span>
          <span style={chipDisabled} title="בקרוב">
            צרף הקשר
          </span>
        </div>
      </section>
    </>
  );
}

// Owner gates carry their next-action implicitly in the bullet body (e.g.
// "owner runs apply.py", "merge / rebase / close"). Surface a stable
// directive line: the gate's own text IS the action. The next-action
// section therefore restates the plain text as the operator-facing call.
function gateNextActionHint(_rawGate: string, plain: string): string {
  return `החלטה / פעולה נדרשת מהבעלים: ${plain}`;
}
