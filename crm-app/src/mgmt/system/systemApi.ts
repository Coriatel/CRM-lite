import { getAuthToken } from "../../services/directus";

// The System tab reads only from the owner-only system-panel-api (CRM-lite ops/system-panel).
// The server checks the session and answers the owner alone; nothing here is a security gate.
export type SystemKind = "map" | "permissions" | "security";

export interface SystemNode {
  id: string;
  kind: string;
  name: string;
  state?: string;
  title_he?: string | null;
  purpose_he?: string | null;
  group?: string;
  [k: string]: unknown;
}
export interface SystemMap {
  _meta: { generated_at?: string; [k: string]: unknown };
  nodes: SystemNode[];
  edges: { from: string; to: string; rel: string }[];
  groups: unknown;
  [k: string]: unknown;
}

function headers(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The publish time when this account may see the System tab; null otherwise (401/403/no route/offline). */
export async function systemAvailable(): Promise<{ published_at: string | null } | null> {
  try {
    const res = await fetch("/api/system/ok", { headers: headers(), cache: "no-store" });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.ok === true ? { published_at: d.published_at ?? null } : null;
  } catch {
    return null;
  }
}

/** Throws Error("Server error (<status>)") like directusFetch, so MgNotice words 403 the same way. */
export async function getSystem<T = SystemMap>(kind: SystemKind): Promise<T> {
  const res = await fetch(`/api/system/${kind}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Server error (${res.status})`);
  return (await res.json()) as T;
}
