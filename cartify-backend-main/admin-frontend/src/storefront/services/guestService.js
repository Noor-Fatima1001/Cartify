import storefrontApi from './storefrontApi';
import { getDeviceId } from '../utils/deviceId';

export const guestService = {
    guestLogin: async ({ mobileNumber, city, latitude, longitude }) =>
        (await storefrontApi.post('auth/guest-login/', {
            device_id: getDeviceId(),
            mobile_number: mobileNumber,
            city,
            latitude,
            longitude,
        })).data,

    convertGuest: async ({ username, email, firstName, lastName, password, mobileNumber }) =>
        (await storefrontApi.post('auth/convert-guest/', {
            device_id: getDeviceId(),
            username,
            email,
            first_name: firstName,
            last_name: lastName,
            password,
            mobile_number: mobileNumber,
        })).data,

    login: async (username_or_email, password) =>
        (await storefrontApi.post('auth/login/', { username_or_email, password })).data,
};
