import { useEffect, useState } from "react";
import {
  summarizeCampaigns,
  campaignStatusColor,
  relativeTimeHe,
  type CampaignsDoc,
} from "../../pages/OpsPage";

// Self-fetching /today card for BLOCKED campaigns. Consumes the same campaigns.json feed and
// the same pure rollup (summarizeCampaigns) that /ops uses — the rollup's `blocked` list is the
// single source for "what is blocked". Adds no producer and never mutates. No drilldown route
// exists for a single campaign, so rows are text-only (honest — no broken link).

export function TodayBlockedCampaignsCard() {
  const [doc, setDoc] = useState<CampaignsDoc | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/ops-data/campaigns.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: CampaignsDoc) => {
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
      <div className="today-section">
        <div className="today-empty" data-testid="today-blocked-campaigns-loading">
          טוען קמפיינים חסומים…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="today-section">
        <div className="today-empty" role="alert" data-testid="today-blocked-campaigns-error">
          לא ניתן לטעון את מצב הקמפיינים כעת. הנתונים לא הומצאו.
        </div>
      </div>
    );
  }

  const { blocked } = summarizeCampaigns(doc);

  return (
    <section
      className="today-section"
      aria-label="קמפיינים חסומים"
      data-testid="today-blocked-campaigns"
    >
      <header className="today-section__header">
        <h2 className="today-section__title">▾ קמפיינים חסומים</h2>
        <span className="today-section__meta">
          {blocked.length === 0 ? "אין" : `${blocked.length} חסומים`}
        </span>
      </header>
      {blocked.length === 0 ? (
        <div className="today-empty" data-testid="today-blocked-campaigns-empty">
          {doc?._meta?.error
            ? `שגיאת fetch: ${doc._meta.error.substring(0, 80)}`
            : "אין קמפיינים חסומים כרגע."}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {blocked.map((c) => (
            <li key={c.id} style={{ fontSize: 13, color: "#404040" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontWeight: 600,
                    color: "#171717",
                    direction: "ltr",
                    unicodeBidi: "isolate",
                    overflowWrap: "anywhere",
                    minWidth: 0,
                  }}
                >
                  {c.id}
                </span>
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    color: "#fff",
                    background: campaignStatusColor(c.status),
                  }}
                >
                  {(c.status ?? "?").toUpperCase()}
                </span>
              </div>
              {c.last_terminal_state ? (
                <div style={{ fontSize: 12, color: "#737373", marginTop: 1 }}>
                  {c.last_terminal_state}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: "#737373", marginTop: 2 }}>
                {c.owner_user ?? "—"}
                {c.last_written_at ? ` · ${relativeTimeHe(c.last_written_at)}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
