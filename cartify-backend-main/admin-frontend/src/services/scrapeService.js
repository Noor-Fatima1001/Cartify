import api from './api';

export const scrapeService = {
  getAllScrapedItems: async (params = {}) => {
    const response = await api.get('admin/all-scraped-items/', { params });
    return response.data;
  }
};
