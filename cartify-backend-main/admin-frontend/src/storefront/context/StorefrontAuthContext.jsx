import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { SF_SESSION_KEYS } from '../config/session';
import { SESSION_TIMEOUT, SESSION_KEYS } from '../../config/session';
import { getDeviceId } from '../utils/deviceId';
import { guestService } from '../services/guestService';
import { authService } from '../../services/authService';
import { normalizeRole, canAccessDashboard } from '../utils/authState';

const StorefrontAuthContext = createContext();

export const useStorefrontAuth = () => useContext(StorefrontAuthContext);

export const StorefrontAuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem(SF_SESSION_KEYS.USER);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    });
    const [token, setToken] = useState(() => localStorage.getItem(SF_SESSION_KEYS.AUTH_TOKEN) || null);
    const [expiresAt, setExpiresAt] = useState(() => Number(localStorage.getItem(SF_SESSION_KEYS.EXPIRES_AT) || 0) || null);
    const [phoneVerified, setPhoneVerified] = useState(
        () => localStorage.getItem(SF_SESSION_KEYS.PHONE_VERIFIED) === 'true'
    );
    const [city, setCityState] = useState(() => localStorage.getItem(SF_SESSION_KEYS.CITY) || '');

    const syncFromStorage = useCallback(() => {
        try {
            const storedToken = localStorage.getItem(SESSION_KEYS.AUTH_TOKEN);
            const storedUser = localStorage.getItem(SESSION_KEYS.USER);
            const storedExpires = Number(localStorage.getItem(SESSION_KEYS.EXPIRES_AT) || 0) || null;
            if (storedToken) {
                setToken(storedToken);
                if (storedExpires) {
                    setExpiresAt(storedExpires);
                }
            } else {
                setToken(null);
                setExpiresAt(null);
            }

            if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
            } else {
                setUser(null);
            }

            const phoneFlag = localStorage.getItem(SF_SESSION_KEYS.PHONE_VERIFIED) === 'true';
            setPhoneVerified(phoneFlag);
        } catch (e) {
            setToken(null);
            setExpiresAt(null);
            setUser(null);
        }
    }, []);

    // Pending action awaiting a phone number (e.g. "open this product").
    const [pendingAction, setPendingAction] = useState(null);
    const [phoneGateOpen, setPhoneGateOpen] = useState(false);

    const setCity = useCallback((value) => {
        setCityState(value);
        if (value) localStorage.setItem(SF_SESSION_KEYS.CITY, value);
        else localStorage.removeItem(SF_SESSION_KEYS.CITY);
    }, []);

    const persistIdentity = useCallback((data) => {
        const normalizedUser = {
            ...(data.user || {}),
            id: data.user_id ?? data.user?.id ?? data.id,
            role: normalizeRole(data.role ?? data.user?.role),
            mobile_number: data.mobile_number ?? data.user?.mobile_number,
            username: data.username ?? data.user?.username ?? data.user?.email ?? 'Account',
        };
        if (data.token) {
            const loginTs = Date.now();
            const expires = loginTs + SESSION_TIMEOUT;
            localStorage.setItem(SF_SESSION_KEYS.AUTH_TOKEN, data.token);
            localStorage.setItem(SF_SESSION_KEYS.LOGIN_TS, String(loginTs));
            localStorage.setItem(SF_SESSION_KEYS.EXPIRES_AT, String(expires));
            setToken(data.token);
            setExpiresAt(expires);
        }
        setUser(normalizedUser);
        localStorage.setItem(SF_SESSION_KEYS.USER, JSON.stringify(normalizedUser));
        setPhoneVerified(true);
        localStorage.setItem(SF_SESSION_KEYS.PHONE_VERIFIED, 'true');
        window.dispatchEvent(new Event('auth:state-changed'));
    }, []);

    // Called once a valid PK/IN phone number has been collected via PhoneGateModal.
    const verifyPhone = useCallback(async (mobileNumber) => {
        const data = await guestService.guestLogin({ mobileNumber, city });
        persistIdentity(data);
        return data;
    }, [city]);

    const convertToCustomer = useCallback(async (payload) => {
        const data = await guestService.convertGuest(payload);
        persistIdentity(data);
        return data;
    }, [persistIdentity]);

    const registerVendor = useCallback(async (formData) => {
        const data = await authService.register(formData);
        persistIdentity(data);
        return data;
    }, [persistIdentity]);

    const login = useCallback(async (usernameOrEmail, password) => {
        const data = await authService.login({ username_or_email: usernameOrEmail, password });
        persistIdentity({
            ...data,
            user: data.user || null,
            role: data.role ?? data.user?.role,
        });
        return data;
    }, [persistIdentity]);

    const logout = useCallback(() => {
        try {
            localStorage.removeItem(SESSION_KEYS.AUTH_TOKEN);
            localStorage.removeItem(SESSION_KEYS.USER);
            localStorage.removeItem(SESSION_KEYS.REFRESH_TOKEN);
            localStorage.removeItem(SESSION_KEYS.EXPIRES_AT);
            localStorage.removeItem(SESSION_KEYS.LOGIN_TS);
        } catch (e) {}

        localStorage.removeItem(SF_SESSION_KEYS.AUTH_TOKEN);
        localStorage.removeItem(SF_SESSION_KEYS.USER);
        localStorage.removeItem(SF_SESSION_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(SF_SESSION_KEYS.EXPIRES_AT);
        localStorage.removeItem(SF_SESSION_KEYS.LOGIN_TS);
        localStorage.removeItem(SF_SESSION_KEYS.PHONE_VERIFIED);
        setToken(null);
        setExpiresAt(null);
        setUser(null);
        setPhoneVerified(false);
        window.dispatchEvent(new Event('auth:state-changed'));
    }, []);

    const updateUserProfile = useCallback((updatedUser) => {
        const nextUser = {
            ...(user || {}),
            ...(updatedUser || {}),
            id: updatedUser?.id ?? updatedUser?.user_id ?? user?.id,
            role: updatedUser?.role ?? user?.role,
            username: updatedUser?.username ?? updatedUser?.user?.username ?? user?.username ?? 'Account',
            email: updatedUser?.email ?? updatedUser?.user?.email ?? user?.email,
            first_name: updatedUser?.first_name ?? updatedUser?.user?.first_name ?? user?.first_name,
            last_name: updatedUser?.last_name ?? updatedUser?.user?.last_name ?? user?.last_name,
            mobile_number: updatedUser?.mobile_number ?? updatedUser?.user?.mobile_number ?? user?.mobile_number,
        };
        setUser(nextUser);
        localStorage.setItem(SF_SESSION_KEYS.USER, JSON.stringify(nextUser));
        window.dispatchEvent(new Event('auth:state-changed'));
    }, [user]);

    // Gate any click-through action (opening a product) behind a verified phone number.
    const requirePhone = useCallback((action) => {
        if (phoneVerified) {
            action();
            return;
        }
        setPendingAction(() => action);
        setPhoneGateOpen(true);
    }, [phoneVerified]);

    const resolvePhoneGate = useCallback(async (mobileNumber) => {
        await verifyPhone(mobileNumber);
        setPhoneGateOpen(false);
        if (pendingAction) {
            pendingAction();
            setPendingAction(null);
        }
    }, [verifyPhone, pendingAction]);

    const closePhoneGate = useCallback(() => {
        setPhoneGateOpen(false);
        setPendingAction(null);
    }, []);

    useEffect(() => {
        // Ensure a device id exists as soon as the storefront mounts.
        getDeviceId();
        syncFromStorage();
    }, [syncFromStorage]);

    useEffect(() => {
        const handleAuthChange = () => syncFromStorage();
        window.addEventListener('auth:state-changed', handleAuthChange);
        window.addEventListener('storage', handleAuthChange);

        // Bfcache: on back/forward navigation the browser can restore this
        // page straight from memory with whatever auth state was frozen at
        // the time, even if the user logged out in another tab/page since.
        // Re-sync from localStorage whenever that happens.
        const handlePageShow = (event) => {
            if (event.persisted) syncFromStorage();
        };
        window.addEventListener('pageshow', handlePageShow);

        return () => {
            window.removeEventListener('auth:state-changed', handleAuthChange);
            window.removeEventListener('storage', handleAuthChange);
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, [syncFromStorage]);

    useEffect(() => {
        if (!token || !expiresAt) return;
        const timer = window.setTimeout(() => {
            logout();
        }, Math.max(0, expiresAt - Date.now()));

        return () => window.clearTimeout(timer);
    }, [expiresAt, logout, token]);

    const isAuthenticated = !!token && !!expiresAt && Date.now() < expiresAt;
    const normalizedRole = normalizeRole(user?.role);

    const value = {
        user,
        token,
        isAuthenticated,
        isCustomer: normalizedRole === 'CUSTOMER',
        isVendor: normalizedRole === 'VENDOR',
        isGuest: normalizedRole === 'ANONYMOUS',
        canAccessDashboard: canAccessDashboard(normalizedRole),
        phoneVerified,
        city,
        setCity,
        requirePhone,
        phoneGateOpen,
        resolvePhoneGate,
        closePhoneGate,
        convertToCustomer,
        registerVendor,
        login,
        logout,
        updateUserProfile,
    };

    return (
        <StorefrontAuthContext.Provider value={value}>
            {children}
        </StorefrontAuthContext.Provider>
    );
};
