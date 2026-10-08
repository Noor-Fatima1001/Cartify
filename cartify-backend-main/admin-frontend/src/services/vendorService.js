import api from './api';

export const vendorService = {
    // Admin methods
    getVendors: async (params = {}) => {
        const response = await api.get('marketplace/admin/vendors/', { params });
        return response.data;
    },

    getVendorDetail: async (id) => {
        const response = await api.get(`marketplace/admin/vendors/${id}/`);
        return response.data;
    },

    createVendor: async (vendorData) => {
        const response = await api.post('marketplace/admin/create-vendor/', vendorData);
        return response.data;
    },

    updateVendor: async (vendorId, vendorData) => {
        const response = await api.patch(`marketplace/admin/vendors/${vendorId}/edit/`, vendorData);
        return response.data;
    },

    approveVendor: async (vendorId, status, reason = '') => {
        const response = await api.post('marketplace/admin/approve-vendor/', {
            vendor_id: vendorId,
            status: status, // 'APPROVED' or 'REJECTED'
            reason: reason
        });
        return response.data;
    },

    toggleVendorStatus: async (id) => {
        const response = await api.post(`marketplace/admin/vendors/${id}/toggle/`);
        return response.data;
    },

    deleteVendor: async (id) => {
        const response = await api.delete(`marketplace/admin/vendors/${id}/delete/`);
        return response.data;
    },

    assignVendorCategories: async (vendorId, categoryIds, disabledSubcategories = []) => {
        const response = await api.post(`marketplace/admin/vendors/${vendorId}/assign-categories/`, {
            category_ids: categoryIds,
            disabled_subcategories: disabledSubcategories
        });
        return response.data;
    },

    updateVendorPermissions: async (vendorId, payload) => {
        const response = await api.patch(`marketplace/admin/vendors/${vendorId}/edit/`, payload);
        return response.data;
    },

    getVendorCategories: async (vendorId) => {
        const response = await api.get(`marketplace/categories/?vendor_id=${vendorId}`);
        return response.data;
    },

    getVendorProducts: async (params = {}) => {
        const response = await api.get('marketplace/vendor/products/', { params });
        return Array.isArray(response.data)
            ? response.data
            : (Array.isArray(response.data?.results) ? response.data.results : response.data);
    },

    getVendorProduct: async (id) => {
        const response = await api.get(`marketplace/vendor/products/${id}/`);
        return response.data;
    },

    updateProfile: async (profileData) => {
        const response = await api.patch('marketplace/vendor/update-profile/', profileData);
        return response.data;
    },

    updateVendorProduct: async (id, productData) => {
        const response = await api.patch(`marketplace/vendor/products/${id}/edit/`, productData);
        return response.data;
    },

    createVendorProduct: async (productData) => {
        const response = await api.post('marketplace/upload/', productData);
        return response.data;
    },

    deleteVendorProduct: async (id) => {
        const response = await api.delete(`marketplace/vendor/products/${id}/delete/`);
        return response.data;
    }
};
