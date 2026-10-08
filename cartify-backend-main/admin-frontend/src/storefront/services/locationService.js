import { feedService } from './feedService';

// Free, no-key reverse geocoding (OpenStreetMap Nominatim). Best-effort only —
// callers must fall back to the manual city picker if this fails or is denied.
export const reverseGeocodeAddress = async (latitude, longitude) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Reverse geocoding failed');
    const data = await res.json();
    const address = data.address || {};
    return {
        city: address.city || address.town || address.municipality || address.county || address.state || null,
        state: address.state || address.region || null,
        country: address.country || null,
    };
};

export const reverseGeocodeCity = async (latitude, longitude) => {
    const { city } = await reverseGeocodeAddress(latitude, longitude);
    return city;
};

export const getCurrentPosition = () =>
    new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            (err) => reject(err),
            { timeout: 8000, maximumAge: 10 * 60 * 1000 }
        );
    });

// Distinct vendor cities, sourced from real data rather than a hardcoded list.
export const getAvailableCities = async () => {
    const data = await feedService.getCategoriesAndVendors();
    const cities = (data.vendors || [])
        .map((v) => v.city)
        .filter(Boolean)
        .map((c) => c.trim());
    return [...new Set(cities)].sort();
};
