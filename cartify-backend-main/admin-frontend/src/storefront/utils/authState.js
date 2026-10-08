export const normalizeRole = (role) => {
    if (!role) return '';
    return String(role).toUpperCase();
};

export const canAccessDashboard = (role) => {
    const normalized = normalizeRole(role);
    return normalized === 'ADMIN' || normalized === 'VENDOR';
};
