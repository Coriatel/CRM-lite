import { useState, useEffect, useCallback } from "react";
import {
  getContacts as fetchContacts,
  updateContact as patchContact,
  createContact as postContact,
  deleteContact as removeContact,
  createInteraction,
  getTags,
  setContactTags,
  DirectusContact,
  DirectusTag,
} from "../services/directus";
import { Contact, ContactStatus, SheetName } from "../types";
import { DEMO_CONTACTS } from "../data/demo";
import { IS_DEMO_MODE } from "../config";

const PAGE_SIZE = 50;

// CRM Lite sheet names → Directus tag names
const SHEET_TAG_NAMES: Record<SheetName, string> = {
  אנשי_קשר: "אנשי_קשר",
  תורמים_פוטנציאליים: "תורמים_פוטנציאליים",
  תורמים_שתרמו: "תורמים_שתרמו",
  חברים_טובים: "חברים_טובים",
  תלמידים: "תלמידים",
  להתרמות: "להתרמות",
};

function mapDirectusToContact(dc: DirectusContact): Contact {
  // Extract source from first matching sheet tag
  let source: SheetName = "אנשי_קשר";
  const tagNames = (dc.contact_tags || [])
    .map((ct) => {
      if (typeof ct.tag_id === "object" && ct.tag_id !== null)
        return ct.tag_id.name;
      return "";
    })
    .filter(Boolean);

  for (const sheet of Object.keys(SHEET_TAG_NAMES) as SheetName[]) {
    if (tagNames.includes(SHEET_TAG_NAMES[sheet])) {
      source = sheet;
      break;
    }
  }

  return {
    id: dc.id,
    source,
    fullName: dc.full_name,
    phone1: dc.phone_e164 || dc.phone_raw || undefined,
    phone2: dc.phone2 || undefined,
    email: dc.email || undefined,
    city: dc.city || undefined,
    address: dc.address || undefined,
    status: (dc.call_status as ContactStatus) || "not_checked",
    lastCallDate: dc.last_call_date ? new Date(dc.last_call_date) : undefined,
    assignedTo: dc.assigned_to || undefined,
    donationType: dc.donation_type || undefined,
    monthlyDonation: dc.monthly_donation
      ? Number(dc.monthly_donation)
      : undefined,
    totalDonation: dc.total_donation ? Number(dc.total_donation) : undefined,
    originalNote: dc.original_note || undefined,
    notes: [], // Notes loaded separately from interactions
    createdAt: new Date(dc.created_at),
    updatedAt: new Date(dc.updated_at),
  };
}

export function useContacts(
  selectedSheet: SheetName | "all",
  statusFilter: ContactStatus | "all",
  searchQuery: string,
) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentLimit, setCurrentLimit] = useState(PAGE_SIZE);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setCurrentLimit(PAGE_SIZE);
  }, [selectedSheet, statusFilter, searchQuery]);

  const loadAll = useCallback(() => {
    setCurrentLimit(5000);
  }, []);

  const loadMore = useCallback(() => {
    setCurrentLimit((prev) => prev + 50);
  }, []);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      let filtered = [...DEMO_CONTACTS];
      if (selectedSheet !== "all") {
        filtered = filtered.filter((c) => c.source === selectedSheet);
      }
      if (statusFilter !== "all") {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            c.phone1?.includes(searchQuery) ||
            c.phone2?.includes(searchQuery),
        );
      }
      setContacts(filtered.slice(0, currentLimit));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchContacts({
      sheet: selectedSheet !== "all" ? selectedSheet : undefined,
      callStatus: statusFilter !== "all" ? statusFilter : undefined,
      search: searchQuery || undefined,
      limit: currentLimit,
    })
      .then((data) => {
        if (!cancelled) {
          setContacts(data.map(mapDirectusToContact));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching contacts:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSheet, statusFilter, searchQuery, currentLimit, refreshKey]);

  return { contacts, loading, hasMore: true, loadMore, loadAll, refresh };
}

// Cache tags so we don't refetch every time
let cachedTags: DirectusTag[] | null = null;

async function getSheetTagId(sheetName: SheetName): Promise<string | null> {
  if (!cachedTags) {
    cachedTags = await getTags();
  }
  const tag = cachedTags.find((t) => t.name === SHEET_TAG_NAMES[sheetName]);
  return tag?.id || null;
}

export function useContactActions() {
  const updateStatus = async (contactId: string, status: ContactStatus) => {
    if (IS_DEMO_MODE) return;
    await patchContact(contactId, {
      call_status: status,
      last_call_date: new Date().toISOString(),
    });
  };

  const addNote = async (
    contactId: string,
    text: string,
    newStatus?: ContactStatus,
  ) => {
    if (IS_DEMO_MODE) return;

    // Create an interaction record
    await createInteraction({
      contact_id: contactId,
      type: "note",
      summary: text,
    });

    // Update contact call_status + last_call_date
    const updateData: Record<string, string> = {
      last_call_date: new Date().toISOString(),
    };
    if (newStatus) {
      updateData.call_status = newStatus;
    }
    await patchContact(contactId, updateData);
  };

  const updateContact = async (contactId: string, data: Partial<Contact>) => {
    if (IS_DEMO_MODE) return;

    const directusData: Record<string, unknown> = {};
    if (data.fullName !== undefined) {
      directusData.full_name = data.fullName;
      const parts = data.fullName.split(" ");
      directusData.first_name = parts[0] || "";
      directusData.last_name = parts.slice(1).join(" ") || "";
    }
    if (data.phone1 !== undefined) directusData.phone_e164 = data.phone1;
    if (data.phone2 !== undefined) directusData.phone2 = data.phone2;
    if (data.email !== undefined) directusData.email = data.email;
    if (data.city !== undefined) directusData.city = data.city;
    if (data.address !== undefined) directusData.address = data.address;

    await patchContact(contactId, directusData);

    // If source changed, update tags
    if (data.source) {
      const tagId = await getSheetTagId(data.source);
      if (tagId) {
        await setContactTags(contactId, [tagId]);
      }
    }
  };

  const createContact = async (data: Partial<Contact>) => {
    if (IS_DEMO_MODE) return;

    const fullName = data.fullName || "";
    const parts = fullName.split(" ");

    const newContact = await postContact({
      full_name: fullName,
      first_name: parts[0] || "",
      last_name: parts.slice(1).join(" ") || "",
      phone_e164: data.phone1 || `_no_phone_${crypto.randomUUID()}`,
      phone2: data.phone2 || "",
      email: data.email || "",
      call_status: "not_checked",
      original_note: data.originalNote || "",
    });

    // Assign sheet tag
    const sheetName = data.source || "אנשי_קשר";
    const tagId = await getSheetTagId(sheetName);
    if (tagId && newContact.id) {
      await setContactTags(newContact.id, [tagId]);
    }
  };

  const deleteContact = async (contactId: string) => {
    if (IS_DEMO_MODE) return;
    await setContactTags(contactId, []); // Clear tags first (FK constraint)
    await removeContact(contactId);
  };

  return { updateStatus, addNote, updateContact, createContact, deleteContact };
}
