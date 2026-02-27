export const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://crm.merkazneshama.co.il';

// Legacy static token — used only as fallback when OAuth is not configured
export const DIRECTUS_STATIC_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

// Demo mode: explicit flag OR no token and no OAuth configured
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

// Auth mode: 'oauth' when no static token (production), 'static' when token is set (legacy)
export const AUTH_MODE: 'oauth' | 'static' | 'demo' =
  IS_DEMO_MODE ? 'demo' :
  DIRECTUS_STATIC_TOKEN ? 'static' :
  'oauth';
