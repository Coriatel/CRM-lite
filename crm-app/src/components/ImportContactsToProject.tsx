import { useState, useEffect } from "react";
import { X, Check, Users, Search } from "lucide-react";
import { useProjectContext } from "../contexts/ProjectContext";
import {
  getProjectContacts,
  getProjectContactIds,
  batchCreateProjectContacts,
  DirectusContact,
} from "../services/directus";
// Contact type not used directly — contacts come from DirectusContact

interface ImportContactsToProjectProps {
  targetProjectId: string;
  onClose: () => void;
  onImported: () => void;
}

interface SourceContact {
  contactId: string;
  fullName: string;
  phone: string;
  alreadyInTarget: boolean;
}

export function ImportContactsToProject({
  targetProjectId,
  onClose,
  onImported,
}: ImportContactsToProjectProps) {
  const { projects } = useProjectContext();
  const [step, setStep] = useState<"select" | "pick" | "importing">("select");
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [sourceContacts, setSourceContacts] = useState<SourceContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);

  const otherProjects = projects.filter(
    (p) => p.id !== targetProjectId && p.status === "active",
  );

  // Load source project contacts when selected
  useEffect(() => {
    if (!sourceProjectId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getProjectContacts(sourceProjectId, { limit: 1000 }),
      getProjectContactIds(targetProjectId),
    ])
      .then(([sourcePcs, targetContactIds]) => {
        if (cancelled) return;
        const targetSet = new Set(targetContactIds);
        const contacts: SourceContact[] = sourcePcs
          .filter((pc) => pc.contact_id && typeof pc.contact_id === "object")
          .map((pc) => {
            const c = pc.contact_id as unknown as DirectusContact;
            return {
              contactId: c.id,
              fullName: c.full_name || "",
              phone: c.phone_e164 || c.phone_raw || "",
              alreadyInTarget: targetSet.has(c.id),
            };
          });
        setSourceContacts(contacts);
        setLoading(false);
        setStep("pick");
      })
      .catch((err) => {
        console.error("Error loading source contacts:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceProjectId, targetProjectId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllAvailable = () => {
    const available = sourceContacts
      .filter((c) => !c.alreadyInTarget)
      .map((c) => c.contactId);
    setSelectedIds(new Set(available));
  };

  const filtered = sourceContacts.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.fullName.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setStep("importing");
    try {
      const items = Array.from(selectedIds).map((cid) => ({
        project_id: targetProjectId,
        contact_id: cid,
        campaign_status: "not_contacted",
      }));
      await batchCreateProjectContacts(items);
      setImportResult(`${selectedIds.size} אנשי קשר יובאו בהצלחה`);
      onImported();
    } catch (err) {
      console.error("Import failed:", err);
      setImportResult("שגיאה בייבוא אנשי הקשר");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--color-bg)",
        display: "flex",
        flexDirection: "column",
        direction: "rtl",
      }}
    >
      {/* Header */}
      <header
        className="header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 className="header-title">ייבא מפרויקט אחר</h1>
        <button
          className="header-btn"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <X size={20} />
        </button>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {step === "select" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-text-secondary)",
                marginBottom: "8px",
              }}
            >
              בחר פרויקט מקור
            </p>
            {otherProjects.length === 0 ? (
              <p style={{ color: "var(--color-text-secondary)" }}>
                אין פרויקטים אחרים
              </p>
            ) : (
              otherProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSourceProjectId(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-card, #fff)",
                    cursor: "pointer",
                    fontSize: "15px",
                    fontFamily: "inherit",
                    textAlign: "right",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: p.color || "var(--color-primary)",
                      flexShrink: 0,
                    }}
                  />
                  {p.name}
                </button>
              ))
            )}
          </div>
        )}

        {step === "pick" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {/* Search */}
            <div
              className="search-box"
              style={{
                background: "var(--color-bg-secondary, #f1f5f9)",
                borderRadius: "8px",
              }}
            >
              <Search size={18} style={{ opacity: 0.5 }} />
              <input
                type="text"
                placeholder="חיפוש..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                onClick={selectAllAvailable}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-primary)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontFamily: "inherit",
                }}
              >
                בחר הכל (
                {sourceContacts.filter((c) => !c.alreadyInTarget).length})
              </button>
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {selectedIds.size} נבחרו
              </span>
            </div>

            {loading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {filtered.map((c) => (
                  <button
                    key={c.contactId}
                    onClick={() =>
                      !c.alreadyInTarget && toggleSelect(c.contactId)
                    }
                    disabled={c.alreadyInTarget}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: selectedIds.has(c.contactId)
                        ? "2px solid var(--color-primary)"
                        : "1px solid var(--color-border)",
                      background: c.alreadyInTarget
                        ? "var(--color-bg-secondary, #f1f5f9)"
                        : "var(--color-bg-card, #fff)",
                      cursor: c.alreadyInTarget ? "default" : "pointer",
                      opacity: c.alreadyInTarget ? 0.5 : 1,
                      textAlign: "right",
                      fontFamily: "inherit",
                      fontSize: "14px",
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "4px",
                        border: "2px solid var(--color-primary)",
                        background: selectedIds.has(c.contactId)
                          ? "var(--color-primary)"
                          : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {selectedIds.has(c.contactId) && (
                        <Check size={14} color="#fff" />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{c.fullName}</div>
                      {c.phone && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {c.phone}
                        </div>
                      )}
                    </div>
                    {c.alreadyInTarget && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        כבר קיים
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={selectedIds.size === 0}
              className="btn btn-primary"
              style={{
                position: "sticky",
                bottom: "16px",
                padding: "12px",
                fontSize: "15px",
                fontWeight: 600,
                borderRadius: "10px",
              }}
            >
              <Users size={18} />
              ייבא {selectedIds.size} אנשי קשר
            </button>
          </div>
        )}

        {step === "importing" && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            {importResult ? (
              <>
                <p style={{ fontSize: "16px", marginBottom: "16px" }}>
                  {importResult}
                </p>
                <button className="btn btn-primary" onClick={onClose}>
                  סגור
                </button>
              </>
            ) : (
              <div className="loading">
                <div className="spinner"></div>
                <p style={{ marginTop: "12px" }}>מייבא...</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
