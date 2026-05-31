import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { goalChainForCampaign } from "./OpsPage";
import type {
  Campaign,
  CampaignGoalChain,
  CampaignsDoc,
  GoalsDoc,
  OperationalQueueDoc,
  OperationalQueueItem,
} from "./OpsPage";
import { bodyLine, sectionBox, sectionHead, subLine } from "./workflow-page-styles";

// Layer-3 drilldown for a single operational_queue.json item. Read-only consumer;
// copy-then-vary from OpsAutomationPage (same 5-section workflow grammar). All fields
// come from the already-synced feed — no new producer. Any act-plane (assign/escalate)
// is owner-gated per C6 and is NOT exposed here.

type LoadState = "loading" | "ready" | "error";

const SEVERITY_LABEL: Record<string, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
  info: "מידע",
};
const REVERSIBILITY_LABEL: Record<string, string> = {
  reversible: "הפיך",
  risky: "מסוכן",
  irreversible: "בלתי הפיך",
  unknown: "לא ידוע",
};

export function findQueueItem(
  doc: OperationalQueueDoc | null,
  id: string,
): OperationalQueueItem | null {
  return (doc?.queue ?? []).find((q) => q.id === id) ?? null;
}

export type QueueItemCampaignContext = {
  id: string;
  campaign: Campaign | null; // null = id absent from the campaigns.json feed
  goalChain: CampaignGoalChain | null;
};

// Pure: resolve a queue item's campaign_id to read-only context using the existing
// queue-id route's sibling feeds. Returns null when the item carries no campaign_id.
// When campaign_id is present but absent from campaigns.json, returns campaign=null so
// the UI shows a safe fallback (the id is authored truth; never a link, never a 404).
export function resolveQueueItemCampaign(
  campaignId: string | null | undefined,
  campaignsDoc: CampaignsDoc | null,
  goalsDoc: GoalsDoc | null,
): QueueItemCampaignContext | null {
  if (!campaignId) return null;
  const campaign = campaignsDoc?.campaigns?.find((c) => c.id === campaignId) ?? null;
  return { id: campaignId, campaign, goalChain: goalChainForCampaign(goalsDoc, campaignId) };
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function OpsQueueItemPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const [doc, setDoc] = useState<OperationalQueueDoc | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignsDoc | null>(null);
  const [goals, setGoals] = useState<GoalsDoc | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    // Campaigns/goals are supplementary context — only the queue feed gates page
    // state, so a missing campaigns.json degrades to no campaign block, not an error.
    Promise.all([
      fetchJson<OperationalQueueDoc>("/ops-data/operational_queue.json"),
      fetchJson<CampaignsDoc>("/ops-data/campaigns.json"),
      fetchJson<GoalsDoc>("/ops-data/goals.json"),
    ]).then(([qd, cd, gd]) => {
      if (cancelled) return;
      setDoc(qd);
      setCampaigns(cd);
      setGoals(gd);
      setState(qd == null ? "error" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = state === "ready" ? findQueueItem(doc, id) : null;
  const campaignCtx = resolveQueueItemCampaign(q?.campaign_id, campaigns, goals);

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-queue-item-page"
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
          data-testid="ops-queue-item-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      {state === "loading" && (
        <div data-testid="ops-queue-item-loading" style={bodyLine}>
          טוען פריט תור…
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-queue-item-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את התור התפעולי. נסה לרענן את הדף.
        </div>
      )}

      {state === "ready" && !q && (
        <div data-testid="ops-queue-item-not-found" role="status" style={sectionBox}>
          <h1 style={{ fontSize: 16, margin: "0 0 6px 0" }}>פריט תור לא נמצא</h1>
          <p style={bodyLine}>
            לא נמצא פריט עם המזהה <code>{id}</code>.
          </p>
        </div>
      )}

      {state === "ready" && q && <QueueItemDetail q={q} campaign={campaignCtx} />}
    </main>
  );
}

function QueueItemDetail({
  q,
  campaign,
}: {
  q: OperationalQueueItem;
  campaign: QueueItemCampaignContext | null;
}) {
  const sev = SEVERITY_LABEL[q.severity] ?? q.severity;
  return (
    <>
      <header style={{ marginBottom: 10 }}>
        <h1 data-testid="ops-queue-item-title" style={{ fontSize: 17, margin: "0 0 4px 0", lineHeight: 1.35 }}>
          {q.summary}
        </h1>
        <div
          style={{ fontSize: 11, color: "#737373", direction: "ltr", unicodeBidi: "isolate", overflowWrap: "anywhere" }}
        >
          <code>{q.id}</code>
        </div>
      </header>

      <section data-testid="section-situation" style={sectionBox}>
        <h2 style={sectionHead}>מצב נוכחי</h2>
        <p style={bodyLine}><strong>סוג: </strong>{q.type}</p>
        <p style={subLine}><strong>חומרה: </strong>{sev} · עדיפות {q.operational_priority}</p>
        {q.lane ? <p style={subLine}><strong>נתיב: </strong>{q.lane}</p> : null}
        <p style={subLine}><strong>טריות: </strong>{q.freshness}</p>
        {q.created_at ? <p style={subLine}><strong>נוצר: </strong>{q.created_at}</p> : null}
      </section>

      {campaign && (
        <section data-testid="section-campaign" style={sectionBox}>
          <h2 style={sectionHead}>קמפיין מקור</h2>
          <p style={bodyLine}>
            <strong>מזהה: </strong>
            <code style={{ fontSize: 12, direction: "ltr", unicodeBidi: "isolate", overflowWrap: "anywhere" }}>
              {campaign.id}
            </code>
          </p>
          {campaign.campaign ? (
            <>
              {campaign.campaign.owner_user ? (
                <p style={subLine}><strong>בעלים: </strong>{campaign.campaign.owner_user}</p>
              ) : null}
              {campaign.campaign.status ? (
                <p style={subLine}><strong>סטטוס: </strong>{campaign.campaign.status}</p>
              ) : null}
              {campaign.campaign.last_terminal_state ? (
                <p style={subLine}><strong>מצב אחרון: </strong>{campaign.campaign.last_terminal_state}</p>
              ) : null}
            </>
          ) : (
            <p data-testid="section-campaign-fallback" style={subLine}>
              פרטי הקמפיין אינם זמינים בעדכון הנוכחי.
            </p>
          )}
          {campaign.goalChain ? (
            <p data-testid="section-campaign-goal" style={subLine}>
              <strong>למה: </strong>{campaign.goalChain.goal}
            </p>
          ) : null}
        </section>
      )}

      <section data-testid="section-why" style={sectionBox}>
        <h2 style={sectionHead}>למה זה חשוב</h2>
        <p style={bodyLine}>{q.summary}</p>
        {q.blocker_type ? <p style={subLine}><strong>סוג חסם: </strong>{q.blocker_type}</p> : null}
        {q.owner_gate ? (
          <p style={subLine}>
            <strong>שער בעלים: </strong>
            {q.owner_gate_kind ?? "נדרש אישור בעלים"}
          </p>
        ) : null}
      </section>

      <section data-testid="section-next-action" style={sectionBox}>
        <h2 style={sectionHead}>הצעד הבא</h2>
        <p style={bodyLine}>{q.suggested_action}</p>
        {q.owner_gate ? (
          <p style={subLine}>פעולה זו מסומנת כשער בעלים — דורשת אישור לפני ביצוע.</p>
        ) : null}
      </section>

      <section data-testid="section-resolution" style={sectionBox}>
        <h2 style={sectionHead}>מסלול פתרון</h2>
        <p style={bodyLine}><strong>הפיכות: </strong>{REVERSIBILITY_LABEL[q.reversibility] ?? q.reversibility}</p>
        <p style={subLine}><strong>ניתן להרצה חוזרת: </strong>{q.retryable ? "כן" : "לא"}</p>
        <p style={subLine}><strong>מועמד להמשכיות: </strong>{q.continuation_candidate ? "כן" : "לא"}</p>
      </section>

      <section data-testid="section-links" style={sectionBox}>
        <h2 style={sectionHead}>קישורים ותלויות</h2>
        {q.source ? (
          <p style={subLine}>
            <strong>מקור: </strong>
            {q.source.producer}
            {q.source.ref ? ` · ${q.source.ref}` : ""}
          </p>
        ) : null}
        {q.source?.url ? (
          <p style={subLine}>
            <a href={q.source.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
              פתח מקור ↗
            </a>
          </p>
        ) : null}
        {q.repo_path ? (
          <p style={subLine}><strong>מאגר: </strong><code style={{ fontSize: 12, overflowWrap: "anywhere" }}>{q.repo_path}</code></p>
        ) : null}
        {q.session_reference ? <p style={subLine}><strong>הפניית סשן: </strong>{q.session_reference}</p> : null}
        {q.assigned_agent ? <p style={subLine}><strong>משויך ל: </strong>{q.assigned_agent}</p> : null}
      </section>
    </>
  );
}
