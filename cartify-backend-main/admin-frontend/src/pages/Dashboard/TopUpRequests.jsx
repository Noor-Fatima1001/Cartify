import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { billingService } from '../../services/billingService';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import { Banknote, Check, X, HelpCircle, Image as ImageIcon, Search, Eye, AlertCircle } from 'lucide-react';

const PAGE_SIZE = 10;
const STATUS_FILTERS = ['ALL', 'PENDING', 'INFO_REQUIRED', 'APPROVED', 'REJECTED'];

const TopUpRequests = () => {
    const { showToast } = useToast();
    const { prompt } = usePrompt();
    const navigate = useNavigate();

    const [topups, setTopups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const [screenshotUrl, setScreenshotUrl] = useState(null);
    const [rejectTopup, setRejectTopup] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [infoTopup, setInfoTopup] = useState(null);
    const [infoMessage, setInfoMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchTopups = useCallback(async () => {
        try {
            setLoading(true);
            const data = await billingService.adminGetTopups({
                page: currentPage,
                limit: PAGE_SIZE,
                status: statusFilter,
                search: searchTerm,
            });
            setTopups(data.results || []);
            setPendingCount(data.pending_count || 0);
            setTotalPages(data.total_pages || 1);
            setTotalItems(data.total_items || 0);
        } catch (e) {
            console.error('Error fetching top-ups:', e);
            showToast('Failed to load top-up requests', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, searchTerm, showToast]);

    useEffect(() => { fetchTopups(); }, [fetchTopups]);

    const handleApprove = async (topup) => {
        const ok = await prompt({
            title: 'Approve Top-up',
            message: `Add ${Number(topup.amount).toLocaleString()} credits to ${topup.vendor_username}'s wallet?`,
            showInput: false,
        });
        if (!ok) return;
        try {
            setSubmitting(true);
            await billingService.adminApproveTopup(topup.id);
            showToast('Top-up approved — credits added');
            fetchTopups();
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to approve', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const submitReject = async (e) => {
        e.preventDefault();
        if (!rejectReason.trim()) {
            showToast('A rejection reason is required', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await billingService.adminRejectTopup(rejectTopup.id, rejectReason.trim());
            showToast('Top-up rejected');
            setRejectTopup(null);
            setRejectReason('');
            fetchTopups();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to reject', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const submitInfoRequest = async (e) => {
        e.preventDefault();
        if (!infoMessage.trim()) {
            showToast('Describe the information you need', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await billingService.adminRequestTopupInfo(infoTopup.id, infoMessage.trim());
            showToast('Information requested from vendor');
            setInfoTopup(null);
            setInfoMessage('');
            fetchTopups();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to request info', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const fmtDate = (iso) => new Date(iso).toLocaleString();

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Banknote size={20} /> Top-up Requests</h3>
                    <p>Review incoming wallet top-up requests and take action in one place.</p>
                </div>
                <div className="toolbar2-controls">
                    <div className="search-box">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search vendor / transaction…"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
                        {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                    </select>
                </div>
            </div>

            {pendingCount > 0 && (
                <div className="info-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                    <AlertCircle size={16} />
                    {pendingCount} pending review
                </div>
            )}

            <div className="data-section">
                <DataTable
                    columns={['Date', 'Vendor', 'Amount', 'Transaction ID', 'Method', 'Screenshot', 'Status', 'Actions']}
                    data={topups}
                    loading={loading}
                    keyExtractor={(t) => t.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    onPageChange={setCurrentPage}
                    renderRow={(t) => (
                        <>
                            <td>{fmtDate(t.created_at)}</td>
                            <td><strong>{t.vendor_username}</strong></td>
                            <td>{Number(t.amount).toLocaleString()}</td>
                            <td style={{ fontFamily: 'monospace' }}>{t.transaction_id}</td>
                            <td>{t.payment_method ? t.payment_method.provider_name : '—'}</td>
                            <td>
                                {t.screenshot_url ? (
                                    <button className="action-btn" title="View screenshot" onClick={() => setScreenshotUrl(t.screenshot_url)}>
                                        <ImageIcon size={16} />
                                    </button>
                                ) : '—'}
                            </td>
                            <td><StatusBadge status={t.status} label={t.status_display} /></td>
                            <td>
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className="action-btn" title="View details" onClick={() => navigate(`/admin/dashboard/topup-requests/${t.id}`)}>
                                        <Eye size={16} />
                                    </button>
                                    {(t.status === 'PENDING' || t.status === 'INFO_REQUIRED') && (
                                        <>
                                            <button className="action-btn" title="Approve" disabled={submitting}
                                                onClick={() => handleApprove(t)}>
                                                <Check size={16} color="var(--dash-success)" />
                                            </button>
                                            <button className="action-btn" title="Reject" disabled={submitting}
                                                onClick={() => { setRejectTopup(t); setRejectReason(''); }}>
                                                <X size={16} color="var(--dash-danger)" />
                                            </button>
                                            {t.status === 'PENDING' && (
                                                <button className="action-btn" title="Request more information" disabled={submitting}
                                                    onClick={() => { setInfoTopup(t); setInfoMessage(''); }}>
                                                    <HelpCircle size={16} color="var(--dash-info)" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {t.status === 'REJECTED' && t.rejection_reason && (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--dash-ink-soft)' }}>{t.rejection_reason}</span>
                                    )}
                                </div>
                            </td>
                        </>
                    )}
                />
            </div>

            {/* Screenshot viewer */}
            <Modal isOpen={!!screenshotUrl} onClose={() => setScreenshotUrl(null)} title="Payment Screenshot" maxWidth="640px">
                {screenshotUrl && (
                    <div style={{ padding: '1rem', textAlign: 'center' }}>
                        <img src={screenshotUrl} alt="Payment screenshot" style={{ maxWidth: '100%', borderRadius: 'var(--dash-radius-md)' }} />
                    </div>
                )}
            </Modal>

            {/* Reject modal */}
            <Modal isOpen={!!rejectTopup} onClose={() => setRejectTopup(null)} title="Reject Top-up" maxWidth="480px">
                {rejectTopup && (
                    <form onSubmit={submitReject} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--dash-ink-soft)' }}>
                            Rejecting {rejectTopup.vendor_username}'s top-up of {Number(rejectTopup.amount).toLocaleString()} credits.
                            The vendor will see the reason.
                        </p>
                        <div className="form-group">
                            <label>Rejection Reason (required)</label>
                            <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setRejectTopup(null)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Rejecting…' : 'Reject Request'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Request-info modal */}
            <Modal isOpen={!!infoTopup} onClose={() => setInfoTopup(null)} title="Request More Information" maxWidth="480px">
                {infoTopup && (
                    <form onSubmit={submitInfoRequest} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--dash-ink-soft)' }}>
                            Ask {infoTopup.vendor_username} for more details about this top-up. The request will move to
                            "More Information Required" until they respond.
                        </p>
                        <div className="form-group">
                            <label>Message to vendor (required)</label>
                            <textarea rows={3} value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} required />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setInfoTopup(null)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Sending…' : 'Send Request'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default TopUpRequests;
