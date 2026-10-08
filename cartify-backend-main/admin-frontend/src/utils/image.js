// Canonical resolver for backend-relative media paths (product/vendor/customer images).
// Consolidates the ~5 slightly-different copies that used to live in individual pages.
export const getImageUrl = (imagePath) => {
    if (!imagePath) return '';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath;
    }
    const backendUrl = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/\/?api\/?$/, '')
        : 'https://cartifyapi.dbitsdemo.com/api';
    return `${backendUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};
