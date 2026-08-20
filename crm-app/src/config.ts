export const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://crm.merkazneshama.co.il';

// Demo mode: explicit flag only
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

// Auth mode. The legacy 'static' mode read a shared Directus token from
// VITE_DIRECTUS_TOKEN, which Vite inlines into the client bundle — i.e. it
// shipped a credential to every browser. It was removed (2026-08-20); the
// only credential the client ever holds now is the per-user OAuth token
// obtained at login. 'static' remains in the union solely so the unreachable
// legacy branches still type-check; nothing can produce it.
export const AUTH_MODE: 'oauth' | 'static' | 'demo' =
  IS_DEMO_MODE ? 'demo' : 'oauth';
