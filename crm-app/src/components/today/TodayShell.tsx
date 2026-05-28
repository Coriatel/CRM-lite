import { Activity } from "lucide-react";
import { StaleChip } from "../runtime/StaleChip";
import "./today.css";

export interface TodayPressureChip {
  id: string;
  label: string;
  value: string;
}

interface TodayShellProps {
  dateLabel: string;
  fetchedAt?: Date | string | null;
  pressureChips: TodayPressureChip[];
  children: React.ReactNode;
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export function TodayShell({
  dateLabel,
  fetchedAt,
  pressureChips,
  children,
}: TodayShellProps) {
  return (
    <main id="main-content" className="today-shell" aria-labelledby="today-page-title">
      <div className="today-shell__inner">
        <header className="today-topbar">
          <div>
            <h1 id="today-page-title" className="today-topbar__title">
              היום · {dateLabel}
            </h1>
            <div className="today-topbar__subtitle">שורש תפעולי · תשומת לב לפני עומס</div>
          </div>
          <div className="today-freshness" aria-label="רעננות נתונים">
            <Activity size={18} aria-hidden="true" />
          </div>
        </header>

        <div className="today-pressure" aria-label="אותות לחץ">
          {pressureChips.map((chip) => (
            <div key={chip.id} className="today-chip">
              <span>{chip.label}</span>
              <strong>{chip.value}</strong>
            </div>
          ))}
          <StaleChip
            fetchedAt={fetchedAt ?? null}
            thresholdMs={STALE_THRESHOLD_MS}
            variant="quiet"
            testId="today-attention-stale"
          />
        </div>

        {children}
      </div>
    </main>
  );
}
