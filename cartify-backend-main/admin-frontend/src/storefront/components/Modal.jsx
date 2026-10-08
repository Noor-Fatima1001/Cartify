import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;
    return (
        <div className="sf-modal-overlay" onClick={onClose}>
            <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
                {onClose && (
                    <button className="sf-modal-close" onClick={onClose} aria-label="Close">
                        <X size={16} />
                    </button>
                )}
                {children}
            </div>
        </div>
    );
};

export default Modal;
