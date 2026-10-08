import storefrontApi from './storefrontApi';
import { getDeviceId } from '../utils/deviceId';

export const cartService = {
    getCart: async () => (await storefrontApi.get('marketplace/cart/', { params: { device_id: getDeviceId() } })).data,
    add: async (productId) =>
        (await storefrontApi.post('marketplace/cart/add/', {
            product_id: productId,
            device_id: getDeviceId(),
        })).data,
    remove: async (productId) =>
        (await storefrontApi.post('marketplace/cart/remove/', {
            product_id: productId,
            device_id: getDeviceId(),
        })).data,
};
