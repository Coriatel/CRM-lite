// Contact types
export type SheetName =
  | "אנשי_קשר"
  | "תורמים_פוטנציאליים"
  | "תורמים_שתרמו"
  | "חברים_טובים"
  | "תלמידים"
  | "להתרמות";

export type ContactStatus =
  | "not_checked"
  | "no_answer"
  | "call_later"
  | "agreed"
  | "refused"
  | "donated"
  | "follow_up";

export interface Note {
  id: string;
  text: string;
  timestamp: Date;
  userId: string;
  userName: string;
  type?: string;
  result?: string;
}

export interface Contact {
  id: string;
  source: SheetName;
  category?: string;
  fullName: string;
  phone1?: string;
  phone2?: string;
  email?: string;
  city?: string;
  address?: string;
  status: ContactStatus;
  lastCallDate?: Date;
  followUpDate?: string;
  followUpNote?: string;
  interestLevel?: number;
  assignedTo?: string;
  notes: Note[];
  donationType?: string;
  monthlyDonation?: number;
  totalDonation?: number;
  createdAt: Date;
  updatedAt: Date;
  originalNote?: string;
  receiptConfirmed?: boolean;
  thankYouSent?: boolean;
  tags?: string[];
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface AdvancedFilters {
  followUpBefore?: string;
  neverCalled?: boolean;
  interestLevel?: number;
  hideNoName?: boolean;
  sheetTags?: string[];
  groupTags?: string[];
}

export type SortOption =
  | "full_name"
  | "-created_at"
  | "created_at"
  | "-last_call_date"
  | "call_status"
  | "-interest_level";

export const SORT_LABELS: Record<SortOption, string> = {
  full_name: "שם (א-ת)",
  "-created_at": "חדש ביותר",
  created_at: "ישן ביותר",
  "-last_call_date": "שיחה אחרונה",
  call_status: "סטטוס",
  "-interest_level": "רמת עניין",
};

export type QuickFilterTab =
  | "all"
  | "before_call"
  | "follow_up"
  | "no_answer"
  | "donated";

export const QUICK_FILTER_LABELS: Record<QuickFilterTab, string> = {
  all: "אנשי קשר",
  before_call: "לפני שיחה",
  follow_up: "לשיחת המשך",
  no_answer: "לא ענו",
  donated: "תרמו",
};

export const QUICK_FILTER_STATUSES: Record<QuickFilterTab, string[] | null> = {
  all: null,
  before_call: ["not_checked"],
  follow_up: ["call_later", "follow_up"],
  no_answer: ["no_answer"],
  donated: ["donated"],
};

export const STATUS_LABELS: Record<ContactStatus, string> = {
  not_checked: "לא נבדק",
  no_answer: "לא ענה",
  call_later: "להתקשר שוב",
  agreed: "בתהליך",
  refused: "סירב",
  donated: "תרם",
  follow_up: "לעקוב",
};

export const SHEET_LABELS: Record<SheetName, string> = {
  אנשי_קשר: "אנשי קשר",
  תורמים_פוטנציאליים: "תורמים פוטנציאליים",
  תורמים_שתרמו: "תורמים שתרמו",
  חברים_טובים: "חברים טובים",
  תלמידים: "תלמידים",
  להתרמות: "להתרמות",
};
