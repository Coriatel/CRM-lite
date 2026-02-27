import { Folder, Users, Pause, Play, RotateCcw } from "lucide-react";
import { Project } from "../../hooks/useProjects";

interface ProjectCardProps {
  project: Project;
  donorCount?: number;
  onPause?: (project: Project) => void;
  onResume?: (project: Project) => void;
  onReset?: (project: Project) => void;
}

export function ProjectCard({
  project,
  donorCount = 0,
  onPause,
  onResume,
  onReset,
}: ProjectCardProps) {
  const progress =
    project.goalAmount > 0
      ? Math.min((project.raisedAmount / project.goalAmount) * 100, 100)
      : 0;

  const isPaused = project.status === "paused";

  return (
    <div
      className="card"
      style={{
        marginBottom: "var(--spacing-sm)",
        opacity: isPaused ? 0.7 : 1,
      }}
    >
      {/* Header */}
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
            gap: "var(--spacing-xs)",
          }}
        >
          <Folder size={16} style={{ color: "var(--color-primary)" }} />
          <span style={{ fontWeight: 600, fontSize: "15px" }}>
            {project.name}
          </span>
          {isPaused && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--color-warning)",
                fontWeight: 500,
              }}
            >
              (מושהה)
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {isPaused && onResume ? (
            <button
              onClick={() => onResume(project)}
              style={{
                background: "none",
                border: "none",
                padding: "4px",
                cursor: "pointer",
                color: "var(--color-success)",
              }}
              title="המשך"
            >
              <Play size={14} />
            </button>
          ) : (
            onPause && (
              <button
                onClick={() => onPause(project)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px",
                  cursor: "pointer",
                  color: "var(--color-warning)",
                }}
                title="השהה"
              >
                <Pause size={14} />
              </button>
            )
          )}
          {onReset && (
            <button
              onClick={() => onReset(project)}
              style={{
                background: "none",
                border: "none",
                padding: "4px",
                cursor: "pointer",
                color: "var(--color-text-secondary)",
              }}
              title="אפס"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: "8px",
          borderRadius: "4px",
          background: "var(--color-bg-secondary, #f1f5f9)",
          marginBottom: "var(--spacing-xs)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: "4px",
            background:
              progress >= 100
                ? "var(--color-success)"
                : "var(--color-primary)",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "13px",
          color: "var(--color-text-secondary)",
        }}
      >
        <span>
          ₪{project.raisedAmount.toLocaleString()} / ₪
          {project.goalAmount.toLocaleString()}
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Users size={12} />
          {donorCount} תורמים
        </span>
      </div>
    </div>
  );
}
