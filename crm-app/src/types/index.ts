// Contact types
export type SheetName =
    | 'אנשי_קשר'
    | 'תורמים_פוטנציאליים'
    | 'תורמים_שתרמו'
    | 'חברים_טובים'
    | 'תלמידים'
    | 'להתרמות';

export type ContactStatus =
    | 'not_checked'
    | 'no_answer'
    | 'call_later'
    | 'agreed'
    | 'refused'
    | 'donated'
    | 'follow_up';

export interface Note {
    id: string;
    text: string;
    timestamp: Date;
    userId: string;
    userName: string;
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
    assignedTo?: string;
    notes: Note[];
    donationType?: string;
    monthlyDonation?: number;
    totalDonation?: number;
    createdAt: Date;
    updatedAt: Date;
    originalNote?: string;
}

export interface AppUser {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
}

export const STATUS_LABELS: Record<ContactStatus, string> = {
    not_checked: 'לא נבדק',
    no_answer: 'לא ענה',
    call_later: 'להתקשר שוב',
    agreed: 'בתהליך',
    refused: 'סירב',
    donated: 'תרם',
    follow_up: 'לעקוב'
};

export const SHEET_LABELS: Record<SheetName, string> = {
    'אנשי_קשר': 'אנשי קשר',
    'תורמים_פוטנציאליים': 'תורמים פוטנציאליים',
    'תורמים_שתרמו': 'תורמים שתרמו',
    'חברים_טובים': 'חברים טובים',
    'תלמידים': 'תלמידים',
    'להתרמות': 'להתרמות'
};
