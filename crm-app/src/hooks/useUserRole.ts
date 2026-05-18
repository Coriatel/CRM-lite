import { useAuth } from "../contexts/AuthContext";
import { AUTH_MODE } from "../config";

export type UserRole =
  | "owner"
  | "primary_rabbi"
  | "rabbi"
  | "coordinator"
  | "mentor"
  | "pending"
  | "unknown";

const KNOWN_ROLES: ReadonlyArray<UserRole> = [
  "owner",
  "primary_rabbi",
  "rabbi",
  "coordinator",
  "mentor",
  "pending",
];

function normalize(raw: string): UserRole {
  const slug = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (KNOWN_ROLES as ReadonlyArray<string>).includes(slug)
    ? (slug as UserRole)
    : "unknown";
}

export function useUserRole(): UserRole {
  const { user } = useAuth();

  // Static-token mode predates per-user identity; the single shared token
  // belongs to the operator, so treat as owner. The OAuth path supplies
  // user.role from Directus role.name.
  if (AUTH_MODE === "static") return "owner";
  if (!user) return "unknown";
  if (!user.role) return "pending";
  return normalize(user.role);
}
