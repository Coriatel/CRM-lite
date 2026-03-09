import { useProjectContext } from "../contexts/ProjectContext";

export function ProjectGate() {
  const { projects, setActiveProject } = useProjectContext();
  const activeProjects = projects.filter((p) => p.status === "active");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
        direction: "rtl",
      }}
    >
      <header
        style={{
          padding: "24px 20px 16px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          בחר פרויקט
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "var(--color-text-secondary)",
            marginTop: "6px",
          }}
        >
          בחר פרויקט כדי להתחיל לעבוד
        </p>
      </header>

      <div
        style={{
          flex: 1,
          padding: "0 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          overflowY: "auto",
        }}
      >
        {activeProjects.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "var(--color-text-secondary)",
            }}
          >
            <p style={{ fontSize: "16px" }}>אין פרויקטים פעילים</p>
            <p style={{ fontSize: "13px", marginTop: "8px" }}>
              צור פרויקט חדש בהגדרות
            </p>
          </div>
        ) : (
          activeProjects.map((project) => {
            const progress =
              project.goalAmount > 0
                ? Math.min(
                    100,
                    Math.round(
                      (project.raisedAmount / project.goalAmount) * 100,
                    ),
                  )
                : 0;

            return (
              <button
                key={project.id}
                onClick={() => setActiveProject(project.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-card, #fff)",
                  cursor: "pointer",
                  textAlign: "right",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Color strip */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: "4px",
                    background: project.color || "var(--color-primary)",
                  }}
                />

                <div
                  style={{
                    fontSize: "17px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    paddingRight: "8px",
                  }}
                >
                  {project.name}
                </div>

                {project.description && (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                      paddingRight: "8px",
                    }}
                  >
                    {project.description}
                  </div>
                )}

                {project.goalAmount > 0 && (
                  <div style={{ paddingRight: "8px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "var(--color-text-secondary)",
                        marginBottom: "4px",
                      }}
                    >
                      <span>
                        ₪{project.raisedAmount.toLocaleString()} / ₪
                        {project.goalAmount.toLocaleString()}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "3px",
                        background: "var(--color-border)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${progress}%`,
                          borderRadius: "3px",
                          background:
                            project.color || "var(--color-primary)",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
