import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestPasswordReset } from './auth';
import { DIRECTUS_URL } from '../config';

// The reset flow itself belongs to Directus and is deliberately not reimplemented
// here. What this file guards is the seam we own: that the request goes to the
// right endpoint, that it carries nothing it must not carry, and — the property
// the whole design rests on — that no observable difference leaks back to the
// caller whatever the server did. A UI that can distinguish "account exists" from
// "account does not" undoes Directus's non-enumeration at the last step.

function mockFetch(impl: (url: string, init: RequestInit) => Promise<unknown> | unknown) {
    const spy = vi.fn(async (url: string, init: RequestInit) => impl(url, init));
    // @ts-expect-error test double
    globalThis.fetch = spy;
    return spy;
}

const ok = () => ({ ok: true, status: 204, json: async () => ({}) });

describe('requestPasswordReset', () => {
    let logs: unknown[][];
    let origLog: typeof console.log;
    let origErr: typeof console.error;
    let origWarn: typeof console.warn;

    beforeEach(() => {
        logs = [];
        origLog = console.log; origErr = console.error; origWarn = console.warn;
        console.log = (...a: unknown[]) => { logs.push(a); };
        console.error = (...a: unknown[]) => { logs.push(a); };
        console.warn = (...a: unknown[]) => { logs.push(a); };
    });
    afterEach(() => {
        console.log = origLog; console.error = origErr; console.warn = origWarn;
        vi.restoreAllMocks();
    });

    it('posts the email to the Directus reset-request endpoint', async () => {
        const spy = mockFetch(() => ok());
        await requestPasswordReset('someone@example.com');
        expect(spy).toHaveBeenCalledTimes(1);
        const [url, init] = spy.mock.calls[0];
        expect(url).toBe(`${DIRECTUS_URL}/auth/password/request`);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({ email: 'someone@example.com' });
    });

    it('never sends a caller-controlled reset destination', async () => {
        // This is the open-redirect guard. Directus would only honour reset_url if
        // it were allow-listed, but the reliable defence is not sending one at all.
        const spy = mockFetch(() => ok());
        await requestPasswordReset('someone@example.com');
        const body = JSON.parse(spy.mock.calls[0][1].body as string);
        expect(body).not.toHaveProperty('reset_url');
        expect(Object.keys(body)).toEqual(['email']);
    });

    it('does not attach credentials or an Authorization header', async () => {
        const spy = mockFetch(() => ok());
        await requestPasswordReset('someone@example.com');
        const init = spy.mock.calls[0][1] as RequestInit & { credentials?: string };
        const headers = init.headers as Record<string, string>;
        expect(Object.keys(headers)).toEqual(['Content-Type']);
        expect(init.credentials).toBeUndefined();
    });

    // --- indistinguishability: the load-bearing property ----------------------
    const cases: Array<[string, () => unknown]> = [
        ['204 (Directus success, and its answer for an unknown address)', () => ok()],
        ['403 (Directus forbids internally for an unknown user)', () => ({ ok: false, status: 403, json: async () => ({}) })],
        ['429 (rate limited)', () => ({ ok: false, status: 429, json: async () => ({}) })],
        ['500 (server error)', () => ({ ok: false, status: 500, json: async () => ({}) })],
        ['network failure', () => { throw new TypeError('Failed to fetch'); }],
    ];

    for (const [label, impl] of cases) {
        it(`resolves to the same nothing on ${label}`, async () => {
            mockFetch(impl as never);
            const result = await requestPasswordReset('someone@example.com');
            expect(result).toBeUndefined();
        });
    }

    it('two different outcomes are indistinguishable to the caller', async () => {
        mockFetch(() => ok());
        const a = await requestPasswordReset('known@example.com');
        mockFetch(() => { throw new TypeError('Failed to fetch'); });
        const b = await requestPasswordReset('unknown@example.com');
        expect(a).toEqual(b);
    });

    it('bite control: the fetch double really is being exercised', async () => {
        // Without this, every "resolves to undefined" case above would also pass
        // against a function that did nothing at all.
        const spy = mockFetch(() => ok());
        await requestPasswordReset('a@example.com');
        await requestPasswordReset('b@example.com');
        expect(spy).toHaveBeenCalledTimes(2);
    });

    // --- nothing sensitive is written anywhere --------------------------------
    it('logs neither the address nor any token', async () => {
        mockFetch(() => ({ ok: true, status: 200, json: async () => ({ token: 'super-secret-token' }) }));
        await requestPasswordReset('leak-canary@example.com');
        const flat = JSON.stringify(logs);
        expect(flat).not.toContain('leak-canary@example.com');
        expect(flat).not.toContain('super-secret-token');
        expect(logs).toHaveLength(0);
    });

    it('writes nothing to localStorage', async () => {
        mockFetch(() => ok());
        const before = { ...localStorage };
        await requestPasswordReset('someone@example.com');
        expect({ ...localStorage }).toEqual(before);
    });

    it('an error thrown by fetch never escapes to the caller', async () => {
        mockFetch(() => { throw new Error('boom'); });
        await expect(requestPasswordReset('someone@example.com')).resolves.toBeUndefined();
    });
});
