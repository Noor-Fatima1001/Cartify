import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { authService } from '../services/authService';
import { SESSION_TIMEOUT, SESSION_WARNING_BEFORE, SESSION_ACTIVITY_EXTEND_INTERVAL, SESSION_KEYS } from '../config/session';

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showExpiryWarning, setShowExpiryWarning] = useState(false);
    const [secondsRemaining, setSecondsRemaining] = useState(0);
    const timeoutRef = useRef(null);
    const warningTimeoutRef = useRef(null);
    const countdownIntervalRef = useRef(null);
    const lastActivityExtendRef = useRef(0);

    const clearAuth = (options = {}) => {
        const emitEvent = options.emitEvent ?? true;
        try {
            localStorage.removeItem(SESSION_KEYS.AUTH_TOKEN);
            localStorage.removeItem(SESSION_KEYS.REFRESH_TOKEN);
            localStorage.removeItem(SESSION_KEYS.USER);
            localStorage.removeItem(SESSION_KEYS.EXPIRES_AT);
            localStorage.removeItem(SESSION_KEYS.LOGIN_TS);
        } catch (e) {}

        setToken(null);
        setUser(null);
        setExpiresAt(null);
        setShowExpiryWarning(false);
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (warningTimeoutRef.current) {
            clearTimeout(warningTimeoutRef.current);
            warningTimeoutRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        if (emitEvent) {
            window.dispatchEvent(new Event('auth:state-changed'));
        }
    };

    const handleSessionExpiry = async () => {
        // Last-chance check before tearing the session down: a sibling tab
        // may have already extended this same token (propagated here via the
        // 'storage' listener below) but this tab's own timer fired first on
        // a stale schedule. Confirm the backend actually considers the token
        // dead before logging out — if it's still valid, resync from
        // localStorage and reschedule instead.
        try {
            const data = await authService.checkUser();
            if (data?.user) {
                const storedExpires = Number(localStorage.getItem(SESSION_KEYS.EXPIRES_AT) || 0);
                const freshExpiresAt = storedExpires && storedExpires > Date.now() ? storedExpires : Date.now() + SESSION_TIMEOUT;
                localStorage.setItem(SESSION_KEYS.EXPIRES_AT, String(freshExpiresAt));
                setExpiresAt(freshExpiresAt);
                scheduleTimeout(freshExpiresAt);
                return;
            }
        } catch {
            // Token really is invalid/expired server-side — proceed to log out.
        }

        try {
            await authService.logout();
        } catch {
            // Token may already be dead server-side (or the request failed) —
            // nothing more to clean up remotely; still clear local state below.
        }
        clearAuth();
        window.location.href = '/admin/login';
    };

    const scheduleWarning = (targetExpiresAt) => {
        if (warningTimeoutRef.current) {
            clearTimeout(warningTimeoutRef.current);
            warningTimeoutRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        setShowExpiryWarning(false);

        const msUntilWarning = targetExpiresAt - SESSION_WARNING_BEFORE - Date.now();

        const startCountdown = () => {
            setShowExpiryWarning(true);
            setSecondsRemaining(Math.max(0, Math.round((targetExpiresAt - Date.now()) / 1000)));
            countdownIntervalRef.current = setInterval(() => {
                const remaining = Math.max(0, Math.round((targetExpiresAt - Date.now()) / 1000));
                setSecondsRemaining(remaining);
                if (remaining <= 0 && countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
            }, 1000);
        };

        if (msUntilWarning <= 0) {
            startCountdown();
            return;
        }

        warningTimeoutRef.current = setTimeout(startCountdown, msUntilWarning);
    };

    const scheduleTimeout = (targetExpiresAt) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        const ms = targetExpiresAt - Date.now();
        if (ms <= 0) {
            handleSessionExpiry();
            return;
        }

        timeoutRef.current = setTimeout(() => {
            handleSessionExpiry();
        }, ms);

        scheduleWarning(targetExpiresAt);
    };

    const extendSession = useCallback(async () => {
        try {
            // The backend call pushes the underlying AuthToken's own (much
            // longer) expiry forward so the credential doesn't die mid-session
            // — but the *local* UX inactivity deadline is deliberately a
            // fresh SESSION_TIMEOUT from now, not the server's raw token TTL.
            // Using the server value here previously made the visible
            // "2 hours of inactivity" policy meaningless after the first
            // activity of a session (see FRONTEND_GUIDELINES.md rule 9b).
            await authService.extendSession();
            const newExpiresAt = Date.now() + SESSION_TIMEOUT;

            localStorage.setItem(SESSION_KEYS.EXPIRES_AT, String(newExpiresAt));
            setExpiresAt(newExpiresAt);
            scheduleTimeout(newExpiresAt);
            return true;
        } catch (err) {
            // Token already expired/invalid server-side — let the axios 401
            // interceptor or the existing hard timeout handle logging out.
            return false;
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            const storedToken = localStorage.getItem(SESSION_KEYS.AUTH_TOKEN);
            const storedUser = localStorage.getItem(SESSION_KEYS.USER);
            const storedExpires = Number(localStorage.getItem(SESSION_KEYS.EXPIRES_AT) || 0);

            if (storedToken && storedUser) {
                if (storedExpires && Date.now() >= storedExpires) {
                    clearAuth({ emitEvent: false });
                    window.location.href = '/admin/login';
                    return;
                }

                setToken(storedToken);
                setUser(JSON.parse(storedUser));
                setExpiresAt(storedExpires || (Date.now() + SESSION_TIMEOUT));

                const effectiveExpires = storedExpires || (Date.now() + SESSION_TIMEOUT);
                scheduleTimeout(effectiveExpires);

                try {
                    const data = await authService.checkUser();
                    if (data?.user) {
                        setUser(data.user);
                        localStorage.setItem(SESSION_KEYS.USER, JSON.stringify(data.user));
                    }
                } catch (err) {
                    console.debug('Silent user check failed (ignored):', err?.message || err);
                }
            } else {
                clearAuth({ emitEvent: false });
            }

            setLoading(false);
        };

        init();
        window.addEventListener('auth:state-changed', init);
        window.addEventListener('storage', init);

        // Bfcache: the browser can restore a previous page (e.g. the vendor
        // dashboard) straight from memory on back/forward navigation, with
        // whatever auth state was in React at the time it was frozen — even
        // if the user logged out in between. Re-check localStorage whenever
        // that happens so a stale "still logged in" view can't survive it.
        const handlePageShow = (event) => {
            if (event.persisted) init();
        };
        window.addEventListener('pageshow', handlePageShow);

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            window.removeEventListener('auth:state-changed', init);
            window.removeEventListener('storage', init);
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, []);

    const login = async (username_or_email, password, portal) => {
        try {
            const payload = { username_or_email, password };
            if (portal) payload.portal = portal;
            const response = await authService.login(payload);
            const { token: newToken, refresh_token, user: loggedUser } = response;

            if (!newToken || !loggedUser) {
                return { success: false, error: 'Invalid login response from server.' };
            }
            if (loggedUser.role !== 'ADMIN' && loggedUser.role !== 'VENDOR') {
                return { success: false, error: 'Access denied. Unauthorized role.' };
            }

            const loginTs = Date.now();
            const expires = loginTs + SESSION_TIMEOUT;

            localStorage.setItem(SESSION_KEYS.AUTH_TOKEN, newToken);
            if (refresh_token) {
                localStorage.setItem(SESSION_KEYS.REFRESH_TOKEN, refresh_token);
            }
            localStorage.setItem(SESSION_KEYS.USER, JSON.stringify(loggedUser));
            localStorage.setItem(SESSION_KEYS.LOGIN_TS, String(loginTs));
            localStorage.setItem(SESSION_KEYS.EXPIRES_AT, String(expires));
            window.dispatchEvent(new Event('auth:state-changed'));

            setToken(newToken);
            setUser(loggedUser);
            setExpiresAt(expires);

            scheduleTimeout(expires);

            return { success: true, role: loggedUser.role };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: error.response?.data?.error || error.response?.data?.detail || 'Login failed. Please check your credentials.',
            };
        }
    };

    const logout = async () => {
        try {
            await authService.logout();
        } catch {
            // Backend call failed (network hiccup, or token already dead) —
            // still clear local state below so the user isn't stuck appearing
            // logged in on a client that just asked to log out.
        }
        // Only an explicit logout should drop this — it's the storefront's
        // "this device already gave us a phone number" gate, and it must
        // outlive routine session-expiry/init cleanup (those run on every
        // page load for any ordinary customer) or every guest would get
        // re-prompted on every visit. Cleared before clearAuth() fires its
        // 'auth:state-changed' event so listeners re-sync to the final state.
        try {
            localStorage.removeItem(SESSION_KEYS.PHONE_VERIFIED);
        } catch (e) {}
        clearAuth();
        const currentPath = window.location.pathname;
        if (currentPath.startsWith('/admin')) {
            window.location.href = '/';
        } else {
            window.location.href = '/admin/login';
        }
    };

    // Sliding session: any real interaction while logged in pushes the expiry
    // forward server-side, throttled so we don't hit the API on every click.
    useEffect(() => {
        if (!token) return undefined;

        const handleActivity = () => {
            const now = Date.now();
            if (now - lastActivityExtendRef.current < SESSION_ACTIVITY_EXTEND_INTERVAL) return;
            lastActivityExtendRef.current = now;
            extendSession();
        };

        ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
        return () => {
            ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
        };
    }, [token, extendSession]);

    const staySignedIn = async () => {
        lastActivityExtendRef.current = Date.now();
        await extendSession();
    };

    const dismissExpiryWarning = () => {
        setShowExpiryWarning(false);
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
    };

    const updateUser = (updatedFields) => {
        setUser(prev => {
            if (!prev) return null;
            const updated = { ...prev, ...updatedFields };
            try { localStorage.setItem(SESSION_KEYS.USER, JSON.stringify(updated)); } catch (e) {}
            return updated;
        });
    };

    const isAuthenticated = !!token && !!expiresAt && Date.now() < expiresAt;

    const value = {
        user,
        token,
        login,
        logout,
        updateUser,
        isAuthenticated,
        loading,
        showExpiryWarning,
        secondsRemaining,
        staySignedIn,
        dismissExpiryWarning,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
