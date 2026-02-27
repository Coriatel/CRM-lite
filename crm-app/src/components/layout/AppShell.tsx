import { useState } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Drawer } from "./Drawer";
import { ContactStatus, SheetName, AdvancedFilters } from "../../types";

interface AppShellProps {
  statusFilter: ContactStatus | "all";
  onStatusFilter: (status: ContactStatus | "all") => void;
  selectedSheet: SheetName | "all";
  onSheetFilter: (sheet: SheetName | "all") => void;
  advancedFilters: AdvancedFilters;
  onAdvancedFilters: (filters: AdvancedFilters) => void;
}

export function AppShell({
  statusFilter,
  onStatusFilter,
  selectedSheet,
  onSheetFilter,
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
        selectedSheet={selectedSheet}
        onSheetFilter={onSheetFilter}
        advancedFilters={advancedFilters}
        onAdvancedFilters={onAdvancedFilters}
      />
    </div>
  );
}
