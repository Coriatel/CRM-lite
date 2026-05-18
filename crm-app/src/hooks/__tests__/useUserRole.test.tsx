import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppUser } from "../../types";

vi.mock("../../config", () => ({
  AUTH_MODE: "oauth",
  DIRECTUS_URL: "https://crm.example",
  DIRECTUS_STATIC_TOKEN: "",
  IS_DEMO_MODE: false,
}));

const userRef: { current: AppUser | null } = { current: null };

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: userRef.current,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    isDemo: false,
  }),
}));

import { useUserRole } from "../useUserRole";

function setUser(u: AppUser | null) {
  userRef.current = u;
}

function wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

describe("useUserRole (oauth mode)", () => {
  beforeEach(() => {
    setUser(null);
  });
  afterEach(() => {
    setUser(null);
  });

  it("returns 'unknown' when there is no user", () => {
    const { result } = renderHook(() => useUserRole(), { wrapper });
    expect(result.current).toBe("unknown");
  });

  it("returns 'pending' when user has no role", () => {
    setUser({ uid: "1", email: "x@y", displayName: "X", role: null });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    expect(result.current).toBe("pending");
  });

  it("returns 'owner' for canonical role name", () => {
    setUser({ uid: "1", email: "x@y", displayName: "X", role: "owner" });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    expect(result.current).toBe("owner");
  });

  it("normalizes 'Primary Rabbi' to 'primary_rabbi'", () => {
    setUser({ uid: "1", email: "x@y", displayName: "X", role: "Primary Rabbi" });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    expect(result.current).toBe("primary_rabbi");
  });

  it("normalizes 'primary-rabbi' (hyphen) to 'primary_rabbi'", () => {
    setUser({ uid: "1", email: "x@y", displayName: "X", role: "primary-rabbi" });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    expect(result.current).toBe("primary_rabbi");
  });

  it("returns 'unknown' for unrecognized role names", () => {
    setUser({ uid: "1", email: "x@y", displayName: "X", role: "wizard" });
    const { result } = renderHook(() => useUserRole(), { wrapper });
    expect(result.current).toBe("unknown");
  });

  it("recognizes all 6 canonical roles", () => {
    const roles = ["owner", "primary_rabbi", "rabbi", "coordinator", "mentor", "pending"];
    for (const r of roles) {
      setUser({ uid: "1", email: "x@y", displayName: "X", role: r });
      const { result } = renderHook(() => useUserRole(), { wrapper });
      expect(result.current).toBe(r);
    }
  });
});

describe("useUserRole (static mode)", () => {
  it("returns 'owner' regardless of user.role (single-tenant token)", async () => {
    vi.resetModules();
    vi.doMock("../../config", () => ({
      AUTH_MODE: "static",
      DIRECTUS_URL: "https://crm.example",
      DIRECTUS_STATIC_TOKEN: "static-token-x",
      IS_DEMO_MODE: false,
    }));
    vi.doMock("../../contexts/AuthContext", () => ({
      useAuth: () => ({
        user: { uid: "static", email: "ops@m", displayName: "Op", role: null },
        loading: false,
        error: null,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signOut: vi.fn(),
        isDemo: false,
      }),
    }));
    const { useUserRole: useUserRoleStatic } = await import("../useUserRole");
    const { result } = renderHook(() => useUserRoleStatic(), { wrapper });
    expect(result.current).toBe("owner");
  });
});
