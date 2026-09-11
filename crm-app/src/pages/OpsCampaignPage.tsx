import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Campaign, CampaignsDoc } from "./OpsPage";
import { bodyLine, sectionBox, sectionHead, subLine } from "./workflow-page-styles";

// Layer-3 drilldown for a single campaigns.json campaign. Read-only consumer;
// copy-then-vary from OpsQueueItemPage (same 5-section workflow grammar). All fields
// come from the already-synced feed — no new producer. The "why" section CONSUMES
// Mission Brain output (the goals.json goal chain) when authored — no duplicated goal
// logic. Resume is operator-driven (copy handoff path); nothing is mutated here.

type LoadState = "loading" | "ready" | "error";

// Minimal shape of the served /ops-data/goals.json (Mission Brain goal hierarchy).
type GoalsDoc = {
  system?: { id?: string; goal?: string };
  lanes?: Record<string, { goal?: string; serves?: string } | undefined>;
  campaigns?: Record<string, { goal?: string; serves?: string } | undefined>;
};

export function findCampaign(doc: CampaignsDoc | null, id: string): Campaign | null {
  return (doc?.campaigns ?? []).find((c) => c.id === id) ?? null;
}

// Goal chain from Mission Brain (goals.json): campaign -> lane -> system. Null on miss
// (authored-only coverage; absence just means "goal not yet authored").
export function goalChain(goals: GoalsDoc | null, id: string): string[] | null {
  const camp = goals?.campaigns?.[id];
  if (!camp?.goal) return null;
  const chain = [camp.goal];
  const lane = camp.serves ? goals?.lanes?.[camp.serves] : undefined;
  if (lane?.goal) chain.push(`נתיב ${camp.serves}: ${lane.goal}`);
  if (goals?.system?.goal) chain.push(`${goals.system.id ?? "מערכת"}: ${goals.system.goal}`);
  return chain;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function OpsCampaignPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const [doc, setDoc] = useState<CampaignsDoc | null>(null);
  const [goals, setGoals] = useState<GoalsDoc | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson<CampaignsDoc>("/ops-data/campaigns.json"),
      fetchJson<GoalsDoc>("/ops-data/goals.json"),
    ]).then(([c, g]) => {
      if (cancelled) return;
      setDoc(c);
      setGoals(g);
      setState(c == null ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const c = state === "ready" ? findCampaign(doc, id) : null;

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-campaign-page"
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
          data-testid="ops-campaign-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      {state === "loading" && (
        <div data-testid="ops-campaign-loading" style={bodyLine}>
          טוען קמפיין…
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-campaign-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את הקמפיינים. נסה לרענן את הדף.
        </div>
      )}

      {state === "ready" && !c && (
        <div data-testid="ops-campaign-not-found" role="status" style={sectionBox}>
          <h1 style={{ fontSize: 16, margin: "0 0 6px 0" }}>קמפיין לא נמצא</h1>
          <p style={bodyLine}>
            לא נמצא קמפיין עם המזהה <code>{id}</code>.
          </p>
        </div>
      )}

      {state === "ready" && c && <CampaignDetail c={c} goals={goals} />}
    </main>
  );
}

function CampaignDetail({ c, goals }: { c: Campaign; goals: GoalsDoc | null }) {
  const status = (c.status ?? "?").toUpperCase();
  const chain = goalChain(goals, c.id);
  const handoffPath = c.handoff_dir
    ? `${c.handoff_dir}/${c.current_handoff ?? "CURRENT.md"}`
    : null;
  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <h1
          data-testid="ops-campaign-title"
          style={{ fontSize: 17, margin: "0 0 4px 0", lineHeight: 1.35, direction: "ltr", unicodeBidi: "isolate", overflowWrap: "anywhere" }}
        >
          {c.id}
        </h1>
        <div style={{ fontSize: 12, color: "#737373" }}>קמפיין · {status}</div>
      </header>

      <section data-testid="section-situation" style={sectionBox}>
        <h2 style={sectionHead}>מצב נוכחי</h2>
        <p style={bodyLine}><strong>סטטוס: </strong>{status}</p>
        {c.last_terminal_state ? (
          <p style={subLine}><strong>מצב סופי אחרון: </strong>{c.last_terminal_state}</p>
        ) : null}
        {c.lane_field ? <p style={subLine}><strong>נתיב: </strong>{c.lane_field}</p> : null}
        {c.last_written_at ? <p style={subLine}><strong>עודכן לאחרונה: </strong>{c.last_written_at}</p> : null}
        {/* No numeric priority in campaigns.json — urgency is status-derived, not fabricated. */}
        <p style={subLine}><strong>עדיפות: </strong>לפי סטטוס ({status})</p>
      </section>

      <section data-testid="section-why" style={sectionBox}>
        <h2 style={sectionHead}>למה זה חשוב</h2>
        {chain ? (
          <ol style={{ margin: 0, paddingInlineStart: 18 }}>
            {chain.map((g, i) => (
              <li key={i} style={i === 0 ? bodyLine : subLine}>{g}</li>
            ))}
          </ol>
        ) : (
          <p style={subLine}>טרם נכתבה מטרה מאושרת לקמפיין זה (goals.json — כיסוי מטרות מאושרות בלבד).</p>
        )}
      </section>

      <section data-testid="section-next-action" style={sectionBox}>
        <h2 style={sectionHead}>הצעד הבא</h2>
        <p style={bodyLine}>
          {c.status === "SHIPPED" || c.status === "ABANDONED"
            ? "הקמפיין הגיע למצב סופי — אין צעד פתוח."
            : `המשך את הקמפיין: continue ${c.id}`}
        </p>
        {handoffPath ? (
          <p style={subLine}>
            <strong>handoff: </strong>
            <code style={{ fontSize: 12, overflowWrap: "anywhere", direction: "ltr", unicodeBidi: "isolate" }}>{handoffPath}</code>
          </p>
        ) : null}
      </section>

      <section data-testid="section-links" style={sectionBox}>
        <h2 style={sectionHead}>קישורים ותלויות</h2>
        <p style={subLine}><strong>בעלים: </strong>{c.owner_user ?? "—"}</p>
        {c.lane_field ? <p style={subLine}><strong>נתיב: </strong>{c.lane_field}</p> : null}
        {handoffPath ? (
          <p style={subLine}>
            <strong>מסמך המשכיות: </strong>
            <code style={{ fontSize: 12, overflowWrap: "anywhere", direction: "ltr", unicodeBidi: "isolate" }}>{handoffPath}</code>
          </p>
        ) : (
          <p style={subLine}>אין מסמך המשכיות רשום.</p>
        )}
      </section>
    </>
  );
}
