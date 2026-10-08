// Mirrors the backend patterns in app/auth/views.py:guest_login
const PK_PATTERN = /^(\+92|0)?3\d{9}$/;
const IN_PATTERN = /^(\+91|0)?[6-9]\d{9}$/;

export const normalizePhone = (raw) => (raw || '').trim().replace(/[\s-]/g, '');

export const isValidPhone = (raw) => {
    const value = normalizePhone(raw);
    return PK_PATTERN.test(value) || IN_PATTERN.test(value);
};

export const detectCountry = (raw) => {
    const value = normalizePhone(raw);
    if (PK_PATTERN.test(value)) return 'PK';
    if (IN_PATTERN.test(value)) return 'IN';
    return null;
};
