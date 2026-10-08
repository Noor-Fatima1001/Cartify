import api from './api';

export const customerService = {
  getCustomers: async (params = {}) => {
    const response = await api.get('marketplace/admin/customers/', { params });
    return response.data;
  },

  getGuests: async (params = {}) => {
    const response = await api.get('marketplace/admin/guests/', { params });
    return response.data;
  },

  getCustomerDetail: async (id) => {
    const response = await api.get(`auth/admin/customers/${id}/`);
    return response.data;
  },

  updateCustomer: async (id, payload) => {
    const response = await api.patch(`auth/admin/customers/${id}/edit/`, payload);
    return response.data;
  },

  getAnalytics: async () => {
    const response = await api.get('marketplace/admin/analytics/');
    return response.data;
  },

  toggleCustomerStatus: async (id) => {
    const response = await api.post(`marketplace/admin/customers/${id}/toggle/`);
    return response.data;
  }
};
