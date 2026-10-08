import axios from 'axios';
import { SF_SESSION_KEYS } from '../config/session';
import { getDeviceId } from '../utils/deviceId';

// Deliberately separate from services/api.js: the admin axios instance auto-attaches
// the ADMIN/VENDOR bearer token from localStorage, which must never leak into guest/
// customer storefront calls (an admin browsing the storefront in the same browser
// should never have their views/favorites/cart attributed to their admin account).
const storefrontApi = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

storefrontApi.interceptors.request.use((config) => {
    config.headers = config.headers || {};
    config.headers['X-Device-Id'] = getDeviceId();

    const token = localStorage.getItem(SF_SESSION_KEYS.AUTH_TOKEN);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

storefrontApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            try {
                localStorage.removeItem(SF_SESSION_KEYS.AUTH_TOKEN);
                localStorage.removeItem(SF_SESSION_KEYS.USER);
            } catch (e) {}
        }
        return Promise.reject(error);
    }
);

export default storefrontApi;
