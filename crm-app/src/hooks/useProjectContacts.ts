import { useState, useEffect, useCallback } from "react";
import {
  getProjectContacts,
  batchCreateProjectContacts,
  updateProjectContact,
  deleteProjectContact,
  getProjectStats,
  getContactCrossProjectDonations,
  DirectusProjectContact,
  DirectusContact,
} from "../services/directus";
import { ProjectContact, CampaignStatus, Contact } from "../types";
import { IS_DEMO_MODE } from "../config";

function mapContact(dc: DirectusContact): Contact {
  const tagNames = (dc.contact_tags || [])
    .map((ct) => {
      if (typeof ct.tag_id === "object" && ct.tag_id !== null)
        return ct.tag_id.name;
      return "";
    })
    .filter(Boolean);

  return {
    id: dc.id,
    source: "אנשי_קשר",
    fullName: dc.full_name,
    phone1: dc.phone_e164 || dc.phone_raw,
    phone2: dc.phone2,
    email: dc.email,
    city: dc.city,
    address: dc.address,
    status: (dc.call_status as Contact["status"]) || "not_checked",
    lastCallDate: dc.last_call_date ? new Date(dc.last_call_date) : undefined,
    followUpDate: dc.follow_up_date,
    followUpNote: dc.follow_up_note,
    interestLevel: dc.interest_level,
    assignedTo: dc.assigned_to,
    notes: [],
    donationType: dc.donation_type,
    monthlyDonation: dc.monthly_donation
      ? Number(dc.monthly_donation)
      : undefined,
    totalDonation: dc.total_donation ? Number(dc.total_donation) : undefined,
    createdAt: new Date(dc.created_at),
    updatedAt: new Date(dc.updated_at),
    originalNote: dc.original_note,
    receiptConfirmed: dc.receipt_confirmed,
    thankYouSent: dc.thank_you_sent,
    tags: tagNames,
  };
}

function mapProjectContact(
  dpc: DirectusProjectContact,
  contact?: Contact,
): ProjectContact {
  return {
    id: dpc.id,
    projectId: dpc.project_id,
    contactId:
      typeof dpc.contact_id === "object"
        ? (dpc.contact_id as DirectusContact).id
        : dpc.contact_id,
    campaignStatus: dpc.campaign_status as CampaignStatus,
    donationAmount: dpc.donation_amount
      ? Number(dpc.donation_amount)
      : undefined,
    donationType: dpc.donation_type as ProjectContact["donationType"],
    tierLabel: dpc.tier_label || undefined,
    linkSendCount: dpc.link_send_count || 0,
    lastLinkSentAt: dpc.last_link_sent_at || undefined,
    notes: dpc.notes || undefined,
    dateCreated: dpc.date_created,
    dateUpdated: dpc.date_updated,
    contact,
  };
}

export function useProjectContacts(
  projectId: string | null,
  statusFilter?: string,
  search?: string,
  sort?: string,
  tagNames?: string[],
) {
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!projectId || IS_DEMO_MODE) {
      setContacts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    getProjectContacts(projectId, {
      campaignStatus: statusFilter,
      search: search || undefined,
      sort,
      tagNames: tagNames && tagNames.length > 0 ? tagNames : undefined,
    })
      .then((pcs) => {
        if (cancelled) return;
        const results = pcs.map((pc) => {
          // contact_id is now expanded to a full object by Directus
          const contactData =
            typeof pc.contact_id === "object"
              ? mapContact(pc.contact_id as unknown as DirectusContact)
              : undefined;
          return mapProjectContact(pc, contactData);
        });
        setContacts(results);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching project contacts:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, statusFilter, search, sort, JSON.stringify(tagNames), refreshKey]);

  return { contacts, loading, refresh };
}

export function useProjectContactActions() {
  const addToProject = async (
    projectId: string,
    contactIds: string[],
  ): Promise<number> => {
    if (IS_DEMO_MODE) return 0;
    const items = contactIds.map((cid) => ({
      project_id: projectId,
      contact_id: cid,
      campaign_status: "not_contacted",
    }));
    const result = await batchCreateProjectContacts(items);
    return Array.isArray(result) ? result.length : 1;
  };

  const updateStatus = async (
    pcId: string,
    status: CampaignStatus,
    extra?: Partial<DirectusProjectContact>,
  ) => {
    if (IS_DEMO_MODE) return;
    await updateProjectContact(pcId, { campaign_status: status, ...extra });
  };

  const recordLinkSent = async (pcId: string, currentCount: number) => {
    if (IS_DEMO_MODE) return;
    await updateProjectContact(pcId, {
      link_send_count: currentCount + 1,
      last_link_sent_at: new Date().toISOString(),
      campaign_status: "link_sent",
    });
  };

  const remove = async (pcId: string) => {
    if (IS_DEMO_MODE) return;
    await deleteProjectContact(pcId);
  };

  const getStats = async (projectId: string) => {
    if (IS_DEMO_MODE)
      return {
        total: 0,
        byStatus: {},
        totalDonated: 0,
        byDonationType: { one_time: 0, recurring: 0 },
        byTier: {},
      };
    return getProjectStats(projectId);
  };

  const getCrossDonations = async (contactId: string) => {
    if (IS_DEMO_MODE) return [];
    return getContactCrossProjectDonations(contactId);
  };

  return {
    addToProject,
    updateStatus,
    recordLinkSent,
    remove,
    getStats,
    getCrossDonations,
  };
}
