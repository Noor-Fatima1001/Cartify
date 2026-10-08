import React from 'react';
import Modal from './Modal';
import { useAuth } from '../../context/AuthContext';

const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
};

const SessionExpiryModal = () => {
    const { showExpiryWarning, secondsRemaining, staySignedIn, dismissExpiryWarning, logout } = useAuth();

    if (!showExpiryWarning) return null;

    return (
        <Modal isOpen={showExpiryWarning} onClose={dismissExpiryWarning} title="Session expiring soon" maxWidth="440px">
            <div style={{ padding: '1rem' }}>
                <p style={{ color: 'var(--dash-ink-soft)', marginBottom: '0.5rem' }}>
                    You've been inactive for a while. For your security, you'll be signed out in:
                </p>
                <p style={{ fontSize: '1.8rem', fontWeight: 700, textAlign: 'center', margin: '0.75rem 0' }}>
                    {formatTime(secondsRemaining)}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                    <button className="btn btn-secondary" onClick={logout}>
                        Log out now
                    </button>
                    <button className="btn btn-primary" onClick={staySignedIn}>
                        Stay signed in
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SessionExpiryModal;
