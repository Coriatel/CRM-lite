import { useState } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Drawer } from "./Drawer";
import { ContactStatus, SortOption, AdvancedFilters } from "../../types";

interface AppShellProps {
  statusFilter: ContactStatus | "all";
  onStatusFilter: (status: ContactStatus | "all") => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  advancedFilters: AdvancedFilters;
  onAdvancedFilters: (filters: AdvancedFilters) => void;
}

export function AppShell({
  statusFilter,
  onStatusFilter,
  sortBy,
  onSortChange,
  advancedFilters,
  onAdvancedFilters,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <Outlet />
      <BottomNav onFilterClick={() => setDrawerOpen(true)} />
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        statusFilter={statusFilter}
        onStatusFilter={onStatusFilter}
        sortBy={sortBy}
        onSortChange={onSortChange}
        advancedFilters={advancedFilters}
        onAdvancedFilters={onAdvancedFilters}
      />
    </div>
  );
}
