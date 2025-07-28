// Environment configuration for VPS deployment with Nginx
const getApiBaseUrl = (): string => {
    // Check for explicit API URL (for external APIs)
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }

    // In production, use relative URLs (Nginx will proxy /api to backend)
    if (import.meta.env.PROD) {
        return '';  // Empty string for relative URLs like /api/employees
    }

    // Development fallback - direct backend connection
    return 'http://localhost:5000';
};

export const API_BASE_URL = getApiBaseUrl();

// Helper to determine if we should use relative URLs
export const useRelativeUrls = () => import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL;

export const config = {
    apiBaseUrl: API_BASE_URL,
    isDevelopment: import.meta.env.DEV,
    isProduction: import.meta.env.PROD,
    useRelativeUrls: useRelativeUrls(),
} as const;