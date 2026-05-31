import { useLocation, useNavigate } from "react-router-dom";
import {
  Users,
  LayoutDashboard,
  Filter,
  MoreHorizontal,
  CalendarClock,
  UserRound,
  type LucideIcon,
} from "lucide-react";

type NavAction = "navigate" | "filter" | "more";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  action: NavAction;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/today", label: "היום", icon: CalendarClock, action: "navigate" },
  { path: "/rabbi", label: "הרב", icon: UserRound, action: "navigate" },
  { path: "/", label: "אנשי קשר", icon: Users, action: "navigate" },
  { path: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard, action: "navigate" },
  { path: "/filter", label: "סינון", icon: Filter, action: "filter" },
  { path: "/more", label: "עוד", icon: MoreHorizontal, action: "more" },
];

interface BottomNavProps {
  onFilterClick?: () => void;
  onMoreClick?: () => void;
  hasActiveFilters?: boolean;
}

export function BottomNav({
  onFilterClick,
  onMoreClick,
  hasActiveFilters,
}: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (item: NavItem) => {
    if (item.action === "filter") {
      onFilterClick?.();
      return;
    }
    if (item.action === "more") {
      onMoreClick?.();
      return;
    }
    navigate(item.path);
  };

  const isActive = (item: NavItem) => {
    if (item.action !== "navigate") return false;
    if (item.path === "/") return location.pathname === "/";
    // /calls-today is a child of the Today flow — keep the Today tab active there.
    if (item.path === "/today") {
      return (
        location.pathname === "/today" ||
        location.pathname.startsWith("/calls-today")
      );
    }
    return location.pathname.startsWith(item.path);
  };

  return (
    <nav className="bottom-nav" aria-label="ניווט ראשי">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        return (
          <button
            key={item.path}
            type="button"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={`bottom-nav-item ${active ? "active" : ""}${item.action === "filter" && hasActiveFilters ? " has-filter" : ""}`}
            onClick={() => handleClick(item)}
          >
            <Icon size={22} />
            <span>{item.label}</span>
            {item.action === "filter" && hasActiveFilters && (
              <span className="filter-dot" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
