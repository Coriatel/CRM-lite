import { X } from "lucide-react";
import { useProjectContext } from "../contexts/ProjectContext";

export function ProjectSelector() {
  const { activeProject, setActiveProject, projects } = useProjectContext();

  const activeProjects = projects.filter((p) => p.status === "active");
  if (activeProjects.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        padding: "6px var(--spacing-md)",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        background: "var(--color-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {activeProjects.map((project) => {
        const isActive = activeProject?.id === project.id;
        return (
          <button
            key={project.id}
            onClick={() => setActiveProject(isActive ? null : project.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "16px",
              border: isActive
                ? `2px solid ${project.color || "var(--color-primary)"}`
                : "1px solid var(--color-border)",
              background: isActive
                ? `${project.color || "var(--color-primary)"}15`
                : "transparent",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 400,
              whiteSpace: "nowrap",
              color: isActive
                ? project.color || "var(--color-primary)"
                : "var(--color-text)",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: project.color || "var(--color-primary)",
                flexShrink: 0,
              }}
            />
            {project.name}
            {isActive && (
              <X
                size={14}
                style={{ opacity: 0.6 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveProject(null);
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
