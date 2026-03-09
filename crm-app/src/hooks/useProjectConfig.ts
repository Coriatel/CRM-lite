import { useState, useEffect, useCallback } from "react";
import {
  getProjectTiers,
  createProjectTier,
  updateProjectTier as patchTier,
  deleteProjectTier,
  DirectusProjectTier,
} from "../services/directus";
import { ProjectTier } from "../types";
import { IS_DEMO_MODE } from "../config";

function mapTier(dt: DirectusProjectTier): ProjectTier {
  return {
    id: dt.id,
    projectId: dt.project_id,
    sortOrder: dt.sort_order,
    label: dt.label,
    oneTimeAmount: dt.one_time_amount ? Number(dt.one_time_amount) : undefined,
    monthlyAmount: dt.monthly_amount ? Number(dt.monthly_amount) : undefined,
  };
}

export function useProjectTiers(projectId: string | null) {
  const [tiers, setTiers] = useState<ProjectTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!projectId || IS_DEMO_MODE) {
      setTiers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getProjectTiers(projectId)
      .then((data) => {
        if (!cancelled) {
          setTiers(data.map(mapTier));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching tiers:", err);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  const addTier = async (data: {
    label: string;
    oneTimeAmount?: number;
    monthlyAmount?: number;
  }) => {
    if (!projectId || IS_DEMO_MODE) return;
    await createProjectTier({
      project_id: projectId,
      label: data.label,
      one_time_amount: data.oneTimeAmount,
      monthly_amount: data.monthlyAmount,
      sort_order: tiers.length,
    });
    refresh();
  };

  const updateTier = async (id: string, data: Partial<ProjectTier>) => {
    if (IS_DEMO_MODE) return;
    const directusData: Partial<DirectusProjectTier> = {};
    if (data.label !== undefined) directusData.label = data.label;
    if (data.oneTimeAmount !== undefined)
      directusData.one_time_amount = data.oneTimeAmount;
    if (data.monthlyAmount !== undefined)
      directusData.monthly_amount = data.monthlyAmount;
    if (data.sortOrder !== undefined) directusData.sort_order = data.sortOrder;
    await patchTier(id, directusData);
    refresh();
  };

  const removeTier = async (id: string) => {
    if (IS_DEMO_MODE) return;
    await deleteProjectTier(id);
    refresh();
  };

  return { tiers, loading, refresh, addTier, updateTier, removeTier };
}
