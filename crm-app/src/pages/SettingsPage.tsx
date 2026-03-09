import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  User,
  Shield,
  Database,
  Upload,
  Plus,
  Trash2,
  Edit3,
  X,
  Check,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProjectContext } from "../contexts/ProjectContext";
import { useProjects, useProjectActions, Project } from "../hooks/useProjects";
import { useProjectTiers } from "../hooks/useProjectConfig";

const COLOR_PALETTE = [
  "#1a5f7a",
  "#e07b39",
  "#22c55e",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeProject, setActiveProject: setActive } = useProjectContext();
  const { projects, loading, refresh } = useProjects();
  const { create, update, remove } = useProjectActions();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formGoal, setFormGoal] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formPageId, setFormPageId] = useState("");
  const [formTemplate, setFormTemplate] = useState("");
  const [formScript, setFormScript] = useState("");
  const [formColor, setFormColor] = useState(COLOR_PALETTE[0]);
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Tier management for editing project
  const { tiers, addTier, removeTier } = useProjectTiers(editingId);
  const [tierLabel, setTierLabel] = useState("");
  const [tierOneTime, setTierOneTime] = useState("");
  const [tierMonthly, setTierMonthly] = useState("");

  const resetForm = () => {
    setFormName("");
    setFormGoal("");
    setFormStart("");
    setFormEnd("");
    setFormUrl("");
    setFormPageId("");
    setFormTemplate("");
    setFormScript("");
    setFormColor(COLOR_PALETTE[0]);
    setFormDescription("");
    setEditingId(null);
    setShowForm(false);
    setTierLabel("");
    setTierOneTime("");
    setTierMonthly("");
  };

  const startEdit = (project: Project) => {
    setFormName(project.name);
    setFormGoal(String(project.goalAmount));
    setFormStart(project.startDate || "");
    setFormEnd(project.endDate || "");
    setFormUrl(project.landingPageUrl || "");
    setFormPageId(project.takbullPageId || "");
    setFormTemplate(project.whatsappTemplate || "");
    setFormScript(project.callScript || "");
    setFormColor(project.color || COLOR_PALETTE[0]);
    setFormDescription(project.description || "");
    setEditingId(project.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        goalAmount: Number(formGoal) || 0,
        startDate: formStart || undefined,
        endDate: formEnd || undefined,
        landingPageUrl: formUrl || undefined,
        takbullPageId: formPageId || undefined,
        whatsappTemplate: formTemplate || undefined,
        callScript: formScript || undefined,
        color: formColor,
        description: formDescription || undefined,
      };
      if (editingId) {
        await update(editingId, data);
      } else {
        await create(data);
      }
      resetForm();
      refresh();
    } catch (err) {
      console.error("Failed to save project:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`למחוק את הפרויקט "${project.name}"?`)) return;
    try {
      await remove(project.id);
      refresh();
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const handleAddTier = async () => {
    if (!tierLabel.trim()) return;
    await addTier({
      label: tierLabel.trim(),
      oneTimeAmount: Number(tierOneTime) || undefined,
      monthlyAmount: Number(tierMonthly) || undefined,
    });
    setTierLabel("");
    setTierOneTime("");
    setTierMonthly("");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    fontSize: "14px",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <header className="header">
        <h1 className="header-title">הגדרות</h1>
      </header>

      <main
        className="main-content"
        style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
      >
        {/* Active project selector */}
        {projects.length > 1 && (
          <div className="card" style={{ marginBottom: "var(--spacing-md)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-sm)",
                marginBottom: "var(--spacing-sm)",
              }}
            >
              <Database size={18} style={{ color: "var(--color-accent)" }} />
              <span style={{ fontWeight: 500 }}>פרויקט פעיל</span>
            </div>
            <select
              value={activeProject?.id || ""}
              onChange={(e) => setActive(e.target.value || null)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--color-border)",
                fontSize: "14px",
                fontFamily: "inherit",
                background: "var(--color-surface)",
              }}
            >
              <option value="">-- בחר פרויקט --</option>
              {projects
                .filter((p) => p.status === "active")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* User info */}
        <div className="card" style={{ marginBottom: "var(--spacing-md)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-md)",
            }}
          >
            <div className="contact-avatar">
              <User size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "16px" }}>
                {user?.displayName}
              </div>
              <div
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                {user?.email}
              </div>
            </div>
          </div>
        </div>

        {/* Projects management */}
        <div className="card" style={{ marginBottom: "var(--spacing-md)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--spacing-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-sm)",
              }}
            >
              <Database size={18} style={{ color: "var(--color-primary)" }} />
              <span style={{ fontWeight: 500 }}>ניהול פרויקטים</span>
            </div>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                <Plus size={14} />
                חדש
              </button>
            )}
          </div>

          {/* Project form */}
          {showForm && (
            <div
              style={{
                background: "var(--color-bg-secondary, #f1f5f9)",
                borderRadius: "8px",
                padding: "var(--spacing-sm)",
                marginBottom: "var(--spacing-sm)",
              }}
            >
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <input
                  type="text"
                  placeholder="שם הפרויקט"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <input
                  type="number"
                  placeholder="יעד גיוס (₪)"
                  value={formGoal}
                  onChange={(e) => setFormGoal(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <textarea
                  placeholder="תיאור הקמפיין"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--spacing-xs)",
                  marginBottom: "var(--spacing-xs)",
                }}
              >
                <input
                  type="date"
                  placeholder="תחילה"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border)",
                    fontSize: "14px",
                  }}
                />
                <input
                  type="date"
                  placeholder="סיום"
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border)",
                    fontSize: "14px",
                  }}
                />
              </div>

              {/* Campaign-specific fields */}
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <input
                  type="url"
                  placeholder="כתובת דף תרומה (https://give.merkazneshama.co.il)"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  style={inputStyle}
                  dir="ltr"
                />
              </div>
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <input
                  type="text"
                  placeholder="מזהה דף תקבול (page_id)"
                  value={formPageId}
                  onChange={(e) => setFormPageId(e.target.value)}
                  style={inputStyle}
                  dir="ltr"
                />
              </div>
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <textarea
                  placeholder={
                    "תבנית הודעת ווטסאפ (השתמש ב-{{link}} לקישור תרומה)"
                  }
                  value={formTemplate}
                  onChange={(e) => setFormTemplate(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <textarea
                  placeholder="תסריט שיחה / נקודות דיבור"
                  value={formScript}
                  onChange={(e) => setFormScript(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              {/* Color picker */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "var(--spacing-xs)",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  צבע:
                </span>
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: c,
                      border:
                        formColor === c
                          ? "3px solid var(--color-text)"
                          : "2px solid transparent",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              {/* Tier management (only when editing) */}
              {editingId && (
                <div
                  style={{
                    marginBottom: "var(--spacing-xs)",
                    padding: "var(--spacing-xs)",
                    background: "rgba(255,255,255,0.5)",
                    borderRadius: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      marginBottom: "6px",
                    }}
                  >
                    רמות תרומה
                  </div>
                  {tiers.map((tier) => (
                    <div
                      key={tier.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "4px",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ flex: 1 }}>{tier.label}</span>
                      {tier.oneTimeAmount && <span>₪{tier.oneTimeAmount}</span>}
                      {tier.monthlyAmount && (
                        <span style={{ color: "var(--color-text-secondary)" }}>
                          /₪{tier.monthlyAmount} חודשי
                        </span>
                      )}
                      <button
                        onClick={() => removeTier(tier.id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "2px",
                          cursor: "pointer",
                          color: "var(--color-danger, #ef4444)",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      marginTop: "6px",
                    }}
                  >
                    <input
                      type="text"
                      placeholder="שם רמה"
                      value={tierLabel}
                      onChange={(e) => setTierLabel(e.target.value)}
                      style={{
                        ...inputStyle,
                        flex: 2,
                        padding: "4px 8px",
                        fontSize: "13px",
                      }}
                    />
                    <input
                      type="number"
                      placeholder="חד פעמי"
                      value={tierOneTime}
                      onChange={(e) => setTierOneTime(e.target.value)}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        padding: "4px 8px",
                        fontSize: "13px",
                      }}
                    />
                    <input
                      type="number"
                      placeholder="חודשי"
                      value={tierMonthly}
                      onChange={(e) => setTierMonthly(e.target.value)}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        padding: "4px 8px",
                        fontSize: "13px",
                      }}
                    />
                    <button
                      onClick={handleAddTier}
                      disabled={!tierLabel.trim()}
                      style={{
                        background: "var(--color-primary)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        padding: "4px 8px",
                        cursor: "pointer",
                        opacity: !tierLabel.trim() ? 0.5 : 1,
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "var(--spacing-xs)",
                }}
              >
                <button
                  onClick={resetForm}
                  style={{
                    background: "none",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "13px",
                  }}
                >
                  <X size={14} />
                  ביטול
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !formName.trim()}
                  style={{
                    background: "var(--color-primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    cursor: saving ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "13px",
                    fontWeight: 500,
                    opacity: saving || !formName.trim() ? 0.6 : 1,
                  }}
                >
                  <Check size={14} />
                  {editingId ? "עדכן" : "צור"}
                </button>
              </div>
            </div>
          )}

          {/* Project list */}
          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "var(--spacing-md)",
                color: "var(--color-text-secondary)",
                fontSize: "14px",
              }}
            >
              טוען פרויקטים...
            </div>
          ) : projects.length === 0 ? (
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-text-secondary)",
              }}
            >
              אין פרויקטים. לחץ "חדש" כדי ליצור פרויקט ראשון.
            </p>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--spacing-sm) 0",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: project.color || "var(--color-primary)",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: "14px" }}>
                      {project.name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      יעד: ₪{project.goalAmount.toLocaleString()} | גויס: ₪
                      {project.raisedAmount.toLocaleString()} |{" "}
                      {project.status === "active"
                        ? "פעיל"
                        : project.status === "paused"
                          ? "מושהה"
                          : "הושלם"}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--spacing-xs)",
                  }}
                >
                  <button
                    onClick={() => startEdit(project)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "4px",
                      cursor: "pointer",
                      color: "var(--color-primary)",
                    }}
                    title="ערוך"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(project)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "4px",
                      cursor: "pointer",
                      color: "var(--color-danger, #ef4444)",
                    }}
                    title="מחק"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Import contacts */}
        <div
          className="card"
          style={{ marginBottom: "var(--spacing-md)", cursor: "pointer" }}
          onClick={() => navigate("/import")}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-sm)",
              marginBottom: "var(--spacing-sm)",
            }}
          >
            <Upload size={18} style={{ color: "var(--color-primary)" }} />
            <span style={{ fontWeight: 500 }}>יבוא אנשי קשר</span>
          </div>
          <p
            style={{
              fontSize: "14px",
              color: "var(--color-text-secondary)",
            }}
          >
            יבוא מקובץ Excel (וואטסאפ, אנשי קשר)
          </p>
        </div>

        {/* Placeholder sections */}
        <div
          className="card"
          style={{ marginBottom: "var(--spacing-md)", opacity: 0.6 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-sm)",
              marginBottom: "var(--spacing-sm)",
            }}
          >
            <Shield size={18} style={{ color: "var(--color-primary)" }} />
            <span style={{ fontWeight: 500 }}>ניהול משתמשים</span>
          </div>
          <p
            style={{
              fontSize: "14px",
              color: "var(--color-text-secondary)",
            }}
          >
            יהיה זמין לאחר הגדרת אימות Google
          </p>
        </div>

        <div className="card" style={{ opacity: 0.6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-sm)",
              marginBottom: "var(--spacing-sm)",
            }}
          >
            <Settings size={18} style={{ color: "var(--color-primary)" }} />
            <span style={{ fontWeight: 500 }}>הגדרות כלליות</span>
          </div>
          <p
            style={{
              fontSize: "14px",
              color: "var(--color-text-secondary)",
            }}
          >
            התאמות אישיות ותצורה
          </p>
        </div>

        {/* Bottom spacer */}
        <div style={{ height: "var(--spacing-lg)" }} />
      </main>
    </div>
  );
}
