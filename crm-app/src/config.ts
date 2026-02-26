export const DIRECTUS_URL = import.meta.env.VITE_DIRECTUS_URL || 'https://crm.merkazneshama.co.il';
export const DIRECTUS_TOKEN = import.meta.env.VITE_DIRECTUS_TOKEN || '';

// Demo mode when no Directus token is configured
export const IS_DEMO_MODE = !DIRECTUS_TOKEN;
