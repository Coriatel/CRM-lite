import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Clock } from "lucide-react";
import { StatsGrid } from "../components/dashboard/StatsGrid";
import { CampaignStatsGrid } from "../components/dashboard/CampaignStatsGrid";
import { CallQueueCard } from "../components/dashboard/CallQueueCard";
import { ProjectCard } from "../components/dashboard/ProjectCard";
import { ProjectSwitcher } from "../components/ProjectSwitcher";
import { useCallQueue, useCallQueueActions } from "../hooks/useCallQueue";
import { useProjects, useProjectActions } from "../hooks/useProjects";
import { useProjectContext } from "../contexts/ProjectContext";
import { useProjectContactActions } from "../hooks/useProjectContacts";
import { useProjectTiers } from "../hooks/useProjectConfig";
import {
  getContact,
  getProjectFollowUps,
  DirectusContact,
} from "../services/directus";
import { Project } from "../hooks/useProjects";
import { CallQueueItem } from "../hooks/useCallQueue";
import { CAMPAIGN_STATUS_LABELS } from "../types";

export function DashboardPage() {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
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
  const { getStats } = useProjectContactActions();
  const { tiers } = useProjectTiers(activeProject?.id || null);

  // Campaign stats
  const [campaignStats, setCampaignStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
    totalDonated: number;
    byDonationType: { one_time: number; recurring: number };
    byTier: Record<string, { count: number; amount: number }>;
  } | null>(null);

  // Follow-up contacts
  const [followUps, setFollowUps] = useState<
    { contactId: string; name: string; status: string; dateUpdated: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    if (activeProject) {
      getStats(activeProject.id).then((stats) => {
        if (!cancelled) setCampaignStats(stats);
      });
      getProjectFollowUps(activeProject.id).then(async (items) => {
        const results = await Promise.all(
          items.map(async (item) => {
            try {
              const c = await getContact(item.contact_id);
              return {
                contactId: item.contact_id,
                name: c.full_name,
                status: item.campaign_status,
                dateUpdated: item.date_updated,
              };
            } catch {
              return {
                contactId: item.contact_id,
                name: "לא ידוע",
                status: item.campaign_status,
                dateUpdated: item.date_updated,
              };
            }
          }),
        );
        if (!cancelled) setFollowUps(results);
      });
    } else {
      setCampaignStats(null);
      setFollowUps([]);
    }
    return () => {
      cancelled = true;
    };
  }, [activeProject]);

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <ProjectSwitcher />
          <span
            style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}
          >
            לוח בקרה
          </span>
        </div>
      </header>

      <main
        className="main-content"
        style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
      >
        {/* Campaign stats or general stats */}
        {activeProject && campaignStats ? (
          <CampaignStatsGrid
            total={campaignStats.total}
            byStatus={campaignStats.byStatus}
            totalDonated={campaignStats.totalDonated}
            goalAmount={activeProject.goalAmount}
          />
        ) : (
          <StatsGrid
            totalCalls={totalCalls}
            completed={completed}
            remaining={remaining}
            raised={totalRaised}
          />
        )}

        {/* Advanced campaign analytics */}
        {activeProject && campaignStats && (
          <div
            style={{
              marginTop: "var(--spacing-md)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-sm)",
            }}
          >
            {/* Donation type split */}
            {(campaignStats.byDonationType.one_time > 0 ||
              campaignStats.byDonationType.recurring > 0) && (
              <div className="card" style={{ padding: "10px 12px" }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "6px",
                  }}
                >
                  סוג תרומה
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--spacing-md)",
                    fontSize: "13px",
                  }}
                >
                  <span>
                    חד פעמי:{" "}
                    <strong>{campaignStats.byDonationType.one_time}</strong>
                  </span>
                  <span>
                    חודשי:{" "}
                    <strong>{campaignStats.byDonationType.recurring}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Tier breakdown */}
            {tiers.length > 0 &&
              Object.keys(campaignStats.byTier).length > 0 && (
                <div className="card" style={{ padding: "10px 12px" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "6px",
                    }}
                  >
                    פירוט לפי רמות
                  </div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                  >
                    {tiers.map((tier) => {
                      const data = campaignStats.byTier[tier.label];
                      if (!data) return null;
                      return (
                        <div
                          key={tier.id}
                          style={{
                            background: "var(--color-bg-secondary, #f1f5f9)",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            fontSize: "12px",
                            textAlign: "center",
                            minWidth: "70px",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{tier.label}</div>
                          <div>{data.count} אנשים</div>
                          {data.amount > 0 && (
                            <div style={{ color: "var(--color-success)" }}>
                              ₪{data.amount.toLocaleString()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Follow-up list */}
            {followUps.length > 0 && (
              <div className="card" style={{ padding: "10px 12px" }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Clock size={14} />
                  דורש מעקב
                </div>
                {followUps.map((fu) => (
                  <div
                    key={fu.contactId}
                    onClick={() => navigate(`/call/${fu.contactId}`)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom: "1px solid var(--color-border)",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Phone size={12} />
                      <span style={{ fontWeight: 500 }}>{fu.name}</span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {CAMPAIGN_STATUS_LABELS[
                          fu.status as keyof typeof CAMPAIGN_STATUS_LABELS
                        ] || fu.status}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {new Date(fu.dateUpdated).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

        {/* Projects (only show when no active project filter) */}
        {!activeProject && (
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
        )}

        {/* Bottom spacer for nav */}
        <div style={{ height: "var(--spacing-lg)" }} />
      </main>
    </div>
  );
}
