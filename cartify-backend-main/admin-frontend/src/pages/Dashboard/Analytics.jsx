import React, { useState, useEffect } from 'react';
import {
    Users, Store, Package, Heart,
    BarChart3, Calendar, TrendingUp, Wallet, PieChart, Clock,
    Megaphone, Activity, Filter, Sparkles, ShoppingCart,
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { analyticsService } from '../../services/analyticsService';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/tables/DataTable';
import StatCard from '../../components/common/StatCard';
import ChartCard from '../../components/common/ChartCard';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonText, SkeletonBlock, SkeletonCircle } from '../../components/common/Skeleton';
import { chartBaseOptions, chartColors } from '../../utils/chartTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const barOptions = {
    ...chartBaseOptions,
    plugins: {
        ...chartBaseOptions.plugins,
        legend: { display: false },
    },
};

const stackedOptions = {
    ...chartBaseOptions,
    scales: {
        x: { ...chartBaseOptions.scales.x, stacked: true },
        y: { ...chartBaseOptions.scales.y, stacked: true },
    },
};

const n = (v) => Number(v || 0).toLocaleString();

const buildBarData = (data, color, label = 'Count') => ({
    labels: data.map((item) => item.label),
    datasets: [
        {
            label,
            data: data.map((item) => item.count),
            backgroundColor: color,
            borderRadius: 6,
            barPercentage: 0.7,
        },
    ],
});

const buildMultiLineData = (labels, series) => ({
    labels,
    datasets: series.map(({ label, data, color }) => ({
        label,
        data,
        borderColor: color,
        backgroundColor: color,
        tension: 0.35,
        pointRadius: 3,
    })),
});

const buildStackedBarData = (labels, series) => ({
    labels,
    datasets: series.map(({ label, data, color }) => ({
        label,
        data,
        backgroundColor: color,
        borderRadius: 4,
        stack: 'stack1',
    })),
});

const Analytics = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const res = await analyticsService.getAdminAnalytics();
            setData(res);
        } catch (error) {
            console.error('Error fetching analytics:', error);
            showToast('Failed to load analytics', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="page-header">
                    <div className="header-left">
                        <SkeletonText width="200px" height="20px" />
                        <SkeletonText width="280px" height="13px" style={{ marginBottom: 0 }} />
                    </div>
                </div>
                <div className="stats-grid">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div className="stat-card" key={i}>
                            <SkeletonCircle size="38px" />
                            <SkeletonText width="70%" height="10px" style={{ marginTop: '0.6rem' }} />
                            <SkeletonText width="45%" height="18px" style={{ marginBottom: 0 }} />
                        </div>
                    ))}
                </div>
                <div className="dash-chart-card"><SkeletonBlock height="260px" /></div>
                <PageLoaderOverlay label="Aggregating system data…" />
            </div>
        );
    }

    const {
        stats, vendor_growth, product_posts, top_vendors,
        revenue_trend = [], topup_trend = [], plan_distribution = [],
        subscription_activity = {}, upcoming_expirations = {},
        campaign_objective_spend = [], engagement_trend = [],
        conversion_funnel = {}, sponsored_vs_organic = {},
    } = data;

    const PAGE_SIZE = 5;
    const totalPages = Math.max(1, Math.ceil((top_vendors?.length || 0) / PAGE_SIZE));
    const displayedVendors = (top_vendors || []).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const columns = ['Vendor', 'Products', 'Favorites', 'Activity'];

    const renderRow = (v) => (
        <>
            <td>
                <div className="vendor-info">
                    <div className="vendor-avatar" style={{ borderRadius: '50%' }}>
                        {v.name ? v.name[0].toUpperCase() : ''}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600 }}>{v.name}</div>
                    </div>
                </div>
            </td>
            <td>{v.products}</td>
            <td>{v.favorites}</td>
            <td>
                <span className="dash-badge" style={{ background: 'var(--dash-success-soft)', color: 'var(--dash-success)' }}>High</span>
            </td>
        </>
    );

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3>System Analytics</h3>
                    <p>Real-time performance and growth metrics.</p>
                </div>
            </div>

            <div className="stats-grid">
                <StatCard
                    label="Total Customers"
                    value={stats.total_customers}
                    icon={Users}
                    hint={`+${stats.conversion_rate}% conversion rate`}
                />
                <StatCard
                    label="Total Vendors"
                    value={stats.total_vendors}
                    icon={Store}
                    hint={`${stats.active_vendors} active / ${stats.pending_kyc} pending`}
                />
                <StatCard
                    label="Total Products"
                    value={stats.total_products}
                    icon={Package}
                    hint={`${stats.active_products} visible on marketplace`}
                />
                <StatCard
                    label="Total Favorites"
                    value={stats.total_favorites}
                    icon={Heart}
                    hint="Across all platforms"
                />
            </div>

            <div className="charts-grid">
                <ChartCard title={<><BarChart3 size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--dash-accent)' }} />Product Postings (Last 7 Days)</>}>
                    <div style={{ width: '100%', height: 260 }}>
                        <Bar
                            options={barOptions}
                            data={buildBarData(product_posts.map((item) => ({ label: item.day || item.month, count: item.count })), chartColors.accent)}
                        />
                    </div>
                </ChartCard>
                <ChartCard title={<><Calendar size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--dash-success)' }} />Vendor Signups (Last 6 Months)</>}>
                    <div style={{ width: '100%', height: 260 }}>
                        <Bar
                            options={barOptions}
                            data={buildBarData(vendor_growth.map((item) => ({ label: item.month?.split(' ')[0] || item.month, count: item.count })), chartColors.success)}
                        />
                    </div>
                </ChartCard>
            </div>

            {/* ── Revenue & Monetization ── */}
            <div className="page-header" style={{ marginTop: '1rem' }}>
                <div className="header-left">
                    <h3>Revenue &amp; Monetization</h3>
                    <p>Subscription, campaign, and wallet top-up revenue.</p>
                </div>
            </div>

            <div className="charts-grid">
                <ChartCard title={<><TrendingUp size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--dash-accent)' }} />Revenue Trend (Last 6 Months)</>}>
                    <div style={{ width: '100%', height: 260 }}>
                        <Bar
                            options={stackedOptions}
                            data={buildStackedBarData(
                                revenue_trend.map((item) => item.month?.split(' ')[0] || item.month),
                                [
                                    { label: 'Subscriptions', data: revenue_trend.map((i) => i.subscriptions), color: chartColors.info },
                                    { label: 'Campaigns', data: revenue_trend.map((i) => i.campaigns), color: chartColors.accent },
                                    { label: 'Top-ups', data: revenue_trend.map((i) => i.topups), color: chartColors.success },
                                ]
                            )}
                        />
                    </div>
                </ChartCard>
                <ChartCard title={<><Wallet size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--dash-success)' }} />Wallet Top-up Volume (Last 7 Days)</>}>
                    <div style={{ width: '100%', height: 260 }}>
                        <Bar
                            options={barOptions}
                            data={buildBarData(topup_trend.map((item) => ({ label: item.day, count: item.amount })), chartColors.success, 'Credits')}
                        />
                    </div>
                </ChartCard>
            </div>

            {/* ── Subscription Health ── */}
            <div className="page-header" style={{ marginTop: '1rem' }}>
                <div className="header-left">
                    <h3>Subscription Health</h3>
                    <p>Plan mix, renewal activity, and upcoming expirations.</p>
                </div>
            </div>

            <div className="stats-grid">
                <StatCard label="Purchased (30 days)" value={n(subscription_activity.purchased)} icon={ShoppingCart} />
                <StatCard label="Renewed (30 days)" value={n(subscription_activity.renewed)} icon={PieChart} />
                <StatCard label="Cancel Scheduled (30 days)" value={n(subscription_activity.cancel_scheduled)} icon={Clock} />
                <StatCard label="Expiring in 7 / 30 Days" value={`${n(upcoming_expirations.next_7_days)} / ${n(upcoming_expirations.next_30_days)}`} icon={Calendar} />
            </div>

            <div className="data-section">
                <div className="section-header"><h3>Plan Distribution</h3></div>
                <DataTable
                    columns={['Plan', 'Active Vendors']}
                    data={plan_distribution}
                    keyExtractor={(p, i) => p.plan || i}
                    renderRow={(p) => (
                        <>
                            <td><strong>{p.plan}</strong></td>
                            <td>{n(p.vendor_count)}</td>
                        </>
                    )}
                />
            </div>

            {upcoming_expirations.soonest?.length > 0 && (
                <div className="data-section">
                    <div className="section-header"><h3>Soonest Expirations</h3></div>
                    <DataTable
                        columns={['Vendor', 'Plan', 'Expires', 'Auto-cancel?']}
                        data={upcoming_expirations.soonest}
                        keyExtractor={(s, i) => `${s.vendor_username}-${i}`}
                        renderRow={(s) => (
                            <>
                                <td><strong>{s.vendor_username}</strong></td>
                                <td>{s.plan}</td>
                                <td>{new Date(s.expires_at).toLocaleDateString()}</td>
                                <td>{s.cancel_at_period_end ? 'Yes' : 'No'}</td>
                            </>
                        )}
                    />
                </div>
            )}

            {/* ── Campaigns & Engagement ── */}
            <div className="page-header" style={{ marginTop: '1rem' }}>
                <div className="header-left">
                    <h3>Campaigns &amp; Engagement</h3>
                    <p>Ad spend by objective, platform-wide interaction trends, and sponsored lift.</p>
                </div>
            </div>

            <div className="charts-grid">
                <ChartCard title={<><Megaphone size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--dash-accent)' }} />Campaign Spend by Objective</>}>
                    <div style={{ width: '100%', height: 260 }}>
                        <Bar
                            options={barOptions}
                            data={buildBarData(campaign_objective_spend.map((item) => ({ label: item.objective, count: item.spend })), chartColors.accent, 'Credits Spent')}
                        />
                    </div>
                </ChartCard>
                <ChartCard title={<><Activity size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--dash-info, #2f6fa8)' }} />Platform Engagement (Last 7 Days)</>}>
                    <div style={{ width: '100%', height: 260 }}>
                        <Line
                            options={chartBaseOptions}
                            data={buildMultiLineData(
                                engagement_trend.map((i) => i.day),
                                [
                                    { label: 'Views', data: engagement_trend.map((i) => i.views), color: chartColors.palette[1] },
                                    { label: 'Favorites', data: engagement_trend.map((i) => i.favorites), color: chartColors.palette[0] },
                                    { label: 'Cart Adds', data: engagement_trend.map((i) => i.cart_adds), color: chartColors.palette[2] },
                                    { label: 'Link Clicks', data: engagement_trend.map((i) => i.link_clicks), color: chartColors.palette[4] },
                                ]
                            )}
                        />
                    </div>
                </ChartCard>
            </div>

            <div className="stats-grid">
                <StatCard label="Views (30 days)" value={n(conversion_funnel.views)} icon={Filter} />
                <StatCard label="Cart Adds (30 days)" value={n(conversion_funnel.cart_adds)} icon={Package} hint={`${conversion_funnel.view_to_cart_rate}% of views`} />
                <StatCard label="Link Clicks (30 days)" value={n(conversion_funnel.link_clicks)} icon={BarChart3} hint={`${conversion_funnel.view_to_click_rate}% of views`} />
            </div>

            <div className="data-section">
                <div className="section-header"><h3><Sparkles size={16} style={{ marginRight: '0.4rem', verticalAlign: '-3px' }} />Sponsored vs Organic (Last 30 Days)</h3></div>
                <DataTable
                    columns={['Segment', 'Products', 'Views', 'Link Clicks', 'CTR']}
                    data={[
                        { segment: 'Sponsored', ...sponsored_vs_organic.sponsored },
                        { segment: 'Organic', ...sponsored_vs_organic.organic },
                    ]}
                    keyExtractor={(s) => s.segment}
                    renderRow={(s) => (
                        <>
                            <td><strong>{s.segment}</strong></td>
                            <td>{n(s.products)}</td>
                            <td>{n(s.views)}</td>
                            <td>{n(s.link_clicks)}</td>
                            <td>{s.ctr}%</td>
                        </>
                    )}
                />
            </div>

            <div className="data-section">
                <div className="section-header">
                    <h3>Top Performing Vendors</h3>
                </div>
                <DataTable
                    columns={columns}
                    data={displayedVendors}
                    renderRow={renderRow}
                    keyExtractor={(v, i) => v.name || i}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={top_vendors?.length || 0}
                    loading={loading}
                />
            </div>
        </div>
    );
};

export default Analytics;
