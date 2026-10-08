import axios from 'axios';
import { SESSION_KEYS } from '../config/session';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem(SESSION_KEYS.AUTH_TOKEN);
        config.headers = config.headers || {};

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
            delete config.headers['content-type'];
            if (config.headers.common) {
                delete config.headers.common['Content-Type'];
                delete config.headers.common['content-type'];
            }
            if (config.headers.post) {
                delete config.headers.post['Content-Type'];
                delete config.headers.post['content-type'];
            }
        }

        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {

        const status = error.response?.status;
        // Allow authentication errors from the login endpoint to propagate
        // so the login page can display server-provided messages (e.g. blocked/deactivated).
        const requestUrl = error.config?.url || '';
        const isLoginRequest = requestUrl.includes('auth/login');

        if (status === 401) {
            if (isLoginRequest) {
                return Promise.reject(error);
            }

            const isAdminRoute = window.location.pathname.startsWith('/admin');

            try {
                localStorage.removeItem(SESSION_KEYS.AUTH_TOKEN);
                localStorage.removeItem(SESSION_KEYS.REFRESH_TOKEN);
                localStorage.removeItem(SESSION_KEYS.USER);
                localStorage.removeItem(SESSION_KEYS.EXPIRES_AT);
                localStorage.removeItem(SESSION_KEYS.LOGIN_TS);
            } catch (e) {}

            // Only force-navigate when the admin token itself failed on an admin
            // route. A storefront visitor's public/guest calls never carry an
            // admin token, so this must not yank them out of their shopping flow.
            if (isAdminRoute) {
                window.location.href = '/admin/login';
            }

            return Promise.reject({ isAuthError: true, message: 'Session expired or unauthorized' });
        }

        if (status === 403) {
            // 403 means authorized but not permitted - let the calling code handle it
            return Promise.reject(error);
        }

        return Promise.reject(error);
    }
);

export default api;