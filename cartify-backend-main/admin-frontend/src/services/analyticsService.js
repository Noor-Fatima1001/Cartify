import api from './api';

export const analyticsService = {
    getAdminAnalytics: async () => {
        const response = await api.get('marketplace/admin/analytics/');
        return response.data;
    },

    getProductAnalytics: async (productId) => {
        const response = await api.get(`marketplace/products/${productId}/analytics/`);
        return response.data;
    },

    exportData: async (reportType) => {
        const response = await api.get(`marketplace/admin/export/${reportType}/`, {
            responseType: 'blob'
        });
        return response.data;
    },

    getAdminDetailedViews: async (params = {}) => {
        const response = await api.get('marketplace/admin/analytics/views/', { params });
        return response.data;
    },

    getAdminDetailedFavorites: async (params = {}) => {
        const response = await api.get('marketplace/admin/analytics/favorites/', { params });
        return response.data;
    },

    getAdminDetailedClicks: async (params = {}) => {
        const response = await api.get('marketplace/admin/analytics/clicks/', { params });
        return response.data;
    },

    getAdminMergedAnalytics: async (params = {}) => {
        const response = await api.get('marketplace/admin/analytics/merged/', { params });
        return response.data;
    },

    getVendorDetailedViews: async (params = {}) => {
        const response = await api.get('marketplace/vendor/analytics/views/', { params });
        return response.data;
    },

    getVendorDetailedFavorites: async (params = {}) => {
        const response = await api.get('marketplace/vendor/analytics/favorites/', { params });
        return response.data;
    },

    getVendorDetailedClicks: async (params = {}) => {
        const response = await api.get('marketplace/vendor/analytics/clicks/', { params });
        return response.data;
    },

    getVendorMergedAnalytics: async (params = {}) => {
        const response = await api.get('marketplace/vendor/analytics/merged/', { params });
        return response.data;
    },

    getVendorDetailedCart: async (params = {}) => {
        const response = await api.get('marketplace/vendor/analytics/cart/', { params });
        return response.data;
    },

    getAdminDetailedCart: async (params = {}) => {
        const response = await api.get('marketplace/admin/analytics/cart/', { params });
        return response.data;
    }
};

