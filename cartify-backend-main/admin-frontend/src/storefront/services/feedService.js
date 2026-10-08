import storefrontApi from './storefrontApi';

export const feedService = {
    getFeed: async (params = {}) => (await storefrontApi.get('marketplace/feed/', { params })).data,
    getTrending: async (params = {}) => (await storefrontApi.get('marketplace/products/trending/', { params })).data,
    getProductDetail: async (productId, params = {}) =>
        (await storefrontApi.get(`marketplace/products/${productId}/`, { params })).data,
    getRelated: async (productId, params = {}) =>
        (await storefrontApi.get(`marketplace/products/${productId}/related/`, { params })).data,
    getCategoriesAndVendors: async () =>
        (await storefrontApi.get('marketplace/public/vendors-and-categories/')).data,
};
