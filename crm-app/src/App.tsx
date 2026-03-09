import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProjectProvider, useProjectContext } from "./contexts/ProjectContext";
import { LoginPage } from "./pages/LoginPage";
import { OAuthCallback } from "./pages/OAuthCallback";
import { ContactsPage } from "./pages/ContactsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ActiveCallPage } from "./pages/ActiveCallPage";
import { ImportPage } from "./pages/ImportPage";

import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SortOption, AdvancedFilters } from "./types";

const LAST_ROUTE_KEY = "crm_last_route";
const ROUTE_WHITELIST = ["/", "/dashboard", "/settings"];

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (ROUTE_WHITELIST.includes(location.pathname)) {
      try {
        localStorage.setItem(LAST_ROUTE_KEY, location.pathname);
      } catch {}
    }
  }, [location.pathname]);
  return null;
}

function AppContent() {
  const { user, loading } = useAuth();
  const { loading: projectsLoading } = useProjectContext();
  const [sortBy, setSortBy] = useState<SortOption>("full_name");
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});

  if (loading || projectsLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg)",
        }}
      >
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  // Restore last route on first render
  const lastRoute = (() => {
    try {
      return localStorage.getItem(LAST_ROUTE_KEY);
    } catch {
      return null;
    }
  })();

  return (
    <>
      <RouteTracker />
      <Routes>
        <Route
          element={
            <AppShell
              sortBy={sortBy}
              onSortChange={setSortBy}
              advancedFilters={advancedFilters}
              onAdvancedFilters={setAdvancedFilters}
            />
          }
        >
          <Route
            index
            element={
              <ContactsPage
                sortBy={sortBy}
                onSortChange={setSortBy}
                advancedFilters={advancedFilters}
              />
            }
          />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="call/:contactId" element={<ActiveCallPage />} />
        <Route path="import" element={<ImportPage />} />
        {lastRoute && lastRoute !== "/" && (
          <Route path="*" element={<Navigate to={lastRoute} replace />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProjectProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </ProjectProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
