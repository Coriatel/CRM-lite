import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Inbox, Users, CheckSquare, Heart } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { MgLoading } from "./MgState";
import "./mgmt.css";

// Only screens that exist are listed: a nav item never leads nowhere.
export const MG_NAV = [
  { to: "/m/today", label: "היום", short: "היום", Icon: Inbox },
  { to: "/m/people", label: "אנשי קשר", short: "אנשים", Icon: Users },
  { to: "/m/tasks", label: "משימות", short: "משימות", Icon: CheckSquare },
  { to: "/m/donors", label: "תורמים", short: "תורמים", Icon: Heart },
];

export function MgmtShell() {
  const { user } = useAuth();
  const name = user?.displayName || user?.email || "";
  return (
    <div className="mg">
      <header className="mg-topbar">
        <Link className="mg-brand" to="/m/today" aria-label="מרכז נשמה">
          <img src="/mgmt/client-mark.png" alt="מרכז נשמה" />
        </Link>
        <span className="mg-area-name">מרחב הניהול</span>
        <span className="mg-spacer" />
        <span className="mg-me">
          <span className="mg-me-name">{name}</span>
          <span className="mg-avatar" aria-hidden="true">
            {name.charAt(0)}
          </span>
        </span>
      </header>
      <div className="mg-layout">
        <nav className="mg-rail" aria-label="ניווט ניהול">
          <div className="mg-rail-inner">
            {MG_NAV.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className="mg-nav">
                <Icon aria-hidden="true" />
                {label}
              </NavLink>
            ))}
            <div className="mg-rail-sep" />
            <Link className="mg-nav" to="/">
              למסכים הקודמים
            </Link>
          </div>
        </nav>
        <main id="main-content">
          <Suspense fallback={<MgLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <nav className="mg-tabbar" aria-label="ניווט ניהול">
        {MG_NAV.map(({ to, short, Icon }) => (
          <NavLink key={to} to={to}>
            <Icon aria-hidden="true" />
            {short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
