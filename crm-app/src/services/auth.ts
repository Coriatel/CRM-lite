import { DIRECTUS_URL } from '../config';
import { AppUser } from '../types';

const TOKEN_KEY = 'crm_access_token';
const REFRESH_KEY = 'crm_refresh_token';
const EXPIRY_KEY = 'crm_token_expiry';

// --- Token storage ---

export function getStoredTokens() {
    return {
        accessToken: localStorage.getItem(TOKEN_KEY) || '',
        refreshToken: localStorage.getItem(REFRESH_KEY) || '',
        expiry: Number(localStorage.getItem(EXPIRY_KEY) || '0'),
    };
}

export function storeTokens(accessToken: string, refreshToken: string, expiresMs: number) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresMs));
}

export function clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRY_KEY);
}

export function isTokenExpiringSoon(): boolean {
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) || '0');
    // Refresh 60 seconds before actual expiry
    return Date.now() > expiry - 60_000;
}

// --- Directus Auth API ---

export function getGoogleAuthUrl(): string {
    const redirect = `${window.location.origin}/auth/callback`;
    return `${DIRECTUS_URL}/auth/login/google?redirect=${encodeURIComponent(redirect)}`;
}

export async function refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string; expires: number } | null> {
    const { refreshToken } = getStoredTokens();
    if (!refreshToken) return null;

    try {
        const res = await fetch(`${DIRECTUS_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                refresh_token: refreshToken,
                mode: 'json',
            }),
        });

        if (!res.ok) {
            clearTokens();
            return null;
        }

        const json = await res.json();
        const data = json.data;

        storeTokens(data.access_token, data.refresh_token, data.expires);

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expires: data.expires,
        };
    } catch {
        clearTokens();
        return null;
    }
}

export async function getCurrentUser(accessToken: string): Promise<AppUser | null> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/users/me?fields=id,email,first_name,last_name,avatar`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!res.ok) return null;

        const json = await res.json();
        const u = json.data;

        return {
            uid: u.id,
            email: u.email || '',
            displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '',
            photoURL: u.avatar ? `${DIRECTUS_URL}/assets/${u.avatar}` : undefined,
        };
    } catch {
        return null;
    }
}

export async function logout(): Promise<void> {
    const { refreshToken } = getStoredTokens();

    if (refreshToken) {
        try {
            await fetch(`${DIRECTUS_URL}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
        } catch {
            // Ignore logout errors
        }
    }

    clearTokens();
}

// --- Parse OAuth callback ---

export function parseOAuthCallback(hash: string): { accessToken: string; refreshToken: string; expires: number } | null {
    // Directus redirects with: #access_token=xxx&refresh_token=xxx&expires=xxx
    const params = new URLSearchParams(hash.replace('#', ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expires = params.get('expires');

    if (!accessToken || !refreshToken) return null;

    return {
        accessToken,
        refreshToken,
        expires: expires ? Number(expires) : 900_000, // Default 15 min
    };
}
