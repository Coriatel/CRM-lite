import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { getProjects, DirectusProject } from "../services/directus";
import { IS_DEMO_MODE } from "../config";

export interface Project {
  id: string;
  name: string;
  goalAmount: number;
  raisedAmount: number;
  status: "active" | "paused" | "completed";
  startDate?: string;
  endDate?: string;
  landingPageUrl?: string;
  takbullPageId?: string;
  description?: string;
  color?: string;
  whatsappTemplate?: string;
  callScript?: string;
  dateCreated: string;
}

function mapProject(dp: DirectusProject): Project {
  return {
    id: dp.id,
    name: dp.name,
    goalAmount: Number(dp.goal_amount) || 0,
    raisedAmount: Number(dp.raised_amount) || 0,
    status: dp.status,
    startDate: dp.start_date || undefined,
    endDate: dp.end_date || undefined,
    landingPageUrl: dp.landing_page_url || undefined,
    takbullPageId: dp.takbull_page_id || undefined,
    description: dp.description || undefined,
    color: dp.color || undefined,
    whatsappTemplate: dp.whatsapp_template || undefined,
    callScript: dp.call_script || undefined,
    dateCreated: dp.date_created,
  };
}

interface ProjectContextValue {
  activeProject: Project | null;
  setActiveProject: (id: string | null) => void;
  projects: Project[];
  loading: boolean;
  refresh: () => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProject: null,
  setActiveProject: () => {},
  projects: [],
  loading: true,
  refresh: () => {},
});

const STORAGE_KEY = "crm_active_project";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      setProjects([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getProjects()
      .then((data) => {
        if (!cancelled) {
          const mapped = data.map(mapProject);
          setProjects(mapped);

          // Auto-select if only one active project and no valid selection
          const currentId = (() => {
            try {
              return localStorage.getItem(STORAGE_KEY);
            } catch {
              return null;
            }
          })();
          const hasValid = currentId && mapped.find((p) => p.id === currentId);
          if (!hasValid) {
            const active = mapped.filter((p) => p.status === "active");
            if (active.length === 1) {
              setActiveProjectId(active[0].id);
              try {
                localStorage.setItem(STORAGE_KEY, active[0].id);
              } catch {}
            }
          }

          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching projects:", err);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const setActiveProject = useCallback((id: string | null) => {
    setActiveProjectId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) || null
    : null;

  return (
    <ProjectContext.Provider
      value={{ activeProject, setActiveProject, projects, loading, refresh }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}
