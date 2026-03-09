import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useProjectContext } from "../contexts/ProjectContext";

export function ProjectSwitcher() {
  const { activeProject, setActiveProject, projects } = useProjectContext();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeProjects = projects.filter((p) => p.status === "active");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  if (!activeProject) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          padding: 0,
          fontSize: "18px",
          fontWeight: 700,
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: activeProject.color || "var(--color-primary)",
            flexShrink: 0,
          }}
        />
        {activeProject.name}
        <ChevronDown
          size={16}
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            opacity: 0.7,
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: "200px",
            background: "var(--color-bg-card, #fff)",
            borderRadius: "10px",
            border: "1px solid var(--color-border)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {activeProjects.map((project) => {
            const isCurrent = project.id === activeProject.id;
            return (
              <button
                key={project.id}
                onClick={() => {
                  setActiveProject(project.id);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "10px 14px",
                  border: "none",
                  background: isCurrent
                    ? "var(--color-bg-secondary, #f1f5f9)"
                    : "transparent",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: isCurrent ? 600 : 400,
                  color: "var(--color-text)",
                  textAlign: "right",
                  fontFamily: "inherit",
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
