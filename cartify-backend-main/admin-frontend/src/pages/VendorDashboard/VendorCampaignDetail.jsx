import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import StatCard from '../../components/common/StatCard';
import ChartCard from '../../components/common/ChartCard';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/tables/DataTable';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import ProductPicker from '../../components/common/ProductPicker';
import { campaignService } from '../../services/campaignService';
import { analyticsService } from '../../services/analyticsService';
import { vendorService } from '../../services/vendorService';
import { billingService } from '../../services/billingService';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonText, SkeletonBlock, SkeletonStatRow } from '../../components/common/Skeleton';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';
import { chartColors, chartBaseOptions } from '../../utils/chartTheme';
import { ArrowLeft, Play, Pause, Square, Coins, History, Pencil } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const AUDIT_PAGE_SIZE = 10;

const productNamesFromState = (state) => {
    const products = state?.products || [];
    if (!products.length) return '—';
    return products.map((p) => p.product_name || `#${p.product_id}`).join(', ');
};

const productDiff = (previous, next) => {
    const prevList = previous?.products || [];
    const nextList = next?.products || [];
    const prevIds = new Set(prevList.map((p) => p.product_id));
    const nextIds = new Set(nextList.map((p) => p.product_id));
    return {
        added: nextList.filter((p) => !prevIds.has(p.product_id)).map((p) => p.product_name || `#${p.product_id}`),
        removed: prevList.filter((p) => !nextIds.has(p.product_id)).map((p) => p.product_name || `#${p.product_id}`),
    };
};

const VALUE_BADGE_COLORS = {
    budget: { bg: 'var(--dash-info-soft)', fg: 'var(--dash-info)' },
    products: { bg: 'var(--dash-neutral-soft)', fg: 'var(--dash-neutral)' },
    added: { bg: 'var(--dash-success-soft)', fg: 'var(--dash-success)' },
    removed: { bg: 'var(--dash-danger-soft)', fg: 'var(--dash-danger)' },
};

// A badge around one value only (one product name, one number) — never a
// whole joined sentence or comma-list, so two products show as two separate
// badges, not one badge containing "A, B".
const ValueBadge = ({ tone, children }) => {
    const color = VALUE_BADGE_COLORS[tone] || VALUE_BADGE_COLORS.products;
    return <span className="dash-badge" style={{ background: color.bg, color: color.fg }}>{children}</span>;
};

// Every audit row's stored snapshot includes the full campaign state (budget,
// products, status), even for actions that didn't touch those fields — so
// showing "before -> after" for budget/products on every row (a Start/Pause/
// Stop entry included) just repeats the same unchanged values and buries the
// one field that actually changed. Only surface what this specific action
// changed instead: a plain-text label per line, with each individual value
// (each product, each number) as its own small badge next to it.
//
// The "Reason" a vendor can attach to a Pause/Stop lives here too, instead of
// its own column, since it's only ever populated for those two actions — a
// standalone column that's empty for every other row is more confusing than
// a line that only shows up when a reason actually exists.
const renderChangeDetails = (l) => {
    const rows = [];

    if (l.action === 'CREATED') {
        rows.push(
            <div className="audit-detail-row" key="budget">
                <span className="audit-detail-label">Budget:</span>
                <ValueBadge tone="budget">{Number(l.new_state?.total_budget ?? 0).toLocaleString()} cr</ValueBadge>
            </div>
        );
        rows.push(
            <div className="audit-detail-row" key="products">
                <span className="audit-detail-label">Products:</span>
                <span className="audit-detail-badges">
                    {(l.new_state?.products || []).map((p) => (
                        <ValueBadge key={p.product_id} tone="products">{p.product_name || `#${p.product_id}`}</ValueBadge>
                    ))}
                </span>
            </div>
        );
    } else if (l.action === 'BUDGET_CHANGED') {
        rows.push(
            <div className="audit-detail-row" key="budget">
                <span className="audit-detail-label">Budget:</span>
                <ValueBadge tone="budget">{Number(l.previous_state?.total_budget ?? 0).toLocaleString()} cr</ValueBadge>
                <span className="audit-detail-arrow">→</span>
                <ValueBadge tone="budget">{Number(l.new_state?.total_budget ?? 0).toLocaleString()} cr</ValueBadge>
            </div>
        );
    } else if (l.action === 'PRODUCTS_CHANGED') {
        const { added, removed } = productDiff(l.previous_state, l.new_state);
        if (added.length > 0) {
            rows.push(
                <div className="audit-detail-row" key="added">
                    <span className="audit-detail-label">Added:</span>
                    <span className="audit-detail-badges">
                        {added.map((name) => <ValueBadge key={name} tone="added">{name}</ValueBadge>)}
                    </span>
                </div>
            );
        }
        if (removed.length > 0) {
            rows.push(
                <div className="audit-detail-row" key="removed">
                    <span className="audit-detail-label">Removed:</span>
                    <span className="audit-detail-badges">
                        {removed.map((name) => <ValueBadge key={name} tone="removed">{name}</ValueBadge>)}
                    </span>
                </div>
            );
        }
    }

    if (l.reason) {
        rows.push(
            <div className="audit-detail-row" key="reason">
                <span className="audit-detail-label">Reason:</span>
                <span className="audit-detail-text">{l.reason}</span>
            </div>
        );
    }

    if (rows.length === 0) return '—';
    return <div className="audit-detail-rows">{rows}</div>;
};

const VendorCampaignDetail = ({ isAdminView = false }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { prompt } = usePrompt();

    const [campaign, setCampaign] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditPage, setAuditPage] = useState(1);
    const [auditTotalPages, setAuditTotalPages] = useState(1);
    const [auditTotalItems, setAuditTotalItems] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [showBudget, setShowBudget] = useState(false);
    const [newBudget, setNewBudget] = useState('');
    const [showEdit, setShowEdit] = useState(false);
    const [editForm, setEditForm] = useState({ name: '' });
    const [editSelection, setEditSelection] = useState({});
    const [editProducts, setEditProducts] = useState([]);
    const [showDuplicate, setShowDuplicate] = useState(false);
    const [duplicateForm, setDuplicateForm] = useState({ name: '', budget: '' });
    const [duplicateSelection, setDuplicateSelection] = useState({});
    const [duplicateProducts, setDuplicateProducts] = useState([]);
    const [duplicateBalance, setDuplicateBalance] = useState(null);
    const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
    const [analyticsModalType, setAnalyticsModalType] = useState('views');
    const [analyticsModalData, setAnalyticsModalData] = useState([]);
    const [analyticsModalLoading, setAnalyticsModalLoading] = useState(false);
    const [analyticsModalPage, setAnalyticsModalPage] = useState(1);
    const [analyticsModalTotalPages, setAnalyticsModalTotalPages] = useState(1);
    const [analyticsModalTotalItems, setAnalyticsModalTotalItems] = useState(0);
    const [analyticsModalProduct, setAnalyticsModalProduct] = useState(null);
    const [analyticsModalVisitorLimit, setAnalyticsModalVisitorLimit] = useState(null);
    const [analyticsModalLockedCount, setAnalyticsModalLockedCount] = useState(0);

    const fetchAuditLogs = useCallback(async (page = 1) => {
        try {
            const logs = await campaignService.getAuditLogs(id, { page, limit: AUDIT_PAGE_SIZE }, isAdminView);
            setAuditLogs(logs.results || []);
            setAuditPage(logs.current_page || page);
            setAuditTotalPages(logs.total_pages || 1);
            setAuditTotalItems(logs.total_items || 0);
        } catch (e) {
            console.error('Error loading audit logs:', e);
        }
    }, [id, isAdminView]);

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const [detail, analyticsData] = await Promise.all([
                campaignService.getCampaign(id, isAdminView),
                campaignService.getAnalytics(id, isAdminView),
            ]);
            setCampaign(detail.campaign);
            setAnalytics(analyticsData);
        } catch (e) {
            console.error('Error loading campaign:', e);
            showToast('Failed to load campaign', 'error');
        } finally {
            setLoading(false);
        }
    }, [id, isAdminView, showToast]);

    useEffect(() => { fetchAll(); fetchAuditLogs(1); }, [fetchAll, fetchAuditLogs]);

    const runAction = async (fn, confirmMsg) => {
        if (confirmMsg) {
            const ok = await prompt({ title: 'Confirm', message: confirmMsg, showInput: false });
            if (!ok) return;
        }
        try {
            setBusy(true);
            const res = await fn(id);
            showToast(res.message || 'Done');
            fetchAll();
            fetchAuditLogs(1);
        } catch (e) {
            showToast(e.response?.data?.error || 'Action failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    // Pause/Stop take an optional reason, recorded on the audit log. prompt()
    // resolves null on Cancel and the (possibly empty) typed string on Submit —
    // must check `=== null`, not falsy, so an intentionally-blank reason still submits.
    const runReasonAction = async (fn, title, message) => {
        const result = await prompt({ title, message, placeholder: 'Optional — visible in campaign history', showInput: true });
        if (result === null) return;
        try {
            setBusy(true);
            const res = await fn(id, result || '');
            showToast(res.message || 'Done');
            fetchAll();
            fetchAuditLogs(1);
        } catch (e) {
            showToast(e.response?.data?.error || 'Action failed', 'error');
        } finally {
            setBusy(false);
        }
    };

    const openEditForm = async (c) => {
        setEditForm({ name: c.name });
        const seed = {};
        (c.products || []).forEach((cp) => { seed[cp.product_id] = { ...cp.objectives }; });
        setEditSelection(seed);
        setShowEdit(true);
        try {
            const productsData = await vendorService.getVendorProducts({ limit: 200 });
            setEditProducts(Array.isArray(productsData) ? productsData : (productsData?.results || []));
        } catch (e) {
            console.error('Error loading products for edit:', e);
        }
    };

    // Backend only allows editing products/objectives while DRAFT or PAUSED
    // (update_campaign_products in campaign_service.py). An ACTIVE campaign
    // has no direct edit path, so pause it first and drop straight into the
    // edit form rather than leaving the user with no button at all.
    const openEdit = async () => {
        if (campaign.status === 'ACTIVE') {
            const ok = await prompt({
                title: 'Pause to Edit',
                message: 'Adding or removing products requires pausing the campaign first. Pause now and continue editing? You can resume afterwards.',
                showInput: false,
            });
            if (!ok) return;
            try {
                setBusy(true);
                await campaignService.pauseCampaign(id, '');
                const fresh = await campaignService.getCampaign(id, isAdminView);
                setCampaign(fresh.campaign);
                fetchAuditLogs(1);
                showToast('Campaign paused — resume it from this page when you\'re done editing.');
                await openEditForm(fresh.campaign);
            } catch (e) {
                showToast(e.response?.data?.error || 'Failed to pause campaign', 'error');
            } finally {
                setBusy(false);
            }
            return;
        }
        await openEditForm(campaign);
    };

    const toggleEditObjective = (productId, key) => {
        setEditSelection((prev) => {
            const current = prev[productId] || {};
            const next = { ...current, [key]: !current[key] };
            if (!Object.values(next).some(Boolean)) {
                const copy = { ...prev };
                delete copy[productId];
                return copy;
            }
            return { ...prev, [productId]: next };
        });
    };

    const addProductToEdit = (productId) => {
        setEditSelection((prev) => ({ ...prev, [productId]: { views: true, favorites: false, cart_adds: false, link_clicks: false } }));
    };

    const removeProductFromEdit = (productId) => {
        setEditSelection((prev) => {
            const copy = { ...prev };
            delete copy[productId];
            return copy;
        });
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        const products = Object.entries(editSelection).map(([productId, objectives]) => ({
            product_id: Number(productId),
            objectives,
        }));
        if (!editForm.name.trim()) return showToast('Campaign name is required', 'error');
        if (products.length === 0) return showToast('Select at least one product with an objective', 'error');
        try {
            setBusy(true);
            const res = await campaignService.updateCampaign(id, { name: editForm.name.trim(), products });
            showToast(res.message || 'Campaign updated');
            setShowEdit(false);
            fetchAll();
            fetchAuditLogs(1);
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to update campaign', 'error');
        } finally {
            setBusy(false);
        }
    };

    // A campaign that has ended (stopped, cancelled, or finished its month)
    // is terminal — there's no "reopen" path, matching how ad platforms
    // generally work. Duplicating pre-fills a fresh Draft with the same
    // targeting so the vendor doesn't have to rebuild it by hand.
    const openDuplicate = async () => {
        setDuplicateForm({ name: `${campaign.name} (Copy)`, budget: '' });
        const seed = {};
        (campaign.products || []).forEach((cp) => { seed[cp.product_id] = { ...cp.objectives }; });
        setDuplicateSelection(seed);
        setShowDuplicate(true);
        try {
            const [walletData, productsData] = await Promise.all([
                billingService.getWallet(),
                vendorService.getVendorProducts({ limit: 200 }),
            ]);
            setDuplicateBalance(Number(walletData.balance));
            const productList = Array.isArray(productsData) ? productsData : (productsData?.results || []);
            setDuplicateProducts(productList.filter((p) => p.is_active !== false));
        } catch (e) {
            console.error('Error loading data for duplicate:', e);
        }
    };

    const toggleDuplicateObjective = (productId, key) => {
        setDuplicateSelection((prev) => {
            const current = prev[productId] || {};
            const next = { ...current, [key]: !current[key] };
            if (!Object.values(next).some(Boolean)) {
                const copy = { ...prev };
                delete copy[productId];
                return copy;
            }
            return { ...prev, [productId]: next };
        });
    };

    const addProductToDuplicate = (productId) => {
        setDuplicateSelection((prev) => ({ ...prev, [productId]: { views: true, favorites: false, cart_adds: false, link_clicks: false } }));
    };

    const removeProductFromDuplicate = (productId) => {
        setDuplicateSelection((prev) => {
            const copy = { ...prev };
            delete copy[productId];
            return copy;
        });
    };

    const submitDuplicate = async (e) => {
        e.preventDefault();
        const products = Object.entries(duplicateSelection).map(([productId, objectives]) => ({
            product_id: Number(productId),
            objectives,
        }));
        if (!duplicateForm.name.trim()) return showToast('Campaign name is required', 'error');
        if (!duplicateForm.budget || Number(duplicateForm.budget) <= 0) return showToast('Enter a valid budget', 'error');
        if (duplicateBalance !== null && Number(duplicateForm.budget) > duplicateBalance) {
            return showToast(`Budget exceeds your available credits (${duplicateBalance.toLocaleString()})`, 'error');
        }
        if (products.length === 0) return showToast('Select at least one product with an objective', 'error');
        try {
            setBusy(true);
            const res = await campaignService.createCampaign({
                name: duplicateForm.name.trim(), budget: duplicateForm.budget, products,
            });
            showToast('New campaign created as a Draft — start it when ready');
            setShowDuplicate(false);
            navigate(`/admin/vendor-dashboard/campaigns/${res.campaign.id}`);
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to create campaign', 'error');
        } finally {
            setBusy(false);
        }
    };

    const submitBudget = async (e) => {
        e.preventDefault();
        try {
            setBusy(true);
            const res = await campaignService.changeBudget(id, newBudget);
            showToast(res.message || 'Budget updated');
            setShowBudget(false);
            fetchAll();
            fetchAuditLogs(1);
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to update budget', 'error');
        } finally {
            setBusy(false);
        }
    };

    const openAnalyticsModal = useCallback(async (type, product, page = 1) => {
        if (!product?.product_id) return;

        try {
            setAnalyticsModalLoading(true);
            setAnalyticsModalType(type);
            setAnalyticsModalProduct(product);
            setShowAnalyticsModal(true);

            const params = {
                product_id: product.product_id,
                limit: ANALYTICS_PAGE_SIZE,
                page,
            };
            // Scope the popup to this campaign's own run — otherwise it pulls the
            // product's all-time analytics, which won't match the count on the
            // badge that opened it (that count is campaign.charges-based, i.e.
            // already restricted to this campaign's window).
            if (campaign?.started_at) params.start_date = campaign.started_at;
            if (campaign?.completed_at) params.end_date = campaign.completed_at;
            else if (campaign?.ends_at) params.end_date = campaign.ends_at;

            const res = type === 'favorites'
                ? isAdminView
                    ? await analyticsService.getAdminDetailedFavorites(params)
                    : await analyticsService.getVendorDetailedFavorites(params)
                : type === 'clicks'
                    ? isAdminView
                        ? await analyticsService.getAdminDetailedClicks(params)
                        : await analyticsService.getVendorDetailedClicks(params)
                    : type === 'cart'
                        ? isAdminView
                            ? await analyticsService.getAdminDetailedCart(params)
                            : await analyticsService.getVendorDetailedCart(params)
                        : isAdminView
                            ? await analyticsService.getAdminDetailedViews(params)
                            : await analyticsService.getVendorDetailedViews(params);

            const pagination = normalizeAnalyticsPagination(res, page, ANALYTICS_PAGE_SIZE);
            setAnalyticsModalData(pagination.results);
            setAnalyticsModalPage(pagination.currentPage);
            setAnalyticsModalTotalPages(pagination.totalPages);
            setAnalyticsModalTotalItems(pagination.totalItems);
            setAnalyticsModalVisitorLimit(res.visitor_limit ?? null);
            setAnalyticsModalLockedCount(res.locked_count || 0);
            setAnalyticsModalType(type);
        } catch (error) {
            console.error(`Failed to load ${type} analytics:`, error);
            showToast(`Failed to load ${type} analytics`, 'error');
        } finally {
            setAnalyticsModalLoading(false);
        }
    }, [showToast, campaign, isAdminView]);

    // `loading` also flips true on action-triggered refetches (start/pause/
    // budget update/edit all call fetchAll()) — gate the full skeleton on "no
    // data yet" so those refetches don't blank the page out again.
    if (!campaign) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="detail-header">
                    <h2>
                        <button className="detail-header-back" onClick={() => navigate(isAdminView ? '/admin/dashboard/campaigns' : '/admin/vendor-dashboard/campaigns')}>
                            <ArrowLeft size={20} />
                        </button>
                        <SkeletonText width="220px" height="20px" style={{ marginBottom: 0, display: 'inline-block' }} />
                    </h2>
                </div>
                <SkeletonStatRow count={7} />
                <div className="data-section" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
                    <SkeletonBlock height="260px" />
                </div>
                <PageLoaderOverlay label="Loading campaign…" />
            </div>
        );
    }

    const totals = analytics?.totals;
    const daily = analytics?.daily || [];

    const chartData = {
        labels: daily.map((d) => d.date),
        datasets: [
            { label: 'Spend', data: daily.map((d) => Number(d.spend)), borderColor: chartColors.palette[0], backgroundColor: 'transparent', tension: 0.3 },
            { label: 'Views', data: daily.map((d) => d.views), borderColor: chartColors.palette[1], backgroundColor: 'transparent', tension: 0.3 },
            { label: 'Favorites', data: daily.map((d) => d.favorites), borderColor: chartColors.palette[2], backgroundColor: 'transparent', tension: 0.3 },
            { label: 'Cart Adds', data: daily.map((d) => d.cart_adds), borderColor: chartColors.palette[3], backgroundColor: 'transparent', tension: 0.3 },
            { label: 'Link Clicks', data: daily.map((d) => d.link_clicks), borderColor: chartColors.palette[4], backgroundColor: 'transparent', tension: 0.3 },
        ],
    };

    const chartOptions = {
        ...chartBaseOptions,
        plugins: {
            ...chartBaseOptions.plugins,
            legend: { ...chartBaseOptions.plugins.legend, position: 'bottom' },
        },
    };

    const editSelectedProducts = editProducts
        .filter((p) => editSelection[p.id])
        .map((p) => ({ product: p, objectives: editSelection[p.id] }));
    const editAvailableProducts = editProducts.filter((p) => !editSelection[p.id]);

    const duplicateSelectedProducts = duplicateProducts
        .filter((p) => duplicateSelection[p.id])
        .map((p) => ({ product: p, objectives: duplicateSelection[p.id] }));
    const duplicateAvailableProducts = duplicateProducts.filter((p) => !duplicateSelection[p.id]);

    return (
        <div className="view active">
            <div className="detail-header">
                <h2>
                    <button className="detail-header-back" onClick={() => navigate(isAdminView ? '/admin/dashboard/campaigns' : '/admin/vendor-dashboard/campaigns')}>
                        <ArrowLeft size={20} />
                    </button>
                    {campaign.name} <StatusBadge status={campaign.display_status || campaign.status} label={campaign.display_status_label || campaign.status_display} />
                    {loading && <span style={{ fontSize: '0.78rem', color: 'var(--dash-ink-faint)', marginLeft: '0.6rem' }}>Refreshing…</span>}
                </h2>
                <div className="action-bar">
                    {!isAdminView && campaign.status === 'DRAFT' && (
                        <button className="btn btn-primary" disabled={busy}
                            onClick={() => runAction(campaignService.startCampaign, 'Start this campaign? It will run for 1 month.')}>
                            <Play size={15} /> Start Campaign
                        </button>
                    )}
                    {!isAdminView && ['DRAFT', 'ACTIVE', 'PAUSED'].includes(campaign.status) && (
                        <button className="btn btn-secondary" disabled={busy} onClick={openEdit}
                            title={campaign.status === 'ACTIVE' ? 'Pauses the campaign so products can be edited' : undefined}>
                            <Pencil size={15} /> Edit
                        </button>
                    )}
                    {campaign.status === 'ACTIVE' && (
                        <button className="btn btn-secondary" disabled={busy}
                            onClick={() => runReasonAction(
                                isAdminView ? campaignService.adminPauseCampaign : campaignService.pauseCampaign,
                                'Pause Campaign', 'Why are you pausing this campaign?'
                            )}>
                            <Pause size={15} /> Pause
                        </button>
                    )}
                    {!isAdminView && campaign.status === 'PAUSED' && (
                        <button className="btn btn-primary" disabled={busy}
                            onClick={() => runAction(campaignService.resumeCampaign)}>
                            <Play size={15} /> Resume
                        </button>
                    )}
                    {!isAdminView && ['DRAFT', 'ACTIVE', 'PAUSED', 'OUT_OF_BUDGET'].includes(campaign.status) && (
                        <button className="btn btn-secondary" disabled={busy}
                            onClick={() => { setNewBudget(campaign.total_budget); setShowBudget(true); }}>
                            <Coins size={15} /> Adjust Budget
                        </button>
                    )}
                    {campaign.status === 'DRAFT' && (
                        <button className="btn btn-danger-ghost" disabled={busy}
                            onClick={() => runReasonAction(
                                isAdminView ? campaignService.adminStopCampaign : campaignService.stopCampaign,
                                'Cancel Draft Campaign',
                                `This draft never started, so nothing has been spent — cancelling refunds the full reserved budget (${Number(campaign.total_budget).toLocaleString()} credits). Reason?`
                            )}>
                            <Square size={15} /> Cancel Draft
                        </button>
                    )}
                    {['ACTIVE', 'PAUSED', 'OUT_OF_BUDGET'].includes(campaign.status) && (
                        <button className="btn btn-danger-ghost" disabled={busy}
                            onClick={() => runReasonAction(
                                isAdminView ? campaignService.adminStopCampaign : campaignService.stopCampaign,
                                'Stop Campaign', 'Stopping will refund the unused budget to the vendor\'s credits. Reason?'
                            )}>
                            <Square size={15} /> Stop
                        </button>
                    )}
                    {!isAdminView && campaign.status === 'COMPLETED' && (
                        <button className="btn btn-primary" disabled={busy} onClick={openDuplicate}>
                            <Pencil size={15} /> Duplicate as New Campaign
                        </button>
                    )}
                </div>
            </div>

            {campaign.status === 'COMPLETED' && (
                <div className="info-banner">
                    This campaign has ended ({campaign.display_status_label || campaign.status_display}) and can't be restarted —
                    a completed campaign is final, the same way it works on other ad platforms.
                    {!isAdminView && ' To promote these products again, click "Duplicate as New Campaign" above to create a fresh draft with the same products and objectives.'}
                </div>
            )}

            {totals && (
                <div className="stats-grid">
                    <StatCard label="Total Budget" value={Number(totals.total_budget).toLocaleString()} />
                    <StatCard label="Budget Spent" value={Number(totals.spent).toLocaleString()} />
                    <StatCard label="Views" value={totals.views.count} />
                    <StatCard label="Favorites" value={totals.favorites.count} />
                    <StatCard label="Cart Adds" value={totals.cart_adds.count} />
                    <StatCard label="Link Clicks" value={totals.link_clicks.count} />
                </div>
            )}

            <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)', marginBottom: '1.25rem' }}>
                {campaign.started_at
                    ? <>Runs {new Date(campaign.started_at).toLocaleDateString()} → {new Date(campaign.ends_at).toLocaleDateString()} (1 month)</>
                    : 'Not started yet — campaigns run for 1 month after you click Start.'}
            </div>

            {daily.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <ChartCard title="Daily Performance">
                        <div style={{ width: '100%', height: 300 }}>
                            <Line data={chartData} options={chartOptions} />
                        </div>
                    </ChartCard>
                </div>
            )}

            <div className="data-section">
                <div className="section-header">
                    <div>
                        <h3>Assigned Products</h3>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: 'var(--dash-ink-soft)', fontWeight: 400 }}>
                            Everything targeted by this campaign — including products with no interactions yet. ✓ marks an enabled objective.
                        </p>
                    </div>
                </div>
                <DataTable
                    columns={['Product', 'Product Status', 'Views', 'Favorites', 'Cart Adds', 'Link Clicks']}
                    data={campaign.products || []}
                    keyExtractor={(p) => p.product_id}
                    renderRow={(p) => (
                        <>
                            <td><strong>{p.product_name}</strong></td>
                            <td>
                                <span className={`status-badge ${p.is_active ? 'status-active' : 'status-pending'}`}>
                                    {p.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td>{p.objectives.views ? '✓' : '—'}</td>
                            <td>{p.objectives.favorites ? '✓' : '—'}</td>
                            <td>{p.objectives.cart_adds ? '✓' : '—'}</td>
                            <td>{p.objectives.link_clicks ? '✓' : '—'}</td>
                        </>
                    )}
                />
            </div>

            <div className="data-section">
                <div className="section-header"><h3>Product Performance</h3></div>
                <DataTable
                    columns={['Product', 'Views', 'Favorites', 'Cart Adds', 'Link Clicks', 'Spend']}
                    data={analytics?.products || []}
                    keyExtractor={(p) => p.product_id}
                    renderRow={(p) => (
                        <>
                            <td><strong>{p.product_name}</strong></td>
                            <td>
                                <button type="button" className="status-badge analytics-badge"
                                    onClick={() => openAnalyticsModal('views', p, 1)}>
                                    {p.views ?? 0}
                                </button>
                            </td>
                            <td>
                                <button type="button" className="status-badge analytics-badge status-pending"
                                    onClick={() => openAnalyticsModal('favorites', p, 1)}>
                                    {p.favorites ?? 0}
                                </button>
                            </td>
                            <td>
                                <button type="button" className="status-badge analytics-badge"
                                    onClick={() => openAnalyticsModal('cart', p, 1)}>
                                    {p.cart_adds ?? 0}
                                </button>
                            </td>
                            <td>
                                <button type="button" className="status-badge analytics-badge status-info"
                                    onClick={() => openAnalyticsModal('clicks', p, 1)}>
                                    {p.link_clicks ?? 0}
                                </button>
                            </td>
                            <td>{Number(p.spend).toLocaleString()}</td>
                        </>
                    )}
                />
            </div>

            <div className="data-section">
                <div className="section-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><History size={17} /> Change History</h3>
                </div>
                <DataTable
                    columns={['Date', 'Action', 'Details']}
                    data={auditLogs}
                    keyExtractor={(l) => l.id}
                    currentPage={auditPage}
                    totalPages={auditTotalPages}
                    totalItems={auditTotalItems}
                    onPageChange={(page) => fetchAuditLogs(page)}
                    renderRow={(l) => (
                        <>
                            <td>{new Date(l.created_at).toLocaleString()}</td>
                            <td>
                                {l.action_display}{l.actor ? ` — ${l.actor}` : ''}
                                {l.actor_role === 'ADMIN' && (
                                    <span className="dash-badge" style={{ marginLeft: '0.4rem', background: 'var(--dash-warning-soft)', color: 'var(--dash-warning)' }}>
                                        Admin action
                                    </span>
                                )}
                            </td>
                            <td>{renderChangeDetails(l)}</td>
                        </>
                    )}
                />
            </div>

            <AnalyticsDetailModal
                isOpen={showAnalyticsModal}
                onClose={() => setShowAnalyticsModal(false)}
                type={analyticsModalType}
                title={analyticsModalType === 'favorites'
                    ? `Favorite Details - ${analyticsModalProduct?.product_name || 'Product'} • ${campaign.name}`
                    : analyticsModalType === 'clicks'
                        ? `Purchase Link Clicks - ${analyticsModalProduct?.product_name || 'Product'} • ${campaign.name}`
                        : analyticsModalType === 'cart'
                            ? `Cart Details - ${analyticsModalProduct?.product_name || 'Product'} • ${campaign.name}`
                            : `Visitor Details - ${analyticsModalProduct?.product_name || 'Product'} • ${campaign.name}`}
                data={analyticsModalData}
                loading={analyticsModalLoading}
                currentPage={analyticsModalPage}
                totalPages={analyticsModalTotalPages}
                totalItems={analyticsModalTotalItems}
                visitorLimit={analyticsModalVisitorLimit}
                lockedCount={analyticsModalLockedCount}
                onPageChange={(page) => openAnalyticsModal(analyticsModalType, analyticsModalProduct, page)}
            />

            <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Campaign" maxWidth="700px">
                <form onSubmit={submitEdit} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Campaign Name</label>
                        <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--dash-ink-soft)', margin: 0 }}>
                        Only available while the campaign is Draft or Paused. Budget isn't changed here — use Adjust Budget.
                    </p>

                    <ProductPicker
                        selected={editSelectedProducts}
                        available={editAvailableProducts}
                        onToggleObjective={toggleEditObjective}
                        onRemove={removeProductFromEdit}
                        onAdd={addProductToEdit}
                        emptyAvailableLabel={editProducts.length === 0 ? 'No products found on your account.' : 'Every product you have is already in this campaign.'}
                    />

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showDuplicate} onClose={() => setShowDuplicate(false)} title="Duplicate as New Campaign" maxWidth="700px">
                <form onSubmit={submitDuplicate} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>
                        Creates a brand-new Draft campaign with the same products and objectives. Pick a fresh budget — nothing is reused from the old campaign.
                    </p>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Campaign Name</label>
                            <input type="text" value={duplicateForm.name}
                                onChange={(e) => setDuplicateForm({ ...duplicateForm, name: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>
                                Budget (credits)
                                {duplicateBalance !== null && (
                                    <span style={{ marginLeft: 6, fontSize: '0.78rem', fontWeight: 400, color: Number(duplicateForm.budget) > duplicateBalance ? 'var(--dash-danger)' : 'var(--dash-ink-soft)' }}>
                                        available: {duplicateBalance.toLocaleString()}
                                    </span>
                                )}
                            </label>
                            <input type="number" min="1" step="0.01" value={duplicateForm.budget}
                                onChange={(e) => setDuplicateForm({ ...duplicateForm, budget: e.target.value })} required />
                        </div>
                    </div>

                    <ProductPicker
                        selected={duplicateSelectedProducts}
                        available={duplicateAvailableProducts}
                        onToggleObjective={toggleDuplicateObjective}
                        onRemove={removeProductFromDuplicate}
                        onAdd={addProductToDuplicate}
                        emptyAvailableLabel="No other active products found."
                    />

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowDuplicate(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create & Reserve Budget'}</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showBudget} onClose={() => setShowBudget(false)} title="Adjust Budget" maxWidth="440px">
                <form onSubmit={submitBudget} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <p style={{ margin: 0, fontSize: '0.87rem', color: 'var(--dash-ink-soft)' }}>
                        Current budget: {Number(campaign.total_budget).toLocaleString()} — spent: {Number(campaign.spent).toLocaleString()}.
                        Increases are taken from your credits; decreases are refunded. The budget cannot go below the amount already spent.
                    </p>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>New Budget</label>
                        <input type="number" min="1" step="0.01" value={newBudget}
                            onChange={(e) => setNewBudget(e.target.value)} required />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowBudget(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update Budget'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default VendorCampaignDetail;
