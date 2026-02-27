import { Phone, Users, Clock, TrendingUp } from "lucide-react";

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
  return (
    <div className="stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
      <div className="stat-card">
        <Phone
          size={24}
          style={{ color: "var(--color-primary)", marginBottom: "8px" }}
        />
        <div className="stat-value">{totalCalls}</div>
        <div className="stat-label">שיחות היום</div>
      </div>
      <div className="stat-card">
        <Users
          size={24}
          style={{ color: "var(--color-success)", marginBottom: "8px" }}
        />
        <div className="stat-value">{completed}</div>
        <div className="stat-label">הושלמו</div>
      </div>
      <div className="stat-card">
        <Clock
          size={24}
          style={{ color: "var(--color-warning)", marginBottom: "8px" }}
        />
        <div className="stat-value">{remaining}</div>
        <div className="stat-label">נותרו</div>
      </div>
      <div className="stat-card">
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
