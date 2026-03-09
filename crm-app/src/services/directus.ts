import { DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, AUTH_MODE } from "../config";

const API_BASE = DIRECTUS_URL;

// Dynamic auth token — set by AuthContext after OAuth login
let authToken = DIRECTUS_STATIC_TOKEN;

export function setAuthToken(token: string) {
  authToken = token;
}

export function getAuthToken(): string {
  return authToken;
}

async function directusFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && AUTH_MODE === "oauth") {
    // Token expired — trigger refresh via event
    window.dispatchEvent(new CustomEvent("auth:token-expired"));
    throw new Error("Token expired");
  }

  if (!res.ok) {
    const body = await res.text();
    if (import.meta.env.DEV) {
      console.error(`Directus ${res.status}: ${body}`);
    }
    throw new Error(`Server error (${res.status})`);
  }
  return res;
}

// ---------- Contacts ----------

export interface DirectusContact {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  phone_e164: string;
  phone_raw?: string;
  phone2?: string;
  email?: string;
  city?: string;
  address?: string;
  status: string;
  call_status: string;
  follow_up_date?: string;
  follow_up_note?: string;
  interest_level?: number;
  assigned_to?: string;
  donation_type?: string;
  monthly_donation?: number;
  total_donation?: number;
  last_call_date?: string;
  original_note?: string;
  notes?: string;
  classification?: string;
  receipt_confirmed?: boolean;
  thank_you_sent?: boolean;
  created_at: string;
  updated_at: string;
  contact_tags?: { tag_id: string | { id: string; name: string } }[];
}

export interface DirectusInteraction {
  id: string;
  contact_id: string;
  type: string;
  status: string;
  summary?: string;
  result?: string;
  result_note?: string;
  created_at: string;
  created_by?: string;
}

interface DirectusResponse<T> {
  data: T;
}

function buildQuery(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : "";
}

export async function getContacts(filters: {
  callStatus?: string;
  callStatuses?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  followUpBefore?: string;
  neverCalled?: boolean;
  interestLevel?: number;
  hideNoName?: boolean;
  sheetTags?: string[];
  groupTags?: string[];
}): Promise<DirectusContact[]> {
  const params: Record<string, string> = {
    fields:
      "id,full_name,first_name,last_name,phone_e164,phone_raw,phone2,email,city,address,status,call_status,follow_up_date,follow_up_note,interest_level,assigned_to,donation_type,monthly_donation,total_donation,last_call_date,original_note,notes,classification,receipt_confirmed,thank_you_sent,created_at,updated_at,contact_tags.tag_id.id,contact_tags.tag_id.name",
    sort: filters.sort || "full_name",
    limit: String(filters.limit || 50),
  };

  if (filters.offset) {
    params["offset"] = String(filters.offset);
  }

  // Collect _or blocks — when multiple exist, wrap in _and to avoid index conflicts
  const orBlocks: { key: string; entries: [string, string][] }[] = [];

  // Multi-status filter
  const hasMultiStatus =
    filters.callStatuses && filters.callStatuses.length > 1;
  if (hasMultiStatus) {
    orBlocks.push({
      key: "status",
      entries: filters.callStatuses!.map((s, i) => [
        `_or[${i}][call_status][_eq]`,
        s,
      ]),
    });
  } else if (filters.callStatuses && filters.callStatuses.length === 1) {
    params["filter[call_status][_eq]"] = filters.callStatuses[0];
  } else if (filters.callStatus && filters.callStatus !== "all") {
    params["filter[call_status][_eq]"] = filters.callStatus;
  }

  // Search filter
  if (filters.search) {
    orBlocks.push({
      key: "search",
      entries: [
        ["_or[0][full_name][_icontains]", filters.search],
        ["_or[1][phone_e164][_contains]", filters.search],
        ["_or[2][phone2][_contains]", filters.search],
      ],
    });
  }

  // Tag filter (sheet + group tags combined)
  const allTags = [...(filters.sheetTags || []), ...(filters.groupTags || [])];
  if (allTags.length === 1) {
    params["filter[contact_tags][tag_id][name][_eq]"] = allTags[0];
  } else if (allTags.length > 1) {
    orBlocks.push({
      key: "tags",
      entries: allTags.map((t, i) => [
        `_or[${i}][contact_tags][tag_id][name][_eq]`,
        t,
      ]),
    });
  }

  // Apply _or blocks
  if (orBlocks.length === 1) {
    for (const [key, value] of orBlocks[0].entries) {
      params[`filter[${key}]`] = value;
    }
  } else if (orBlocks.length > 1) {
    orBlocks.forEach((block, i) => {
      for (const [key, value] of block.entries) {
        params[`filter[_and][${i}][${key}]`] = value;
      }
    });
  }

  if (filters.followUpBefore) {
    params["filter[follow_up_date][_lte]"] = filters.followUpBefore;
    params["filter[follow_up_date][_nnull]"] = "true";
  }

  if (filters.neverCalled) {
    params["filter[last_call_date][_null]"] = "true";
  }

  if (filters.interestLevel) {
    params["filter[interest_level][_eq]"] = String(filters.interestLevel);
  }

  const res = await directusFetch(`/items/contacts${buildQuery(params)}`);
  const json: DirectusResponse<DirectusContact[]> = await res.json();

  // Client-side filter: hide contacts whose name looks like a phone number
  if (filters.hideNoName) {
    const phoneNameRegex = /^\+?[0-9][0-9\s\-()]+$/;
    return json.data.filter((c) => !phoneNameRegex.test(c.full_name));
  }

  return json.data;
}

export async function getContact(id: string): Promise<DirectusContact> {
  const res = await directusFetch(
    `/items/contacts/${id}?fields=*,contact_tags.tag_id.id,contact_tags.tag_id.name`,
  );
  const json: DirectusResponse<DirectusContact> = await res.json();
  return json.data;
}

export async function createContact(
  data: Partial<DirectusContact>,
): Promise<DirectusContact> {
  const res = await directusFetch("/items/contacts", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusContact> = await res.json();
  return json.data;
}

export async function updateContact(
  id: string,
  data: Partial<DirectusContact>,
): Promise<DirectusContact> {
  const res = await directusFetch(`/items/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusContact> = await res.json();
  return json.data;
}

export async function deleteContact(id: string): Promise<void> {
  await directusFetch(`/items/contacts/${id}`, { method: "DELETE" });
}

// ---------- Interactions (Notes) ----------

export async function getInteractions(
  contactId: string,
): Promise<DirectusInteraction[]> {
  const params: Record<string, string> = {
    "filter[contact_id][_eq]": contactId,
    sort: "-created_at",
    fields:
      "id,contact_id,type,status,summary,result,result_note,created_at,created_by",
    limit: "100",
  };
  const res = await directusFetch(`/items/interactions${buildQuery(params)}`);
  const json: DirectusResponse<DirectusInteraction[]> = await res.json();
  return json.data;
}

export async function createInteraction(data: {
  contact_id: string;
  type: string;
  status?: string;
  summary?: string;
  result?: string;
}): Promise<DirectusInteraction> {
  const res = await directusFetch("/items/interactions", {
    method: "POST",
    body: JSON.stringify({
      ...data,
      status: data.status || "done",
    }),
  });
  const json: DirectusResponse<DirectusInteraction> = await res.json();
  return json.data;
}

// ---------- Tags ----------

export interface DirectusTag {
  id: string;
  name: string;
}

export async function getTags(): Promise<DirectusTag[]> {
  const res = await directusFetch(
    "/items/tags?limit=200&fields=id,name&sort=name",
  );
  const json: DirectusResponse<DirectusTag[]> = await res.json();
  return json.data;
}

export async function createTag(name: string): Promise<DirectusTag> {
  const res = await directusFetch("/items/tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const json: DirectusResponse<DirectusTag> = await res.json();
  return json.data;
}

export async function addContactTag(
  contactId: string,
  tagId: string,
): Promise<void> {
  await directusFetch("/items/contact_tags", {
    method: "POST",
    body: JSON.stringify({ contact_id: contactId, tag_id: tagId }),
  });
}

export async function getAllContacts(): Promise<DirectusContact[]> {
  const allContacts: DirectusContact[] = [];
  let offset = 0;
  const limit = 500;
  const MAX_ITERATIONS = 100; // Safety guard: max 50,000 contacts
  let iterations = 0;
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const params: Record<string, string> = {
      fields:
        "id,full_name,phone_e164,phone_raw,phone2,contact_tags.tag_id.id,contact_tags.tag_id.name",
      sort: "id",
      limit: String(limit),
      offset: String(offset),
    };
    const res = await directusFetch(`/items/contacts${buildQuery(params)}`);
    const json: DirectusResponse<DirectusContact[]> = await res.json();
    allContacts.push(...json.data);
    if (json.data.length < limit) break;
    offset += limit;
  }
  return allContacts;
}

export async function setContactTags(
  contactId: string,
  tagIds: string[],
): Promise<void> {
  // Delete existing tags for this contact
  const existingRes = await directusFetch(
    `/items/contact_tags?filter[contact_id][_eq]=${encodeURIComponent(contactId)}&fields=id`,
  );
  const existing: DirectusResponse<{ id: string }[]> = await existingRes.json();

  if (existing.data.length > 0) {
    const ids = existing.data.map((t) => t.id);
    await directusFetch("/items/contact_tags", {
      method: "DELETE",
      body: JSON.stringify(ids),
    });
  }

  if (tagIds.length > 0) {
    const items = tagIds.map((tagId) => ({
      contact_id: contactId,
      tag_id: tagId,
    }));
    await directusFetch("/items/contact_tags", {
      method: "POST",
      body: JSON.stringify(items),
    });
  }
}

// ---------- Projects ----------

export interface DirectusProject {
  id: string;
  name: string;
  goal_amount: number;
  raised_amount: number;
  status: "active" | "paused" | "completed";
  start_date?: string;
  end_date?: string;
  landing_page_url?: string;
  takbull_page_id?: string;
  description?: string;
  color?: string;
  whatsapp_template?: string;
  call_script?: string;
  date_created: string;
  user_created?: string;
}

export async function getProjects(status?: string): Promise<DirectusProject[]> {
  const params: Record<string, string> = {
    fields: "*",
    sort: "-date_created",
    limit: "100",
  };
  if (status) {
    params["filter[status][_eq]"] = status;
  }
  const res = await directusFetch(`/items/projects${buildQuery(params)}`);
  const json: DirectusResponse<DirectusProject[]> = await res.json();
  return json.data;
}

export async function createProject(
  data: Partial<DirectusProject>,
): Promise<DirectusProject> {
  const res = await directusFetch("/items/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusProject> = await res.json();
  return json.data;
}

export async function updateProject(
  id: string,
  data: Partial<DirectusProject>,
): Promise<DirectusProject> {
  const res = await directusFetch(`/items/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusProject> = await res.json();
  return json.data;
}

export async function deleteProject(id: string): Promise<void> {
  await directusFetch(`/items/projects/${id}`, { method: "DELETE" });
}

// ---------- Project Donations ----------

export interface DirectusProjectDonation {
  id: string;
  project_id: string;
  contact_id: string;
  interaction_id?: string;
  amount: number;
  date?: string;
  notes?: string;
  date_created: string;
  user_created?: string;
}

export async function getProjectDonations(
  projectId: string,
): Promise<DirectusProjectDonation[]> {
  const params: Record<string, string> = {
    "filter[project_id][_eq]": projectId,
    sort: "-date_created",
    fields: "*",
    limit: "500",
  };
  const res = await directusFetch(
    `/items/project_donations${buildQuery(params)}`,
  );
  const json: DirectusResponse<DirectusProjectDonation[]> = await res.json();
  return json.data;
}

export async function createProjectDonation(
  data: Partial<DirectusProjectDonation>,
): Promise<DirectusProjectDonation> {
  const res = await directusFetch("/items/project_donations", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusProjectDonation> = await res.json();
  return json.data;
}

// ---------- Call Queue ----------

export interface DirectusCallQueueItem {
  id: string;
  contact_id: string;
  project_id?: string;
  assigned_to?: string;
  priority: number;
  scheduled_date?: string;
  status: "pending" | "completed" | "skipped";
  result?: string;
  notes?: string;
  date_created: string;
  user_created?: string;
}

export async function getCallQueue(filters: {
  status?: string;
  assignedTo?: string;
  scheduledDate?: string;
  projectId?: string;
}): Promise<DirectusCallQueueItem[]> {
  const params: Record<string, string> = {
    fields: "*",
    sort: "priority,-date_created",
    limit: "200",
  };
  if (filters.status) {
    params["filter[status][_eq]"] = filters.status;
  }
  if (filters.assignedTo) {
    params["filter[assigned_to][_eq]"] = filters.assignedTo;
  }
  if (filters.scheduledDate) {
    params["filter[scheduled_date][_lte]"] = filters.scheduledDate;
  }
  if (filters.projectId) {
    params["filter[project_id][_eq]"] = filters.projectId;
  }
  const res = await directusFetch(`/items/call_queue${buildQuery(params)}`);
  const json: DirectusResponse<DirectusCallQueueItem[]> = await res.json();
  return json.data;
}

export async function createCallQueueItem(
  data: Partial<DirectusCallQueueItem>,
): Promise<DirectusCallQueueItem> {
  const res = await directusFetch("/items/call_queue", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusCallQueueItem> = await res.json();
  return json.data;
}

export async function batchCreateCallQueueItems(
  items: Partial<DirectusCallQueueItem>[],
): Promise<DirectusCallQueueItem[]> {
  if (items.length === 0) return [];
  const res = await directusFetch("/items/call_queue", {
    method: "POST",
    body: JSON.stringify(items),
  });
  const json: DirectusResponse<DirectusCallQueueItem[]> = await res.json();
  return json.data;
}

export async function updateCallQueueItem(
  id: string,
  data: Partial<DirectusCallQueueItem>,
): Promise<DirectusCallQueueItem> {
  const res = await directusFetch(`/items/call_queue/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusCallQueueItem> = await res.json();
  return json.data;
}

// ---------- Project Contacts ----------

export interface DirectusProjectContact {
  id: string;
  project_id: string;
  contact_id: string;
  campaign_status: string;
  donation_amount?: number;
  donation_type?: string;
  tier_label?: string;
  link_send_count: number;
  last_link_sent_at?: string;
  notes?: string;
  date_created: string;
  date_updated: string;
}

export async function getProjectContacts(
  projectId: string,
  filters?: {
    campaignStatus?: string;
    search?: string;
    sort?: string;
    tagNames?: string[];
    limit?: number;
    offset?: number;
  },
): Promise<DirectusProjectContact[]> {
  const params: Record<string, string> = {
    "filter[project_id][_eq]": projectId,
    fields:
      "id,project_id,contact_id.id,contact_id.full_name,contact_id.first_name,contact_id.last_name,contact_id.phone_e164,contact_id.phone_raw,contact_id.phone2,contact_id.email,contact_id.city,contact_id.address,contact_id.status,contact_id.call_status,contact_id.follow_up_date,contact_id.follow_up_note,contact_id.interest_level,contact_id.assigned_to,contact_id.donation_type,contact_id.monthly_donation,contact_id.total_donation,contact_id.last_call_date,contact_id.original_note,contact_id.notes,contact_id.classification,contact_id.receipt_confirmed,contact_id.thank_you_sent,contact_id.created_at,contact_id.updated_at,contact_id.contact_tags.tag_id.id,contact_id.contact_tags.tag_id.name,campaign_status,donation_amount,donation_type,tier_label,link_send_count,last_link_sent_at,notes,date_created,date_updated",
    sort: filters?.sort || "-date_created",
    limit: String(filters?.limit || 200),
  };
  if (filters?.offset) params["offset"] = String(filters.offset);
  if (filters?.campaignStatus && filters.campaignStatus !== "all") {
    params["filter[campaign_status][_eq]"] = filters.campaignStatus;
  }

  // Search on related contact fields
  if (filters?.search) {
    params["filter[_or][0][contact_id][full_name][_icontains]"] =
      filters.search;
    params["filter[_or][1][contact_id][phone_e164][_contains]"] =
      filters.search;
    params["filter[_or][2][contact_id][phone2][_contains]"] = filters.search;
  }

  // Tag filter on related contact
  if (filters?.tagNames && filters.tagNames.length === 1) {
    params["filter[contact_id][contact_tags][tag_id][name][_eq]"] =
      filters.tagNames[0];
  } else if (filters?.tagNames && filters.tagNames.length > 1) {
    // Note: if search _or is also active, this would conflict.
    // For now, tag filtering with search is handled client-side if needed.
    filters.tagNames.forEach((t, i) => {
      params[`filter[_or][${i}][contact_id][contact_tags][tag_id][name][_eq]`] =
        t;
    });
  }

  const res = await directusFetch(
    `/items/project_contacts${buildQuery(params)}`,
  );
  const json: DirectusResponse<DirectusProjectContact[]> = await res.json();
  return json.data;
}

export async function getProjectContactIds(
  projectId: string,
): Promise<string[]> {
  const params: Record<string, string> = {
    "filter[project_id][_eq]": projectId,
    fields: "contact_id",
    limit: "5000",
  };
  const res = await directusFetch(
    `/items/project_contacts${buildQuery(params)}`,
  );
  const json: DirectusResponse<{ contact_id: string }[]> = await res.json();
  return json.data.map((d) => d.contact_id);
}

export async function createProjectContact(
  data: Partial<DirectusProjectContact>,
): Promise<DirectusProjectContact> {
  const res = await directusFetch("/items/project_contacts", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusProjectContact> = await res.json();
  return json.data;
}

export async function batchCreateProjectContacts(
  items: Partial<DirectusProjectContact>[],
): Promise<DirectusProjectContact[]> {
  if (items.length === 0) return [];
  const res = await directusFetch("/items/project_contacts", {
    method: "POST",
    body: JSON.stringify(items),
  });
  const json: DirectusResponse<DirectusProjectContact[]> = await res.json();
  return json.data;
}

export async function updateProjectContact(
  id: string,
  data: Partial<DirectusProjectContact>,
): Promise<DirectusProjectContact> {
  const res = await directusFetch(`/items/project_contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusProjectContact> = await res.json();
  return json.data;
}

export async function deleteProjectContact(id: string): Promise<void> {
  await directusFetch(`/items/project_contacts/${id}`, { method: "DELETE" });
}

export async function getProjectStats(projectId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  totalDonated: number;
  byDonationType: { one_time: number; recurring: number };
  byTier: Record<string, { count: number; amount: number }>;
}> {
  const params: Record<string, string> = {
    "filter[project_id][_eq]": projectId,
    fields: "campaign_status,donation_amount,donation_type,tier_label",
    limit: "5000",
  };
  const res = await directusFetch(
    `/items/project_contacts${buildQuery(params)}`,
  );
  const json: DirectusResponse<
    {
      campaign_status: string;
      donation_amount?: number;
      donation_type?: string;
      tier_label?: string;
    }[]
  > = await res.json();
  const byStatus: Record<string, number> = {};
  const byDonationType = { one_time: 0, recurring: 0 };
  const byTier: Record<string, { count: number; amount: number }> = {};
  let totalDonated = 0;
  for (const pc of json.data) {
    byStatus[pc.campaign_status] = (byStatus[pc.campaign_status] || 0) + 1;
    if (pc.campaign_status === "paid" && pc.donation_amount) {
      totalDonated += Number(pc.donation_amount);
      if (pc.donation_type === "recurring") {
        byDonationType.recurring++;
      } else {
        byDonationType.one_time++;
      }
    }
    if (pc.tier_label) {
      if (!byTier[pc.tier_label])
        byTier[pc.tier_label] = { count: 0, amount: 0 };
      byTier[pc.tier_label].count++;
      if (pc.donation_amount)
        byTier[pc.tier_label].amount += Number(pc.donation_amount);
    }
  }
  return {
    total: json.data.length,
    byStatus,
    totalDonated,
    byDonationType,
    byTier,
  };
}

export async function getProjectContactForContact(
  projectId: string,
  contactId: string,
): Promise<DirectusProjectContact | null> {
  const params: Record<string, string> = {
    "filter[project_id][_eq]": projectId,
    "filter[contact_id][_eq]": contactId,
    fields:
      "id,project_id,contact_id,campaign_status,donation_amount,donation_type,tier_label,link_send_count,last_link_sent_at,notes,date_created,date_updated",
    limit: "1",
  };
  const res = await directusFetch(
    `/items/project_contacts${buildQuery(params)}`,
  );
  const json: DirectusResponse<DirectusProjectContact[]> = await res.json();
  return json.data.length > 0 ? json.data[0] : null;
}

export async function getProjectFollowUps(
  projectId: string,
  limit = 5,
): Promise<
  { contact_id: string; campaign_status: string; date_updated: string }[]
> {
  const threeDaysAgo = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const params: Record<string, string> = {
    "filter[project_id][_eq]": projectId,
    "filter[date_updated][_lte]": threeDaysAgo,
    fields: "contact_id,campaign_status,date_updated",
    sort: "date_updated",
    limit: String(limit),
  };
  // Filter for called or agreed statuses.
  // Note: Directus ANDs top-level filters (project_id, date_updated) with the _or block,
  // so this correctly returns contacts in THIS project, updated > 3 days ago, with status called OR agreed.
  params["filter[_or][0][campaign_status][_eq]"] = "called";
  params["filter[_or][1][campaign_status][_eq]"] = "agreed";
  const res = await directusFetch(
    `/items/project_contacts${buildQuery(params)}`,
  );
  const json: DirectusResponse<
    { contact_id: string; campaign_status: string; date_updated: string }[]
  > = await res.json();
  return json.data;
}

export async function getContactCrossProjectDonations(
  contactId: string,
): Promise<{ project_id: string; donation_amount: number }[]> {
  const params: Record<string, string> = {
    "filter[contact_id][_eq]": contactId,
    "filter[campaign_status][_eq]": "paid",
    fields: "project_id,donation_amount",
    limit: "50",
  };
  const res = await directusFetch(
    `/items/project_contacts${buildQuery(params)}`,
  );
  const json: DirectusResponse<
    { project_id: string; donation_amount: number }[]
  > = await res.json();
  return json.data;
}

// ---------- Project Tiers ----------

export interface DirectusProjectTier {
  id: string;
  project_id: string;
  sort_order: number;
  label: string;
  one_time_amount?: number;
  monthly_amount?: number;
  date_created: string;
}

export async function getProjectTiers(
  projectId: string,
): Promise<DirectusProjectTier[]> {
  const params: Record<string, string> = {
    "filter[project_id][_eq]": projectId,
    fields: "*",
    sort: "sort_order",
    limit: "50",
  };
  const res = await directusFetch(`/items/project_tiers${buildQuery(params)}`);
  const json: DirectusResponse<DirectusProjectTier[]> = await res.json();
  return json.data;
}

export async function createProjectTier(
  data: Partial<DirectusProjectTier>,
): Promise<DirectusProjectTier> {
  const res = await directusFetch("/items/project_tiers", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusProjectTier> = await res.json();
  return json.data;
}

export async function updateProjectTier(
  id: string,
  data: Partial<DirectusProjectTier>,
): Promise<DirectusProjectTier> {
  const res = await directusFetch(`/items/project_tiers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const json: DirectusResponse<DirectusProjectTier> = await res.json();
  return json.data;
}

export async function deleteProjectTier(id: string): Promise<void> {
  await directusFetch(`/items/project_tiers/${id}`, { method: "DELETE" });
}
