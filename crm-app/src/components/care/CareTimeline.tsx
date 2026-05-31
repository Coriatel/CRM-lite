import { useState, useEffect, useCallback } from "react";
import { Plus, HeartHandshake } from "lucide-react";
import {
  getCareReports,
  type DirectusCareReport,
} from "../../services/directus";
import { CareReportForm } from "./CareReportForm";

interface CareTimelineProps {
  contactId: string;
  contactName: string;
}

const TYPE_LABELS: Record<string, string> = {
  call: "שיחה",
  meeting: "פגישה",
  message: "הודעה",
  other: "אחר",
};

const STATUS_LABELS: Record<string, string> = {
  none: "ללא מעקב",
  pending: "מעקב נדרש",
  done: "טופל",
};

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "חיובי",
  neutral: "ניטרלי",
  concern: "דאגה",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CareTimeline({ contactId, contactName }: CareTimelineProps) {
  const [reports, setReports] = useState<DirectusCareReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getCareReports({ contactId })
      .then(setReports)
      .catch((err) => {
        console.error("Error loading care reports:", err);
        setError("שגיאה בטעינת דיווחי הטיפול");
      })
      .finally(() => setLoading(false));
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--spacing-sm)",
        }}
      >
        <h3 className="notes-title" style={{ margin: 0 }}>
          <HeartHandshake size={16} style={{ verticalAlign: "middle" }} /> טיפול
          רוחני
        </h3>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => setShowForm(true)}
          style={{ minHeight: 44 }}
        >
          <Plus size={16} /> דיווח
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      )}

      {error && (
        <div className="empty-state" style={{ color: "var(--color-danger)" }}>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="empty-state">
          <p>אין דיווחי טיפול עדיין</p>
        </div>
      )}

      {reports.map((r) => (
        <div
          key={r.id}
          className="note-item"
          style={{ marginBottom: "var(--spacing-sm)" }}
        >
          <div className="note-header">
            <span>
              {TYPE_LABELS[r.interaction_type] ?? r.interaction_type}
              {r.sentiment ? ` · ${SENTIMENT_LABELS[r.sentiment]}` : ""}
            </span>
            <span>{formatWhen(r.interaction_at)}</span>
          </div>
          <div className="note-text">{r.summary}</div>
          {r.followup_status === "pending" && (
            <div
              className="note-header"
              style={{ fontSize: 12, color: "var(--color-warning, #b45309)" }}
            >
              <span>
                {STATUS_LABELS.pending}
                {r.followup_due ? ` · ${r.followup_due}` : ""}
              </span>
            </div>
          )}
        </div>
      ))}

      {showForm && (
        <CareReportForm
          contactId={contactId}
          contactName={contactName}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
