import api from './api';

export const campaignService = {
    // Vendor
    getCampaigns: async (params = {}) => {
        const response = await api.get('campaigns/', { params });
        return response.data;
    },

    createCampaign: async (data) => {
        const response = await api.post('campaigns/', data);
        return response.data;
    },

    getCampaign: async (id, isAdmin = false) => {
        const response = await api.get(isAdmin ? `campaigns/admin/campaigns/${id}/` : `campaigns/${id}/`);
        return response.data;
    },

    updateCampaign: async (id, data) => {
        const response = await api.patch(`campaigns/${id}/`, data);
        return response.data;
    },

    startCampaign: async (id) => (await api.post(`campaigns/${id}/start/`)).data,
    pauseCampaign: async (id, reason = '') => (await api.post(`campaigns/${id}/pause/`, { reason })).data,
    resumeCampaign: async (id) => (await api.post(`campaigns/${id}/resume/`)).data,
    stopCampaign: async (id, reason = '') => (await api.post(`campaigns/${id}/stop/`, { reason })).data,

    changeBudget: async (id, newBudget) => {
        const response = await api.post(`campaigns/${id}/budget/`, { new_budget: newBudget });
        return response.data;
    },

    getAnalytics: async (id, isAdmin = false) => (await api.get(isAdmin ? `campaigns/admin/campaigns/${id}/analytics/` : `campaigns/${id}/analytics/`)).data,

    getAuditLogs: async (id, params = {}, isAdmin = false) => {
        const response = await api.get(isAdmin ? `campaigns/admin/campaigns/${id}/audit-logs/` : `campaigns/${id}/audit-logs/`, { params });
        return response.data;
    },

    // Admin
    adminGetCampaigns: async (params = {}) => {
        const response = await api.get('campaigns/admin/campaigns/', { params });
        return response.data;
    },

    adminPauseCampaign: async (id, reason = '') => (await api.post(`campaigns/admin/campaigns/${id}/pause/`, { reason })).data,
    adminStopCampaign: async (id, reason = '') => (await api.post(`campaigns/admin/campaigns/${id}/stop/`, { reason })).data,

    adminGetPricing: async () => (await api.get('campaigns/admin/pricing/')).data,

    adminUpdatePricing: async (data) => {
        const response = await api.put('campaigns/admin/pricing/', data);
        return response.data;
    },
};
