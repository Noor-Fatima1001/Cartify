import api from './api';

export const authService = {
  login: async (credentials) => {
    const response = await api.post('auth/login/', credentials);
    return response.data;
  },

  register: async (formData) => {
    const response = await api.post('auth/register/', formData);
    return response.data;
  },

  logout: async () => {
    try {
      await api.post('auth/logout/');
    } catch (e) {
      // Best-effort: even if the backend call fails (offline, already expired),
      // the client-side auth state still gets cleared by the caller.
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  extendSession: async () => {
    const response = await api.post('auth/refresh-token/');
    return response.data;
  },

  checkUser: async () => {
    const response = await api.get('auth/check-user/');
    return response.data;
  },

  updateProfile: async (payload) => {
    const body = payload instanceof FormData
      ? Object.fromEntries(Array.from(payload.entries()).filter(([key]) => ['first_name','last_name','email','username','mobile_number'].includes(key)))
      : payload;

    const response = await api.post('auth/update-profile/', body, {
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  }
};
