import { Phone, Mail, MapPin, Calendar, Edit2, ChevronLeft, MessageCircle, Pencil } from 'lucide-react';
import { Contact } from '../types';
import { StatusBadge } from './StatusBadge';

interface ContactDetailModalProps {
    contact: Contact;
    onClose: () => void;
    onAddNote: () => void;
    onEdit: () => void;
}

export function ContactDetailModal({ contact, onClose, onAddNote, onEdit }: ContactDetailModalProps) {
    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('he-IL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    const isValidPhone = (phone: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        return cleanPhone.length >= 9;
    };

    const getWhatsAppLink = (phone: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length >= 9) {
            const international = cleanPhone.startsWith('0')
                ? '972' + cleanPhone.substring(1)
                : cleanPhone;
            return `https://wa.me/${international}`;
        }
        return null;
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <button className="btn btn-icon btn-outline" onClick={onClose}>
                        <ChevronLeft size={20} />
                    </button>
                    <h2>{contact.fullName}</h2>
                    <button className="btn btn-icon btn-outline" onClick={onEdit} title="ערוך פרטים">
                        <Pencil size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Status */}
                    <div style={{ marginBottom: 'var(--spacing-md)', textAlign: 'center' }}>
                        <StatusBadge status={contact.status} />
                    </div>

                    {/* Contact Info */}
                    <div className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                        {contact.phone1 && (
                            <div className="contact-detail-row">
                                {isValidPhone(contact.phone1) ? (
                                    <a
                                        href={`tel:${contact.phone1}`}
                                        className="contact-link"
                                    >
                                        <Phone size={18} />
                                        <span>{contact.phone1}</span>
                                    </a>
                                ) : (
                                    <div className="contact-link" style={{ cursor: 'default' }}>
                                        <Phone size={18} />
                                        <span>{contact.phone1}</span>
                                    </div>
                                )}
                                {getWhatsAppLink(contact.phone1) && (
                                    <a
                                        href={getWhatsAppLink(contact.phone1) || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-icon"
                                        style={{ color: '#25D366' }}
                                        title="שלח הודעה בוואטסאפ"
                                    >
                                        <MessageCircle size={20} />
                                    </a>
                                )}
                            </div>
                        )}

                        {contact.phone2 && (
                            <div className="contact-detail-row">
                                {isValidPhone(contact.phone2) ? (
                                    <a
                                        href={`tel:${contact.phone2}`}
                                        className="contact-link"
                                    >
                                        <Phone size={18} />
                                        <span>{contact.phone2}</span>
                                    </a>
                                ) : (
                                    <div className="contact-link" style={{ cursor: 'default' }}>
                                        <Phone size={18} />
                                        <span>{contact.phone2}</span>
                                    </div>
                                )}
                                {getWhatsAppLink(contact.phone2) && (
                                    <a
                                        href={getWhatsAppLink(contact.phone2) || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-icon"
                                        style={{ color: '#25D366' }}
                                        title="שלח הודעה בוואטסאפ"
                                    >
                                        <MessageCircle size={20} />
                                    </a>
                                )}
                            </div>
                        )}

                        {contact.email && (
                            <a
                                href={`mailto:${contact.email}`}
                                className="contact-detail-row contact-link-secondary"
                            >
                                <Mail size={18} />
                                <span>{contact.email}</span>
                            </a>
                        )}

                        {(contact.address || contact.city) && (
                            <div className="contact-detail-row contact-detail-info">
                                <MapPin size={18} />
                                <span>{[contact.address, contact.city].filter(Boolean).join(', ')}</span>
                            </div>
                        )}

                        {contact.lastCallDate && (
                            <div className="contact-detail-row contact-detail-info" style={{ fontSize: '14px' }}>
                                <Calendar size={18} />
                                <span>שיחה אחרונה: {formatDate(contact.lastCallDate)}</span>
                            </div>
                        )}
                    </div>

                    {/* Notes History */}
                    <div>
                        <h3 className="notes-title">
                            היסטוריית הערות
                        </h3>

                        {contact.originalNote && (
                            <div className="note-item note-original" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                <div className="note-header">
                                    <span>הערה מקורית (מהאקסל)</span>
                                </div>
                                <div className="note-text">{contact.originalNote}</div>
                            </div>
                        )}

                        {contact.notes.length === 0 && !contact.originalNote && (
                            <div className="empty-state">
                                <p>אין הערות עדיין</p>
                            </div>
                        )}

                        {[...contact.notes].reverse().map(note => (
                            <div
                                key={note.id}
                                className="note-item"
                                style={{ marginBottom: 'var(--spacing-sm)' }}
                            >
                                <div className="note-header">
                                    <span>{note.userName}</span>
                                    <span>{formatDate(note.timestamp)}</span>
                                </div>
                                <div className="note-text">{note.text}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-footer">
                    <button
                        className="btn btn-primary btn-block"
                        onClick={onAddNote}
                    >
                        <Edit2 size={18} />
                        הוסף הערה
                    </button>
                </div>
            </div>
        </div>
    );
}
