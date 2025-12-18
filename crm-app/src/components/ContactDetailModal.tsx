import { useState } from 'react';
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
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '95vh' }}>
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-sm) 0' }}>
                                <a
                                    href={`tel:${contact.phone1}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-sm)',
                                        color: 'var(--color-primary)',
                                        textDecoration: 'none'
                                    }}
                                >
                                    <Phone size={18} />
                                    <span>{contact.phone1}</span>
                                </a>
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-sm) 0' }}>
                                <a
                                    href={`tel:${contact.phone2}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-sm)',
                                        color: 'var(--color-primary)',
                                        textDecoration: 'none'
                                    }}
                                >
                                    <Phone size={18} />
                                    <span>{contact.phone2}</span>
                                </a>
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
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--spacing-sm)',
                                    padding: 'var(--spacing-sm) 0',
                                    color: 'var(--color-text)',
                                    textDecoration: 'none'
                                }}
                            >
                                <Mail size={18} />
                                <span>{contact.email}</span>
                            </a>
                        )}

                        {(contact.address || contact.city) && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                padding: 'var(--spacing-sm) 0',
                                color: 'var(--color-text-secondary)'
                            }}>
                                <MapPin size={18} />
                                <span>{[contact.address, contact.city].filter(Boolean).join(', ')}</span>
                            </div>
                        )}

                        {contact.lastCallDate && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                padding: 'var(--spacing-sm) 0',
                                color: 'var(--color-text-secondary)',
                                fontSize: '14px'
                            }}>
                                <Calendar size={18} />
                                <span>שיחה אחרונה: {formatDate(contact.lastCallDate)}</span>
                            </div>
                        )}
                    </div>

                    {/* Notes History */}
                    <div>
                        <h3 style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            marginBottom: 'var(--spacing-sm)'
                        }}>
                            היסטוריית הערות
                        </h3>

                        {contact.originalNote && (
                            <div
                                className="card"
                                style={{
                                    marginBottom: 'var(--spacing-sm)',
                                    background: 'var(--color-bg)',
                                    fontSize: '14px'
                                }}
                            >
                                <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginBottom: 4 }}>
                                    הערה מקורית (מהאקסל)
                                </div>
                                <div>{contact.originalNote}</div>
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
                                className="card"
                                style={{ marginBottom: 'var(--spacing-sm)', fontSize: '14px' }}
                            >
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: 'var(--color-text-secondary)',
                                    fontSize: '12px',
                                    marginBottom: 4
                                }}>
                                    <span>{note.userName}</span>
                                    <span>{formatDate(note.timestamp)}</span>
                                </div>
                                <div>{note.text}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-footer">
                    <button
                        className="btn btn-primary"
                        onClick={onAddNote}
                        style={{ flex: 1 }}
                    >
                        <Edit2 size={18} />
                        הוסף הערה
                    </button>
                </div>
            </div>
        </div>
    );
}
