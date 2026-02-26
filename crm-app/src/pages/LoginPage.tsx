import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
    const { signInWithGoogle } = useAuth();

    // Auto-login since we use static token
    useEffect(() => {
        signInWithGoogle();
    }, []);

    return (
        <div className="login-page">
            <div style={{
                width: 100,
                height: 100,
                background: 'white',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 'var(--spacing-lg)',
                boxShadow: 'var(--shadow-lg)'
            }}>
                <span style={{ fontSize: '48px' }}>📞</span>
            </div>

            <h1 className="login-title">CRM Lite</h1>
            <p className="login-subtitle">מרכז נשמה - ניהול תורמים</p>

            <div className="loading">
                <div className="spinner"></div>
            </div>
        </div>
    );
}
