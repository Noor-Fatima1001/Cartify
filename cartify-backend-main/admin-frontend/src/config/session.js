
export const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours of inactivity logs the user out

// While the user is actively clicking/typing, the session is silently extended
// server-side at most this often — so an active user never sees the warning.
export const SESSION_ACTIVITY_EXTEND_INTERVAL = 5 * 60 * 1000; // 5 minutes

// How long before expiry to show the "still there?" warning modal.
export const SESSION_WARNING_BEFORE = 2 * 60 * 1000; // 2 minutes

export const SESSION_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  LOGIN_TS: 'login_ts',
  EXPIRES_AT: 'session_expires_at',
  // Storefront's "this device already gave us a phone number" gate. Lives
  // here (not just in the storefront's own key list) so an admin/vendor
  // logout can drop it too — otherwise it outlives the account session and
  // the guest phone-verification popup never reappears.
  PHONE_VERIFIED: 'sf_phone_verified',
};
