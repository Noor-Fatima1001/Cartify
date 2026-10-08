import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { Search, Eye, Store, CheckCircle2, ShieldAlert, Package, Users, UserRound } from 'lucide-react';
import { dashboardService } from '../../services/dashboardService';
import { vendorService } from '../../services/vendorService';
import { analyticsService } from '../../services/analyticsService';
import StatCard from '../../components/common/StatCard';
import ChartCard from '../../components/common/ChartCard';
import Table from '../../components/common/Table';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import StatusBadge from '../../components/common/StatusBadge';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/common/Modal';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonText, SkeletonBlock, SkeletonCircle } from '../../components/common/Skeleton';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';
import { getImageUrl } from '../../utils/image';
import { chartColors, chartBaseOptions } from '../../utils/chartTheme';


ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const PAGE_SIZE = 5;

const DashboardHome = () => {
    const { showToast } = useToast();
    const [stats, setStats] = useState({
        vendors: 0,
        active_vendors: 0,
        pending_kyc: 0,
        products: 0,
        customers: 0,
        guests: 0,
    });
    const [recentVendors, setRecentVendors] = useState([]);
    const [vendorGrowth, setVendorGrowth] = useState([]);
    const [productPosts, setProductPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [vendorDetailsLoading, setVendorDetailsLoading] = useState(false);
    const [showVendorVisitorsModal, setShowVendorVisitorsModal] = useState(false);
    const [showVendorFavoritesModal, setShowVendorFavoritesModal] = useState(false);
    const [showVendorClicksModal, setShowVendorClicksModal] = useState(false);
    const [visitorModalData, setVisitorModalData] = useState([]);
    const [favoriteModalData, setFavoriteModalData] = useState([]);
    const [clickModalData, setClickModalData] = useState([]);
    const [visitorModalLoading, setVisitorModalLoading] = useState(false);
    const [favoriteModalLoading, setFavoriteModalLoading] = useState(false);
    const [clickModalLoading, setClickModalLoading] = useState(false);
    const [visitorModalPage, setVisitorModalPage] = useState(1);
    const [favoriteModalPage, setFavoriteModalPage] = useState(1);
    const [clickModalPage, setClickModalPage] = useState(1);
    const [visitorModalTotalPages, setVisitorModalTotalPages] = useState(1);
    const [favoriteModalTotalPages, setFavoriteModalTotalPages] = useState(1);
    const [clickModalTotalPages, setClickModalTotalPages] = useState(1);
    const [visitorModalTotalItems, setVisitorModalTotalItems] = useState(0);
    const [favoriteModalTotalItems, setFavoriteModalTotalItems] = useState(0);
    const [clickModalTotalItems, setClickModalTotalItems] = useState(0);
    const [selectedVendorForAnalytics, setSelectedVendorForAnalytics] = useState(null);


    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [analyticsData, vendorsData] = await Promise.all([
                    dashboardService.getAnalytics(),
                    vendorService.getVendors(),
                ]);

                if (analyticsData?.stats) {
                    setStats({
                        vendors: analyticsData.stats.total_vendors ?? 0,
                        active_vendors: analyticsData.stats.active_vendors ?? 0,
                        pending_kyc: analyticsData.stats.pending_kyc ?? 0,
                        products: analyticsData.stats.total_products ?? 0,
                        customers: analyticsData.stats.total_customers ?? 0,
                        guests: analyticsData.stats.total_guests ?? 0,
                    });
                }

                if (analyticsData?.vendor_growth) {
                    setVendorGrowth(analyticsData.vendor_growth);
                }

                if (analyticsData?.product_posts) {
                    setProductPosts(analyticsData.product_posts);
                }

                const vendorList = Array.isArray(vendorsData) ? vendorsData : (vendorsData.results || []);
                setRecentVendors(vendorList);
            } catch (error) {
                console.error('Dashboard API error', error);
                showToast('Unable to load dashboard data', 'error');
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [showToast]);

    const vendorGrowthData = {
        labels: vendorGrowth.map((item) => item.month),
        datasets: [
            {
                label: 'New Vendors',
                data: vendorGrowth.map((item) => item.count),
                borderColor: chartColors.accent,
                backgroundColor: chartColors.accentSoft,
                fill: true,
                tension: 0.4,
                borderWidth: 3,
            },
        ],
    };

    const productPostsData = {
        labels: productPosts.map((item) => item.day),
        datasets: [
            {
                label: 'Products Added',
                data: productPosts.map((item) => item.count),
                backgroundColor: chartColors.success,
                borderRadius: 6,
            },
        ],
    };

    const chartOptions = {
        ...chartBaseOptions,
        plugins: {
            ...chartBaseOptions.plugins,
            legend: {
                ...chartBaseOptions.plugins.legend,
                display: false,
            },
        },
    };

    const filteredRecentVendors = recentVendors.filter((vendor) => {
        const matchesSearch = vendor.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vendor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vendor.username?.toLowerCase().includes(searchTerm.toLowerCase());
        const status = vendor.kyc_status || (vendor.is_approved ? 'APPROVED' : 'PENDING');
        const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    useEffect(() => {
        const pages = Math.max(1, Math.ceil(filteredRecentVendors.length / PAGE_SIZE));
        setTotalPages(pages);
        if (currentPage > pages) {
            setCurrentPage(pages);
        }
    }, [filteredRecentVendors.length, currentPage]);


    const handleViewVendor = async (vendor) => {
        setVendorDetailsLoading(true);
        try {
            const details = await vendorService.getVendorDetail(vendor.id);
            setSelectedVendor(details);
            setShowVendorModal(true);
        } catch (error) {
            console.error('Failed to load vendor details:', error);
            showToast('Failed to load vendor details', 'error');
        } finally {
            setVendorDetailsLoading(false);
        }
    };

    const displayedRecentVendors = filteredRecentVendors.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const columns = ['Vendor', 'Total Visitors', 'Total Favorites', 'Total Clicks', 'Email', 'Status', 'Actions'];
    const renderRow = (vendor) => {
        const isApproved = vendor.is_approved || vendor.kyc_status?.toLowerCase() === 'approved';
        const statusValue = isApproved ? 'APPROVED' : 'PENDING';
        const statusLabel = isApproved ? 'Approved' : 'Pending';

        return (
            <>
                <td>
                    <div className="vendor-info">
                        <div className="vendor-avatar">
                            {vendor.logo ? (
                                <img src={getImageUrl(vendor.logo)} alt={vendor.brand_name || vendor.username} />
                            ) : (
                                (vendor.brand_name || vendor.username || 'V')[0]
                            )}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600 }}>{vendor.brand_name || vendor.username || 'N/A'}</div>
                            {vendor.created_at && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--dash-ink-soft)' }}>
                                    Joined {new Date(vendor.created_at).toLocaleDateString()}
                                </div>
                            )}
                        </div>
                    </div>
                </td>
                <td>
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => handleShowVendorVisitors(vendor)}
                    >
                        {vendor.total_visitors ?? 0}
                    </button>
                </td>
                <td>
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => handleShowVendorFavorites(vendor)}
                    >
                        {vendor.total_favorites ?? 0}
                    </button>
                </td>
                <td>
                    <button
                        type="button"
                        className="status-badge analytics-badge"
                        onClick={() => handleShowVendorClicks(vendor)}
                    >
                        {vendor.total_clicks ?? 0}
                    </button>
                </td>
                <td>{vendor.email || '—'}</td>
                <td>
                    <StatusBadge status={statusValue} label={statusLabel} />
                </td>
                <td>
                    <button
                        className="btn btn-secondary"
                        style={{ padding: '0.45rem', fontSize: '0.8rem', color: 'var(--dash-accent)' }}
                        onClick={() => handleViewVendor(vendor)}
                        title="View vendor"
                    >
                        <Eye size={16} />
                    </button>
                </td>
            </>
        );
    };

    const fetchVendorAnalyticsModalData = async (type, vendor, page = 1) => {
        if (!vendor) return;
        setSelectedVendorForAnalytics(vendor);

        try {
            const params = {
                vendor_id: vendor.id,
                limit: ANALYTICS_PAGE_SIZE,
                page,
            };

            if (type === 'favorites') {
                setFavoriteModalLoading(true);
                const res = await analyticsService.getAdminDetailedFavorites(params);
                const pagination = normalizeAnalyticsPagination(res, page, ANALYTICS_PAGE_SIZE);
                setFavoriteModalData(pagination.results);
                setFavoriteModalPage(pagination.currentPage);
                setFavoriteModalTotalPages(pagination.totalPages);
                setFavoriteModalTotalItems(pagination.totalItems);
                setShowVendorFavoritesModal(true);
                setShowVendorVisitorsModal(false);
                setShowVendorClicksModal(false);
            } else if (type === 'clicks') {
                setClickModalLoading(true);
                const res = await analyticsService.getAdminDetailedClicks(params);
                const pagination = normalizeAnalyticsPagination(res, page, ANALYTICS_PAGE_SIZE);
                setClickModalData(pagination.results);
                setClickModalPage(pagination.currentPage);
                setClickModalTotalPages(pagination.totalPages);
                setClickModalTotalItems(pagination.totalItems);
                setShowVendorClicksModal(true);
                setShowVendorVisitorsModal(false);
                setShowVendorFavoritesModal(false);
            } else {
                setVisitorModalLoading(true);
                const res = await analyticsService.getAdminDetailedViews(params);
                const pagination = normalizeAnalyticsPagination(res, page, ANALYTICS_PAGE_SIZE);
                setVisitorModalData(pagination.results);
                setVisitorModalPage(pagination.currentPage);
                setVisitorModalTotalPages(pagination.totalPages);
                setVisitorModalTotalItems(pagination.totalItems);
                setShowVendorVisitorsModal(true);
                setShowVendorFavoritesModal(false);
                setShowVendorClicksModal(false);
            }
        } catch (error) {
            console.error(`Failed to load ${type} analytics data:`, error);
            showToast(`Failed to load ${type} analytics data`, 'error');
        } finally {
            if (type === 'favorites') {
                setFavoriteModalLoading(false);
            } else if (type === 'clicks') {
                setClickModalLoading(false);
            } else {
                setVisitorModalLoading(false);
            }
        }
    };

    const handleShowVendorVisitors = async (vendor) => {
        await fetchVendorAnalyticsModalData('views', vendor, 1);
    };

    const handleShowVendorFavorites = async (vendor) => {
        await fetchVendorAnalyticsModalData('favorites', vendor, 1);
    };

    const handleShowVendorClicks = async (vendor) => {
        await fetchVendorAnalyticsModalData('clicks', vendor, 1);
    };

    if (loading) {
        return (
            <div id="dashboard-view" className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="dash-page-header">
                    <SkeletonText width="160px" height="20px" />
                    <SkeletonText width="360px" height="13px" style={{ marginBottom: 0 }} />
                </div>
                <div className="dash-stats-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div className="stat-card" key={i}>
                            <SkeletonCircle size="38px" />
                            <SkeletonText width="70%" height="10px" style={{ marginTop: '0.6rem' }} />
                            <SkeletonText width="45%" height="18px" style={{ marginBottom: 0 }} />
                        </div>
                    ))}
                </div>
                <div className="dash-charts-grid">
                    <div className="dash-chart-card"><SkeletonBlock height="260px" /></div>
                    <div className="dash-chart-card"><SkeletonBlock height="260px" /></div>
                </div>
                <PageLoaderOverlay label="Loading dashboard…" />
            </div>
        );
    }

    return (
        <div id="dashboard-view" className="view active">
            <div className="dash-page-header">
                <h3>Dashboard</h3>
                <p>Overview of vendors, products and customer activity across the platform.</p>
            </div>

            <div className="dash-stats-grid">
                <StatCard label="Total Vendors" value={stats.vendors} icon={Store} />
                <StatCard label="Active Vendors" value={stats.active_vendors} icon={CheckCircle2} />
                <StatCard label="Pending KYC" value={stats.pending_kyc} icon={ShieldAlert} />
                <StatCard label="Total Products" value={stats.products} icon={Package} />
                <StatCard label="Total Customers" value={stats.customers} icon={Users} />
                <StatCard label="Guest Users" value={stats.guests} icon={UserRound} />
            </div>

            <div className="dash-charts-grid">
                <ChartCard title="Vendor Growth">
                    <div style={{ width: '100%', height: 260 }}>
                        <Line options={chartOptions} data={vendorGrowthData} />
                    </div>
                </ChartCard>
                <ChartCard title="Product Posts">
                    <div style={{ width: '100%', height: 260 }}>
                        <Bar options={chartOptions} data={productPostsData} />
                    </div>
                </ChartCard>
            </div>
            <Modal isOpen={showVendorModal} onClose={() => { setShowVendorModal(false); setSelectedVendor(null); }} title="Vendor Details" maxWidth="1100px" contentClassName="premium-modal-content">
                <div className="premium-modal">
                    {vendorDetailsLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading vendor details...</div>
                    ) : selectedVendor ? (
                        <div className="premium-modal-body">
                            <div className="premium-modal-header-row">
                                <div className="product-header">
                                    <div className="product-image">
                                        {selectedVendor.kyc?.logo || selectedVendor.logo ? (
                                            <img src={getImageUrl(selectedVendor.kyc?.logo || selectedVendor.logo)} alt="Vendor logo" />
                                        ) : (
                                            <div className="no-image">{selectedVendor.brand_name?.charAt(0) || selectedVendor.username?.charAt(0) || 'V'}</div>
                                        )}
                                    </div>
                                    <div className="product-meta">
                                        <h1 className="product-title">{selectedVendor.brand_name || selectedVendor.username}</h1>
                                        <div className="product-type">{selectedVendor.category || ''}</div>
                                        <div className="vendor-row"><span className="vendor-badge">{selectedVendor.email || '—'}</span></div>
                                    </div>
                                </div>
                                <div className="product-status-wrapper">
                                    <span className={`status-badge ${selectedVendor.is_active ? 'status-active' : 'status-pending'}`}>{selectedVendor.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                                </div>
                            </div>

                            <div className="premium-modal-grid">
                                <div className="left-col">
                                    <div className="info-card">
                                        <h3 className="card-title">Contact & Account</h3>
                                        <p className="description-text"><strong>Username:</strong> {selectedVendor.username || '—'}</p>
                                        <p className="description-text"><strong>Email:</strong> {selectedVendor.email || '—'}</p>
                                        <p className="description-text"><strong>Phone:</strong> {selectedVendor.phone_number || selectedVendor.phone || '—'}</p>
                                        <p className="description-text"><strong>Status:</strong> <span className={`status-badge ${selectedVendor.is_active ? 'status-active' : 'status-pending'}`}>{selectedVendor.is_active ? 'ACTIVE' : 'INACTIVE'}</span></p>
                                    </div>

                                    <div className="info-card">
                                        <h3 className="card-title">Business</h3>
                                        <p className="description-text"><strong>Brand Name:</strong> {selectedVendor.brand_name || '—'}</p>
                                        <p className="description-text"><strong>Address:</strong> {selectedVendor.address || selectedVendor.kyc?.address || '—'}</p>
                                    </div>
                                </div>

                                <div className="right-col">
                                    <div className="info-card product-info-card">
                                        <h3 className="card-title">Vendor Information</h3>
                                        <div className="info-row"><div className="info-label">Vendor ID</div><div className="info-value">{selectedVendor.id}</div></div>
                                        <div className="info-row"><div className="info-label">Joined</div><div className="info-value">{(selectedVendor.date_joined || selectedVendor.created_at) ? new Date(selectedVendor.date_joined || selectedVendor.created_at).toLocaleString() : '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Products</div><div className="info-value">{selectedVendor.product_count ?? '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Assigned Categories</div><div className="info-value">{selectedVendor.assigned_categories?.length ?? 0}</div></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>No vendor details available.</div>
                    )}
                </div>
            </Modal>

            <div className="section-header" style={{ marginBottom: '2rem' }}>
                <div className="header-left">
                    <h3>Recent Vendor Activities</h3>
                </div>
            </div>
            <div className="data-section" style={{ marginBottom: '1rem' }}>
                <div className="section-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="toolbar-controls">
                        <div className="search-box">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search vendors..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                            <option value="ALL">All Status</option>
                            <option value="PENDING">Pending</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                        </select>
                    </div>
                    <Link to="/admin/dashboard/vendors" className="text-accent no-underline hover:underline">View all</Link>
                </div>
            </div>
            <div className="data-section">
                <Table
                    columns={columns}
                    data={displayedRecentVendors}
                    renderRow={renderRow}
                    keyExtractor={(vendor) => vendor.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={filteredRecentVendors.length}
                />
            </div>
            <AnalyticsDetailModal
                isOpen={showVendorVisitorsModal}
                onClose={() => setShowVendorVisitorsModal(false)}
                type="views"
                title={selectedVendorForAnalytics ? `Visitors - ${selectedVendorForAnalytics.brand_name || selectedVendorForAnalytics.username}` : 'Visitors'}
                data={visitorModalData}
                loading={visitorModalLoading}
                currentPage={visitorModalPage}
                totalPages={visitorModalTotalPages}
                totalItems={visitorModalTotalItems}
                onPageChange={(page) => fetchVendorAnalyticsModalData('views', selectedVendorForAnalytics, page)}
            />

            <AnalyticsDetailModal
                isOpen={showVendorFavoritesModal}
                onClose={() => setShowVendorFavoritesModal(false)}
                type="favorites"
                title={selectedVendorForAnalytics ? `Favorites - ${selectedVendorForAnalytics.brand_name || selectedVendorForAnalytics.username}` : 'Favorites'}
                data={favoriteModalData}
                loading={favoriteModalLoading}
                currentPage={favoriteModalPage}
                totalPages={favoriteModalTotalPages}
                totalItems={favoriteModalTotalItems}
                onPageChange={(page) => fetchVendorAnalyticsModalData('favorites', selectedVendorForAnalytics, page)}
            />

            <AnalyticsDetailModal
                isOpen={showVendorClicksModal}
                onClose={() => setShowVendorClicksModal(false)}
                type="purchase_link_click"
                title={selectedVendorForAnalytics ? `Purchase Link Clicks - ${selectedVendorForAnalytics.brand_name || selectedVendorForAnalytics.username}` : 'Purchase Link Clicks'}
                data={clickModalData}
                loading={clickModalLoading}
                currentPage={clickModalPage}
                totalPages={clickModalTotalPages}
                totalItems={clickModalTotalItems}
                onPageChange={(page) => fetchVendorAnalyticsModalData('clicks', selectedVendorForAnalytics, page)}
            />
        </div>
    );
};

export default DashboardHome;
