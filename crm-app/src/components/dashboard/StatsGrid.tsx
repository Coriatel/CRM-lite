import { Phone, Users, Clock, TrendingUp } from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";

interface StatsGridProps {
  totalCalls: number;
  completed: number;
  remaining: number;
  raised: number;
}

export function StatsGrid({
  totalCalls,
  completed,
  remaining,
  raised,
}: StatsGridProps) {
  const navigate = useNavigate();
  // KPI-as-navigation: today's-call KPIs drill into the calls-today workflow.
  const go = () => navigate("/calls-today");
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };
  const portal = (label: string) => ({
    className: "stat-card",
    role: "button",
    tabIndex: 0,
    style: { cursor: "pointer" },
    onClick: go,
    onKeyDown: onKey,
    "aria-label": `${label} — פתיחת שיחות היום`,
  });

  return (
    <div className="stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
      <div {...portal("שיחות היום")}>
        <Phone
          size={24}
          style={{ color: "var(--color-primary)", marginBottom: "8px" }}
        />
        <div className="stat-value">{totalCalls}</div>
        <div className="stat-label">שיחות היום</div>
      </div>
      <div {...portal("הושלמו")}>
        <Users
          size={24}
          style={{ color: "var(--color-success)", marginBottom: "8px" }}
        />
        <div className="stat-value">{completed}</div>
        <div className="stat-label">הושלמו</div>
      </div>
      <div {...portal("נותרו")}>
        <Clock
          size={24}
          style={{ color: "var(--color-warning)", marginBottom: "8px" }}
        />
        <div className="stat-value">{remaining}</div>
        <div className="stat-label">נותרו</div>
      </div>
      <div {...portal("גויס")}>
        <TrendingUp
          size={24}
          style={{ color: "var(--color-accent)", marginBottom: "8px" }}
        />
        <div className="stat-value">₪{raised.toLocaleString()}</div>
        <div className="stat-label">גויס</div>
      </div>
    </div>
  );
}
