import React, { useState } from 'react';
import { Smartphone } from 'lucide-react';
import Modal from './Modal';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { isValidPhone } from '../utils/phoneValidation';

const PhoneGateModal = () => {
    const { phoneGateOpen, closePhoneGate, resolvePhoneGate } = useStorefrontAuth();
    const [phone, setPhone] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!phoneGateOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isValidPhone(phone)) {
            setError('Enter a valid Pakistani (03XXXXXXXXX) or Indian (9XXXXXXXXX) mobile number.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await resolvePhoneGate(phone);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not verify that number. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={phoneGateOpen} onClose={closePhoneGate}>
            <div className="sf-modal-title">One quick step</div>
            <div className="sf-modal-sub">
                Share your mobile number to view product details. We only ask once — after this, browsing is seamless.
            </div>
            {error && <div className="sf-form-error">{error}</div>}
            <form onSubmit={handleSubmit}>
                <div className="sf-field">
                    <label htmlFor="sf-phone">Mobile number</label>
                    <input
                        id="sf-phone"
                        type="tel"
                        placeholder="03XXXXXXXXX or 9XXXXXXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoFocus
                    />
                </div>
                <button type="submit" className="sf-btn sf-btn-primary sf-btn-block" disabled={loading}>
                    <Smartphone size={16} />
                    {loading ? 'Verifying...' : 'Continue'}
                </button>
            </form>
        </Modal>
    );
};

export default PhoneGateModal;
