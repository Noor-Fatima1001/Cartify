import api from './api';

export const subscriptionService = {
    // Vendor
    getPlans: async () => (await api.get('billing/plans/')).data,
    getSubscription: async () => (await api.get('billing/subscription/')).data,
    purchase: async (planId) => (await api.post('billing/subscription/purchase/', { plan_id: planId })).data,
    cancel: async (reason) => (await api.post('billing/subscription/cancel/', { reason })).data,
    resume: async () => (await api.post('billing/subscription/resume/')).data,
    getHistory: async (params = {}) => (await api.get('billing/subscription/history/', { params })).data,

    // Admin
    adminGetPlans: async () => (await api.get('billing/admin/plans/')).data,
    adminCreatePlan: async (data) => (await api.post('billing/admin/plans/', data)).data,
    adminUpdatePlan: async (id, data) => (await api.patch(`billing/admin/plans/${id}/`, data)).data,
    adminDeletePlan: async (id) => (await api.delete(`billing/admin/plans/${id}/`)).data,
    adminGetSubscriptions: async (params = {}) => (await api.get('billing/admin/subscriptions/', { params })).data,
    adminGetVendorHistory: async (vendorId, params = {}) => (await api.get(`billing/admin/subscriptions/vendor/${vendorId}/history/`, { params })).data,
    adminCancelSubscription: async (vendorId, reason) =>
        (await api.post(`billing/admin/subscriptions/vendor/${vendorId}/cancel/`, { reason })).data,
    adminResumeSubscription: async (vendorId) =>
        (await api.post(`billing/admin/subscriptions/vendor/${vendorId}/resume/`)).data,
    adminRenewSubscription: async (vendorId, planId) =>
        (await api.post(`billing/admin/subscriptions/vendor/${vendorId}/renew/`, { plan_id: planId })).data,
};
