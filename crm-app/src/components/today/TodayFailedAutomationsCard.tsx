import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  summarizeAutomations,
  automationHealthColor,
  AUTOMATION_HEALTH_LABEL_HE,
  relativeTimeHe,
  type AutomationInventoryDoc,
} from "../../pages/OpsPage";

// Self-fetching /today card for automations that need attention (failing / broken / degraded /
// stale). Consumes the same automation_runtime_inventory.json feed and the same pure rollup
// (summarizeAutomations) that /ops uses — adds no producer and never mutates. Rows link to
// /ops/automations/:id, which resolves by a.id from this same feed (verified same keyspace),
// so the drilldown always lands. Capped small for the mobile shell; overflow links to /ops.

const TODAY_CAP = 6;

export function TodayFailedAutomationsCard() {
  const [doc, setDoc] = useState<AutomationInventoryDoc | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/ops-data/automation_runtime_inventory.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: AutomationInventoryDoc) => {
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
        <div className="today-empty" data-testid="today-failed-automations-loading">
          טוען אוטומציות שדורשות טיפול…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="today-section">
        <div className="today-empty" role="alert" data-testid="today-failed-automations-error">
          לא ניתן לטעון את מצב האוטומציות כעת. הנתונים לא הומצאו.
        </div>
      </div>
    );
  }

  const { attention, attentionTotal } = summarizeAutomations(doc, TODAY_CAP);

  return (
    <section
      className="today-section"
      aria-label="אוטומציות שנכשלו"
      data-testid="today-failed-automations"
    >
      <header className="today-section__header">
        <h2 className="today-section__title">▾ אוטומציות שנכשלו</h2>
        <span className="today-section__meta">
          {attentionTotal === 0 ? "תקין" : `${attentionTotal} לטיפול`}
        </span>
      </header>
      {attentionTotal === 0 ? (
        <div className="today-empty" data-testid="today-failed-automations-empty">
          {doc?._meta?.error
            ? `שגיאת fetch: ${doc._meta.error.substring(0, 80)}`
            : "כל האוטומציות תקינות כרגע."}
        </div>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {attention.map((a) => (
              <li
                key={a.id}
                style={{ fontSize: 13, color: "#404040", overflowWrap: "anywhere" }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <Link
                    to={`/ops/automations/${encodeURIComponent(a.id)}`}
                    style={{
                      color: "#1d4ed8",
                      textDecoration: "none",
                      fontWeight: 600,
                      overflowWrap: "anywhere",
                      minWidth: 0,
                    }}
                  >
                    {a.name ?? a.id}
                  </Link>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 8px",
                      borderRadius: 999,
                      fontSize: 11,
                      color: "#fff",
                      background: automationHealthColor(a.health_status),
                    }}
                  >
                    {AUTOMATION_HEALTH_LABEL_HE[(a.health_status ?? "").toLowerCase()] ??
                      a.health_status ??
                      "?"}
                  </span>
                  {a.platform ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        color: "#fff",
                        background: "#737373",
                      }}
                    >
                      {a.platform}
                    </span>
                  ) : null}
                </div>
                {a.last_failure_at ? (
                  <div style={{ fontSize: 12, color: "#737373", marginTop: 1 }}>
                    כשל אחרון: {relativeTimeHe(a.last_failure_at)}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {attentionTotal > attention.length ? (
            <div style={{ fontSize: 12, color: "#737373", marginTop: 6 }}>
              <Link to="/ops" style={{ color: "#1d4ed8", textDecoration: "none" }}>
                +{attentionTotal - attention.length} נוספות דורשות תשומת לב — לכל האוטומציות
              </Link>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
