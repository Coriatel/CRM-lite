import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ageDays,
  ageLevel,
  type AgeLevel,
  type Blocker,
} from "./OpsPage";
import {
  bodyLine,
  chipDisabled,
  sectionBox,
  sectionHead,
  subLine,
} from "./workflow-page-styles";

// Layer-3 Workflow Page for a single blocker. Slice 2 of the MN-OS UX runtime
// (5-section grammar). Read-only consumer of /ops-data/blockers.json — no
// schema writes. Copy-then-vary from OpsIssuePage: the section structure is
// shared, but the data contract (Blocker vs RuntimeIssue), the severity axis
// (age-driven vs explicit severity field), and the family heuristic (lane vs
// id prefix) differ. No shared shell is extracted here — rule-of-3 still
// applies; a third concrete page must ship before abstraction is considered.

type LoadState = "loading" | "ready" | "error";

type BlockersDoc = { blockers?: Blocker[] };

const AGE_LEVEL_LABEL_HE: Record<AgeLevel, string> = {
  ok: "טרי",
  warn: "ותיק",
  critical: "ותיק מאוד",
};

// Lane grouping for "related context". Lanes can be compound ("A-or-owner",
// "B-or-owner"); the primary lane is the leading letter (A/B/C/D) or "owner"
// when no lane letter is present. Blockers without a lane fall into "ללא מסלול".
export function blockerLaneFamily(lane?: string | null): string {
  if (!lane) return "unlabeled";
  const trimmed = lane.trim();
  if (!trimmed) return "unlabeled";
  const match = /^([A-Da-d])(?:-|$|\s)/.exec(trimmed);
  if (match) return match[1].toUpperCase();
  if (/owner/i.test(trimmed)) return "owner";
  return trimmed;
}

export function findBlocker(
  doc: BlockersDoc | null,
  id: string,
): Blocker | null {
  const all = doc?.blockers ?? [];
  return all.find((b) => b.id === id) ?? null;
}

export function relatedBlockers(
  doc: BlockersDoc | null,
  current: Blocker,
  limit = 5,
): Blocker[] {
  const fam = blockerLaneFamily(current.lane);
  const all = doc?.blockers ?? [];
  return all
    .filter((b) => b.id !== current.id && blockerLaneFamily(b.lane) === fam)
    .slice(0, limit);
}

async function fetchBlockers(): Promise<BlockersDoc | null> {
  try {
    const r = await fetch("/ops-data/blockers.json", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as BlockersDoc;
  } catch {
    return null;
  }
}

export function OpsBlockerPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const [doc, setDoc] = useState<BlockersDoc | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetchBlockers().then((d) => {
      if (cancelled) return;
      setDoc(d);
      setState(d == null ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const blocker = state === "ready" ? findBlocker(doc, id) : null;

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-blocker-page"
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
          data-testid="ops-blocker-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      {state === "loading" && (
        <div data-testid="ops-blocker-loading" style={bodyLine}>
          טוען נתוני חסם…
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-blocker-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את נתוני החסמים. נסה לרענן את הדף.
        </div>
      )}

      {state === "ready" && !blocker && (
        <div data-testid="ops-blocker-not-found" role="status" style={sectionBox}>
          <h1 style={{ fontSize: 16, margin: "0 0 6px 0" }}>חסם לא נמצא</h1>
          <p style={bodyLine}>
            לא נמצא חסם פעיל עם המזהה <code>{id}</code>. ייתכן שהוא נפתר,
            הוסר מקובץ המקור, או שהקישור שגוי.
          </p>
        </div>
      )}

      {state === "ready" && blocker && (
        <BlockerWorkflow blocker={blocker} doc={doc} />
      )}
    </main>
  );
}

function BlockerWorkflow({
  blocker,
  doc,
}: {
  blocker: Blocker;
  doc: BlockersDoc | null;
}) {
  const days = ageDays(blocker.since);
  const lvl = ageLevel(days);
  const related = relatedBlockers(doc, blocker);

  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <h1
          data-testid="ops-blocker-title"
          style={{ fontSize: 17, margin: "0 0 4px 0", lineHeight: 1.35 }}
        >
          {blocker.summary}
        </h1>
        <div style={{ fontSize: 11, color: "#737373" }}>
          <code>{blocker.id}</code>
        </div>
      </header>

      <section data-testid="section-situation" style={sectionBox}>
        <h2 style={sectionHead}>מצב נוכחי</h2>
        <p style={bodyLine}>
          <strong>גיל: </strong>
          {AGE_LEVEL_LABEL_HE[lvl]}
          {days != null ? ` · ${days} ימים` : blocker.since ? ` · ${blocker.since}` : ""}
        </p>
        {blocker.lane && (
          <p style={subLine}>
            <strong>מסלול: </strong>
            {blocker.lane}
          </p>
        )}
        {blocker.since && (
          <p style={subLine}>
            <strong>פתוח מאז: </strong>
            {blocker.since}
          </p>
        )}
      </section>

      <section data-testid="section-next-action" style={sectionBox}>
        <h2 style={sectionHead}>הצעד הבא</h2>
        {blocker.needs ? (
          <p style={bodyLine}>{blocker.needs}</p>
        ) : (
          <p style={bodyLine}>אין הכוונה תפעולית מוגדרת לחסם זה.</p>
        )}
      </section>

      <section data-testid="section-assets" style={sectionBox}>
        <h2 style={sectionHead}>חומרים רלוונטיים</h2>
        {blocker.ref ? (
          <p style={bodyLine}>
            <strong>מקור: </strong>
            <code style={{ fontSize: 12 }}>{blocker.ref}</code>
          </p>
        ) : (
          <p style={bodyLine}>אין קישור לקובץ מקור.</p>
        )}
      </section>

      <section data-testid="section-related" style={sectionBox}>
        <h2 style={sectionHead}>חסמים נוספים באותו מסלול</h2>
        {related.length === 0 ? (
          <p style={bodyLine}>אין חסמים נוספים באותו מסלול.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {related.map((r) => {
              const rd = ageDays(r.since);
              return (
                <li key={r.id} style={subLine}>
                  <Link
                    to={`/ops/blockers/${encodeURIComponent(r.id)}`}
                    data-testid="related-blocker-link"
                    style={{ color: "#2563eb", textDecoration: "none" }}
                  >
                    {r.summary}
                  </Link>
                  {rd != null ? ` · ${rd} ימים` : r.since ? ` · ${r.since}` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-testid="section-resolution" style={sectionBox}>
        <h2 style={sectionHead}>פעולות סיום</h2>
        <p style={subLine}>קריאה-בלבד בגרסה זו. כתיבה תוטמע בסליס נפרד.</p>
        <div>
          <span style={chipDisabled} title="בקרוב">
            סמן כפתור
          </span>
          <span style={chipDisabled} title="בקרוב">
            הצמד הערה
          </span>
          <span style={chipDisabled} title="בקרוב">
            הקצא ל...
          </span>
        </div>
      </section>
    </>
  );
}
