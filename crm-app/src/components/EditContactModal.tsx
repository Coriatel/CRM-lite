import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { Contact } from '../types';

interface EditContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (contactData: Partial<Contact>) => Promise<void>;
    contact?: Contact; // If provided, we are editing. If null, creating new.
}

export function EditContactModal({ isOpen, onClose, onSave, contact }: EditContactModalProps) {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phone1: '',
        phone2: '',
        email: ''
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
                email: contact.email || ''
            });
        } else {
            setFormData({
                firstName: '',
                lastName: '',
                phone1: '',
                phone2: '',
                email: ''
            });
        }
    }, [contact, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const fullName = `${formData.firstName} ${formData.lastName}`.trim();

        try {
            await onSave({
                fullName,
                phone1: formData.phone1,
                phone2: formData.phone2,
                email: formData.email
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

                    <div style={{ marginTop: '20px' }}>
                        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                            <Save size={18} />
                            {loading ? 'שומר...' : 'שמור'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
