import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, maxWidth = '540px', contentClassName }) => {
    if (!isOpen) return null;

    return (
        <div className="modal" style={{ display: 'flex' }}>
            <div className={`modal-content ${contentClassName || ''}`} style={{ maxWidth }}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <X className="close-modal" onClick={onClose} />
                </div>
                {children}
            </div>
        </div>
    );
};

export default Modal;
