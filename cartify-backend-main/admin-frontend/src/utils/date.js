// Canonical Asia/Karachi (PKT) date+time formatter for analytics/visitor timestamps.
// Consolidates the copies previously duplicated across VendorHome, VendorCartDetails,
// AnalyticsDetailModal, Products, and VisitorAnalytics.
export const formatPKT = (isoString) => {
    if (!isoString) return '—';
    try {
        const d = new Date(isoString);
        const dateOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' };
        const datePart = d.toLocaleDateString('en-GB', dateOptions);
        const timePart = d.toLocaleTimeString('en-US', timeOptions);
        return `${datePart}, ${timePart}`;
    } catch {
        return isoString;
    }
};
