export const getApiBaseUrl = () => {
    const configuredUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';
    const trimmedUrl = configuredUrl.replace(/\/+$/, '');
    return trimmedUrl.endsWith('/api/v1') ? trimmedUrl : `${trimmedUrl}/api/v1`;
};

export const apiUrl = (path = '') => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${getApiBaseUrl()}${cleanPath}`;
};

export const wsApiUrl = (path = '') => {
    return apiUrl(path).replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
};
