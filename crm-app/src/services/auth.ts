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

export async function loginWithPassword(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; expires: number } | null> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, mode: 'json' }),
        });

        if (!res.ok) return null;

        const json = await res.json();
        const data = json.data;
        storeTokens(data.access_token, data.refresh_token, data.expires);

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expires: data.expires,
        };
    } catch {
        return null;
    }
}

/**
 * Ask Directus to email a password-reset link.
 *
 * The whole flow lives in Directus and deliberately stays there. Its token is a
 * JWT signed with the instance SECRET *and bound to the user's current password
 * hash*, so it is single-use by construction: the moment the password changes the
 * signature stops validating. Nothing is stored, so there is no plaintext token
 * to leak, and the TTL is enforced server-side.
 *
 * Note what is NOT sent: `reset_url`. Directus only honours a caller-supplied
 * destination if it appears in PASSWORD_RESET_URL_ALLOW_LIST, which this instance
 * does not set — so omitting it means the link can only ever point at the
 * instance's own PUBLIC_URL. An open redirect is not merely unlikely here, it is
 * unreachable: there is no parameter through which a destination could arrive.
 *
 * Always resolves. The caller must show the same message whatever happened —
 * Directus answers 204 for an address it has never seen, and a UI that
 * distinguished the cases would undo that at the last step.
 */
/**
 * Which SSO providers this Directus instance actually has.
 *
 * The login screen offered a Google button for months while the instance had no
 * providers configured at all: GET /auth returned `{"data":[]}` and
 * /auth/login/google answered 404, so the button navigated the owner to a dead
 * end with no explanation. Asking the server what exists, rather than assuming,
 * makes the screen tell the truth — and makes it self-correcting: the moment
 * AUTH_PROVIDERS is configured the button comes back with no redeploy.
 *
 * Returns [] on any failure. Showing a button that cannot work is worse than
 * showing none, so an unreachable server is treated as "no SSO", not "probably
 * fine".
 */
export async function getEnabledAuthProviders(): Promise<string[]> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/auth`);
        if (!res.ok) return [];
        const json = await res.json();
        const data = json?.data;
        if (!Array.isArray(data)) return [];
        return data
            .map((p: { name?: unknown }) => (typeof p?.name === 'string' ? p.name : ''))
            .filter(Boolean);
    } catch {
        return [];
    }
}

export async function requestPasswordReset(email: string): Promise<void> {
    try {
        await fetch(`${DIRECTUS_URL}/auth/password/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
    } catch {
        // Swallowed on purpose. A network error here is indistinguishable to the
        // user from a successful request for an unknown address, and it must
        // stay that way; surfacing it would leak nothing useful and would give
        // an attacker a timing or error-shape oracle for free.
    }
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
        const res = await fetch(`${DIRECTUS_URL}/users/me?fields=id,email,first_name,last_name,avatar,role.name`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!res.ok) return null;

        const json = await res.json();
        const u = json.data;
        const roleName = u?.role?.name;

        return {
            uid: u.id,
            email: u.email || '',
            displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '',
            photoURL: u.avatar ? `${DIRECTUS_URL}/assets/${u.avatar}` : undefined,
            role: typeof roleName === 'string' ? roleName : null,
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
