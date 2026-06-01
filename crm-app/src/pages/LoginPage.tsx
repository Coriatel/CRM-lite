import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AUTH_MODE } from '../config';

export function LoginPage() {
    const { signInWithGoogle, signInWithEmail, error } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || submitting) return;
        setSubmitting(true);
        try {
            await signInWithEmail(email, password);
        } finally {
            setSubmitting(false);
            setPassword('');
        }
    };

    // Static/demo modes auto-login — show spinner briefly
    if (AUTH_MODE !== 'oauth') {
        return (
            <div className="login-page">
                <div className="loading">
                    <div className="spinner" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }}></div>
                </div>
            </div>
        );
    }

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
                boxShadow: 'var(--shadow-lg)',
            }}>
                <span style={{ fontSize: '48px' }}>📞</span>
            </div>

            <h1 className="login-title">מרכז נשמה — OPS</h1>
            <p className="login-subtitle">מערכת התפעול של מרכז נשמה</p>

            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.2)',
                    color: 'white',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    marginBottom: 'var(--spacing-lg)',
                    fontSize: '14px',
                    textAlign: 'center',
                }}>
                    {error}
                </div>
            )}

            <button
                className="google-btn"
                onClick={signInWithGoogle}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>התחבר עם Google</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 320, margin: 'var(--spacing-lg) 0', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.3)' }} />
                <span>או</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.3)' }} />
            </div>

            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
                <input
                    type="email"
                    autoComplete="email"
                    placeholder="אימייל"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ padding: '12px 14px', borderRadius: 8, border: 'none', fontSize: 14, direction: 'ltr', textAlign: 'left' }}
                />
                <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="סיסמה"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ padding: '12px 14px', borderRadius: 8, border: 'none', fontSize: 14, direction: 'ltr', textAlign: 'left' }}
                />
                <button
                    type="submit"
                    disabled={submitting || !email || !password}
                    style={{ padding: '12px 14px', borderRadius: 8, border: 'none', background: 'white', color: '#1a5f7a', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
                >
                    {submitting ? 'מתחבר...' : 'התחבר עם אימייל'}
                </button>
            </form>
        </div>
    );
}
