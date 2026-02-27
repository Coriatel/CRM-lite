import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { StatsGrid } from "../components/dashboard/StatsGrid";
import { CallQueueCard } from "../components/dashboard/CallQueueCard";
import { ProjectCard } from "../components/dashboard/ProjectCard";
import { useCallQueue, useCallQueueActions } from "../hooks/useCallQueue";
import { useProjects, useProjectActions } from "../hooks/useProjects";
import { getContact, DirectusContact } from "../services/directus";
import { Project } from "../hooks/useProjects";
import { CallQueueItem } from "../hooks/useCallQueue";

export function DashboardPage() {
  const {
    queue,
    loading: queueLoading,
    refresh: refreshQueue,
  } = useCallQueue();
  const { queue: completedQueue, loading: completedLoading } = useCallQueue({
    status: "completed",
  });
  const {
    projects,
    loading: projectsLoading,
    refresh: refreshProjects,
  } = useProjects("active");
  const { skip, generateDailyQueue } = useCallQueueActions();
  const [generating, setGenerating] = useState(false);
  const { update: updateProject, resetProject } = useProjectActions();

  // Contact names cache for queue items
  const [contactNames, setContactNames] = useState<
    Record<string, { name: string; phone?: string }>
  >({});
  const fetchedIdsRef = useRef(new Set<string>());

  // Project names cache for queue items
  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) {
      map[p.id] = p.name;
    }
    return map;
  }, [projects]);

  // Fetch contact details for queue items
  useEffect(() => {
    const ids = queue
      .map((q) => q.contactId)
      .filter((id) => id && !fetchedIdsRef.current.has(id));
    if (ids.length === 0) return;

    const unique = [...new Set(ids)];
    // Mark as fetching to prevent duplicate requests
    for (const id of unique) fetchedIdsRef.current.add(id);

    Promise.all(
      unique.map((id) =>
        getContact(id)
          .then((c: DirectusContact) => ({
            id,
            name: c.full_name,
            phone: c.phone_e164 || c.phone_raw,
          }))
          .catch(() => ({ id, name: "לא ידוע", phone: undefined })),
      ),
    ).then((results) => {
      setContactNames((prev) => {
        const map = { ...prev };
        for (const r of results) {
          map[r.id] = { name: r.name, phone: r.phone };
        }
        return map;
      });
    });
  }, [queue]);

  // Stats
  const completed = completedQueue.length;
  const remaining = queue.filter((q) => q.status === "pending").length;
  const totalCalls = completed + remaining;
  const totalRaised = projects.reduce((sum, p) => sum + p.raisedAmount, 0);

  const handleCall = useCallback(
    (item: CallQueueItem) => {
      const contact = contactNames[item.contactId];
      if (contact?.phone) {
        const cleaned = contact.phone.replace(/[^\d+\-() ]/g, "");
        if (cleaned.length >= 5) {
          window.open(`tel:${cleaned}`, "_self");
        }
      }
    },
    [contactNames],
  );

  const handleSkip = async (item: CallQueueItem) => {
    await skip(item.id);
    refreshQueue();
  };

  const handlePause = async (project: Project) => {
    await updateProject(project.id, { status: "paused" });
    refreshProjects();
  };

  const handleResume = async (project: Project) => {
    await updateProject(project.id, { status: "active" });
    refreshProjects();
  };

  const handleReset = async (project: Project) => {
    if (confirm(`לאפס את הגיוס בפרויקט "${project.name}"?`)) {
      await resetProject(project.id);
      refreshProjects();
    }
  };

  const loading = queueLoading || completedLoading || projectsLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <header className="header">
        <h1 className="header-title">לוח בקרה</h1>
      </header>

      <main
        className="main-content"
        style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
      >
        {/* Stats */}
        <StatsGrid
          totalCalls={totalCalls}
          completed={completed}
          remaining={remaining}
          raised={totalRaised}
        />

        {/* Call Queue */}
        <div style={{ marginTop: "var(--spacing-lg)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--spacing-sm)",
            }}
          >
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-xs)",
              }}
            >
              תור שיחות להיום
              {queue.length > 0 && (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  ({queue.length})
                </span>
              )}
            </h2>
            <button
              onClick={async () => {
                setGenerating(true);
                try {
                  const added = await generateDailyQueue();
                  if (added > 0) refreshQueue();
                } catch (err) {
                  console.error("Failed to generate queue:", err);
                } finally {
                  setGenerating(false);
                }
              }}
              disabled={generating}
              style={{
                padding: "4px 12px",
                borderRadius: "6px",
                border: "1px solid var(--color-border)",
                background: "transparent",
                fontSize: "12px",
                cursor: generating ? "wait" : "pointer",
                color: "var(--color-primary)",
                fontWeight: 500,
              }}
            >
              {generating ? "מחולל..." : "חולל תור"}
            </button>
          </div>

          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "var(--spacing-lg)",
                color: "var(--color-text-secondary)",
              }}
            >
              טוען...
            </div>
          ) : queue.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: "center",
                color: "var(--color-text-secondary)",
                padding: "var(--spacing-lg)",
              }}
            >
              אין שיחות בתור להיום
            </div>
          ) : (
            queue.map((item) => (
              <CallQueueCard
                key={item.id}
                item={item}
                contactName={contactNames[item.contactId]?.name || "טוען..."}
                contactPhone={contactNames[item.contactId]?.phone}
                projectName={
                  item.projectId ? projectNameMap[item.projectId] : undefined
                }
                onCall={handleCall}
                onSkip={handleSkip}
              />
            ))
          )}
        </div>

        {/* Projects */}
        <div style={{ marginTop: "var(--spacing-lg)" }}>
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 600,
              marginBottom: "var(--spacing-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>פרויקטים פעילים</span>
          </h2>

          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "var(--spacing-lg)",
                color: "var(--color-text-secondary)",
              }}
            >
              טוען...
            </div>
          ) : projects.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: "center",
                color: "var(--color-text-secondary)",
                padding: "var(--spacing-lg)",
              }}
            >
              אין פרויקטים פעילים. צור פרויקט חדש בהגדרות.
            </div>
          ) : (
            projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onPause={handlePause}
                onResume={handleResume}
                onReset={handleReset}
              />
            ))
          )}
        </div>

        {/* Bottom spacer for nav */}
        <div style={{ height: "var(--spacing-lg)" }} />
      </main>
    </div>
  );
}
