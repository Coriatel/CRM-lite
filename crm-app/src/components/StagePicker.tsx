import { useEffect, useState } from "react";
import { Contact, LifecycleStage } from "../types";
import {
  DirectusLifecycleStage,
  getLifecycleStages,
  setContactStage,
} from "../services/directus";
import { StageBadge } from "./StageBadge";

interface StagePickerProps {
  contact: Contact;
  /**
   * Notify parent that the contact's lifecycle stage changed so it can
   * lift state into its own store. Receives the resolved new stage.
   */
  onStageChanged: (
    next: Pick<LifecycleStage, "id" | "slug" | "name" | "color">,
  ) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error" };

/**
 * Stage selector for ContactDetailModal (Slice #2).
 *
 * Read-only badge by default. Click "שנה שלב" to enter edit mode, pick a
 * new stage, and save. A single PATCH is issued; the server-side Directus
 * Flow writes the stage_transitions audit row automatically.
 */
export function StagePicker({ contact, onStageChanged }: StagePickerProps) {
  const [stages, setStages] = useState<DirectusLifecycleStage[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(
    contact.lifecycleStage?.id ?? "",
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    getLifecycleStages()
      .then((s) => {
        if (!cancelled) setStages(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset local state when modal reopens on a different contact.
  useEffect(() => {
    setSelectedId(contact.lifecycleStage?.id ?? "");
    setEditing(false);
    setStatus({ kind: "idle" });
  }, [contact.id, contact.lifecycleStage?.id]);

  const currentStage = contact.lifecycleStage;

  const handleSave = async () => {
    if (!selectedId || selectedId === currentStage?.id) {
      setEditing(false);
      return;
    }
    setStatus({ kind: "saving" });
    try {
      await setContactStage(contact.id, selectedId);
      const next = stages.find((s) => s.id === selectedId);
      if (next) {
        onStageChanged({
          id: next.id,
          slug: next.slug,
          name: next.name,
          color: next.color,
        });
      }
      setStatus({ kind: "idle" });
      setEditing(false);
    } catch (err) {
      console.warn("setContactStage failed", err);
      setStatus({ kind: "error" });
    }
  };

  const handleCancel = () => {
    setSelectedId(currentStage?.id ?? "");
    setEditing(false);
    setStatus({ kind: "idle" });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        marginBottom: "var(--spacing-md)",
        borderRadius: 10,
        border: "1px solid var(--color-border, #e5e7eb)",
        background: "var(--color-surface, #fff)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              color: "var(--color-text-muted, #64748b)",
            }}
          >
            שלב במסע:
          </span>
          {currentStage ? (
            <StageBadge stage={currentStage} size="md" />
          ) : (
            <span
              style={{
                fontSize: 13,
                color: "var(--color-text-muted, #94a3b8)",
                fontStyle: "italic",
              }}
            >
              לא הוגדר
            </span>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={stages.length === 0}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border, #d1d5db)",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: stages.length === 0 ? "not-allowed" : "pointer",
              opacity: stages.length === 0 ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            שנה שלב
          </button>
        )}
      </div>

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={status.kind === "saving"}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--color-border, #d1d5db)",
              background: "var(--color-bg, #fff)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          >
            <option value="">בחר שלב...</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleCancel}
              disabled={status.kind === "saving"}
              style={{
                background: "transparent",
                border: "1px solid var(--color-border, #d1d5db)",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                status.kind === "saving" ||
                !selectedId ||
                selectedId === currentStage?.id
              }
              style={{
                background: "var(--color-primary, #1a5f7a)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: status.kind === "saving" ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity:
                  status.kind === "saving" ||
                  !selectedId ||
                  selectedId === currentStage?.id
                    ? 0.6
                    : 1,
              }}
            >
              {status.kind === "saving" ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      )}

      {status.kind === "error" && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "#dc2626",
            background: "#ef444415",
            padding: "6px 10px",
            borderRadius: 4,
            lineHeight: 1.5,
          }}
        >
          ⚠ שינוי השלב נכשל, נסה שוב.
        </div>
      )}
    </div>
  );
}
