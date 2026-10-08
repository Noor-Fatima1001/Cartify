import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Package, Pencil } from 'lucide-react';
import { productService } from '../../services/productService';
import { vendorService } from '../../services/vendorService';
import { analyticsService } from '../../services/analyticsService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/common/StatusBadge';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonCard, SkeletonBlock, SkeletonStatRow, SkeletonText } from '../../components/common/Skeleton';
import { getImageUrl as resolveImageUrl } from '../../utils/image';
import { formatPKT } from '../../utils/date';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';

const getImageUrl = (imagePath) => (imagePath && imagePath.startsWith('blob:') ? imagePath : resolveImageUrl(imagePath));

const getFavoriteCount = (item) => (
    item?.favorites ?? item?.favorites_count ?? item?.favorite_count ?? item?.favoritesCount ?? '—'
);

const ProductDetail = ({ isAdminView = false }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { user } = useAuth();
    const backPath = isAdminView ? '/admin/dashboard/products' : '/admin/vendor-dashboard/products';

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detailImageIndex, setDetailImageIndex] = useState(0);
    const [productAnalytics, setProductAnalytics] = useState(null);

    const canAccessAnalytics = isAdminView
        ? true
        : (user?.analytics_permission?.can_access_analytics ?? user?.can_access_analytics ?? true);

    const [showVisitorAnalyticsModal, setShowVisitorAnalyticsModal] = useState(false);
    const [showFavoriteAnalyticsModal, setShowFavoriteAnalyticsModal] = useState(false);
    const [showClickAnalyticsModal, setShowClickAnalyticsModal] = useState(false);
    const [showCartAnalyticsModal, setShowCartAnalyticsModal] = useState(false);
    const [analyticsModalData, setAnalyticsModalData] = useState([]);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsModalPage, setAnalyticsModalPage] = useState(1);
    const [analyticsModalTotalPages, setAnalyticsModalTotalPages] = useState(1);
    const [analyticsModalTotalItems, setAnalyticsModalTotalItems] = useState(0);
    const [analyticsModalTotalViews, setAnalyticsModalTotalViews] = useState(null);
    const [analyticsModalTitle, setAnalyticsModalTitle] = useState('Visitor Details');
    const [analyticsModalVisitorLimit, setAnalyticsModalVisitorLimit] = useState(null);
    const [analyticsModalLockedCount, setAnalyticsModalLockedCount] = useState(0);

    const fetchProduct = React.useCallback(async () => {
        try {
            setLoading(true);
            const data = isAdminView
                ? await productService.getProduct(id)
                : await vendorService.getVendorProduct(id);
            setProduct(data);
        } catch (err) {
            console.error('Failed to load product:', err);
            showToast('Failed to load product', 'error');
        } finally {
            setLoading(false);
        }
    }, [id, isAdminView, showToast]);

    useEffect(() => { fetchProduct(); }, [fetchProduct]);
    useEffect(() => { setDetailImageIndex(0); }, [id]);

    useEffect(() => {
        const fetchAnalytics = async () => {
            if (!product || !canAccessAnalytics) {
                setProductAnalytics(null);
                return;
            }
            try {
                const res = await analyticsService.getProductAnalytics(product.id);
                setProductAnalytics(res);
            } catch (err) {
                console.error('Failed to load product analytics', err);
                if (err.response?.status === 403) {
                    showToast(err.response?.data?.error || 'Analytics access is disabled for your account', 'error');
                }
                setProductAnalytics(null);
            }
        };
        fetchAnalytics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.id, canAccessAnalytics]);

    const fetchAnalyticsDetails = async (type, page = 1, title) => {
        if (!canAccessAnalytics) {
            showToast('Analytics access is disabled for your account', 'error');
            return;
        }
        try {
            setAnalyticsLoading(true);
            setAnalyticsModalTitle(title);
            const params = { product_id: id, limit: ANALYTICS_PAGE_SIZE, page };
            let res;

            switch (type) {
                case 'views':
                    // "Total Views" shows individual view events (own timestamp
                    // each); "Visitor Details" shows one row per visitor summed up.
                    if (title === 'Total Views') params.granularity = 'event';
                    res = isAdminView
                        ? await analyticsService.getAdminDetailedViews(params)
                        : await analyticsService.getVendorDetailedViews(params);
                    break;
                case 'favorites':
                    res = isAdminView
                        ? await analyticsService.getAdminDetailedFavorites(params)
                        : await analyticsService.getVendorDetailedFavorites(params);
                    break;
                case 'clicks':
                    res = isAdminView
                        ? await analyticsService.getAdminDetailedClicks(params)
                        : await analyticsService.getVendorDetailedClicks(params);
                    break;
                case 'cart':
                    res = isAdminView
                        ? await analyticsService.getAdminDetailedCart(params)
                        : await analyticsService.getVendorDetailedCart(params);
                    break;
                default:
                    throw new Error('Unsupported analytics type');
            }

            const pagination = normalizeAnalyticsPagination(res, page, ANALYTICS_PAGE_SIZE);
            setAnalyticsModalData(pagination.results);
            setAnalyticsModalTotalPages(pagination.totalPages);
            setAnalyticsModalTotalItems(pagination.totalItems);
            setAnalyticsModalPage(pagination.currentPage);
            setAnalyticsModalVisitorLimit(res.visitor_limit ?? null);
            setAnalyticsModalLockedCount(res.locked_count || 0);
            setAnalyticsModalTotalViews(type === 'views' ? (res.total_views ?? null) : null);

            setShowVisitorAnalyticsModal(type === 'views');
            setShowFavoriteAnalyticsModal(type === 'favorites');
            setShowClickAnalyticsModal(type === 'clicks');
            setShowCartAnalyticsModal(type === 'cart');
        } catch (err) {
            console.error(`Failed to load ${type} analytics:`, err);
            if (err.response?.status === 403) {
                showToast(err.response?.data?.error || 'Analytics access is disabled for your account', 'error');
            } else {
                showToast(`Failed to load ${type} analytics`, 'error');
            }
        } finally {
            setAnalyticsLoading(false);
        }
    };

    const fetchVisitorAnalyticsData = (page = 1, title = 'Visitor Details') => fetchAnalyticsDetails('views', page, title);
    const fetchFavoriteAnalyticsData = (page = 1) => fetchAnalyticsDetails('favorites', page, 'Favorite Details');
    const fetchClickAnalyticsData = (page = 1) => fetchAnalyticsDetails('clicks', page, 'Purchase Link Clicks');
    const fetchCartAnalyticsData = (page = 1) => fetchAnalyticsDetails('cart', page, 'Cart Details');

    if (!product) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="detail-header">
                    <h2>
                        <button type="button" className="detail-header-back" onClick={() => navigate(backPath)}>
                            <ArrowLeft size={20} />
                        </button>
                        <Package size={18} /> Product Details
                    </h2>
                </div>
                <div className="premium-modal-grid">
                    <div className="left-col">
                        <SkeletonCard titleWidth="30%" lines={3} />
                        <SkeletonStatRow count={3} />
                        <div className="info-card">
                            <SkeletonText width="30%" height="16px" style={{ marginBottom: '0.9rem' }} />
                            <SkeletonBlock height="260px" />
                        </div>
                    </div>
                    <div className="right-col">
                        <SkeletonCard titleWidth="45%" lines={6} className="info-card product-info-card" />
                    </div>
                </div>
                {loading && <PageLoaderOverlay label="Loading product…" />}
            </div>
        );
    }

    return (
        <div className="view active">
            <div className="detail-header">
                <h2>
                    <button type="button" className="detail-header-back" onClick={() => navigate(backPath)}>
                        <ArrowLeft size={20} />
                    </button>
                    <Package size={18} /> Product Details
                </h2>
                <div className="action-bar">
                    <button
                        type="button"
                        className="dash-btn dash-btn-secondary"
                        onClick={() => navigate(`${backPath}?modal=edit&edit_id=${product.id}`)}
                    >
                        <Pencil size={15} /> Edit
                    </button>
                </div>
            </div>

            <div className="premium-modal-header-row">
                <div className="product-header">
                    <div className="product-image">
                        {(product.images?.length > 0 || product.image) ? (
                            <img src={getImageUrl(product.images?.[0] || product.image)} alt={product.name || 'Product image'} />
                        ) : (
                            <div className="no-image">N/A</div>
                        )}
                    </div>
                    <div className="product-meta">
                        <h1 className="product-title">{product.name}</h1>
                        <div className="product-type">{product.product_type || 'No type'}</div>
                        <div className="vendor-row">
                            <span className="vendor-badge">{product.vendor_name || product.vendor || '—'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="premium-modal-grid">
                <div className="left-col">
                    <div className="info-card description-card">
                        <h3 className="card-title">Description</h3>
                        <div className="description-text" dangerouslySetInnerHTML={{ __html: product.description || '<p>No description available.</p>' }} />
                    </div>

                    <div className="stat-cards">
                        <div
                            className="stat-card-small"
                            style={{ cursor: canAccessAnalytics ? 'pointer' : 'default' }}
                            onClick={() => canAccessAnalytics ? fetchVisitorAnalyticsData(1, 'Visitor Details') : showToast('Analytics access is disabled for your account', 'error')}
                        >
                            <div className="stat-icon">👁</div>
                            <div>
                                <div className="stat-label">Unique Visitors</div>
                                <div className="stat-value">{productAnalytics?.unique_visitors ?? product.unique_visitors ?? '—'}</div>
                            </div>
                        </div>
                        <div
                            className="stat-card-small"
                            style={{ cursor: canAccessAnalytics ? 'pointer' : 'default' }}
                            onClick={() => canAccessAnalytics ? fetchFavoriteAnalyticsData(1) : showToast('Analytics access is disabled for your account', 'error')}
                        >
                            <div className="stat-icon">❤️</div>
                            <div>
                                <div className="stat-label">Favorites</div>
                                <div className="stat-value">{getFavoriteCount(productAnalytics) !== '—' ? getFavoriteCount(productAnalytics) : getFavoriteCount(product)}</div>
                            </div>
                        </div>
                        <div
                            className="stat-card-small"
                            style={{ cursor: canAccessAnalytics ? 'pointer' : 'default' }}
                            onClick={() => canAccessAnalytics ? fetchVisitorAnalyticsData(1, 'Total Views') : showToast('Analytics access is disabled for your account', 'error')}
                        >
                            <div className="stat-icon">📈</div>
                            <div>
                                <div className="stat-label">Total Views</div>
                                <div className="stat-value">{productAnalytics?.total_views ?? product.total_views ?? '—'}</div>
                            </div>
                        </div>
                        <div
                            className="stat-card-small"
                            style={{ cursor: canAccessAnalytics ? 'pointer' : 'default' }}
                            onClick={() => canAccessAnalytics ? fetchClickAnalyticsData(1) : showToast('Analytics access is disabled for your account', 'error')}
                        >
                            <div className="stat-icon">🖱️</div>
                            <div>
                                <div className="stat-label">Clicks</div>
                                <div className="stat-value">{product.purchase_click_count ?? '—'}</div>
                            </div>
                        </div>
                        <div
                            className="stat-card-small"
                            style={{ cursor: canAccessAnalytics ? 'pointer' : 'default' }}
                            onClick={() => canAccessAnalytics ? fetchCartAnalyticsData(1) : showToast('Analytics access is disabled for your account', 'error')}
                        >
                            <div className="stat-icon">🛒</div>
                            <div>
                                <div className="stat-label">Cart Adds</div>
                                <div className="stat-value">{product.cart_count ?? '—'}</div>
                            </div>
                        </div>
                    </div>

                    {(product.images?.length > 0 || product.image) && (
                        <div className="info-card image-gallery">
                            <h3 className="card-title">Image Gallery</h3>
                            <div className="main-image">
                                <img src={getImageUrl((product.images?.length > 0 ? product.images[detailImageIndex] : product.image))} alt={`Product image ${detailImageIndex + 1}`} />
                            </div>
                            {(product.images?.length > 1) && (
                                <div className="thumbnails">
                                    {product.images.map((image, index) => (
                                        <button key={index} type="button" onClick={() => setDetailImageIndex(index)} className={`thumb-btn ${index === detailImageIndex ? 'active' : ''}`}>
                                            <img src={getImageUrl(image)} alt={`Gallery ${index + 1}`} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="right-col">
                    <div className="info-card product-info-card">
                        <h3 className="card-title">Product Information</h3>
                        {isAdminView && product.is_premium_active && (
                            <div className="info-row">
                                <div className="info-label" style={{ color: 'var(--dash-accent)' }}>Sponsor</div>
                                <div className="info-value">
                                    <span
                                        className="dash-badge"
                                        style={{ background: 'linear-gradient(135deg, var(--dash-accent), var(--dash-accent-hover))', color: 'var(--dash-accent-ink)' }}
                                    >
                                        ✦ Sponsor
                                    </span>
                                </div>
                            </div>
                        )}
                        {isAdminView && (
                            <div className="info-row"><div className="info-label">Vendor</div><div className="info-value">{product.vendor_name || product.vendor || '—'}</div></div>
                        )}
                        <div className="info-row"><div className="info-label">Category</div><div className="info-value">{product.category_name || product.category?.name || '—'}</div></div>
                        {isAdminView && (
                            <div className="info-row"><div className="info-label">Subcategory</div><div className="info-value">{product.subcategory_name || product.subcategory?.name || '—'}</div></div>
                        )}
                        <div className="info-row"><div className="info-label">Product Type</div><div className="info-value">{product.product_type || '—'}</div></div>
                        <div className="info-row"><div className="info-label">Price</div><div className="info-value">Rs. {product.price}</div></div>
                        <div className="info-row"><div className="info-label">Original Price</div><div className="info-value">Rs. {product.original_price || '—'}</div></div>
                        <div className="info-row"><div className="info-label">Discount</div><div className="info-value">{product.discount ?? '—'}%</div></div>
                        {isAdminView ? (
                            product.purchase_link && (
                                <div className="info-row">
                                    <div className="info-label">Purchase Link</div>
                                    <div className="info-value"><a href={product.purchase_link} target="_blank" rel="noopener noreferrer">View</a></div>
                                </div>
                            )
                        ) : (
                            <div className="info-row"><div className="info-label">Purchase Link</div><div className="info-value">{product.purchase_short_link ? (<a href={product.purchase_short_link} target="_blank" rel="noopener noreferrer">Open</a>) : '—'}</div></div>
                        )}
                        <div className="info-row">
                            <div className="info-label">Status</div>
                            <div className="info-value">
                                <StatusBadge status={product.is_active ? 'ACTIVE' : 'CANCELLED'} label={product.is_active ? 'Active' : 'Inactive'} />
                            </div>
                        </div>
                        <div className="info-row"><div className="info-label">Created</div><div className="info-value">{product.created_at ? formatPKT(product.created_at) : '—'}</div></div>
                    </div>
                </div>
            </div>

            <AnalyticsDetailModal
                isOpen={showVisitorAnalyticsModal}
                onClose={() => setShowVisitorAnalyticsModal(false)}
                type="views"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                totalViews={analyticsModalTotalViews}
                eventLevel={analyticsModalTitle === 'Total Views'}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchVisitorAnalyticsData(p, analyticsModalTitle)}
            />

            <AnalyticsDetailModal
                isOpen={showFavoriteAnalyticsModal}
                onClose={() => setShowFavoriteAnalyticsModal(false)}
                type="favorites"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchFavoriteAnalyticsData(p)}
            />

            <AnalyticsDetailModal
                isOpen={showClickAnalyticsModal}
                onClose={() => setShowClickAnalyticsModal(false)}
                type="clicks"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchClickAnalyticsData(p)}
            />

            <AnalyticsDetailModal
                isOpen={showCartAnalyticsModal}
                onClose={() => setShowCartAnalyticsModal(false)}
                type="cart"
                title={analyticsModalTitle}
                data={analyticsModalData}
                loading={analyticsLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(p) => fetchCartAnalyticsData(p)}
            />
        </div>
    );
};

export default ProductDetail;
