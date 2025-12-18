// Check if we're in demo mode (no valid Firebase config)
export const IS_DEMO_MODE =
    !import.meta.env.VITE_FIREBASE_API_KEY ||
    import.meta.env.VITE_FIREBASE_API_KEY === 'demo-key';
