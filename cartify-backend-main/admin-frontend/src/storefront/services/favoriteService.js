import storefrontApi from './storefrontApi';
import { getDeviceId } from '../utils/deviceId';

export const favoriteService = {
    toggle: async (productId) =>
        (await storefrontApi.post('marketplace/favorite/', {
            product_id: productId,
            device_id: getDeviceId(),
        })).data,
    list: async () => (await storefrontApi.get('marketplace/favorites/', { params: { device_id: getDeviceId() } })).data,
};
