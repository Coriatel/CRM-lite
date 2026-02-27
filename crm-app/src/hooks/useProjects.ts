import { useState, useEffect, useCallback } from "react";
import {
  getProjects as fetchProjects,
  createProject as postProject,
  updateProject as patchProject,
  deleteProject as removeProject,
  getProjectDonations as fetchDonations,
  createProjectDonation as postDonation,
  DirectusProject,
  DirectusProjectDonation,
} from "../services/directus";
import { IS_DEMO_MODE } from "../config";

export interface Project {
  id: string;
  name: string;
  goalAmount: number;
  raisedAmount: number;
  status: "active" | "paused" | "completed";
  startDate?: string;
  endDate?: string;
  dateCreated: string;
}

export interface ProjectDonation {
  id: string;
  projectId: string;
  contactId: string;
  interactionId?: string;
  amount: number;
  date?: string;
  notes?: string;
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
    dateCreated: dp.date_created,
  };
}

function mapDonation(dd: DirectusProjectDonation): ProjectDonation {
  return {
    id: dd.id,
    projectId: dd.project_id,
    contactId: dd.contact_id,
    interactionId: dd.interaction_id || undefined,
    amount: Number(dd.amount) || 0,
    date: dd.date || undefined,
    notes: dd.notes || undefined,
    dateCreated: dd.date_created,
  };
}

export function useProjects(statusFilter?: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      setProjects([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchProjects(statusFilter)
      .then((data) => {
        if (!cancelled) {
          setProjects(data.map(mapProject));
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
  }, [statusFilter, refreshKey]);

  return { projects, loading, refresh };
}

export function useProjectActions() {
  const create = async (data: {
    name: string;
    goalAmount: number;
    startDate?: string;
    endDate?: string;
  }): Promise<Project | null> => {
    if (IS_DEMO_MODE) return null;
    const result = await postProject({
      name: data.name,
      goal_amount: data.goalAmount,
      raised_amount: 0,
      status: "active",
      start_date: data.startDate,
      end_date: data.endDate,
    });
    return mapProject(result);
  };

  const update = async (
    id: string,
    data: Partial<{
      name: string;
      goalAmount: number;
      status: "active" | "paused" | "completed";
      startDate: string;
      endDate: string;
    }>,
  ): Promise<void> => {
    if (IS_DEMO_MODE) return;
    const directusData: Partial<DirectusProject> = {};
    if (data.name !== undefined) directusData.name = data.name;
    if (data.goalAmount !== undefined) directusData.goal_amount = data.goalAmount;
    if (data.status !== undefined) directusData.status = data.status;
    if (data.startDate !== undefined) directusData.start_date = data.startDate;
    if (data.endDate !== undefined) directusData.end_date = data.endDate;
    await patchProject(id, directusData);
  };

  const remove = async (id: string): Promise<void> => {
    if (IS_DEMO_MODE) return;
    await removeProject(id);
  };

  const resetProject = async (id: string): Promise<void> => {
    if (IS_DEMO_MODE) return;
    await patchProject(id, { raised_amount: 0 });
  };

  const addDonation = async (data: {
    projectId: string;
    contactId: string;
    amount: number;
    interactionId?: string;
    notes?: string;
  }): Promise<ProjectDonation | null> => {
    if (IS_DEMO_MODE) return null;

    const result = await postDonation({
      project_id: data.projectId,
      contact_id: data.contactId,
      amount: data.amount,
      interaction_id: data.interactionId,
      notes: data.notes,
      date: new Date().toISOString().split("T")[0],
    });

    // Update project raised_amount
    // Fetch current project to get latest raised_amount and add
    const donations = await fetchDonations(data.projectId);
    const totalRaised = donations.reduce((sum, d) => sum + Number(d.amount), 0);
    await patchProject(data.projectId, { raised_amount: totalRaised });

    return mapDonation(result);
  };

  const getDonations = async (projectId: string): Promise<ProjectDonation[]> => {
    if (IS_DEMO_MODE) return [];
    const data = await fetchDonations(projectId);
    return data.map(mapDonation);
  };

  return { create, update, remove, resetProject, addDonation, getDonations };
}
