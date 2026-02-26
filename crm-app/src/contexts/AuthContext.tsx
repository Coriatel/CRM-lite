import { createContext, useContext, useState, ReactNode } from 'react';
import { AppUser } from '../types';
import { IS_DEMO_MODE } from '../config';

interface AuthContextType {
    user: AppUser | null;
    loading: boolean;
    error: string | null;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    isDemo: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STATIC_USER: AppUser = {
    uid: 'static-user',
    email: 'crm@merkazneshama.co.il',
    displayName: 'מרכז נשמה',
};

const DEMO_USER: AppUser = {
    uid: 'demo-user',
    email: 'demo@example.com',
    displayName: 'משתמש דמו',
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const activeUser = IS_DEMO_MODE ? DEMO_USER : STATIC_USER;
    const [user] = useState<AppUser | null>(activeUser);

    const signInWithGoogle = async () => {
        // No-op — static token auth, no login needed
    };

    const signOut = async () => {
        // No-op — reload page to "logout"
        window.location.reload();
    };

    return (
        <AuthContext.Provider value={{ user, loading: false, error: null, signInWithGoogle, signOut, isDemo: IS_DEMO_MODE }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
