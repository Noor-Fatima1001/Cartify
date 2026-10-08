import api from './api';

export const dashboardService = {
  getAnalytics: async () => {
    const response = await api.get('marketplace/admin/analytics/');
    return response.data;
  }
};
