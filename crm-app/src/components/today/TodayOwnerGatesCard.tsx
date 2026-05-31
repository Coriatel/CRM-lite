import { useEffect, useState } from "react";
import {
  summarizeOwnerGates,
  ownerGateStatusColor,
  type OwnerGateStatusDoc,
} from "../../pages/OpsPage";

// Self-fetching /today "Waiting Approvals" card. Consumes the same owner_gate_status.json
// feed and the same pure rollup (summarizeOwnerGates) that /ops uses — adds no producer and
// never mutates. Rows are deliberately NOT linked to /ops/gates/:id: that route resolves
// plain-text gates from session_index.json via plainifyGate, a disjoint keyspace from these
// structured gate_ids (runtime_issue:/owner_gate:/blocker:). Linking would 404. Mirrors the
// /ops OwnerGateQueueCard, which is also link-free for the same reason.

export function TodayOwnerGatesCard() {
  const [doc, setDoc] = useState<OwnerGateStatusDoc | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/ops-data/owner_gate_status.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: OwnerGateStatusDoc) => {
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
        <div className="today-empty" data-testid="today-owner-gates-loading">
          טוען שערים הממתינים לאישור…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="today-section">
        <div className="today-empty" role="alert" data-testid="today-owner-gates-error">
          לא ניתן לטעון את שערי האישור כעת. הנתונים לא הומצאו.
        </div>
      </div>
    );
  }

  const { open, gates } = summarizeOwnerGates(doc, null);

  return (
    <section className="today-section" aria-label="ממתינים לאישור" data-testid="today-owner-gates">
      <header className="today-section__header">
        <h2 className="today-section__title">▾ ממתינים לאישור</h2>
        <span className="today-section__meta">{open === 0 ? "שקט" : `${open} פתוחים`}</span>
      </header>
      {gates.length === 0 ? (
        <div className="today-empty" data-testid="today-owner-gates-empty">
          {doc?._meta?.error
            ? `שגיאת fetch: ${doc._meta.error.substring(0, 80)}`
            : "אין שערים הממתינים לאישור כרגע."}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {gates.map((g) => (
            <li key={g.gate_id} style={{ fontSize: 13, color: "#404040" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    color: "#fff",
                    background: ownerGateStatusColor(g.status),
                  }}
                >
                  {(g.status ?? "?").replace(/_/g, " ")}
                </span>
                {g.gate_kind ? (
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
                    {g.gate_kind}
                  </span>
                ) : null}
              </div>
              <div style={{ color: "#171717", marginTop: 2 }}>{g.summary ?? g.gate_id}</div>
              {g.reason ? (
                <div style={{ fontSize: 12, color: "#737373", marginTop: 1 }}>{g.reason}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
