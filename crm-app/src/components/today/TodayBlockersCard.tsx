import { useEffect, useState } from "react";
import { HybridBlockersCard } from "../ops/HybridBlockersCard";
import type { AttentionSynthesisDoc } from "../ops/AttentionSynthesisCard";

// Self-fetching /today wrapper around the shared HybridBlockersCard. Consumes the same
// attention_synthesis.json feed that /ops uses; adds no producer and never mutates. The card
// is self-headed and renders its own honest empty state when the synthesis feed is missing,
// so this wrapper only supplies fetch lifecycle + section spacing.

export function TodayBlockersCard() {
  const [doc, setDoc] = useState<AttentionSynthesisDoc | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/ops-data/attention_synthesis.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: AttentionSynthesisDoc) => {
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
        <div className="today-empty" data-testid="today-blockers-loading">
          טוען חסמים…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="today-section">
        <div className="today-empty" role="alert" data-testid="today-blockers-error">
          לא ניתן לטעון את החסמים כעת. הנתונים לא הומצאו.
        </div>
      </div>
    );
  }

  return (
    <div className="today-section" data-testid="today-blockers">
      <HybridBlockersCard doc={doc} />
    </div>
  );
}
