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
  sheet?: string;
  callStatus?: string;
  search?: string;
  limit?: number;
  offset?: number;
  followUpBefore?: string;
  neverCalled?: boolean;
  interestLevel?: number;
}): Promise<DirectusContact[]> {
  const params: Record<string, string> = {
    fields:
      "id,full_name,first_name,last_name,phone_e164,phone_raw,phone2,email,city,address,status,call_status,follow_up_date,follow_up_note,interest_level,assigned_to,donation_type,monthly_donation,total_donation,last_call_date,original_note,notes,created_at,updated_at,contact_tags.tag_id.id,contact_tags.tag_id.name",
    sort: "full_name",
    limit: String(filters.limit || 50),
  };

  if (filters.offset) {
    params["offset"] = String(filters.offset);
  }

  if (filters.callStatus && filters.callStatus !== "all") {
    params["filter[call_status][_eq]"] = filters.callStatus;
  }

  if (filters.sheet && filters.sheet !== "all") {
    params["filter[contact_tags][tag_id][name][_eq]"] = filters.sheet;
  }

  if (filters.search) {
    params["filter[_or][0][full_name][_icontains]"] = filters.search;
    params["filter[_or][1][phone_e164][_contains]"] = filters.search;
    params["filter[_or][2][phone2][_contains]"] = filters.search;
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
