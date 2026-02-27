import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { AppUser } from "../types";
import { AUTH_MODE } from "../config";
import { setAuthToken } from "../services/directus";
import { clearTagCache } from "../hooks/useContacts";
import {
  getStoredTokens,
  getGoogleAuthUrl,
  refreshAccessToken,
  getCurrentUser,
  logout as authLogout,
  clearTokens,
  isTokenExpiringSoon,
} from "../services/auth";

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STATIC_USER: AppUser = {
  uid: "static-user",
  email: "crm@merkazneshama.co.il",
  displayName: "מרכז נשמה",
};

const DEMO_USER: AppUser = {
  uid: "demo-user",
  email: "demo@example.com",
  displayName: "משתמש דמו",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set up auto-refresh for OAuth tokens
  const startTokenRefresh = useCallback(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);

    // Check every 30 seconds if token needs refresh
    refreshTimer.current = setInterval(async () => {
      if (isTokenExpiringSoon()) {
        const result = await refreshAccessToken();
        if (result) {
          setAuthToken(result.accessToken);
        } else {
          // Refresh failed — log out and stop timer
          setUser(null);
          clearTokens();
          setAuthToken("");
          if (refreshTimer.current) {
            clearInterval(refreshTimer.current);
            refreshTimer.current = null;
          }
        }
      }
    }, 30_000);
  }, []);

  // Listen for 401 token-expired events from directus.ts
  // Use a lock to prevent concurrent refresh attempts
  const isRefreshing = useRef(false);

  useEffect(() => {
    const handler = async () => {
      if (isRefreshing.current) return;
      isRefreshing.current = true;
      try {
        const result = await refreshAccessToken();
        if (result) {
          setAuthToken(result.accessToken);
        } else {
          setUser(null);
          clearTokens();
          setAuthToken("");
        }
      } finally {
        isRefreshing.current = false;
      }
    };

    window.addEventListener("auth:token-expired", handler);
    return () => window.removeEventListener("auth:token-expired", handler);
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    const init = async () => {
      if (AUTH_MODE === "demo") {
        setUser(DEMO_USER);
        setLoading(false);
        return;
      }

      if (AUTH_MODE === "static") {
        setUser(STATIC_USER);
        setLoading(false);
        return;
      }

      // OAuth mode — check for stored tokens
      const { accessToken } = getStoredTokens();

      if (!accessToken) {
        setLoading(false);
        return;
      }

      // Try to get current user with stored token
      setAuthToken(accessToken);
      let currentUser = await getCurrentUser(accessToken);

      if (!currentUser) {
        // Token might be expired, try refresh
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          setAuthToken(refreshed.accessToken);
          currentUser = await getCurrentUser(refreshed.accessToken);
        }
      }

      if (currentUser) {
        setUser(currentUser);
        startTokenRefresh();
      } else {
        clearTokens();
        setAuthToken("");
      }

      setLoading(false);
    };

    init();

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [startTokenRefresh]);

  const signInWithGoogle = useCallback(async () => {
    if (AUTH_MODE !== "oauth") return;

    try {
      setError(null);
      // Redirect to Directus Google OAuth
      window.location.href = getGoogleAuthUrl();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאת אימות");
    }
  }, []);

  const signOut = useCallback(async () => {
    if (AUTH_MODE === "oauth") {
      await authLogout();
      setAuthToken("");
    }
    setUser(null);
    clearTagCache();
    if (refreshTimer.current) clearInterval(refreshTimer.current);

    if (AUTH_MODE !== "oauth") {
      window.location.reload();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signInWithGoogle,
        signOut,
        isDemo: AUTH_MODE === "demo",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
