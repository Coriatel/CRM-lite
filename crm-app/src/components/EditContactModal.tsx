import React, { useState, useEffect } from 'react';
import { X, Save, UserPlus, Trash2 } from 'lucide-react';
import { Contact, SheetName, SHEET_LABELS } from '../types';

interface EditContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (contactData: Partial<Contact>) => Promise<void>;
    onDelete?: () => void;
    contact?: Contact; // If provided, we are editing. If null, creating new.
}

export function EditContactModal({ isOpen, onClose, onSave, onDelete, contact }: EditContactModalProps) {
    const handleDelete = () => {
        if (contact && onDelete) {
            if (confirm(`האם אתה בטוח שברצונך למחוק את ${contact.fullName}?`)) {
                onDelete();
                onClose();
            }
        }
    };
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phone1: '',
        phone2: '',
        email: '',
        source: 'אנשי_קשר' as SheetName
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (contact) {
            // Split full name if possible, or just put everything in first name for now
            const parts = contact.fullName.split(' ');
            const firstName = parts[0] || ''; // Simpler split for now
            const lastName = parts.slice(1).join(' ') || '';

            setFormData({
                firstName,
                lastName,
                phone1: contact.phone1 || '',
                phone2: contact.phone2 || '',
                email: contact.email || '',
                source: contact.source
            });
        } else {
            setFormData({
                firstName: '',
                lastName: '',
                phone1: '',
                phone2: '',
                email: '',
                source: 'אנשי_קשר'
            });
        }
    }, [contact, isOpen]);

    const handleImportContact = async () => {
        // Check if Contact Picker API is available
        if ('contacts' in navigator && 'ContactsManager' in window) {
            try {
                const props = ['name', 'tel', 'email'];
                // @ts-ignore - Contact Picker API not in TypeScript types yet
                const contacts = await navigator.contacts.select(props, { multiple: false });

                if (contacts && contacts.length > 0) {
                    const contact = contacts[0];
                    const nameParts = contact.name ? contact.name[0].split(' ') : ['', ''];

                    setFormData(prev => ({
                        ...prev,
                        firstName: nameParts[0] || '',
                        lastName: nameParts.slice(1).join(' ') || '',
                        phone1: contact.tel && contact.tel[0] ? contact.tel[0] : '',
                        phone2: contact.tel && contact.tel[1] ? contact.tel[1] : '',
                        email: contact.email && contact.email[0] ? contact.email[0] : ''
                    }));
                }
            } catch (error) {
                console.error('Error importing contact:', error);
                alert('שגיאה בייבוא איש קשר');
            }
        } else {
            alert('הדפדפן שלך לא תומך בייבוא אנשי קשר. תכונה זו זמינה רק בניידים עם Chrome/Edge.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const fullName = `${formData.firstName} ${formData.lastName}`.trim();

        try {
            await onSave({
                fullName,
                phone1: formData.phone1,
                phone2: formData.phone2,
                email: formData.email,
                source: formData.source
            });
            onClose();
        } catch (error) {
            console.error('Error saving contact:', error);
            alert('שגיאה בשמירת איש הקשר');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{contact ? 'עריכת איש קשר' : 'איש קשר חדש'}</h2>
                    <button onClick={onClose} className="btn-icon">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    {!contact && (
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <button
                                type="button"
                                className="btn btn-outline btn-block"
                                onClick={handleImportContact}
                            >
                                <UserPlus size={18} />
                                ייבא מאנשי הקשר של הנייד
                            </button>
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">שם פרטי</label>
                        <input
                            type="text"
                            value={formData.firstName}
                            onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                            required
                            className="form-input"
                            placeholder="שם פרטי"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">שם משפחה</label>
                        <input
                            type="text"
                            value={formData.lastName}
                            onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                            className="form-input"
                            placeholder="שם משפחה"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">טלפון ראשי</label>
                        <input
                            type="tel"
                            value={formData.phone1}
                            onChange={e => setFormData(prev => ({ ...prev, phone1: e.target.value }))}
                            className="form-input"
                            dir="ltr"
                            placeholder="050-0000000"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">טלפון נוסף</label>
                        <input
                            type="tel"
                            value={formData.phone2}
                            onChange={e => setFormData(prev => ({ ...prev, phone2: e.target.value }))}
                            className="form-input"
                            dir="ltr"
                            placeholder="050-0000000"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">אימייל</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            className="form-input"
                            dir="ltr"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">קטגוריה</label>
                        <select
                            value={formData.source}
                            onChange={e => setFormData(prev => ({ ...prev, source: e.target.value as SheetName }))}
                            className="form-input"
                            required
                        >
                            {(Object.keys(SHEET_LABELS) as SheetName[]).map(sheet => (
                                <option key={sheet} value={sheet}>
                                    {SHEET_LABELS[sheet]}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', gap: 'var(--spacing-sm)' }}>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                            <Save size={18} />
                            {loading ? 'שומר...' : 'שמור'}
                        </button>
                        {contact && onDelete && (
                            <button
                                type="button"
                                className="btn"
                                style={{
                                    background: 'var(--color-danger)',
                                    color: 'white',
                                    border: 'none'
                                }}
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
