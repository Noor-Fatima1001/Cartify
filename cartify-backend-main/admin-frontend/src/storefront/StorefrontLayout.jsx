import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useStorefrontAuth } from './context/StorefrontAuthContext';
import { getCurrentPosition, reverseGeocodeCity } from './services/locationService';
import Header from './components/Header';
import PhoneGateModal from './components/PhoneGateModal';
import './styles/storefront.css';

const StorefrontLayout = () => {
    const { city, setCity } = useStorefrontAuth();

    useEffect(() => {
        if (city) return;
        // Silent best-effort geolocation on first visit; if denied/unavailable the
        // header's "Choose city" pill remains the manual fallback.
        (async () => {
            try {
                const { latitude, longitude } = await getCurrentPosition();
                const detected = await reverseGeocodeCity(latitude, longitude);
                if (detected) setCity(detected);
            } catch (e) {
                // Silent — user can pick manually via the header.
            }
        })();
    }, [city, setCity]);

    return (
        <div className="sf-root">
            <Header />
            <Outlet />
            <footer className="sf-footer">Cartify — discover products from vendors near you.</footer>
            <PhoneGateModal />
        </div>
    );
};

export default StorefrontLayout;
