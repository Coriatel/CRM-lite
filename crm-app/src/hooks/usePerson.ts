import { useCallback, useEffect, useState } from "react";
import { getContact } from "../services/directus";
import { mapDirectusToContact } from "./useContacts";
import type { Contact } from "../types";

export interface UsePersonResult {
  contact: Contact | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// Loads a single contact by id and maps it to the app Contact shape, so a
// routed /people/:id page can render the same ContactDetailModal surface used
// by the people hub. Reuses getContact + mapDirectusToContact — no new data path.
export function usePerson(id: string | undefined): UsePersonResult {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!id) {
      setError("מזהה איש קשר חסר");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getContact(id)
      .then((dc) => {
        if (cancelled) return;
        setContact(mapDirectusToContact(dc));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("שגיאה בטעינת איש הקשר");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  return { contact, loading, error, refresh };
}
