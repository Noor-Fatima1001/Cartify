import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Eye, ArrowUpRight, ShoppingCart } from 'lucide-react';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import StatusBadge from '../../components/common/StatusBadge';
import StatCard from '../../components/common/StatCard';
import { LockedRowsPanel } from '../../components/common/LockedRowsBanner';
import { vendorService } from '../../services/vendorService';
import { analyticsService } from '../../services/analyticsService';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonText, SkeletonBlock, SkeletonStatRow, SkeletonTableRows } from '../../components/common/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/authService';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';
import { formatPKT } from '../../utils/date';

const RECENT_ACTIVITY_LIMIT = 5;

const getImageUrl = (imagePath) => {
    if (!imagePath) return '';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath;
    }
    const backendUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : 'https://cartifyapi.dbitsdemo.com/api';
    return `${backendUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};

const VendorHome = () => {
    const { user, updateUser } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalProducts: 0,
        activeProducts: 0,
        totalVisitors: 0,
        totalFavorites: 0,
        totalClicks: 0,
        totalCartAdds: 0,
        recentProducts: []
    });
    const [loading, setLoading] = useState(true);
    const [activityData, setActivityData] = useState([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [activityLockedCount, setActivityLockedCount] = useState(0);
    const [showVisitorAnalyticsModal, setShowVisitorAnalyticsModal] = useState(false);
    const [showFavoriteAnalyticsModal, setShowFavoriteAnalyticsModal] = useState(false);
    const [showClickAnalyticsModal, setShowClickAnalyticsModal] = useState(false);
    const [showCartAnalyticsModal, setShowCartAnalyticsModal] = useState(false);
    const [analyticsModalData, setAnalyticsModalData] = useState([]);
    const [analyticsModalLoading, setAnalyticsModalLoading] = useState(false);
    const [analyticsModalPage, setAnalyticsModalPage] = useState(1);
    const [analyticsModalTotalPages, setAnalyticsModalTotalPages] = useState(1);
    const [analyticsModalTotalItems, setAnalyticsModalTotalItems] = useState(0);
    const [analyticsModalTitle, setAnalyticsModalTitle] = useState('Visitor Details');
    const [analyticsVisitorLimit, setAnalyticsVisitorLimit] = useState(null);
    const [analyticsLockedCount, setAnalyticsLockedCount] = useState(0);
    const canAccessAnalytics = user?.analytics_permission?.can_access_analytics ?? user?.can_access_analytics ?? true;

    useEffect(() => {
        fetchVendorData();
        fetchRecentActivity();
        refreshUserStatus();
    }, []);

    const refreshUserStatus = async () => {
        try {
            const data = await authService.checkUser();
            if (data?.user && typeof updateUser === 'function') {
                updateUser(data.user);
            }
        } catch (err) {
            console.error('Failed to refresh user status:', err);
        }
    };

    const fetchVendorData = async () => {
        try {
            setLoading(true);
            const products = await vendorService.getVendorProducts();
            const totalFavs = products.reduce((acc, p) => acc + (p.favorites_count || 0), 0);
            const totalVisitors = products.reduce((acc, p) => acc + (p.unique_visitors || 0), 0);
            const totalClicks = products.reduce((acc, p) => acc + (p.purchase_click_count || 0), 0);
            const totalCartAdds = products.reduce((acc, p) => acc + (p.cart_count || 0), 0);

            setStats({
                totalProducts: products.length,
                activeProducts: products.filter(p => p.is_active).length,
                totalVisitors,
                totalFavorites: totalFavs,
                totalClicks,
                totalCartAdds,
                recentProducts: products.slice(0, 5)
            });
        } catch (error) {
            console.error('Error fetching vendor data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentActivity = async () => {
        try {
            setActivityLoading(true);
            const res = await analyticsService.getVendorMergedAnalytics({ page: 1, limit: RECENT_ACTIVITY_LIMIT });
            setActivityData(res.results || []);
            setActivityLockedCount(res.locked_count || 0);
        } catch (error) {
            console.error('Error fetching recent activity:', error);

            // Handle analytics disabled error
            if (error.response?.status === 403) {
                const errorMessage = error.response?.data?.error || 'Analytics access is disabled for your account';
                showToast(errorMessage, 'error');
                setActivityData([]);
                setActivityLockedCount(0);
            } else {
                showToast('Failed to load recent activity', 'error');
            }
        } finally {
            setActivityLoading(false);
        }
    };

    const fetchVendorAnalyticsData = async (type, page = 1) => {
        if (!canAccessAnalytics) {
            showToast('Analytics access is disabled for your account', 'error');
            return;
        }

        const title = type === 'favorites' ? 'Favorite Details' : type === 'clicks' ? 'Purchase Link Clicks' : type === 'cart' ? 'Cart Details' : 'Visitor Details';
        const params = {
            page,
            limit: ANALYTICS_PAGE_SIZE,
        };

        try {
            setAnalyticsModalLoading(true);
            setAnalyticsModalTitle(title);
            const res = type === 'favorites'
                ? await analyticsService.getVendorDetailedFavorites(params)
                : type === 'clicks'
                    ? await analyticsService.getVendorDetailedClicks(params)
                    : type === 'cart'
                        ? await analyticsService.getVendorDetailedCart(params)
                        : await analyticsService.getVendorDetailedViews(params);
            const pagination = normalizeAnalyticsPagination(res, page, ANALYTICS_PAGE_SIZE);
            setAnalyticsModalData(pagination.results);
            setAnalyticsModalTotalPages(pagination.totalPages);
            setAnalyticsModalTotalItems(pagination.totalItems);
            setAnalyticsModalPage(pagination.currentPage);
            setAnalyticsVisitorLimit(res.visitor_limit ?? null);
            setAnalyticsLockedCount(res.locked_count || 0);
            if (type === 'favorites') {
                setShowFavoriteAnalyticsModal(true);
            } else if (type === 'clicks') {
                setShowClickAnalyticsModal(true);
            } else if (type === 'cart') {
                setShowCartAnalyticsModal(true);
            } else {
                setShowVisitorAnalyticsModal(true);
            }
        } catch (error) {
            console.error('Error loading analytics details:', error);
            showToast('Failed to load analytics details', 'error');
        } finally {
            setAnalyticsModalLoading(false);
        }
    };

    const handleVisitorAnalyticsClick = () => {
        fetchVendorAnalyticsData('views', 1);
    };

    const handleFavoritesAnalyticsClick = () => {
        fetchVendorAnalyticsData('favorites', 1);
    };

    const handleClickAnalyticsClick = () => {
        fetchVendorAnalyticsData('clicks', 1);
    };

    if (loading) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="dash-page-header">
                    <div>
                        <SkeletonText width="220px" height="20px" />
                        <SkeletonText width="260px" height="13px" style={{ marginBottom: 0 }} />
                    </div>
                </div>
                <SkeletonStatRow count={5} />
                <div className="data-section" style={{ marginTop: '1.5rem' }}>
                    <SkeletonBlock height="240px" />
                </div>
                <PageLoaderOverlay label="Loading dashboard data…" />
            </div>
        );
    }

    return (
        <div className="view active">
            <div className="dash-page-header">
                <div>
                    <h3>Welcome, {user?.brand_name || user?.username}</h3>
                    <p>Here&apos;s what&apos;s happening with your store</p>
                </div>
            </div>

            <div className="stats-grid">
                <div
                    style={{ opacity: canAccessAnalytics ? 1 : 0.6 }}
                    title={canAccessAnalytics ? 'Click to view visitor analytics' : 'Analytics access disabled'}
                >
                    <StatCard
                        label="Visitors"
                        value={stats.totalVisitors}
                        icon={Eye}
                        hint={canAccessAnalytics ? 'Click to view analytics' : 'Analytics disabled'}
                        onClick={canAccessAnalytics ? handleVisitorAnalyticsClick : undefined}
                    />
                </div>

                <div
                    style={{ opacity: canAccessAnalytics ? 1 : 0.6 }}
                    title={canAccessAnalytics ? 'Click to view favorites analytics' : 'Analytics access disabled'}
                >
                    <StatCard
                        label="Favorites"
                        value={stats.totalFavorites}
                        icon={Heart}
                        hint={canAccessAnalytics ? 'Click for details' : 'Analytics disabled'}
                        onClick={canAccessAnalytics ? handleFavoritesAnalyticsClick : undefined}
                    />
                </div>

                <div
                    style={{ opacity: canAccessAnalytics ? 1 : 0.6 }}
                    title={canAccessAnalytics ? 'Click to view purchase link click analytics' : 'Analytics access disabled'}
                >
                    <StatCard
                        label="Link Clicks"
                        value={stats.totalClicks}
                        icon={ArrowUpRight}
                        hint={canAccessAnalytics ? 'Click for details' : 'Analytics disabled'}
                        onClick={canAccessAnalytics ? handleClickAnalyticsClick : undefined}
                    />
                </div>

                <div
                    style={{ opacity: canAccessAnalytics ? 1 : 0.6 }}
                    title={canAccessAnalytics ? 'Click to view cart analytics' : 'Analytics access disabled'}
                >
                    <StatCard
                        label="Cart Adds"
                        value={stats.totalCartAdds}
                        icon={ShoppingCart}
                        hint={canAccessAnalytics ? 'Click for details' : 'Analytics disabled'}
                        onClick={canAccessAnalytics ? () => fetchVendorAnalyticsData('cart', 1) : undefined}
                    />
                </div>
            </div>

            <AnalyticsDetailModal
                isOpen={showVisitorAnalyticsModal}
                onClose={() => setShowVisitorAnalyticsModal(false)}
                type="views"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsModalLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsVisitorLimit}
                lockedCount={analyticsLockedCount}
                onPageChange={(p) => fetchVendorAnalyticsData('views', p)}
            />

            <AnalyticsDetailModal
                isOpen={showFavoriteAnalyticsModal}
                onClose={() => setShowFavoriteAnalyticsModal(false)}
                type="favorites"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsModalLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsVisitorLimit}
                lockedCount={analyticsLockedCount}
                onPageChange={(p) => fetchVendorAnalyticsData('favorites', p)}
            />

            <AnalyticsDetailModal
                isOpen={showClickAnalyticsModal}
                onClose={() => setShowClickAnalyticsModal(false)}
                type="purchase_link_click"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsModalLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsVisitorLimit}
                lockedCount={analyticsLockedCount}
                onPageChange={(p) => fetchVendorAnalyticsData('clicks', p)}
            />

            <AnalyticsDetailModal
                isOpen={showCartAnalyticsModal}
                onClose={() => setShowCartAnalyticsModal(false)}
                type="cart"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsModalLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsVisitorLimit}
                lockedCount={analyticsLockedCount}
                onPageChange={(p) => fetchVendorAnalyticsData('cart', p)}
            />

            <div className="data-section">
                <div className="section-header">
                    <h3>Recent Product Activity</h3>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Type</th>
                                <th>User</th>
                                <th>Mobile</th>
                                <th>Date & Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activityLoading ? (
                                <SkeletonTableRows rows={5} columns={5} />
                            ) : activityData.length > 0 ? (
                                activityData.map((item, index) => (
                                    <tr key={`${item.id || item.product_id || index}-${index}`}>
                                        <td>
                                            <div className="vendor-info">
                                                {((item.product_image || item.product_image_url) || item.product?.images?.[0]) && (
                                                    <div className="vendor-avatar">
                                                        <img
                                                            src={getImageUrl(item.product_image || item.product_image_url || item.product?.images?.[0] || '')}
                                                            alt={item.product_name || 'Product image'}
                                                        />
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{item.product_name || item.product?.name || '—'}</div>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>{item.product_type || item.product?.product_type || ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <StatusBadge
                                                status={item.type === 'favorite' ? 'PENDING' : item.type === 'purchase_link_click' ? 'INFO_REQUIRED' : item.type === 'cart' ? 'DRAFT' : 'ACTIVE'}
                                                label={item.type === 'favorite' ? 'Favorite' : item.type === 'purchase_link_click' ? 'Link Click' : item.type === 'cart' ? 'Cart Add' : 'View'}
                                            />
                                        </td>
                                        <td>{item.visitor_name || item.user_name || item.user || '—'}</td>
                                        <td>{item.mobile_number || item.visitor_mobile || item.mobile || '—'}</td>
                                        <td>{item.timestamp ? formatPKT(item.timestamp) : '—'}</td>
                                    </tr>
                                ))
                            ) : activityLockedCount === 0 ? (
                                <tr>
                                    <td colSpan={5} className="dash-empty">
                                        No recent activity available.
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
                {activityLockedCount > 0 && (
                    <LockedRowsPanel lockedCount={activityLockedCount} columnsCount={5} noun="interaction" />
                )}
            </div>
        </div>
    );
};

export default VendorHome;
