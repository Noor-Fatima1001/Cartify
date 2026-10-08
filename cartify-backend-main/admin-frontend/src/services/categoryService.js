import api from './api';

export const categoryService = {
  getCategories: async (params = {}) => {
    const response = await api.get('marketplace/admin/categories/', { params });
    return response.data;
  },

  getCategory: async (id) => {
    const response = await api.get(`marketplace/admin/categories/${id}/`);
    return response.data;
  },

  createCategory: async (data) => {
    let payload = data;
    if (!(data instanceof FormData) && (data.image || data.imageFile)) {
      payload = new FormData();
      payload.append('name', data.name);
      payload.append('is_active', data.is_active ?? true);
      const imageField = data.imageFile || data.image;
      if (imageField) payload.append('image', imageField);
      if (data.subcategories) payload.append('subcategories', JSON.stringify(data.subcategories));
    }
    const response = await api.post('marketplace/admin/categories/create/', payload);
    return response.data;
  },

  updateCategory: async (id, data) => {
    let payload = data;
    if (!(data instanceof FormData) && (data.image || data.imageFile)) {
      payload = new FormData();
      if (data.name) payload.append('name', data.name);
      if (typeof data.is_active !== 'undefined') payload.append('is_active', data.is_active);
      const imageField = data.imageFile || data.image;
      if (imageField) payload.append('image', imageField);
      if (data.subcategories) payload.append('subcategories', JSON.stringify(data.subcategories));
    }
    const response = await api.patch(`marketplace/admin/categories/${id}/edit/`, payload);
    return response.data;
  },

  deleteCategory: async (id) => {
    const response = await api.delete(`marketplace/admin/categories/${id}/delete/`);
    return response.data;
  },

  toggleCategoryStatus: async (id) => {
    const response = await api.post(`marketplace/admin/categories/${id}/toggle/`);
    return response.data;
  },

  // Subcategories
  createSubcategory: async (categoryId, data) => {
    const response = await api.post(`marketplace/admin/categories/${categoryId}/subcategories/`, data);
    return response.data;
  },

  updateSubcategory: async (id, data) => {
    const response = await api.patch(`marketplace/admin/subcategories/${id}/edit/`, data);
    return response.data;
  },

  deleteSubcategory: async (id) => {
    const response = await api.delete(`marketplace/admin/subcategories/${id}/delete/`);
    return response.data;
  }
};
