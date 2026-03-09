import { useState } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Drawer } from "./Drawer";
import { SortOption, AdvancedFilters } from "../../types";

interface AppShellProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  advancedFilters: AdvancedFilters;
  onAdvancedFilters: (filters: AdvancedFilters) => void;
}

export function AppShell({
  sortBy,
  onSortChange,
  advancedFilters,
  onAdvancedFilters,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <Outlet />
      <BottomNav
        onFilterClick={() => setDrawerOpen(true)}
        hasActiveFilters={
          !!(
            advancedFilters.followUpBefore ||
            advancedFilters.neverCalled ||
            advancedFilters.interestLevel ||
            advancedFilters.hideNoName ||
            (advancedFilters.sheetTags &&
              advancedFilters.sheetTags.length > 0) ||
            (advancedFilters.groupTags && advancedFilters.groupTags.length > 0)
          )
        }
      />
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sortBy={sortBy}
        onSortChange={onSortChange}
        advancedFilters={advancedFilters}
        onAdvancedFilters={onAdvancedFilters}
      />
    </div>
  );
}
