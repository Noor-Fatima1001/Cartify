import React, { useState, useEffect } from 'react';
import { Search, Lock } from 'lucide-react';
import { analyticsService } from '../../services/analyticsService';
import { vendorService } from '../../services/vendorService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/tables/DataTable';
import { LockedRowsPanel } from '../../components/common/LockedRowsBanner';
import { formatPKT } from '../../utils/date';

const VisitorAnalytics = ({ userRole = 'admin' }) => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const canAccessAnalytics = user?.analytics_permission?.can_access_analytics ?? user?.can_access_analytics ?? true;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [lockedCount, setLockedCount] = useState(0);
    const [visitorLimit, setVisitorLimit] = useState(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedVendor, setSelectedVendor] = useState('');
    const [selectedType, setSelectedType] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const INTERACTION_TYPE_OPTIONS = [
        { value: 'view', label: 'Views' },
        { value: 'favorite', label: 'Favorites' },
        { value: 'purchase_link_click', label: 'Purchase Link Clicks' },
        { value: 'cart', label: 'Cart Adds' },
    ];

    // Data sources
    const [products, setProducts] = useState([]);
    const [vendors, setVendors] = useState([]);

    const PAGE_SIZE = 10;

    // Fetch products and vendors on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const productsRes = userRole === 'admin'
                    ? await productService.getProducts({ limit: 1000 })
                    : await vendorService.getVendorProducts({ limit: 1000 });
                const prodItems = Array.isArray(productsRes.results) ? productsRes.results : (Array.isArray(productsRes) ? productsRes : []);
                setProducts(prodItems);

                if (userRole === 'admin') {
                    const vendorsRes = await vendorService.getVendors();
                    setVendors(Array.isArray(vendorsRes) ? vendorsRes : vendorsRes.results || []);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        };
        fetchData();
    }, [userRole]);

    // Fetch analytics data
    useEffect(() => {
        if (userRole === 'vendor' && !canAccessAnalytics) {
            setData([]);
            setTotalItems(0);
            setTotalPages(1);
            return;
        }
        fetchAnalytics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, canAccessAnalytics, userRole]);

    const fetchAnalytics = async (page = currentPage) => {
        try {
            setLoading(true);
            const params = {
                page,
                limit: PAGE_SIZE,
                search: searchTerm || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                product_id: selectedProduct || undefined,
                type: selectedType || undefined,
            };

            if (userRole === 'admin' && selectedVendor) {
                params.vendor_id = selectedVendor;
            }

            const res = userRole === 'admin'
                ? await analyticsService.getAdminMergedAnalytics(params)
                : await analyticsService.getVendorMergedAnalytics(params);

            setData(res.results || []);
            setTotalPages(res.total_pages || 1);
            setTotalItems(res.total_items || 0);
            setCurrentPage(res.current_page || page);
            setLockedCount(res.locked_count || 0);
            setVisitorLimit(res.visitor_limit ?? null);
        } catch (error) {
            console.error('Error fetching analytics:', error);

            // Handle analytics disabled error
            if (error.response?.status === 403) {
                const errorMessage = error.response?.data?.error || 'Analytics access is disabled for your account';
                showToast(errorMessage, 'error');
                setData([]);
                setLockedCount(0);
            } else {
                showToast('Failed to load analytics', 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = () => {
        setCurrentPage(1);
        fetchAnalytics(1);
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedProduct('');
        setSelectedVendor('');
        setSelectedType('');
        setStartDate('');
        setEndDate('');
        setCurrentPage(1);
        fetchAnalytics(1);
    };

    const mergedColumns = ['Product', 'User', 'Mobile', 'Type', 'Activity Time'];

    const getTypeLabel = (type) => {
        if (type === 'view') return 'View';
        if (type === 'favorite') return 'Favorite';
        if (type === 'purchase_link_click') return 'Purchase Link Click';
        if (type === 'cart') return 'Cart Add';
        return type || '—';
    };

    const mergedRenderRow = (item) => (
        <>
            <td>{item.product_name || '—'}</td>
            <td>{item.visitor_name || '—'}</td>
            <td>{item.mobile_number || '—'}</td>
            <td>{getTypeLabel(item.type)}</td>
            <td>{item.timestamp ? formatPKT(item.timestamp) : '—'}</td>
        </>
    );

    if (userRole === 'vendor' && !canAccessAnalytics) {
        return (
            <div className="view active">
                <div className="page-header">
                    <div className="header-left">
                        <h3><Lock size={20} /> Analytics Access Disabled</h3>
                        <p>Visitor analytics has been disabled for your account by the administrator. You can continue using the rest of the vendor dashboard.</p>
                    </div>
                </div>
                <div className="data-section">
                    <div className="dash-empty">
                        <Lock size={28} style={{ marginBottom: '0.75rem', color: 'var(--dash-ink-faint)' }} />
                        <div>Analytics for your account are currently turned off.</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3>Product Analytics</h3>
                    <p>Combined visitor and favorites activity.</p>
                </div>
            </div>

            <div className="data-section" style={{ marginBottom: '1rem' }}>
                <div className="section-header" style={{ flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <div className="toolbar-controls">
                        <div className="search-box">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search name or mobile..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} className="filter-select">
                            <option value="">All Products</option>
                            {products.map((product) => (
                                <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                        </select>
                        <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="filter-select">
                            <option value="">All Interactions</option>
                            {INTERACTION_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        {userRole === 'admin' && (
                            <select value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)} className="filter-select">
                                <option value="">All Vendors</option>
                                {vendors.map((vendor) => (
                                    <option key={vendor.id} value={vendor.id}>{vendor.brand_name || vendor.username}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div className="toolbar2-controls">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="filter-select"
                        />
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="filter-select"
                        />
                        <button className="btn btn-primary" onClick={handleApplyFilters}>Apply</button>
                        <button className="btn btn-secondary" onClick={handleResetFilters}>Reset</button>
                    </div>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={mergedColumns}
                    data={data}
                    renderRow={mergedRenderRow}
                    keyExtractor={(item, idx) => `analytics-${idx}`}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={totalItems}
                    loading={loading}
                />
                {!loading && lockedCount > 0 && (
                    <LockedRowsPanel
                        lockedCount={lockedCount}
                        columnsCount={mergedColumns.length}
                        noun="interaction"
                        hint={visitorLimit != null ? `Your plan shows only the first ${visitorLimit} interactions per product.` : null}
                        ctaTo={userRole === 'vendor' ? '/admin/vendor-dashboard/subscription' : null}
                    />
                )}
            </div>
        </div>
    );
};

export default VisitorAnalytics;
