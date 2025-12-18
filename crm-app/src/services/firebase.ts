import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';


const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo.appspot.com',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123:web:abc'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with new persistence settings (v9/v10 compat)
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export const googleProvider = new GoogleAuthProvider();

// Allowed users whitelist
export const ALLOWED_USERS = [
    'coriatel@gmail.com',
    'adi.abinun@gmail.com',
    'hoshenyehuda@gmail.com'
];
