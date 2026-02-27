import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { OAuthCallback } from "./pages/OAuthCallback";
import { ContactsPage } from "./pages/ContactsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ActiveCallPage } from "./pages/ActiveCallPage";
import { ImportPage } from "./pages/ImportPage";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  ContactStatus,
  QuickFilterTab,
  SortOption,
  AdvancedFilters,
} from "./types";

function AppContent() {
  const { user, loading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">(
    "all",
  );
  const [quickFilter, setQuickFilter] = useState<QuickFilterTab>("all");
  const [sortBy, setSortBy] = useState<SortOption>("full_name");
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});

  if (loading) {
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

  return (
    <Routes>
      <Route
        element={
          <AppShell
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
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
              quickFilter={quickFilter}
              onQuickFilterChange={setQuickFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
