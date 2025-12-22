import { Phone, MessageSquarePlus } from 'lucide-react';
import { Contact } from '../types';
import { StatusBadge } from './StatusBadge';

interface ContactCardProps {
    contact: Contact;
    onAddNote: (contact: Contact) => void;
    onViewDetails: (contact: Contact) => void;
    onEdit: (contact: Contact) => void;
}

export function ContactCard({ contact, onAddNote, onViewDetails, onEdit }: ContactCardProps) {
    const initials = contact.fullName
        .split(' ')
        .slice(0, 2)
        .map(n => n[0])
        .join('');

    const lastNote = contact.notes.length > 0
        ? contact.notes[contact.notes.length - 1].text
        : contact.originalNote;

    const isValidPhone = (phone: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        return cleanPhone.length >= 9;
    };

    const handleCall = (e: React.MouseEvent, phone: string) => {
        e.stopPropagation();
        if (isValidPhone(phone)) {
            window.location.href = `tel:${phone}`;
        }
    };

    return (
        <div className="card contact-card" onClick={() => onViewDetails(contact)}>
            <div 
                className="contact-avatar" 
                onClick={(e) => {
                    e.stopPropagation();
                    onEdit(contact);
                }}
                style={{ cursor: 'pointer' }}
                title="לחץ לעריכה"
            >
                {initials || '?'}
            </div>

            <div className="contact-info">
                <div className="contact-name">{contact.fullName}</div>

                {contact.phone1 && (
                    <div className="contact-phone">
                        <Phone size={14} />
                        {isValidPhone(contact.phone1) ? (
                            <a
                                href={`tel:${contact.phone1}`}
                                onClick={(e) => handleCall(e, contact.phone1!)}
                            >
                                {contact.phone1}
                            </a>
                        ) : (
                            <span>{contact.phone1}</span>
                        )}
                    </div>
                )}

                <StatusBadge status={contact.status} />

                {lastNote && (
                    <div className="contact-note" title={lastNote}>
                        {lastNote}
                    </div>
                )}
            </div>

            <div className="contact-actions">
                {contact.phone1 && (
                    <button
                        className="call-btn"
                        onClick={(e) => handleCall(e, contact.phone1!)}
                        title="חייג"
                    >
                        <Phone size={20} />
                    </button>
                )}

                <button
                    className="btn btn-icon btn-outline"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddNote(contact);
                    }}
                    title="הוסף הערה"
                >
                    <MessageSquarePlus size={18} />
                </button>
            </div>
        </div>
    );
}
