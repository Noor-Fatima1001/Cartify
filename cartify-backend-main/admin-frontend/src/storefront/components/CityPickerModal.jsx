import React, { useEffect, useState } from 'react';
import { MapPin, LocateFixed, Search } from 'lucide-react';
import Modal from './Modal';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { getAvailableCities, getCurrentPosition, reverseGeocodeCity } from '../services/locationService';

const CityPickerModal = ({ isOpen, onClose }) => {
    const { setCity } = useStorefrontAuth();
    const [cities, setCities] = useState([]);
    const [query, setQuery] = useState('');
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        getAvailableCities().then(setCities).catch(() => setCities([]));
    }, [isOpen]);

    if (!isOpen) return null;

    const handleUseLocation = async () => {
        setLocating(true);
        setError('');
        try {
            const { latitude, longitude } = await getCurrentPosition();
            const detected = await reverseGeocodeCity(latitude, longitude);
            if (detected) {
                setCity(detected);
                onClose();
            } else {
                setError('Could not detect your city — please choose one below.');
            }
        } catch (err) {
            setError('Location access was denied — please choose your city below.');
        } finally {
            setLocating(false);
        }
    };

    const handlePick = (city) => {
        setCity(city);
        onClose();
    };

    const filtered = cities.filter((c) => c.toLowerCase().includes(query.toLowerCase()));

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="sf-modal-title">Choose your city</div>
            <div className="sf-modal-sub">We'll show you products from vendors near you.</div>

            <button className="sf-btn sf-btn-dark sf-btn-block" onClick={handleUseLocation} disabled={locating}>
                <LocateFixed size={16} />
                {locating ? 'Detecting your location...' : 'Use my current location'}
            </button>

            {error && <div className="sf-form-error" style={{ marginTop: 14 }}>{error}</div>}

            <div className="sf-field" style={{ marginTop: 18 }}>
                <label htmlFor="sf-city-search">
                    <Search size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Or search a city
                </label>
                <input
                    id="sf-city-search"
                    type="text"
                    placeholder="Search city"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>

            <div className="sf-city-list">
                {filtered.map((c) => (
                    <button key={c} onClick={() => handlePick(c)}>
                        <MapPin size={13} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.6 }} />
                        {c}
                    </button>
                ))}
                {filtered.length === 0 && <div className="sf-empty" style={{ padding: '12px 0' }}>No matching cities</div>}
            </div>
        </Modal>
    );
};

export default CityPickerModal;
