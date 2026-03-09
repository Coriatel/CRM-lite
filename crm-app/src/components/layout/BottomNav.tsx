import { useLocation, useNavigate } from "react-router-dom";
import { Users, LayoutDashboard, Filter, Settings } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "אנשי קשר", icon: Users },
  { path: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { path: "/filter", label: "סינון", icon: Filter },
  { path: "/settings", label: "הגדרות", icon: Settings },
] as const;

interface BottomNavProps {
  onFilterClick?: () => void;
  hasActiveFilters?: boolean;
}

export function BottomNav({ onFilterClick, hasActiveFilters }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (path: string) => {
    if (path === "/filter") {
      onFilterClick?.();
      return;
    }
    navigate(path);
  };

  const isActive = (path: string) => {
    if (path === "/filter") return false;
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
        <button
          key={path}
          className={`bottom-nav-item ${isActive(path) ? "active" : ""}${path === "/filter" && hasActiveFilters ? " has-filter" : ""}`}
          onClick={() => handleClick(path)}
        >
          <Icon size={22} />
          <span>{label}</span>
          {path === "/filter" && hasActiveFilters && (
            <span className="filter-dot" />
          )}
        </button>
      ))}
    </nav>
  );
}
