import React, { createContext, useContext, useState, useCallback } from 'react';

const StorefrontToastContext = createContext();

export const useStorefrontToast = () => useContext(StorefrontToastContext);

export const StorefrontToastProvider = ({ children }) => {
    const [toast, setToast] = useState({ message: '', visible: false });

    const showToast = useCallback((message) => {
        setToast({ message, visible: true });
        setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 2400);
    }, []);

    return (
        <StorefrontToastContext.Provider value={{ showToast }}>
            {children}
            <div className={`sf-toast ${toast.visible ? 'show' : ''}`}>{toast.message}</div>
        </StorefrontToastContext.Provider>
    );
};
