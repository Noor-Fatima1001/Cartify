import api from './api';

export const productService = {
  getProducts: async (params = {}) => {
    const response = await api.get('marketplace/admin/products/', { params });
    return response.data;
  },

  getProduct: async (id) => {
    const response = await api.get(`marketplace/admin/products/${id}/`);
    return response.data;
  },

  createProduct: async (productData) => {
  
  const response = await api.post('marketplace/admin/post-on-behalf/', productData);
    return response.data;
  },

  updateProduct: async (id, productData) => {
  
    const response = await api.patch(`marketplace/admin/products/${id}/edit/`, productData);
    return response.data;
  },

  deleteProduct: async (id) => {
    const response = await api.delete(`marketplace/admin/products/${id}/`);
    return response.data;
  },

  toggleProductStatus: async (id) => {
    const response = await api.post(`marketplace/admin/products/${id}/toggle/`);
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get('marketplace/admin/categories/');
    if (response.data && Array.isArray(response.data.results)) return response.data.results;
    if (Array.isArray(response.data)) return response.data;
    return [];
  }
};
