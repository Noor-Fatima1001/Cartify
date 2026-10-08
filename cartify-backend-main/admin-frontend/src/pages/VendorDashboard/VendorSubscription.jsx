import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import Pagination from '../../components/common/Pagination';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonCircle, SkeletonText, SkeletonBlock, SkeletonStatRow, SkeletonTileGrid } from '../../components/common/Skeleton';
import { subscriptionService } from '../../services/subscriptionService';
import { billingService } from '../../services/billingService';
import { useToast } from '../../context/ToastContext';
import {
    Crown, Check, X as XIcon, AlertTriangle, History,
    Package, Wallet as WalletIcon, RotateCcw, Gift, RefreshCw, Ban, Undo2,
} from 'lucide-react';

const HISTORY_PAGE_SIZE = 5;

const progressColor = (remainingDays) => {
    if (remainingDays <= 3) return 'var(--dash-danger)';
    if (remainingDays <= 7) return 'var(--dash-warning)';
    return 'var(--dash-success)';
};

const VendorSubscription = () => {
    const { showToast } = useToast();
    const [data, setData] = useState(null);
    const [plans, setPlans] = useState([]);
    const [balance, setBalance] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyTotalItems, setHistoryTotalItems] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [confirmPlan, setConfirmPlan] = useState(null);
    const [showCancel, setShowCancel] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchHistory = useCallback(async (page) => {
        try {
            setHistoryLoading(true);
            const historyData = await subscriptionService.getHistory({ page, limit: HISTORY_PAGE_SIZE });
            setHistory(historyData.results || []);
            setHistoryTotalPages(historyData.total_pages || 1);
            setHistoryTotalItems(historyData.total_items || 0);
        } catch (e) {
            console.error('Error loading subscription history:', e);
            showToast('Failed to load subscription history', 'error');
        } finally {
            setHistoryLoading(false);
        }
    }, [showToast]);

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const [subData, plansData, walletData] = await Promise.all([
                subscriptionService.getSubscription(),
                subscriptionService.getPlans(),
                billingService.getWallet(),
            ]);
            setData(subData);
            setPlans(plansData.results || []);
            setBalance(Number(walletData.balance));
            setHistoryPage(1);
            await fetchHistory(1);
        } catch (e) {
            console.error('Error loading subscription:', e);
            showToast('Failed to load subscription details', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast, fetchHistory]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleHistoryPageChange = (page) => {
        setHistoryPage(page);
        fetchHistory(page);
    };

    const submitPurchase = async () => {
        try {
            setSubmitting(true);
            await subscriptionService.purchase(confirmPlan.id);
            showToast('Subscription purchased');
            setConfirmPlan(null);
            fetchAll();
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to purchase plan', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const submitCancel = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const res = await subscriptionService.cancel(cancelReason.trim());
            showToast(res.message || 'Cancellation scheduled');
            setShowCancel(false);
            setCancelReason('');
            fetchAll();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to cancel subscription', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleResume = async () => {
        try {
            setSubmitting(true);
            await subscriptionService.resume();
            showToast('Cancellation undone — your subscription will continue as normal');
            fetchAll();
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to resume subscription', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // `loading` also flips true on action-triggered refetches (purchase/cancel/
    // resume all call fetchAll()) — gate the full skeleton on "no data yet" so
    // those refetches don't blank out the whole page, only the initial visit does.
    if (!data) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="page-header">
                    <div className="header-left">
                        <h3><Crown size={20} /> Subscription</h3>
                        <p>Your plan, billing status and history in one place.</p>
                    </div>
                </div>

                <div className="sub-hero">
                    <div className="sub-hero-top">
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <SkeletonCircle size="48px" />
                            <div>
                                <SkeletonText width="140px" height="11px" />
                                <SkeletonText width="180px" height="20px" style={{ marginBottom: 0 }} />
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: '1.4rem' }}>
                        <SkeletonBlock height="8px" radius="999px" />
                    </div>
                    <SkeletonStatRow count={3} />
                </div>

                <div className="section-header" style={{ padding: '0 0 1rem', border: 'none' }}>
                    <SkeletonText width="160px" height="18px" style={{ marginBottom: 0 }} />
                </div>
                <SkeletonTileGrid count={3} className="plan-grid" />

                <PageLoaderOverlay label="Loading subscription…" />
            </div>
        );
    }

    const sub = data?.subscription;
    const ents = data?.entitlements || {};
    const freePlan = plans.find((p) => p.is_free_default);
    const currentPlanId = sub?.plan?.id ?? freePlan?.id ?? null;

    let elapsedPct = 100;
    if (sub) {
        const started = new Date(sub.started_at).getTime();
        const expires = new Date(sub.expires_at).getTime();
        const total = expires - started;
        elapsedPct = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - started) / total) * 100)) : 100;
    }
    const remainingPct = Math.max(0, 100 - elapsedPct);
    const remainingDays = sub?.remaining_days ?? 0;
    const barColor = progressColor(remainingDays);

    const featureRow = (label, enabled) => (
        <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.15rem 0' }}>
            {enabled ? <Check size={15} color="var(--dash-success)" /> : <XIcon size={15} color="var(--dash-ink-faint)" />} {label}
        </li>
    );

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Crown size={20} /> Subscription {loading && <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--dash-ink-faint)' }}>· Refreshing…</span>}</h3>
                    <p>Your plan, billing status and history in one place.</p>
                </div>
            </div>

            {/* Hero: current plan status */}
            <div className={`sub-hero ${sub ? '' : 'is-free'}`}>
                <div className="sub-hero-top">
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                        <div className="sub-hero-plan-icon"><Crown size={24} /></div>
                        <div>
                            <div className="sub-hero-eyebrow">{sub ? 'Current Plan' : 'No Active Subscription'}</div>
                            <div className="sub-hero-title">{sub ? sub.plan.name : 'Free'}</div>
                        </div>
                    </div>
                    {sub && (
                        sub.cancel_at_period_end ? (
                            <button className="btn btn-secondary" onClick={handleResume} disabled={submitting}>
                                <Undo2 size={15} /> {submitting ? 'Resuming…' : 'Resume Subscription'}
                            </button>
                        ) : (
                            <button className="btn btn-danger-ghost" onClick={() => setShowCancel(true)}>
                                <Ban size={15} /> Cancel Subscription
                            </button>
                        )
                    )}
                </div>

                {sub && sub.cancel_at_period_end && (
                    <div style={{
                        marginTop: '1.2rem', padding: '0.7rem 0.9rem', borderRadius: 12,
                        background: 'var(--dash-warning-soft)', color: 'var(--dash-warning)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', position: 'relative',
                    }}>
                        <AlertTriangle size={16} />
                        Scheduled to end on <strong style={{ marginLeft: 4 }}>{new Date(sub.expires_at).toLocaleDateString()}</strong>.
                        You keep full access until then — nothing has changed yet. Click "Resume Subscription" any time before that to undo it.
                    </div>
                )}

                {sub ? (
                    <div style={{ marginTop: '1.4rem', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>
                                {sub.remaining_text || 'Expired'}
                            </span>
                            <span style={{ color: 'var(--text-secondary)' }}>
                                {sub.cancel_at_period_end ? 'Ends' : 'Renews / expires'} <strong style={{ color: 'var(--text-primary)' }}>{new Date(sub.expires_at).toLocaleDateString()}</strong>
                            </span>
                        </div>
                        <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${remainingPct}%`, background: sub.cancel_at_period_end ? 'var(--dash-warning)' : barColor }} />
                        </div>
                    </div>
                ) : (
                    <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem', position: 'relative' }}>
                        You're on the free plan. Purchase a plan below to unlock more active products and analytics.
                    </p>
                )}

                <div className="sub-mini-stats">
                    <div className="sub-mini-stat">
                        <div className="sub-mini-stat-label"><Package size={13} /> Products</div>
                        <div className="sub-mini-stat-value">{data?.active_products ?? 0} <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.9rem' }}>/ {ents.max_active_products}</span></div>
                    </div>
                    <div className="sub-mini-stat">
                        <div className="sub-mini-stat-label"><WalletIcon size={13} /> Wallet Balance</div>
                        <div className="sub-mini-stat-value">{balance !== null ? balance.toLocaleString() : '—'}</div>
                    </div>
                    <div className="sub-mini-stat">
                        <div className="sub-mini-stat-label"><RotateCcw size={13} /> Times Renewed</div>
                        <div className="sub-mini-stat-value">{sub?.renewal_count ?? 0}</div>
                    </div>
                </div>

                {data?.auto_deactivated_products > 0 && (
                    <div style={{
                        marginTop: '1.2rem', padding: '0.7rem 0.9rem', borderRadius: 12,
                        background: 'var(--dash-warning-soft)', color: 'var(--dash-warning)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', position: 'relative',
                    }}>
                        <AlertTriangle size={16} />
                        {data.auto_deactivated_products} of your products are deactivated because your subscription
                        {sub ? ' limit was reached' : ' expired'}. Purchase a plan to reactivate them.
                    </div>
                )}
            </div>

            {/* Available plans */}
            <div className="section-header" style={{ padding: '0 0 1rem', border: 'none' }}>
                <h3 style={{ fontSize: '1.1rem' }}>Available Plans</h3>
            </div>
            <div className="plan-grid">
                {plans.map((plan) => {
                    const isCurrent = plan.id === currentPlanId;
                    const isFree = plan.is_free_default;
                    return (
                        <div key={plan.id} className="stat-card plan-card" style={{
                            border: isCurrent ? '2px solid var(--dash-accent)' : undefined,
                            display: 'flex', flexDirection: 'column',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <h3 style={{ margin: 0 }}>{plan.name}</h3>
                                {isCurrent && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--dash-accent)', fontWeight: 700 }}>CURRENT</span>
                                )}
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0' }}>
                                {Number(plan.price_credits).toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>credits / month</span>
                            </div>
                            {plan.description && (
                                <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }} className="description-text" dangerouslySetInnerHTML={{ __html: plan.description }} />
                            )}
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.8rem', flex: 1 }}>
                                {featureRow(`${plan.max_active_products} active products`, true)}
                                {featureRow('Add to Cart for customers', plan.allow_cart)}
                                {featureRow('Product view users', plan.can_view_viewers)}
                                {featureRow('Favorite users', plan.can_view_favoriters)}
                                {featureRow('Cart users', plan.can_view_cart_users)}
                                {featureRow('Link click users', plan.can_view_clickers)}
                                {featureRow(
                                    plan.visitor_detail_limit == null
                                        ? 'Unlimited visitor details'
                                        : `First ${plan.visitor_detail_limit} visitors per product`,
                                    true
                                )}
                            </ul>
                            {isFree ? (
                                <button className="btn btn-secondary" disabled>
                                    {isCurrent ? 'Included by default' : 'Available when not subscribed'}
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={() => setConfirmPlan(plan)}
                                    disabled={balance !== null && balance < Number(plan.price_credits)}>
                                    {isCurrent ? 'Renew (+1 month)' : 'Activate'}
                                </button>
                            )}
                            {!isFree && balance !== null && balance < Number(plan.price_credits) && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--dash-danger)', margin: '0.4rem 0 0' }}>Not enough credits — top up first.</p>
                            )}
                            {!isFree && isCurrent && sub?.cancel_at_period_end && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--dash-warning)', margin: '0.4rem 0 0' }}>Renewing will undo the scheduled cancellation.</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {(historyTotalItems > 0 || historyLoading) && (
                <div className="data-section" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <History size={18} /> Subscription History
                        {historyTotalItems > 0 && (
                            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>({historyTotalItems})</span>
                        )}
                    </h3>
                    <div className="timeline" style={{ opacity: historyLoading ? 0.5 : 1 }}>
                        {history.map((h) => {
                            const displayStatus = h.history_status || h.status;
                            const stateClass = displayStatus === 'CANCELLED' ? 'is-cancelled' : displayStatus === 'EXPIRED' ? 'is-expired' : '';
                            const Icon = displayStatus === 'CANCELLED' ? Ban : h.renewal_count > 0 ? RefreshCw : Gift;
                            return (
                                <div key={h.id} className={`timeline-item ${stateClass}`}>
                                    <div className="timeline-icon"><Icon size={16} /></div>
                                    <div className="timeline-body">
                                        <span className="timeline-main">
                                            <strong>{h.plan.name}</strong> · {Number(h.credits_paid).toLocaleString()} credits
                                            {h.renewal_count > 0 && ` · renewal #${h.renewal_count}`}
                                        </span>
                                        <span className="timeline-dates">
                                            {new Date(h.started_at).toLocaleDateString()} → {new Date(h.expires_at).toLocaleDateString()}
                                        </span>
                                        <StatusBadge status={displayStatus} label={displayStatus === 'RENEWED' ? 'Renewed on time' : undefined} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <Pagination
                        currentPage={historyPage}
                        totalPages={historyTotalPages}
                        totalItems={historyTotalItems}
                        onPageChange={handleHistoryPageChange}
                    />
                </div>
            )}

            <Modal isOpen={!!confirmPlan} onClose={() => setConfirmPlan(null)} title="Confirm Purchase" maxWidth="440px">
                {confirmPlan && (
                    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>
                            Purchase <strong>{confirmPlan.name}</strong> for{' '}
                            <strong>{Number(confirmPlan.price_credits).toLocaleString()} credits</strong>?
                            {confirmPlan.id === currentPlanId
                                ? ' Your current subscription will be extended by 1 month.'
                                : ' The plan activates immediately for 1 month.'}
                        </p>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setConfirmPlan(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={submitPurchase} disabled={submitting}>
                                {submitting ? 'Purchasing…' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={showCancel} onClose={() => setShowCancel(false)} title="Cancel Subscription" maxWidth="460px">
                <form onSubmit={submitCancel} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {sub && (
                            <>You'll keep full access to <strong>{sub.plan.name}</strong> until{' '}
                            <strong>{new Date(sub.expires_at).toLocaleDateString()}</strong> — nothing changes right
                            now. After that date you'll move to the free plan and products beyond the free limit
                            will be deactivated. Credits already paid are not refunded. You can undo this any time
                            before then.</>
                        )}
                    </p>
                    <div className="form-group">
                        <label>Reason (optional)</label>
                        <textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowCancel(false)}>Back</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Cancelling…' : 'Confirm Cancellation'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default VendorSubscription;
