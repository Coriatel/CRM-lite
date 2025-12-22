import { useState, useEffect } from 'react';
import { X, CheckCircle2, Circle, Search, RefreshCw } from 'lucide-react';
import { Contact, SheetName, SHEET_LABELS } from '../types';
import { initGoogleAuth, requestGoogleAuth, fetchGoogleContacts, ParsedGoogleContact, disconnectGoogle } from '../services/googleContacts';

interface GoogleContactsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (contacts: Partial<Contact>[]) => Promise<void>;
    existingContacts: Contact[];
}

export function GoogleContactsModal({ isOpen, onClose, onImport, existingContacts }: GoogleContactsModalProps) {
    const [loading, setLoading] = useState(false);
    const [authenticated, setAuthenticated] = useState(false);
    const [googleContacts, setGoogleContacts] = useState<ParsedGoogleContact[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [defaultCategory, setDefaultCategory] = useState<SheetName>('אנשי_קשר');

    useEffect(() => {
        if (isOpen && !authenticated) {
            initGoogleAuth().catch(console.error);
        }
    }, [isOpen]);

    const handleAuth = async () => {
        setLoading(true);
        try {
            await requestGoogleAuth();
            setAuthenticated(true);
            await loadContacts();
        } catch (error) {
            console.error('Authentication error:', error);
            alert('שגיאה באימות עם Google. אנא נסה שוב.');
        } finally {
            setLoading(false);
        }
    };

    const loadContacts = async () => {
        setLoading(true);
        try {
            const contacts = await fetchGoogleContacts();
            setGoogleContacts(contacts);

            // Auto-select contacts that don't exist in CRM
            const existingPhones = new Set(
                existingContacts.flatMap(c => [c.phone1, c.phone2].filter(Boolean))
            );

            const newContactIds = contacts
                .filter(c => {
                    const hasNewPhone = c.phone1 && !existingPhones.has(c.phone1);
                    return hasNewPhone;
                })
                .map(c => c.id);

            setSelectedIds(new Set(newContactIds));
        } catch (error) {
            console.error('Error loading contacts:', error);
            alert('שגיאה בטעינת אנשי קשר מ-Google');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    };

    const deselectAll = () => {
        setSelectedIds(new Set());
    };

    const handleImport = async () => {
        if (selectedIds.size === 0) return;

        setLoading(true);
        try {
            const contactsToImport = googleContacts
                .filter(c => selectedIds.has(c.id))
                .map(c => ({
                    fullName: c.fullName,
                    phone1: c.phone1,
                    phone2: c.phone2,
                    email: c.email,
                    source: defaultCategory,
                }));

            await onImport(contactsToImport);
            alert(`${contactsToImport.length} אנשי קשר יובאו בהצלחה!`);
            handleClose();
        } catch (error) {
            console.error('Error importing contacts:', error);
            alert('שגיאה בייבוא אנשי קשר');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        disconnectGoogle();
        setAuthenticated(false);
        setGoogleContacts([]);
        setSelectedIds(new Set());
        setSearchQuery('');
        onClose();
    };

    const filteredContacts = googleContacts.filter(contact => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            contact.fullName.toLowerCase().includes(query) ||
            contact.phone1?.includes(searchQuery) ||
            contact.phone2?.includes(searchQuery) ||
            contact.email?.toLowerCase().includes(query)
        );
    });

    const getContactStatus = (contact: ParsedGoogleContact) => {
        const existingByPhone = existingContacts.find(
            c => c.phone1 === contact.phone1 || c.phone2 === contact.phone1
        );

        if (existingByPhone) {
            return { exists: true, type: 'phone', match: existingByPhone };
        }

        const existingByName = existingContacts.find(
            c => c.fullName.toLowerCase() === contact.fullName.toLowerCase()
        );

        if (existingByName) {
            return { exists: true, type: 'name', match: existingByName };
        }

        return { exists: false, type: null, match: null };
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div
                className="modal"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '700px', maxHeight: '90vh' }}
            >
                <div className="modal-header">
                    <h2>סנכרון עם Google Contacts</h2>
                    <button onClick={handleClose} className="btn-icon">
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {!authenticated ? (
                        <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                            <img
                                src="https://www.gstatic.com/images/branding/product/1x/contacts_2020q4_48dp.png"
                                alt="Google Contacts"
                                style={{ width: '64px', height: '64px', margin: '0 auto var(--spacing-md)' }}
                            />
                            <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>התחבר ל-Google Contacts</h3>
                            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
                                אנחנו נבקש גישה לקריאה בלבד של אנשי הקשר שלך
                            </p>
                            <button
                                className="btn btn-primary btn-block"
                                onClick={handleAuth}
                                disabled={loading}
                            >
                                {loading ? 'מתחבר...' : 'התחבר עם Google'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Search and filters */}
                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                    <Search
                                        size={18}
                                        style={{
                                            position: 'absolute',
                                            right: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--color-text-secondary)'
                                        }}
                                    />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="חפש איש קשר..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        style={{ paddingRight: '40px' }}
                                    />
                                </div>
                                <button
                                    className="btn btn-icon btn-outline"
                                    onClick={loadContacts}
                                    disabled={loading}
                                    title="רענן"
                                >
                                    <RefreshCw size={18} />
                                </button>
                            </div>

                            {/* Category selection */}
                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                                <label style={{ fontWeight: '500', minWidth: 'fit-content' }}>
                                    קטגוריה ברירת מחדל:
                                </label>
                                <select
                                    className="form-input"
                                    value={defaultCategory}
                                    onChange={e => setDefaultCategory(e.target.value as SheetName)}
                                    style={{ flex: 1 }}
                                >
                                    {(Object.keys(SHEET_LABELS) as SheetName[]).map(sheet => (
                                        <option key={sheet} value={sheet}>
                                            {SHEET_LABELS[sheet]}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Selection controls */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: 'var(--spacing-sm)',
                                background: 'var(--color-bg)',
                                borderRadius: 'var(--radius-sm)'
                            }}>
                                <span style={{ fontWeight: '500' }}>
                                    {selectedIds.size} מתוך {filteredContacts.length} נבחרו
                                </span>
                                <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                                    <button
                                        className="btn btn-outline"
                                        onClick={selectAll}
                                        style={{ fontSize: '14px', padding: '4px 12px' }}
                                    >
                                        בחר הכל
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        onClick={deselectAll}
                                        style={{ fontSize: '14px', padding: '4px 12px' }}
                                    >
                                        נקה בחירה
                                    </button>
                                </div>
                            </div>

                            {/* Contacts list */}
                            <div style={{
                                maxHeight: '400px',
                                overflowY: 'auto',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)'
                            }}>
                                {loading ? (
                                    <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                                        <p style={{ marginTop: 'var(--spacing-sm)' }}>טוען אנשי קשר...</p>
                                    </div>
                                ) : filteredContacts.length === 0 ? (
                                    <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                        לא נמצאו אנשי קשר
                                    </div>
                                ) : (
                                    filteredContacts.map(contact => {
                                        const status = getContactStatus(contact);
                                        const isSelected = selectedIds.has(contact.id);

                                        return (
                                            <div
                                                key={contact.id}
                                                onClick={() => !status.exists && toggleSelection(contact.id)}
                                                style={{
                                                    padding: 'var(--spacing-sm) var(--spacing-md)',
                                                    borderBottom: '1px solid var(--color-border)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 'var(--spacing-sm)',
                                                    cursor: status.exists ? 'not-allowed' : 'pointer',
                                                    opacity: status.exists ? 0.5 : 1,
                                                    background: isSelected ? 'rgba(26, 95, 122, 0.05)' : 'transparent',
                                                    transition: 'background 0.2s'
                                                }}
                                            >
                                                <div style={{ fontSize: '24px' }}>
                                                    {status.exists ? (
                                                        <Circle size={24} color="var(--color-border)" />
                                                    ) : isSelected ? (
                                                        <CheckCircle2 size={24} color="var(--color-primary)" />
                                                    ) : (
                                                        <Circle size={24} color="var(--color-primary)" />
                                                    )}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                                                        {contact.fullName}
                                                        {status.exists && (
                                                            <span style={{
                                                                marginRight: '8px',
                                                                fontSize: '12px',
                                                                color: 'var(--color-warning)',
                                                                fontWeight: '400'
                                                            }}>
                                                                (כבר קיים)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                                                        {contact.phone1 && <span>{contact.phone1}</span>}
                                                        {contact.phone2 && <span> • {contact.phone2}</span>}
                                                        {contact.email && <span> • {contact.email}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Import button */}
                            <button
                                className="btn btn-primary btn-block"
                                onClick={handleImport}
                                disabled={loading || selectedIds.size === 0}
                            >
                                {loading ? 'מייבא...' : `ייבא ${selectedIds.size} אנשי קשר`}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
