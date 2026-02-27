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
import { useProjects, useProjectActions, Project } from "../hooks/useProjects";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects, loading, refresh } = useProjects();
  const { create, update, remove } = useProjectActions();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formGoal, setFormGoal] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormName("");
    setFormGoal("");
    setFormStart("");
    setFormEnd("");
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (project: Project) => {
    setFormName(project.name);
    setFormGoal(String(project.goalAmount));
    setFormStart(project.startDate || "");
    setFormEnd(project.endDate || "");
    setEditingId(project.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await update(editingId, {
          name: formName.trim(),
          goalAmount: Number(formGoal) || 0,
          startDate: formStart || undefined,
          endDate: formEnd || undefined,
        });
      } else {
        await create({
          name: formName.trim(),
          goalAmount: Number(formGoal) || 0,
          startDate: formStart || undefined,
          endDate: formEnd || undefined,
        });
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

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <header className="header">
        <h1 className="header-title">הגדרות</h1>
      </header>

      <main
        className="main-content"
        style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
      >
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
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border)",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "var(--spacing-xs)" }}>
                <input
                  type="number"
                  placeholder="יעד גיוס (₪)"
                  value={formGoal}
                  onChange={(e) => setFormGoal(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border)",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
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
