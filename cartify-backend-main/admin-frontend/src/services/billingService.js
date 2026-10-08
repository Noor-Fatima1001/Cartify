import api from './api';

export const billingService = {
    // Vendor
    getWallet: async () => {
        const response = await api.get('billing/wallet/');
        return response.data;
    },

    getLedger: async (params = {}) => {
        const response = await api.get('billing/ledger/', { params });
        return response.data;
    },

    getPaymentMethods: async () => {
        const response = await api.get('billing/payment-methods/');
        return response.data;
    },

    getTopups: async (params = {}) => {
        const response = await api.get('billing/topups/', { params });
        return response.data;
    },

    createTopup: async (formData) => {
        const response = await api.post('billing/topups/', formData);
        return response.data;
    },

    updateTopup: async (topupId, formData) => {
        const response = await api.patch(`billing/topups/${topupId}/`, formData);
        return response.data;
    },

    getTopupDetail: async (topupId) => {
        const response = await api.get(`billing/topups/${topupId}/`);
        return response.data;
    },

    getNotifications: async (params = {}) => {
        const response = await api.get('billing/notifications/', { params });
        return response.data;
    },

    markNotificationsRead: async (payload = { all: true }) => {
        const response = await api.post('billing/notifications/mark-read/', payload);
        return response.data;
    },

    // Admin
    adminGetPaymentMethods: async () => {
        const response = await api.get('billing/admin/payment-methods/');
        return response.data;
    },

    adminCreatePaymentMethod: async (data) => {
        const response = await api.post('billing/admin/payment-methods/', data);
        return response.data;
    },

    adminUpdatePaymentMethod: async (id, data) => {
        const response = await api.patch(`billing/admin/payment-methods/${id}/`, data);
        return response.data;
    },

    adminDeletePaymentMethod: async (id) => {
        const response = await api.delete(`billing/admin/payment-methods/${id}/`);
        return response.data;
    },

    adminGetTopups: async (params = {}) => {
        const response = await api.get('billing/admin/topups/', { params });
        return response.data;
    },

    adminApproveTopup: async (id) => {
        const response = await api.post(`billing/admin/topups/${id}/approve/`);
        return response.data;
    },

    adminRejectTopup: async (id, reason) => {
        const response = await api.post(`billing/admin/topups/${id}/reject/`, { reason });
        return response.data;
    },

    adminRequestTopupInfo: async (id, message) => {
        const response = await api.post(`billing/admin/topups/${id}/request-info/`, { message });
        return response.data;
    },

    adminGetTopupDetail: async (id) => {
        const response = await api.get(`billing/admin/topups/${id}/`);
        return response.data;
    },

    adminUpdateTopup: async (id, formData) => {
        const response = await api.patch(`billing/admin/topups/${id}/`, formData);
        return response.data;
    },

    adminGetWallets: async (params = {}) => {
        const response = await api.get('billing/admin/wallets/', { params });
        return response.data;
    },

    adminAdjustWallet: async (vendorId, amount, description) => {
        const response = await api.post(`billing/admin/wallets/${vendorId}/adjust/`, { amount, description });
        return response.data;
    },
};
