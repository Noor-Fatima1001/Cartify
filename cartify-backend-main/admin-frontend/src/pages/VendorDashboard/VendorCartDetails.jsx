import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ShoppingCart } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { analyticsService } from '../../services/analyticsService';
import Table from '../../components/common/Table';
import { LockedRowsPanel } from '../../components/common/LockedRowsBanner';
import { formatPKT } from '../../utils/date';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';

const getImageUrl = (imagePath) => {
    if (!imagePath) return '';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath;
    }
    const backendUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : 'https://cartifyapi.dbitsdemo.com/api';
    return `${backendUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};

const VendorCartDetails = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [visitorLimit, setVisitorLimit] = useState(null);
    const [lockedCount, setLockedCount] = useState(0);

    const fetchData = async (currentPage = 1, currentSearch = '') => {
        try {
            setLoading(true);
            const params = {
                page: currentPage,
                limit: ANALYTICS_PAGE_SIZE,
                search: currentSearch || undefined,
            };
            const res = await analyticsService.getVendorDetailedCart(params);
            const pagination = normalizeAnalyticsPagination(res, currentPage, ANALYTICS_PAGE_SIZE);
            setData(pagination.results);
            setPage(pagination.currentPage);
            setTotalPages(pagination.totalPages);
            setTotalItems(pagination.totalItems);
            setVisitorLimit(res.visitor_limit ?? null);
            setLockedCount(res.locked_count || 0);
        } catch (error) {
            console.error('Failed to load cart analytics', error);
            showToast('Failed to load cart analytics', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(page, searchTerm);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearch = (value) => {
        setSearchTerm(value);
        setPage(1);
        fetchData(1, value);
    };

    const summaryText = useMemo(() => {
        if (loading) return 'Loading cart analytics...';
        if (totalItems === 0) return 'No cart add analytics available.';
        return `Showing ${data.length} of ${totalItems} cart add records`;
    }, [data.length, loading, totalItems]);

    const rows = useMemo(
        () => data.map((item, index) => ({ ...item, __rowKey: `${item.product_id || item.guest_id || index}-${index}` })),
        [data]
    );

    return (
        <div className="view active">
            <div className="detail-header">
                <h2>
                    <button type="button" className="detail-header-back" onClick={() => navigate('/admin/vendor-dashboard')}>
                        <ArrowLeft size={20} />
                    </button>
                    <ShoppingCart size={18} /> Cart Details
                </h2>
                <div className="search-box">
                    <Search size={16} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search products, guests or mobile..."
                    />
                </div>
            </div>
            <p style={{ margin: '-1rem 0 1.25rem', color: 'var(--dash-ink-soft)', fontSize: '0.9rem' }}>
                Review who added products to their cart and when.
            </p>

            <div style={{ margin: '0 0 0.75rem', color: 'var(--dash-ink-soft)', fontSize: '0.9rem' }}>{summaryText}</div>

            <div className="data-section">
                <Table
                    columns={['Product', 'Guest', 'Mobile Number', 'Cart Adds', 'First Added', 'Last Added']}
                    data={rows}
                    loading={loading}
                    keyExtractor={(item) => item.__rowKey}
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    onPageChange={(nextPage) => { setPage(nextPage); fetchData(nextPage, searchTerm); }}
                    noDataMessage="No cart add analytics available."
                    renderRow={(item) => (
                        <>
                            <td>
                                <div className="vendor-info">
                                    {item.product_image ? (
                                        <div className="vendor-avatar" style={{ width: 42, height: 42 }}>
                                            <img src={getImageUrl(item.product_image)} alt={item.product_name || 'Product image'} />
                                        </div>
                                    ) : null}
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{item.product_name || item.product?.name || '—'}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>{item.product_category || item.product?.category_name || '—'}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <span>{item.visitor_name || item.user_name || item.user || '—'}</span>
                                    {item.guest_id ? <span style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>ID: {item.guest_id}</span> : null}
                                </div>
                            </td>
                            <td>{item.mobile_number || item.visitor_mobile || item.mobile || item.phone_number || item.phone || '—'}</td>
                            <td>{item.total_cart_adds || 0}</td>
                            <td>{formatPKT(item.first_add)}</td>
                            <td>{formatPKT(item.last_add)}</td>
                        </>
                    )}
                />
                {!loading && lockedCount > 0 && (
                    <LockedRowsPanel
                        lockedCount={lockedCount}
                        columnsCount={6}
                        noun="cart add"
                        hint={visitorLimit != null ? `Your plan shows only the first ${visitorLimit} cart adds per product.` : null}
                    />
                )}
            </div>
        </div>
    );
};

export default VendorCartDetails;
