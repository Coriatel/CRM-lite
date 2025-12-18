import { useState, useEffect, useCallback } from 'react';
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    arrayUnion,
    Timestamp,
    limit,
    addDoc
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { Contact, ContactStatus, SheetName, Note } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { DEMO_CONTACTS } from '../data/demo';
import { IS_DEMO_MODE } from '../config';

const CONTACTS_COLLECTION = 'contacts';
const PAGE_SIZE = 50;

export function useContacts(
    selectedSheet: SheetName | 'all',
    statusFilter: ContactStatus | 'all',
    searchQuery: string
) {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentLimit, setCurrentLimit] = useState(PAGE_SIZE);

    // Reset limit when filters change
    useEffect(() => {
        setCurrentLimit(PAGE_SIZE);
        setLoading(true);
    }, [selectedSheet, statusFilter, searchQuery]);

    const loadAll = useCallback(() => {
        setCurrentLimit(5000); // Load everything (up to 5000)
    }, []);

    const loadMore = useCallback(() => {
        setCurrentLimit(prev => prev + 50);
    }, []);

    // Demo mode - use local data
    useEffect(() => {
        if (IS_DEMO_MODE) {
            let filtered = [...DEMO_CONTACTS];

            if (selectedSheet !== 'all') {
                filtered = filtered.filter(c => c.source === selectedSheet);
            }

            if (statusFilter !== 'all') {
                filtered = filtered.filter(c => c.status === statusFilter);
            }

            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                filtered = filtered.filter(c =>
                    c.fullName.toLowerCase().includes(q) ||
                    c.phone1?.includes(searchQuery) ||
                    c.phone2?.includes(searchQuery)
                );
            }

            setContacts(filtered.slice(0, currentLimit));
            setLoading(false);
            return;
        }

        // Real Firestore mode
        let q = query(collection(db, CONTACTS_COLLECTION));

        if (selectedSheet !== 'all') {
            q = query(q, where('source', '==', selectedSheet));
        }

        if (statusFilter !== 'all') {
            q = query(q, where('status', '==', statusFilter));
        }

        // Apply ordering and dynamic limit
        const qLimited = query(q, orderBy('fullName'), limit(currentLimit));

        const unsubscribe = onSnapshot(qLimited, (snapshot) => {
            const newContacts: Contact[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                newContacts.push({
                    id: docSnap.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate() || new Date(),
                    lastCallDate: data.lastCallDate?.toDate(),
                    notes: (data.notes || []).map((n: any) => ({
                        ...n,
                        timestamp: n.timestamp?.toDate() || new Date()
                    }))
                } as Contact);
            });

            // Client-side search filtering
            let filtered = newContacts;
            if (searchQuery) {
                const sq = searchQuery.toLowerCase();
                filtered = newContacts.filter(c =>
                    c.fullName.toLowerCase().includes(sq) ||
                    c.phone1?.includes(searchQuery) ||
                    c.phone2?.includes(searchQuery)
                );
            }

            setContacts(filtered);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching contacts:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedSheet, statusFilter, searchQuery, currentLimit]);

    return { contacts, loading, hasMore: true, loadMore, loadAll };
}

export function useContactActions() {
    const { user } = useAuth();

    const updateStatus = async (contactId: string, status: ContactStatus) => {
        if (IS_DEMO_MODE) {
            console.log('Demo mode: updateStatus', contactId, status);
            return;
        }

        const contactRef = doc(db, CONTACTS_COLLECTION, contactId);
        await updateDoc(contactRef, {
            status,
            updatedAt: Timestamp.now(),
            lastCallDate: Timestamp.now()
        });
    };

    const addNote = async (contactId: string, text: string, newStatus?: ContactStatus) => {
        if (IS_DEMO_MODE) {
            console.log('Demo mode: addNote', contactId, text, newStatus);
            return;
        }

        if (!user) return;

        const note: Note = {
            id: crypto.randomUUID(),
            text,
            timestamp: new Date(),
            userId: user.uid,
            userName: user.displayName
        };

        const contactRef = doc(db, CONTACTS_COLLECTION, contactId);
        const updateData: any = {
            notes: arrayUnion({
                ...note,
                timestamp: Timestamp.now()
            }),
            updatedAt: Timestamp.now(),
            lastCallDate: Timestamp.now()
        };

        if (newStatus) {
            updateData.status = newStatus;
        }

        await updateDoc(contactRef, updateData);
    };

    const updateContact = async (contactId: string, data: Partial<Contact>) => {
        if (IS_DEMO_MODE) {
            console.log('Demo mode: updateContact', contactId, data);
            return;
        }

        const contactRef = doc(db, CONTACTS_COLLECTION, contactId);
        await updateDoc(contactRef, {
            ...data,
            updatedAt: Timestamp.now()
        });
    };

    const createContact = async (data: Partial<Contact>) => {
        if (IS_DEMO_MODE) {
            console.log('Demo mode: createContact', data);
            return;
        }

        const newContact = {
            ...data,
            status: 'not_checked',
            source: 'אנשי_קשר', // Default source
            notes: [],
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        await addDoc(collection(db, CONTACTS_COLLECTION), newContact);
    };

    return { updateStatus, addNote, updateContact, createContact };
}
