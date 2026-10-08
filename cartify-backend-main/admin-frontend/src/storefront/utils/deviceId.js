const DEVICE_ID_KEY = 'sf_device_id';

// Guest identity that survives the browser being closed/reopened for months —
// this is what lets returning visitors be recognized without re-asking for a phone number.
export const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
};
