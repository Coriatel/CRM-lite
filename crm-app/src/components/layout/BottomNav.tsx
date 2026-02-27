import { useLocation, useNavigate } from 'react-router-dom';
import { Home, LayoutDashboard, Filter, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'בית', icon: Home },
  { path: '/dashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { path: '/filter', label: 'סינון', icon: Filter },
  { path: '/settings', label: 'הגדרות', icon: Settings },
] as const;

interface BottomNavProps {
  onFilterClick?: () => void;
}

export function BottomNav({ onFilterClick }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (path: string) => {
    if (path === '/filter') {
      onFilterClick?.();
      return;
    }
    navigate(path);
  };

  const isActive = (path: string) => {
    if (path === '/filter') return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
        <button
          key={path}
          className={`bottom-nav-item ${isActive(path) ? 'active' : ''}`}
          onClick={() => handleClick(path)}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
