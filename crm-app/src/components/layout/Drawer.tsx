import { useState } from "react";
import {
  X,
  LogOut,
  User,
  Calendar,
  PhoneOff,
  Star,
  ChevronDown,
  UserX,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  ContactStatus,
  STATUS_LABELS,
  SortOption,
  SORT_LABELS,
  AdvancedFilters,
} from "../../types";
import { useTags } from "../../hooks/useTags";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  statusFilter: ContactStatus | "all";
  onStatusFilter: (status: ContactStatus | "all") => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
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

function DrawerSection({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="drawer-section">
      <button className="drawer-section-toggle" onClick={onToggle}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {icon}
          {title}
        </span>
        <ChevronDown
          size={16}
          style={{
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>
      <div
        style={{
          maxHeight: isExpanded ? "500px" : "0",
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div className="drawer-filter-list">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({
  isOpen,
  onClose,
  statusFilter,
  onStatusFilter,
  sortBy,
  onSortChange,
  advancedFilters,
  onAdvancedFilters,
}: DrawerProps) {
  const { user, signOut } = useAuth();
  const { tags } = useTags();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    quickFilters: true,
    sort: false,
    sheets: false,
    groups: false,
    interestLevel: false,
    callStatus: false,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const today = new Date().toISOString().split("T")[0];

  const hasActiveAdvanced =
    advancedFilters.followUpBefore ||
    advancedFilters.neverCalled ||
    advancedFilters.interestLevel ||
    advancedFilters.hideNoName ||
    (advancedFilters.sheetTags && advancedFilters.sheetTags.length > 0) ||
    (advancedFilters.groupTags && advancedFilters.groupTags.length > 0) ||
    statusFilter !== "all";

  const clearAdvanced = () => {
    onAdvancedFilters({});
    onStatusFilter("all");
  };

  const toggleFollowUpToday = () => {
    if (advancedFilters.followUpBefore === today) {
      onAdvancedFilters({ ...advancedFilters, followUpBefore: undefined });
    } else {
      onAdvancedFilters({ ...advancedFilters, followUpBefore: today });
    }
  };

  const toggleNeverCalled = () => {
    onAdvancedFilters({
      ...advancedFilters,
      neverCalled: advancedFilters.neverCalled ? undefined : true,
    });
  };

  const toggleHideNoName = () => {
    onAdvancedFilters({
      ...advancedFilters,
      hideNoName: advancedFilters.hideNoName ? undefined : true,
    });
  };

  const setInterestLevel = (level: number | undefined) => {
    onAdvancedFilters({ ...advancedFilters, interestLevel: level });
  };

  const toggleSheetTag = (tagName: string) => {
    const current = advancedFilters.sheetTags || [];
    const next = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName];
    onAdvancedFilters({
      ...advancedFilters,
      sheetTags: next.length > 0 ? next : undefined,
    });
  };

  const toggleGroupTag = (tagName: string) => {
    const current = advancedFilters.groupTags || [];
    const next = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName];
    onAdvancedFilters({
      ...advancedFilters,
      groupTags: next.length > 0 ? next : undefined,
    });
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
          {/* Clear all filters — always visible */}
          <button
            className="drawer-clear-all"
            onClick={clearAdvanced}
            disabled={!hasActiveAdvanced}
          >
            נקה כל הסינונים
          </button>

          {/* Quick filters */}
          <DrawerSection
            title="סינון מהיר"
            isExpanded={expanded.quickFilters}
            onToggle={() => toggle("quickFilters")}
          >
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
            <button
              className={`drawer-filter-item ${advancedFilters.hideNoName ? "active" : ""}`}
              onClick={toggleHideNoName}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <UserX size={16} />
              הסתר שמות לא אמיתיים
            </button>
          </DrawerSection>

          {/* Sort */}
          <DrawerSection
            title="מיון"
            icon={<ArrowUpDown size={14} />}
            isExpanded={expanded.sort}
            onToggle={() => toggle("sort")}
          >
            {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
              <button
                key={option}
                className={`drawer-filter-item ${sortBy === option ? "active" : ""}`}
                onClick={() => onSortChange(option)}
              >
                {SORT_LABELS[option]}
              </button>
            ))}
          </DrawerSection>

          {/* WhatsApp Sheets (dynamic from tags) */}
          {tags.sheetTags.length > 0 && (
            <DrawerSection
              title="גיליון וואטסאפ"
              isExpanded={expanded.sheets}
              onToggle={() => toggle("sheets")}
            >
              {tags.sheetTags.map((tag) => {
                const isActive = advancedFilters.sheetTags?.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    className={`drawer-filter-item ${isActive ? "active" : ""}`}
                    onClick={() => toggleSheetTag(tag.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {isActive && <Check size={14} />}
                    {tag.name.replace("גיליון: ", "")}
                  </button>
                );
              })}
            </DrawerSection>
          )}

          {/* WhatsApp Groups (dynamic from tags) */}
          {tags.groupTags.length > 0 && (
            <DrawerSection
              title="קבוצות וואטסאפ"
              isExpanded={expanded.groups}
              onToggle={() => toggle("groups")}
            >
              {tags.groupTags.map((tag) => {
                const isActive = advancedFilters.groupTags?.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    className={`drawer-filter-item ${isActive ? "active" : ""}`}
                    onClick={() => toggleGroupTag(tag.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {isActive && <Check size={14} />}
                    {tag.name.replace("קבוצה: ", "")}
                  </button>
                );
              })}
            </DrawerSection>
          )}

          {/* Interest level filter */}
          <DrawerSection
            title="רמת עניין"
            isExpanded={expanded.interestLevel}
            onToggle={() => toggle("interestLevel")}
          >
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
          </DrawerSection>

          {/* Status filter */}
          <DrawerSection
            title="סטטוס שיחה"
            isExpanded={expanded.callStatus}
            onToggle={() => toggle("callStatus")}
          >
            <button
              className={`drawer-filter-item ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => onStatusFilter("all")}
            >
              הכל
            </button>
            {(Object.keys(STATUS_LABELS) as ContactStatus[]).map((status) => (
              <button
                key={status}
                className={`drawer-filter-item ${statusFilter === status ? "active" : ""}`}
                onClick={() => onStatusFilter(status)}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </DrawerSection>
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
