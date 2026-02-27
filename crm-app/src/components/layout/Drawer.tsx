import { X, LogOut, User, Calendar, PhoneOff, Star } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  ContactStatus,
  STATUS_LABELS,
  SheetName,
  SHEET_LABELS,
  AdvancedFilters,
} from "../../types";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  statusFilter: ContactStatus | "all";
  onStatusFilter: (status: ContactStatus | "all") => void;
  selectedSheet: SheetName | "all";
  onSheetFilter: (sheet: SheetName | "all") => void;
  advancedFilters: AdvancedFilters;
  onAdvancedFilters: (filters: AdvancedFilters) => void;
}

const INTEREST_LABELS: Record<number, string> = {
  1: "נמוך מאוד",
  2: "נמוך",
  3: "בינוני",
  4: "גבוה",
  5: "גבוה מאוד",
};

export function Drawer({
  isOpen,
  onClose,
  statusFilter,
  onStatusFilter,
  selectedSheet,
  onSheetFilter,
  advancedFilters,
  onAdvancedFilters,
}: DrawerProps) {
  const { user, signOut } = useAuth();

  const today = new Date().toISOString().split("T")[0];

  const hasActiveAdvanced =
    advancedFilters.followUpBefore ||
    advancedFilters.neverCalled ||
    advancedFilters.interestLevel;

  const clearAdvanced = () => {
    onAdvancedFilters({});
    onClose();
  };

  const toggleFollowUpToday = () => {
    if (advancedFilters.followUpBefore === today) {
      onAdvancedFilters({ ...advancedFilters, followUpBefore: undefined });
    } else {
      onAdvancedFilters({ ...advancedFilters, followUpBefore: today });
    }
    onClose();
  };

  const toggleNeverCalled = () => {
    onAdvancedFilters({
      ...advancedFilters,
      neverCalled: advancedFilters.neverCalled ? undefined : true,
    });
    onClose();
  };

  const setInterestLevel = (level: number | undefined) => {
    onAdvancedFilters({ ...advancedFilters, interestLevel: level });
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && <div className="drawer-overlay" onClick={onClose} />}

      {/* Drawer panel */}
      <div className={`drawer ${isOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <button className="drawer-close" onClick={onClose}>
            <X size={20} />
          </button>
          <div className="drawer-user">
            <div className="drawer-avatar">
              <User size={24} />
            </div>
            <div>
              <div className="drawer-user-name">{user?.displayName}</div>
              <div className="drawer-user-email">{user?.email}</div>
            </div>
          </div>
        </div>

        <div className="drawer-body">
          {/* Quick filters */}
          <div className="drawer-section">
            <h3 className="drawer-section-title">סינון מהיר</h3>
            <div className="drawer-filter-list">
              <button
                className={`drawer-filter-item ${advancedFilters.followUpBefore === today ? "active" : ""}`}
                onClick={toggleFollowUpToday}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Calendar size={16} />
                מעקבים להיום / באיחור
              </button>
              <button
                className={`drawer-filter-item ${advancedFilters.neverCalled ? "active" : ""}`}
                onClick={toggleNeverCalled}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <PhoneOff size={16} />
                מעולם לא התקשרו
              </button>
            </div>
          </div>

          {/* Interest level filter */}
          <div className="drawer-section">
            <h3 className="drawer-section-title">רמת עניין</h3>
            <div className="drawer-filter-list">
              <button
                className={`drawer-filter-item ${!advancedFilters.interestLevel ? "active" : ""}`}
                onClick={() => setInterestLevel(undefined)}
              >
                הכל
              </button>
              {[5, 4, 3, 2, 1].map((level) => (
                <button
                  key={level}
                  className={`drawer-filter-item ${advancedFilters.interestLevel === level ? "active" : ""}`}
                  onClick={() => setInterestLevel(level)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "2px",
                    }}
                  >
                    {Array.from({ length: level }, (_, i) => (
                      <Star
                        key={i}
                        size={12}
                        fill="var(--color-warning)"
                        color="var(--color-warning)"
                      />
                    ))}
                  </span>
                  {INTEREST_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div className="drawer-section">
            <h3 className="drawer-section-title">קטגוריה</h3>
            <div className="drawer-filter-list">
              <button
                className={`drawer-filter-item ${selectedSheet === "all" ? "active" : ""}`}
                onClick={() => {
                  onSheetFilter("all");
                  onClose();
                }}
              >
                הכל
              </button>
              {(Object.keys(SHEET_LABELS) as SheetName[]).map((sheet) => (
                <button
                  key={sheet}
                  className={`drawer-filter-item ${selectedSheet === sheet ? "active" : ""}`}
                  onClick={() => {
                    onSheetFilter(sheet);
                    onClose();
                  }}
                >
                  {SHEET_LABELS[sheet]}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div className="drawer-section">
            <h3 className="drawer-section-title">סטטוס שיחה</h3>
            <div className="drawer-filter-list">
              <button
                className={`drawer-filter-item ${statusFilter === "all" ? "active" : ""}`}
                onClick={() => {
                  onStatusFilter("all");
                  onClose();
                }}
              >
                הכל
              </button>
              {(Object.keys(STATUS_LABELS) as ContactStatus[]).map(
                (status) => (
                  <button
                    key={status}
                    className={`drawer-filter-item ${statusFilter === status ? "active" : ""}`}
                    onClick={() => {
                      onStatusFilter(status);
                      onClose();
                    }}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Clear all filters */}
          {hasActiveAdvanced && (
            <div className="drawer-section">
              <button
                className="drawer-filter-item"
                onClick={clearAdvanced}
                style={{
                  width: "100%",
                  textAlign: "center",
                  color: "var(--color-danger)",
                  fontWeight: 600,
                }}
              >
                נקה סינון מתקדם
              </button>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <button className="drawer-sign-out" onClick={signOut}>
            <LogOut size={18} />
            <span>התנתק</span>
          </button>
        </div>
      </div>
    </>
  );
}
