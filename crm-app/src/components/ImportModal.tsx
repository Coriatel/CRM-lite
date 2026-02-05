import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Contact, SheetName } from '../types';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (contacts: Partial<Contact>[]) => Promise<void>;
}

export function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<Partial<Contact>[]>([]);

    const downloadTemplate = () => {
        const template = [
            {
                'שם מלא': 'דוגמה אחת',
                'טלפון 1': '050-1234567',
                'טלפון 2': '052-7654321',
                'אימייל': 'example@example.com',
                'קטגוריה': 'אנשי_קשר',
                'הערות': 'הערה לדוגמה'
            },
            {
                'שם מלא': 'דוגמה שתיים',
                'טלפון 1': '053-1111111',
                'טלפון 2': '',
                'אימייל': 'test@test.com',
                'קטגוריה': 'תורמים_פוטנציאליים',
                'הערות': ''
            }
        ];

        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'אנשי קשר');
        XLSX.writeFile(wb, 'תבנית_ייבוא_אנשי_קשר.xlsx');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            const contacts: Partial<Contact>[] = jsonData.map((row: any) => ({
                fullName: row['שם מלא'] || '',
                phone1: row['טלפון 1'] || '',
                phone2: row['טלפון 2'] || '',
                email: row['אימייל'] || '',
                source: (row['קטגוריה'] as SheetName) || 'אנשי_קשר',
                originalNote: row['הערות'] || ''
            }));

            setPreview(contacts);
        } catch (error) {
            console.error('Error reading file:', error);
            alert('שגיאה בקריאת הקובץ. אנא ודא שהפורמט תקין.');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (preview.length === 0) return;

        setLoading(true);
        try {
            await onImport(preview);
            alert(`${preview.length} אנשי קשר יובאו בהצלחה!`);
            setPreview([]);
            onClose();
        } catch (error) {
            console.error('Error importing contacts:', error);
            alert('שגיאה בייבוא אנשי קשר');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2>ייבוא אנשי קשר מאקסל</h2>
                    <button onClick={onClose} className="btn-icon">
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body">
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-sm)', fontSize: '16px' }}>
                            שלב 1: הורד תבנית
                        </h3>
                        <button
                            type="button"
                            className="btn btn-outline btn-block"
                            onClick={downloadTemplate}
                        >
                            <Download size={18} />
                            הורד תבנית אקסל
                        </button>
                        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-sm)' }}>
                            הורד את התבנית, מלא אותה עם אנשי הקשר שלך, ושמור אותה.
                        </p>
                    </div>

                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-sm)', fontSize: '16px' }}>
                            שלב 2: העלה קובץ
                        </h3>
                        <label
                            htmlFor="file-upload"
                            className="btn btn-primary btn-block"
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <Upload size={18} />
                            בחר קובץ אקסל
                        </label>
                        <input
                            id="file-upload"
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />
                    </div>

                    {preview.length > 0 && (
                        <div>
                            <h3 style={{ marginBottom: 'var(--spacing-sm)', fontSize: '16px' }}>
                                תצוגה מקדימה ({preview.length} אנשי קשר)
                            </h3>
                            <div style={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: 'var(--spacing-sm)'
                            }}>
                                {preview.slice(0, 5).map((contact, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            padding: 'var(--spacing-sm)',
                                            borderBottom: index < 4 ? '1px solid var(--color-border)' : 'none'
                                        }}
                                    >
                                        <div style={{ fontWeight: '500' }}>{contact.fullName}</div>
                                        <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                                            {contact.phone1} {contact.phone2 && `• ${contact.phone2}`}
                                        </div>
                                    </div>
                                ))}
                                {preview.length > 5 && (
                                    <div style={{ padding: 'var(--spacing-sm)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                        ועוד {preview.length - 5} אנשי קשר...
                                    </div>
                                )}
                            </div>

                            <button
                                className="btn btn-primary btn-block"
                                onClick={handleImport}
                                disabled={loading}
                                style={{ marginTop: 'var(--spacing-md)' }}
                            >
                                <FileSpreadsheet size={18} />
                                {loading ? 'מייבא...' : `ייבא ${preview.length} אנשי קשר`}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
