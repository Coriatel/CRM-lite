import {
  Users,
  PhoneOff,
  Phone,
  ThumbsUp,
  Send,
  BadgeCheck,
  XCircle,
  TrendingUp,
} from "lucide-react";
import type React from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  CampaignStatus,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
  AdvancedFilters,
} from "../../types";

interface CampaignStatsGridProps {
  total: number;
  byStatus: Record<string, number>;
  totalDonated: number;
  goalAmount: number;
}

const STATUS_ICONS: Record<CampaignStatus, typeof Users> = {
  not_contacted: Users,
  called: Phone,
  no_answer: PhoneOff,
  agreed: ThumbsUp,
  link_sent: Send,
  paid: BadgeCheck,
  refused: XCircle,
};

export function CampaignStatsGrid({
  total,
  byStatus,
  totalDonated,
  goalAmount,
}: CampaignStatsGridProps) {
  const progress =
    goalAmount > 0 ? Math.min((totalDonated / goalAmount) * 100, 100) : 0;

  const navigate = useNavigate();
  const { setAdvancedFilters } = useOutletContext<{
    setAdvancedFilters: (f: AdvancedFilters) => void;
  }>();
  // B4 (KPI-as-navigation): a campaign-status card drills into the people list
  // filtered by that status; the total card clears it. Sets only campaignStatus
  // (the P-B4 filter) and navigates — no URL params. Active-project scoping is
  // enforced downstream by PeopleHubPage/useContacts (campaignStatus is ignored
  // when no project is active), so no extra wiring is needed here.
  const drill = (status?: CampaignStatus) => {
    setAdvancedFilters({ campaignStatus: status });
    navigate("/people");
  };
  const portal = (label: string, status?: CampaignStatus) => ({
    className: "stat-card",
    role: "button",
    tabIndex: 0,
    style: { padding: "8px", cursor: "pointer" },
    onClick: () => drill(status),
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        drill(status);
      }
    },
    "aria-label": `${label} — אנשי קשר`,
  });

  return (
    <div>
      {/* Progress bar */}
      <div className="card" style={{ marginBottom: "var(--spacing-sm)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "6px",
            fontSize: "14px",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            <TrendingUp
              size={16}
              style={{
                verticalAlign: "middle",
                marginLeft: "4px",
                color: "var(--color-accent)",
              }}
            />
            ₪{totalDonated.toLocaleString()}
          </span>
          <span style={{ color: "var(--color-text-secondary)" }}>
            מתוך ₪{goalAmount.toLocaleString()} ({Math.round(progress)}%)
          </span>
        </div>
        <div
          style={{
            height: "10px",
            borderRadius: "5px",
            background: "var(--color-bg-secondary, #f1f5f9)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: "5px",
              background:
                progress >= 100
                  ? "var(--color-success)"
                  : "var(--color-primary)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Status grid */}
      <div
        className="stats"
        style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}
      >
        <div {...portal('סה"כ')}>
          <Users
            size={18}
            style={{ color: "var(--color-primary)", marginBottom: "4px" }}
          />
          <div className="stat-value" style={{ fontSize: "18px" }}>
            {total}
          </div>
          <div className="stat-label" style={{ fontSize: "10px" }}>
            סה"כ
          </div>
        </div>
        {(
          [
            "not_contacted",
            "called",
            "no_answer",
            "agreed",
            "link_sent",
            "paid",
            "refused",
          ] as CampaignStatus[]
        ).map((status) => {
          const Icon = STATUS_ICONS[status];
          const count = byStatus[status] || 0;
          return (
            <div key={status} {...portal(CAMPAIGN_STATUS_LABELS[status], status)}>
              <Icon
                size={18}
                style={{
                  color: CAMPAIGN_STATUS_COLORS[status],
                  marginBottom: "4px",
                }}
              />
              <div className="stat-value" style={{ fontSize: "18px" }}>
                {count}
              </div>
              <div className="stat-label" style={{ fontSize: "10px" }}>
                {CAMPAIGN_STATUS_LABELS[status]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
