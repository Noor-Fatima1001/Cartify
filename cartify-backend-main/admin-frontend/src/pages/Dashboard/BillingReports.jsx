import React, { useState, useEffect, useCallback } from 'react';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/tables/DataTable';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonText, SkeletonCircle } from '../../components/common/Skeleton';
import {
    BarChart3, Coins, TrendingUp, Wallet, Megaphone, Clock, CreditCard,
    ShoppingBag, PiggyBank,
} from 'lucide-react';

const BillingReports = () => {
    const { showToast } = useToast();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchReport = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('billing/admin/reports/');
            setReport(res.data);
        } catch (e) {
            console.error('Error loading reports:', e);
            showToast('Failed to load reports', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    if (loading || !report) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="page-header">
                    <div className="header-left">
                        <SkeletonText width="280px" height="20px" />
                        <SkeletonText width="360px" height="13px" style={{ marginBottom: 0 }} />
                    </div>
                </div>
                <div className="stats-grid">
                    {Array.from({ length: 9 }).map((_, i) => (
                        <div className="stat-card" key={i}>
                            <SkeletonCircle size="38px" />
                            <SkeletonText width="70%" height="10px" style={{ marginTop: '0.6rem' }} />
                            <SkeletonText width="45%" height="18px" style={{ marginBottom: 0 }} />
                        </div>
                    ))}
                </div>
                <PageLoaderOverlay label="Loading reports…" />
            </div>
        );
    }

    const n = (v) => Number(v).toLocaleString();

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><BarChart3 size={20} /> Billing &amp; Campaign Reports</h3>
                    <p>Platform-wide revenue, credits, and campaign performance at a glance.</p>
                </div>
            </div>

            <div className="stats-grid">
                <StatCard icon={Coins} label="Credits Sold (Total)" value={n(report.credits_sold.total)} />
                <StatCard icon={Coins} label="Credits Sold (30 days)" value={n(report.credits_sold.last_30_days)} />
                <StatCard icon={TrendingUp} label="Platform Revenue" value={n(report.platform_revenue.total)} />
                <StatCard icon={CreditCard} label="— from Subscriptions" value={n(report.platform_revenue.subscriptions)} />
                <StatCard icon={Megaphone} label="— from Campaigns" value={n(report.platform_revenue.campaigns)} />
                <StatCard icon={Megaphone} label="Active Campaigns" value={report.active_campaigns} />
                <StatCard icon={Clock} label="Pending Top-ups" value={report.pending_topups} />
                <StatCard icon={ShoppingBag} label="Subscription Sales (Total)" value={report.subscription_sales.total_count} />
                <StatCard icon={ShoppingBag} label="Subscriptions (30 days)" value={report.subscription_sales.last_30_days_count} />
                <StatCard icon={Wallet} label="Outstanding Wallet Credits" value={n(report.total_wallet_balance)} />
            </div>

            <div className="data-section">
                <div className="section-header"><h3><PiggyBank size={16} style={{ marginRight: '0.4rem', verticalAlign: '-3px' }} />Most Clicked Products</h3></div>
                <DataTable
                    columns={['Product', 'Vendor', 'Link Clicks']}
                    data={report.most_clicked_products}
                    keyExtractor={(p) => p.product_id}
                    renderRow={(p) => (
                        <>
                            <td><strong>{p.product_name}</strong></td>
                            <td>{p.vendor_username}</td>
                            <td>{n(p.clicks)}</td>
                        </>
                    )}
                />
            </div>

            <div className="data-section">
                <div className="section-header"><h3>Top Vendors by Spend</h3></div>
                <DataTable
                    columns={['Vendor', 'Campaign Spend', 'Subscription Spend', 'Total']}
                    data={report.top_vendors}
                    keyExtractor={(v) => v.vendor_id}
                    renderRow={(v) => (
                        <>
                            <td><strong>{v.vendor_username}</strong></td>
                            <td>{n(v.campaign_spend)}</td>
                            <td>{n(v.subscription_spend)}</td>
                            <td>{n(v.total_spend)}</td>
                        </>
                    )}
                />
            </div>
        </div>
    );
};

export default BillingReports;
