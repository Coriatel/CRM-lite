import { useEffect, useState } from "react";

// Read-only consumer of the lesson_pipeline_v2 projection produced by
// build_lesson_runs.py (ops-vault). Renders pipeline state + attention; never mutates
// anything and never touches publish behavior. Honest empty states when the producer has
// not run yet (_meta.source === "unavailable") or the file is missing.

interface LessonAttention {
  kind: string;
  severity?: string;
  state?: string;
  run_id: string;
  lesson?: string | null;
  surface?: string;
}

interface LessonRunsDoc {
  _meta?: { source?: string; generated_at?: string; limitations?: string[] };
  summary?: { total_runs?: number; by_state?: Record<string, number>; attention_count?: number };
  attention?: LessonAttention[];
}

const STATE_LABEL: Record<string, string> = {
  queued: "בתור",
  downloading: "הורדה",
  transcribing: "תמלול",
  summarizing: "סיכום",
  rendering: "עיבוד",
  published: "פורסם",
  materialized: "בספרייה",
  failed: "נכשל",
  stalled: "תקוע",
  in_progress: "בתהליך",
};

const ATTENTION_LABEL: Record<string, string> = {
  lesson_failed: "ריצה נכשלה",
  lesson_stalled: "ריצה תקועה",
  lesson_missing_summary: "סיכום מתעכב (מעל 6 שעות)",
};

export function LessonRunsCard() {
  const [doc, setDoc] = useState<LessonRunsDoc | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/ops-data/lesson_processing_runs.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: LessonRunsDoc) => {
        if (alive) {
          setDoc(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="today-empty" data-testid="today-lessons-loading">
        טוען מצב צינור השיעורים…
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="today-empty" role="alert" data-testid="today-lessons-error">
        לא ניתן לטעון את מצב השיעורים כעת. הנתונים לא הומצאו.
      </div>
    );
  }

  const source = doc._meta?.source;
  if (source === "unavailable" || source === "error") {
    return (
      <div className="today-empty" data-testid="today-lessons-unavailable">
        מעקב השיעורים עדיין לא פעיל. ה-producer (build_lesson_runs) טרם הופעל ב-Windmill, ולכן אין
        עדיין נתוני ריצה אמיתיים.
      </div>
    );
  }

  const total = doc.summary?.total_runs ?? 0;
  if (total === 0) {
    return (
      <div className="today-empty" data-testid="today-lessons-empty">
        אין ריצות שיעור בחלון המעקב. הצינור שקט.
      </div>
    );
  }

  const byState = doc.summary?.by_state ?? {};
  const attention = doc.attention ?? [];
  const stateLine = Object.entries(byState)
    .map(([s, n]) => `${STATE_LABEL[s] ?? s}: ${n}`)
    .join(" · ");

  return (
    <div
      className="today-card"
      data-testid="today-lessons-card"
      style={
        {
          "--mn-card-accent": attention.length ? "var(--mn-warning)" : "var(--mn-brand-teal)",
        } as React.CSSProperties
      }
    >
      <div className="today-card__kicker">
        <span>תכנים · צינור שיעורים</span>
        <span>{total} ריצות</span>
      </div>
      <p className="today-card__reason">{stateLine}</p>
      {attention.length ? (
        <ul data-testid="today-lessons-attention" style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
          {attention.map((a) => (
            <li key={a.run_id}>
              {ATTENTION_LABEL[a.kind] ?? a.kind}
              {a.lesson ? ` — ${a.lesson}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="today-card__action">כל הריצות תקינות. אין מה לטפל כרגע.</p>
      )}
    </div>
  );
}
