import React, { createContext, useContext, useState, useCallback } from 'react';
import '../styles/dashboard.css'; // Toast styles are here

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState({ message: '', type: '', visible: false });

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type, visible: true });
        setTimeout(() => {
            setToast((prev) => ({ ...prev, visible: false }));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className={`toast toast-${toast.type} ${toast.visible ? 'show' : ''}`}>
                {toast.message}
            </div>
        </ToastContext.Provider>
    );
};
