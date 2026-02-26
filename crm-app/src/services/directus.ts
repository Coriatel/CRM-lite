const API_BASE = import.meta.env.VITE_DIRECTUS_URL || 'https://crm.merkazneshama.co.il';
const TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

async function directusFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
            ...options.headers,
        },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Directus ${res.status}: ${body}`);
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
    return qs ? `?${qs}` : '';
}

export async function getContacts(filters: {
    sheet?: string;
    callStatus?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<DirectusContact[]> {
    const params: Record<string, string> = {
        'fields': 'id,full_name,first_name,last_name,phone_e164,phone_raw,phone2,email,city,address,status,call_status,assigned_to,donation_type,monthly_donation,total_donation,last_call_date,original_note,notes,created_at,updated_at,contact_tags.tag_id.id,contact_tags.tag_id.name',
        'sort': 'full_name',
        'limit': String(filters.limit || 50),
    };

    if (filters.offset) {
        params['offset'] = String(filters.offset);
    }

    if (filters.callStatus && filters.callStatus !== 'all') {
        params['filter[call_status][_eq]'] = filters.callStatus;
    }

    if (filters.sheet && filters.sheet !== 'all') {
        params['filter[contact_tags][tag_id][name][_eq]'] = filters.sheet;
    }

    if (filters.search) {
        params['filter[_or][0][full_name][_icontains]'] = filters.search;
        params['filter[_or][1][phone_e164][_contains]'] = filters.search;
        params['filter[_or][2][phone2][_contains]'] = filters.search;
    }

    const res = await directusFetch(`/items/contacts${buildQuery(params)}`);
    const json: DirectusResponse<DirectusContact[]> = await res.json();
    return json.data;
}

export async function getContact(id: string): Promise<DirectusContact> {
    const res = await directusFetch(
        `/items/contacts/${id}?fields=*,contact_tags.tag_id.id,contact_tags.tag_id.name`
    );
    const json: DirectusResponse<DirectusContact> = await res.json();
    return json.data;
}

export async function createContact(data: Partial<DirectusContact>): Promise<DirectusContact> {
    const res = await directusFetch('/items/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
    });
    const json: DirectusResponse<DirectusContact> = await res.json();
    return json.data;
}

export async function updateContact(id: string, data: Partial<DirectusContact>): Promise<DirectusContact> {
    const res = await directusFetch(`/items/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
    const json: DirectusResponse<DirectusContact> = await res.json();
    return json.data;
}

export async function deleteContact(id: string): Promise<void> {
    await directusFetch(`/items/contacts/${id}`, { method: 'DELETE' });
}

// ---------- Interactions (Notes) ----------

export async function getInteractions(contactId: string): Promise<DirectusInteraction[]> {
    const params: Record<string, string> = {
        'filter[contact_id][_eq]': contactId,
        'sort': '-created_at',
        'fields': 'id,contact_id,type,status,summary,result,result_note,created_at,created_by',
        'limit': '100',
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
    const res = await directusFetch('/items/interactions', {
        method: 'POST',
        body: JSON.stringify({
            ...data,
            status: data.status || 'done',
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
    const res = await directusFetch('/items/tags?limit=200&fields=id,name&sort=name');
    const json: DirectusResponse<DirectusTag[]> = await res.json();
    return json.data;
}

export async function setContactTags(contactId: string, tagIds: string[]): Promise<void> {
    // Delete existing tags for this contact
    const existingRes = await directusFetch(
        `/items/contact_tags?filter[contact_id][_eq]=${contactId}&fields=id`
    );
    const existing: DirectusResponse<{ id: string }[]> = await existingRes.json();

    if (existing.data.length > 0) {
        const ids = existing.data.map(t => t.id);
        await directusFetch('/items/contact_tags', {
            method: 'DELETE',
            body: JSON.stringify(ids),
        });
    }

    if (tagIds.length > 0) {
        const items = tagIds.map(tagId => ({ contact_id: contactId, tag_id: tagId }));
        await directusFetch('/items/contact_tags', {
            method: 'POST',
            body: JSON.stringify(items),
        });
    }
}
