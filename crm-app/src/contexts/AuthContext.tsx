import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider, ALLOWED_USERS } from '../services/firebase';
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

// Demo user for testing
const DEMO_USER: AppUser = {
    uid: 'demo-user',
    email: 'demo@example.com',
    displayName: 'משתמש דמו',
    photoURL: undefined
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AppUser | null>(IS_DEMO_MODE ? DEMO_USER : null);
    const [loading, setLoading] = useState(!IS_DEMO_MODE);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (IS_DEMO_MODE) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser && firebaseUser.email) {
                if (ALLOWED_USERS.includes(firebaseUser.email)) {
                    setUser({
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName || 'משתמש',
                        photoURL: firebaseUser.photoURL || undefined
                    });
                    setError(null);
                } else {
                    // User not in whitelist
                    firebaseSignOut(auth);
                    setUser(null);
                    setError('אין לך הרשאה לגשת לאפליקציה');
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        if (IS_DEMO_MODE) {
            setUser(DEMO_USER);
            return;
        }

        try {
            setError(null);
            const result = await signInWithPopup(auth, googleProvider);
            const email = result.user.email;

            if (!email || !ALLOWED_USERS.includes(email)) {
                await firebaseSignOut(auth);
                setError('אין לך הרשאה לגשת לאפליקציה');
            }
        } catch (err) {
            console.error('Sign in error:', err);
            setError('שגיאה בהתחברות');
        }
    };

    const signOut = async () => {
        if (IS_DEMO_MODE) {
            // In demo mode, just show login page
            setUser(null);
            setTimeout(() => setUser(DEMO_USER), 100); // Auto re-login for demo
            return;
        }

        try {
            await firebaseSignOut(auth);
            setUser(null);
        } catch (err) {
            console.error('Sign out error:', err);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut, isDemo: IS_DEMO_MODE }}>
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
