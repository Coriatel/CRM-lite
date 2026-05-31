import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  BarChart3,
  X,
  Activity,
  CalendarDays,
  Users,
  Phone,
  BookOpen,
  UserCog,
  type LucideIcon,
} from "lucide-react";

/*
 * MoreSheet — bottom sheet for secondary navigation, opened from the 5th
 * "עוד" tab in BottomNav. Keeps the primary nav at 5 fixed slots while
 * still exposing low-frequency surfaces (Settings, /ops, /dashboard, etc.).
 *
 * Accessibility:
 *   role="dialog" + aria-modal + aria-labelledby
 *   Esc + overlay click close
 *   First focusable element receives focus on open
 */

interface MoreSheetItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const ITEMS: MoreSheetItem[] = [
  { path: "/schedule", label: "לוח זמנים", icon: CalendarDays },
  { path: "/dashboard", label: "לוח בקרה", icon: BarChart3 },
  { path: "/ops", label: "מערכת — Ops", icon: Activity },
  { path: "/people", label: "אנשים", icon: Users },
  { path: "/calls-today", label: "שיחות היום", icon: Phone },
  { path: "/rabbi", label: "תור הרב", icon: BookOpen },
  { path: "/elron", label: "תור אלרון", icon: UserCog },
  { path: "/settings", label: "הגדרות", icon: Settings },
];

interface MoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MoreSheet({ isOpen, onClose }: MoreSheetProps) {
  const navigate = useNavigate();
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    firstButtonRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGo = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <>
      <div
        className="more-sheet-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="more-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
        dir="rtl"
      >
        <div className="more-sheet-header">
          <h2 id="more-sheet-title" className="more-sheet-title">
            עוד
          </h2>
          <button
            type="button"
            className="more-sheet-close"
            onClick={onClose}
            aria-label="סגור"
          >
            <X size={20} />
          </button>
        </div>
        <ul className="more-sheet-list">
          {ITEMS.map(({ path, label, icon: Icon }, idx) => (
            <li key={path}>
              <button
                type="button"
                ref={idx === 0 ? firstButtonRef : undefined}
                className="more-sheet-item"
                onClick={() => handleGo(path)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
