import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';

const signInWithGoogle = vi.fn();
const signInWithEmail = vi.fn();
const requestPasswordReset = vi.fn(async (_email: string) => undefined);
const getEnabledAuthProviders = vi.fn(async (): Promise<string[]> => []);

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ signInWithGoogle, signInWithEmail, error: null }),
}));
vi.mock('../services/auth', () => ({
    requestPasswordReset: (email: string) => requestPasswordReset(email),
    // The login screen asks Directus which SSO providers exist; the default in
    // these tests is "none", matching the live instance.
    getEnabledAuthProviders: () => getEnabledAuthProviders(),
}));
vi.mock('../config', () => ({ AUTH_MODE: 'oauth', DIRECTUS_URL: 'https://directus.test' }));

const openReset = () => fireEvent.click(screen.getByText('שכחת סיסמה?'));

describe('LoginPage — password reset', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => { document.body.innerHTML = ''; });

    it('offers a forgot-password control on the sign-in screen', () => {
        render(<LoginPage />);
        expect(screen.getByText('שכחת סיסמה?')).toBeTruthy();
    });

    it('the control opens a reset form asking only for an email', () => {
        render(<LoginPage />);
        openReset();
        expect(screen.getByLabelText('הזינו את כתובת האימייל של החשבון')).toBeTruthy();
        // The password field must be gone: this screen must not look like, or be
        // mistaken for, a place that changes a password directly.
        expect(screen.queryByPlaceholderText('סיסמה')).toBeNull();
    });

    it('submitting calls the service exactly once with the typed address', async () => {
        render(<LoginPage />);
        openReset();
        fireEvent.change(screen.getByLabelText('הזינו את כתובת האימייל של החשבון'),
            { target: { value: 'owner@example.com' } });
        fireEvent.click(screen.getByText('שלחו לי קישור לאיפוס'));
        await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledTimes(1));
        expect(requestPasswordReset).toHaveBeenCalledWith('owner@example.com');
    });

    it('shows the same confirmation for a known and an unknown address', async () => {
        const seen: string[] = [];
        for (const email of ['known@example.com', 'nobody@example.com']) {
            const { unmount } = render(<LoginPage />);
            openReset();
            fireEvent.change(screen.getByLabelText('הזינו את כתובת האימייל של החשבון'),
                { target: { value: email } });
            fireEvent.click(screen.getByText('שלחו לי קישור לאיפוס'));
            await waitFor(() => screen.getByText(/אם קיים חשבון/));
            seen.push(screen.getByText(/אם קיים חשבון/).textContent || '');
            unmount();
        }
        expect(seen[0]).toBe(seen[1]);
        expect(seen[0]).toContain('אם קיים חשבון');
    });

    it('shows that same confirmation even when the request fails outright', async () => {
        requestPasswordReset.mockRejectedValueOnce(new Error('network'));
        render(<LoginPage />);
        openReset();
        fireEvent.change(screen.getByLabelText('הזינו את כתובת האימייל של החשבון'),
            { target: { value: 'owner@example.com' } });
        fireEvent.click(screen.getByText('שלחו לי קישור לאיפוס'));
        await waitFor(() => expect(screen.getByText(/אם קיים חשבון/)).toBeTruthy());
    });

    it('the confirmation states the link is time-limited and single-use', async () => {
        render(<LoginPage />);
        openReset();
        fireEvent.change(screen.getByLabelText('הזינו את כתובת האימייל של החשבון'),
            { target: { value: 'owner@example.com' } });
        fireEvent.click(screen.getByText('שלחו לי קישור לאיפוס'));
        const msg = await screen.findByText(/אם קיים חשבון/);
        expect(msg.textContent).toContain('פעם אחת');
        expect(msg.textContent).toContain('זמן קצר');
    });

    it('an empty address does not fire a request', async () => {
        render(<LoginPage />);
        openReset();
        fireEvent.click(screen.getByText('שלחו לי קישור לאיפוס'));
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it('cancel returns to sign-in with the email path intact', () => {
        render(<LoginPage />);
        openReset();
        fireEvent.click(screen.getByText('ביטול'));
        expect(screen.getByPlaceholderText('סיסמה')).toBeTruthy();
    });

    // --- the Google control must describe the server, not a hope ---------------
    it('hides the Google button when the instance has no providers', async () => {
        getEnabledAuthProviders.mockResolvedValueOnce([]);
        render(<LoginPage />);
        await waitFor(() => expect(screen.getByText(/אינה מוגדרת בשרת/)).toBeTruthy());
        expect(screen.queryByText('התחבר עם Google')).toBeNull();
    });

    it('shows the Google button when the instance reports the provider', async () => {
        getEnabledAuthProviders.mockResolvedValueOnce(['google']);
        render(<LoginPage />);
        await waitFor(() => expect(screen.getByText('התחבר עם Google')).toBeTruthy());
        expect(screen.queryByText(/אינה מוגדרת בשרת/)).toBeNull();
    });

    it('an unreachable provider list is treated as no SSO, not as working SSO', async () => {
        getEnabledAuthProviders.mockRejectedValueOnce(new Error('offline'));
        render(<LoginPage />);
        await waitFor(() => expect(screen.queryByText('התחבר עם Google')).toBeNull());
    });

    it('email sign-in stays available regardless of the provider list', async () => {
        getEnabledAuthProviders.mockResolvedValueOnce([]);
        render(<LoginPage />);
        await waitFor(() => screen.getByText(/אינה מוגדרת בשרת/));
        expect(screen.getByPlaceholderText('סיסמה')).toBeTruthy();
        expect(screen.getByText('שכחת סיסמה?')).toBeTruthy();
    });

    it('returning from the confirmation clears the typed address', async () => {
        render(<LoginPage />);
        openReset();
        fireEvent.change(screen.getByLabelText('הזינו את כתובת האימייל של החשבון'),
            { target: { value: 'owner@example.com' } });
        fireEvent.click(screen.getByText('שלחו לי קישור לאיפוס'));
        fireEvent.click(await screen.findByText('חזרה להתחברות'));
        openReset();
        expect((screen.getByLabelText('הזינו את כתובת האימייל של החשבון') as HTMLInputElement).value).toBe('');
    });

    it('the reset screen never renders the password the user had typed', async () => {
        render(<LoginPage />);
        fireEvent.change(screen.getByPlaceholderText('סיסמה'), { target: { value: 'hunter2' } });
        openReset();
        expect(document.body.innerHTML).not.toContain('hunter2');
    });

    it('sign-in still works and is untouched by the new path', async () => {
        render(<LoginPage />);
        fireEvent.change(screen.getByPlaceholderText('אימייל'), { target: { value: 'a@b.com' } });
        fireEvent.change(screen.getByPlaceholderText('סיסמה'), { target: { value: 'pw' } });
        fireEvent.click(screen.getByText('התחבר עם אימייל'));
        await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('a@b.com', 'pw'));
    });
});
