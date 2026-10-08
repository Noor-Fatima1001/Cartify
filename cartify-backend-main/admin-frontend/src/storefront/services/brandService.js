import storefrontApi from './storefrontApi';

export const brandService = {
    getTopVendors: async (params = {}) => (await storefrontApi.get('marketplace/vendors/top/', { params })).data,
    getVendorProfile: async (vendorId) => (await storefrontApi.get(`marketplace/vendor/${vendorId}/`)).data,
};
