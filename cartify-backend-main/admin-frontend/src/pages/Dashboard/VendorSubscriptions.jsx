import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import Pagination from '../../components/common/Pagination';
import { subscriptionService } from '../../services/subscriptionService';
import { useToast } from '../../context/ToastContext';
import { Crown, Search, History, Ban, RefreshCw, Undo2 } from 'lucide-react';

const PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 5;
const STATUS_FILTERS = ['ALL', 'ACTIVE', 'EXPIRED', 'CANCELLED'];

const VendorSubscriptions = () => {
    const { showToast } = useToast();

    const [subs, setSubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const [plans, setPlans] = useState([]);
    const [historyVendor, setHistoryVendor] = useState(null);
    const [history, setHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyTotalItems, setHistoryTotalItems] = useState(0);

    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [renewTarget, setRenewTarget] = useState(null);
    const [renewPlanId, setRenewPlanId] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchSubs = useCallback(async () => {
        try {
            setLoading(true);
            const data = await subscriptionService.adminGetSubscriptions({
                page: currentPage,
                limit: PAGE_SIZE,
                status: statusFilter,
                search: searchTerm,
            });
            setSubs(data.results || []);
            setTotalPages(data.total_pages || 1);
            setTotalItems(data.total_items || 0);
        } catch (e) {
            console.error('Error fetching subscriptions:', e);
            showToast('Failed to load subscriptions', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, searchTerm, showToast]);

    useEffect(() => { fetchSubs(); }, [fetchSubs]);

    useEffect(() => {
        subscriptionService.adminGetPlans()
            .then((data) => setPlans((data.results || []).filter((p) => !p.is_free_default && p.is_active)))
            .catch(() => {});
    }, []);

    const openHistory = async (sub) => {
        setHistoryVendor(sub);
        setHistory(null);
        setHistoryPage(1);
        await loadHistoryPage(sub.vendor_id, 1);
    };

    const loadHistoryPage = async (vendorId, page) => {
        setHistoryLoading(true);
        try {
            const data = await subscriptionService.adminGetVendorHistory(vendorId, { page, limit: HISTORY_PAGE_SIZE });
            setHistory(data);
            setHistoryTotalPages(data.total_pages || 1);
            setHistoryTotalItems(data.total_items || 0);
        } catch (e) {
            showToast('Failed to load subscription history', 'error');
            setHistoryVendor(null);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleHistoryPageChange = (page) => {
        setHistoryPage(page);
        loadHistoryPage(historyVendor.vendor_id, page);
    };

    const submitCancel = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const res = await subscriptionService.adminCancelSubscription(cancelTarget.vendor_id, cancelReason.trim());
            showToast(res.message || 'Cancellation scheduled');
            setCancelTarget(null);
            setCancelReason('');
            fetchSubs();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to cancel subscription', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleResume = async (s) => {
        try {
            setSubmitting(true);
            await subscriptionService.adminResumeSubscription(s.vendor_id);
            showToast('Cancellation undone — subscription will continue as normal');
            fetchSubs();
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to resume subscription', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const submitRenew = async (e) => {
        e.preventDefault();
        if (!renewPlanId) {
            showToast('Choose a plan', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await subscriptionService.adminRenewSubscription(renewTarget.vendor_id, renewPlanId);
            showToast('Subscription renewed on behalf of the vendor');
            setRenewTarget(null);
            setRenewPlanId('');
            fetchSubs();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to renew subscription', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Crown size={20} /> Vendor Subscriptions</h3>
                    <p>Every subscription purchase and renewal, per vendor — cancel or renew on their behalf.</p>
                </div>
                <div className="toolbar2-controls">
                    <div className="search-box">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search vendor / plan…"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
                        {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={['Vendor', 'Plan', 'Status', 'Started', 'Expires', 'Remaining', 'Credits Paid', 'Renewals', 'Actions']}
                    data={subs}
                    loading={loading}
                    keyExtractor={(s) => s.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    onPageChange={setCurrentPage}
                    renderRow={(s) => (
                        <>
                            <td><strong>{s.vendor_username}</strong></td>
                            <td>{s.plan.name}</td>
                            <td>
                                <StatusBadge status={s.status} />
                                {s.status === 'ACTIVE' && s.cancel_at_period_end && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--dash-warning)', marginTop: 2 }}>
                                        Ends {new Date(s.expires_at).toLocaleDateString()} (scheduled)
                                    </div>
                                )}
                                {s.status === 'CANCELLED' && s.cancelled_by_username && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--dash-ink-soft)', marginTop: 2 }}>
                                        by {s.cancelled_by_username}
                                    </div>
                                )}
                            </td>
                            <td>{fmtDate(s.started_at)}</td>
                            <td>{fmtDate(s.expires_at)}</td>
                            <td>{s.remaining_text || '—'}</td>
                            <td>{Number(s.credits_paid).toLocaleString()}</td>
                            <td>{s.renewal_count}</td>
                            <td>
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                    <button className="action-btn" title="View history" onClick={() => openHistory(s)}>
                                        <History size={16} />
                                    </button>
                                    <button className="action-btn" title="Renew on behalf of vendor" disabled={submitting}
                                        onClick={() => { setRenewTarget(s); setRenewPlanId(String(s.plan.id)); }}>
                                        <RefreshCw size={16} color="var(--dash-info)" />
                                    </button>
                                    {s.status === 'ACTIVE' && (
                                        s.cancel_at_period_end ? (
                                            <button className="action-btn" title="Undo scheduled cancellation" disabled={submitting}
                                                onClick={() => handleResume(s)}>
                                                <Undo2 size={16} color="var(--dash-warning)" />
                                            </button>
                                        ) : (
                                            <button className="action-btn" title="Cancel subscription" disabled={submitting}
                                                onClick={() => { setCancelTarget(s); setCancelReason(''); }}>
                                                <Ban size={16} color="var(--dash-danger)" />
                                            </button>
                                        )
                                    )}
                                </div>
                            </td>
                        </>
                    )}
                />
            </div>

            {/* History modal */}
            <Modal isOpen={!!historyVendor} onClose={() => setHistoryVendor(null)} title={historyVendor ? `${historyVendor.vendor_username} — Subscription History` : ''} maxWidth="760px">
                {historyLoading && <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--dash-ink-soft)' }}>Loading…</div>}
                {history && (
                    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
                        <div>
                            <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Subscriptions
                                {historyTotalItems > 0 && <span style={{ fontWeight: 400, color: 'var(--dash-ink-soft)', fontSize: '0.8rem' }}>({historyTotalItems})</span>}
                            </h4>
                            <div className="timeline" style={{ opacity: historyLoading ? 0.5 : 1 }}>
                                {history.subscriptions.map((s) => {
                                    const displayStatus = s.history_status || s.status;
                                    const itemClass = displayStatus === 'EXPIRED' ? 'is-expired' : displayStatus === 'CANCELLED' ? 'is-cancelled' : '';
                                    return (
                                        <div key={s.id} className={`timeline-item ${itemClass}`}>
                                            <div className="timeline-icon"><Crown size={16} /></div>
                                            <div className="timeline-body">
                                                <div className="timeline-main">
                                                    <strong>{s.plan.name}</strong> · {Number(s.credits_paid).toLocaleString()} credits · renewal #{s.renewal_count}
                                                </div>
                                                <div className="timeline-dates">{fmtDate(s.started_at)} → {fmtDate(s.expires_at)}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {displayStatus === 'ACTIVE' && s.cancel_at_period_end && (
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--dash-warning)' }}>cancellation scheduled</span>
                                                    )}
                                                    <StatusBadge status={displayStatus} label={displayStatus === 'RENEWED' ? 'Renewed on time' : undefined} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {history.subscriptions.length === 0 && <div className="dash-empty" style={{ padding: '1.5rem' }}>No subscriptions yet.</div>}
                            </div>
                            <Pagination
                                currentPage={historyPage}
                                totalPages={historyTotalPages}
                                totalItems={historyTotalItems}
                                onPageChange={handleHistoryPageChange}
                            />
                        </div>
                        <div>
                            <h4 style={{ margin: '0 0 0.75rem' }}>Audit Log</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 240, overflowY: 'auto' }}>
                                {history.audit_log.map((l) => (
                                    <div key={l.id} className="info-card" style={{ padding: '0.75rem 0.9rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                                            <strong style={{ fontSize: '0.86rem' }}>{l.action_display}</strong>
                                            <span style={{ fontSize: '0.76rem', color: 'var(--dash-ink-soft)' }}>{fmtDate(l.created_at)}</span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--dash-ink-soft)', marginTop: 2 }}>
                                            {l.actor_username ? `by ${l.actor_username}` : 'system'}
                                            {l.reason && ` — ${l.reason}`}
                                        </div>
                                    </div>
                                ))}
                                {history.audit_log.length === 0 && <div className="dash-empty" style={{ padding: '1.5rem' }}>No audit entries yet.</div>}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Cancel modal */}
            <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Subscription" maxWidth="480px">
                {cancelTarget && (
                    <form onSubmit={submitCancel} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--dash-ink-soft)', lineHeight: 1.55 }}>
                            Schedule cancellation of <strong>{cancelTarget.vendor_username}</strong>'s "{cancelTarget.plan.name}" subscription?
                            They'll keep full access until <strong>{new Date(cancelTarget.expires_at).toLocaleDateString()}</strong> — nothing
                            changes right now. After that date they'll move to the free plan and products beyond the free limit will be
                            deactivated. Credits already paid are not refunded. This can be undone any time before then.
                        </p>
                        <div className="form-group">
                            <label>Reason (optional, vendor will see it)</label>
                            <textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setCancelTarget(null)}>Back</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Cancelling…' : 'Confirm Cancellation'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Renew modal */}
            <Modal isOpen={!!renewTarget} onClose={() => setRenewTarget(null)} title="Renew On Behalf Of Vendor" maxWidth="480px">
                {renewTarget && (
                    <form onSubmit={submitRenew} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--dash-ink-soft)', lineHeight: 1.55 }}>
                            Renewing for <strong>{renewTarget.vendor_username}</strong>. This charges the vendor's own
                            wallet, same as if they purchased it themselves — use this after confirming payment
                            through another channel.
                        </p>
                        <div className="form-group">
                            <label>Plan</label>
                            <select value={renewPlanId} onChange={(e) => setRenewPlanId(e.target.value)} required>
                                <option value="" disabled>Select a plan…</option>
                                {plans.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name} — {Number(p.price_credits).toLocaleString()} credits</option>
                                ))}
                            </select>
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setRenewTarget(null)}>Back</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Renewing…' : 'Confirm Renewal'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default VendorSubscriptions;
