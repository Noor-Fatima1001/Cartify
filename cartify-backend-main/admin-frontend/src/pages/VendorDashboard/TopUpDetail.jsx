import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Banknote, Check, X, HelpCircle, Pencil, Upload,
    MessageSquare, Clock3,
} from 'lucide-react';
import { billingService } from '../../services/billingService';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import StatusBadge from '../../components/common/StatusBadge';
import PageLoaderOverlay from '../../components/common/PageLoader';
import { SkeletonCard, SkeletonText, SkeletonBlock } from '../../components/common/Skeleton';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_AMOUNT = 9999999999.99; // matches TopUpRequest.amount's DecimalField(max_digits=12, decimal_places=2)
const TRANSACTION_ID_MAX_LENGTH = 100; // matches TopUpRequest.transaction_id max_length

const validateScreenshotFile = (file) => {
    if (!file) return null;
    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) return 'Screenshot must be a JPG, PNG, or WEBP image';
    if (file.size > MAX_SCREENSHOT_BYTES) return 'Screenshot must be smaller than 5MB';
    return null;
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

// Pairs each admin "INFO_REQUESTED" audit row with the vendor's next "EDITED"
// row (their reply), so the page can show full ask/reply rounds. The Activity
// Log below shows every row regardless — rounds are a friendlier view on top
// of the same data, not a replacement for the full trail.
const buildRounds = (auditLogAscending) => {
    const rounds = [];
    auditLogAscending.forEach((entry, index) => {
        if (entry.action !== 'INFO_REQUESTED') return;
        let reply = null;
        for (let j = index + 1; j < auditLogAscending.length; j += 1) {
            const candidate = auditLogAscending[j];
            if (candidate.action === 'INFO_REQUESTED') break;
            if (candidate.action === 'EDITED') {
                reply = candidate;
                break;
            }
        }
        rounds.push({ request: entry, reply });
    });
    return rounds;
};

const replyHasNewScreenshot = (reply) => {
    if (!reply) return false;
    const before = reply.previous_state?.screenshot_url;
    const after = reply.new_state?.screenshot_url;
    return !!after && after !== before;
};

// Every audit row can carry its own screenshot swap and/or amount/transaction
// edits — surfaced per-row in the Activity Log so no change is ever silently
// dropped, even outside an info-request round.
const screenshotDiff = (log) => {
    const before = log.previous_state?.screenshot_url || null;
    const after = log.new_state?.screenshot_url || null;
    if (!after || after === before) return null;
    return { before, after };
};

const DIFF_FIELDS = [
    ['amount', 'Amount'],
    ['transaction_id', 'Transaction ID'],
];

const fieldDiffs = (log) => DIFF_FIELDS
    .map(([key, label]) => {
        const before = log.previous_state?.[key];
        const after = log.new_state?.[key];
        if (after === undefined || after === before) return null;
        return { label, before: before ?? '—', after: after ?? '—' };
    })
    .filter(Boolean);

const TopUpDetail = ({ isAdminView = false }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { prompt } = usePrompt();

    const [topup, setTopup] = useState(null);
    const [auditLog, setAuditLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState(null);

    const [showReject, setShowReject] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showRequestInfo, setShowRequestInfo] = useState(false);
    const [infoMessage, setInfoMessage] = useState('');

    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ amount: '', transaction_id: '', screenshot: null });

    const [respondForm, setRespondForm] = useState({ transaction_id: '', vendor_note: '', screenshot: null });

    const backPath = isAdminView ? '/admin/dashboard/topup-requests' : '/admin/vendor-dashboard/wallet';

    const fetchDetail = useCallback(async () => {
        try {
            setLoading(true);
            const data = isAdminView
                ? await billingService.adminGetTopupDetail(id)
                : await billingService.getTopupDetail(id);
            setTopup(data);
            setAuditLog(data.audit_log || []);
            setRespondForm({ transaction_id: data.transaction_id || '', vendor_note: '', screenshot: null });
        } catch (e) {
            console.error('Error fetching top-up detail:', e);
            showToast('Failed to load top-up details', 'error');
        } finally {
            setLoading(false);
        }
    }, [id, isAdminView, showToast]);

    useEffect(() => {
        setEditMode(false);
        setLightboxSrc(null);
        fetchDetail();
    }, [fetchDetail]);

    const handleApprove = async () => {
        const ok = await prompt({
            title: 'Approve Top-up',
            message: `Add ${Number(topup.amount).toLocaleString()} credits to ${topup.vendor_username}'s wallet?`,
            showInput: false,
        });
        if (!ok) return;
        try {
            setBusy(true);
            await billingService.adminApproveTopup(topup.id);
            showToast('Top-up approved — credits added');
            fetchDetail();
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to approve', 'error');
        } finally {
            setBusy(false);
        }
    };

    const submitReject = async (e) => {
        e.preventDefault();
        if (!rejectReason.trim()) {
            showToast('A rejection reason is required', 'error');
            return;
        }
        try {
            setBusy(true);
            await billingService.adminRejectTopup(topup.id, rejectReason.trim());
            showToast('Top-up rejected');
            setShowReject(false);
            setRejectReason('');
            fetchDetail();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to reject', 'error');
        } finally {
            setBusy(false);
        }
    };

    const submitRequestInfo = async (e) => {
        e.preventDefault();
        if (!infoMessage.trim()) {
            showToast('Describe the information you need', 'error');
            return;
        }
        try {
            setBusy(true);
            await billingService.adminRequestTopupInfo(topup.id, infoMessage.trim());
            showToast('Information requested from vendor');
            setShowRequestInfo(false);
            setInfoMessage('');
            fetchDetail();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to request info', 'error');
        } finally {
            setBusy(false);
        }
    };

    const startEdit = () => {
        setEditForm({ amount: topup.amount, transaction_id: topup.transaction_id, screenshot: null });
        setEditMode(true);
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        const amountNum = Number(editForm.amount);
        if (!editForm.amount || !Number.isFinite(amountNum) || amountNum <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }
        if (amountNum > MAX_AMOUNT) {
            showToast(`Amount cannot exceed ${MAX_AMOUNT.toLocaleString()}`, 'error');
            return;
        }
        if (!editForm.transaction_id.trim()) {
            showToast('Transaction ID is required', 'error');
            return;
        }
        if (editForm.transaction_id.trim().length > TRANSACTION_ID_MAX_LENGTH) {
            showToast(`Transaction ID cannot be longer than ${TRANSACTION_ID_MAX_LENGTH} characters`, 'error');
            return;
        }
        try {
            setBusy(true);
            const fd = new FormData();
            fd.append('amount', editForm.amount);
            fd.append('transaction_id', editForm.transaction_id.trim());
            if (editForm.screenshot) fd.append('screenshot', editForm.screenshot);
            await billingService.adminUpdateTopup(topup.id, fd);
            showToast('Top-up request updated');
            setEditMode(false);
            fetchDetail();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to update top-up', 'error');
        } finally {
            setBusy(false);
        }
    };

    const submitRespond = async (e) => {
        e.preventDefault();
        const screenshotError = validateScreenshotFile(respondForm.screenshot);
        if (screenshotError) {
            showToast(screenshotError, 'error');
            return;
        }
        try {
            setBusy(true);
            const fd = new FormData();
            if (respondForm.transaction_id.trim()) fd.append('transaction_id', respondForm.transaction_id.trim());
            if (respondForm.vendor_note.trim()) fd.append('vendor_note', respondForm.vendor_note.trim());
            if (respondForm.screenshot) fd.append('screenshot', respondForm.screenshot);
            await billingService.updateTopup(topup.id, fd);
            showToast(topup.status === 'REJECTED' ? 'Top-up resubmitted — pending review again' : 'Information submitted — request is pending again');
            fetchDetail();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to update request', 'error');
        } finally {
            setBusy(false);
        }
    };

    // `loading` also flips true on action-triggered refetches (approve/reject/
    // edit/respond all call fetchDetail()) — gate the full skeleton on "no data
    // yet" so those refetches don't blank the page out again, only the first visit does.
    if (!topup) {
        return (
            <div className="view active" style={{ position: 'relative', minHeight: '70vh' }}>
                <div className="detail-header">
                    <h2>
                        <button type="button" className="detail-header-back" onClick={() => navigate(backPath)}>
                            <ArrowLeft size={20} />
                        </button>
                        <Banknote size={18} /> Top-up Request
                    </h2>
                </div>
                <div className="premium-modal-grid">
                    <div className="left-col">
                        <SkeletonCard titleWidth="35%" lines={4} className="info-card product-info-card" />
                        <div className="info-card">
                            <SkeletonText width="30%" height="16px" style={{ marginBottom: '0.9rem' }} />
                            <SkeletonBlock height="220px" />
                        </div>
                    </div>
                    <div className="right-col">
                        <SkeletonCard titleWidth="45%" lines={3} />
                        <SkeletonCard titleWidth="30%" lines={2} />
                    </div>
                </div>
                <PageLoaderOverlay label="Loading top-up details…" />
            </div>
        );
    }

    const ascendingLog = [...auditLog].reverse(); // API returns newest-first
    const rounds = buildRounds(ascendingLog);
    const activityEvents = ascendingLog.slice().reverse(); // full trail, newest-first for display
    const canRespond = isAdminView === false && (topup.status === 'INFO_REQUIRED' || topup.status === 'REJECTED');

    return (
        <div className="view active">
            <div className="detail-header">
                <h2>
                    <button type="button" className="detail-header-back" onClick={() => navigate(backPath)}>
                        <ArrowLeft size={20} />
                    </button>
                    <Banknote size={18} /> Top-up Request — {Number(topup.amount).toLocaleString()} credits
                </h2>
                <div className="action-bar" style={{ alignItems: 'center', gap: '0.6rem' }}>
                    <StatusBadge status={topup.status} label={topup.status_display} />
                    {loading && <span style={{ fontSize: '0.78rem', color: 'var(--dash-ink-faint)' }}>Refreshing…</span>}
                    {isAdminView && (topup.status === 'PENDING' || topup.status === 'INFO_REQUIRED') && (
                        <>
                            <button type="button" className="dash-btn dash-btn-primary" disabled={busy} onClick={handleApprove}>
                                <Check size={16} /> Approve
                            </button>
                            <button type="button" className="dash-btn dash-btn-danger" disabled={busy} onClick={() => { setShowReject(true); setRejectReason(''); }}>
                                <X size={16} /> Reject
                            </button>
                            {topup.status === 'PENDING' && (
                                <button type="button" className="dash-btn dash-btn-secondary" disabled={busy} onClick={() => { setShowRequestInfo(true); setInfoMessage(''); }}>
                                    <HelpCircle size={16} /> Request Info
                                </button>
                            )}
                        </>
                    )}
                    {isAdminView && topup.status !== 'APPROVED' && !editMode && (
                        <button type="button" className="dash-btn dash-btn-secondary" onClick={startEdit}>
                            <Pencil size={16} /> Correct Details
                        </button>
                    )}
                </div>
            </div>

            {isAdminView && topup.vendor_username && (
                <p style={{ margin: '-1rem 0 1.25rem', color: 'var(--dash-ink-soft)', fontSize: '0.9rem' }}>
                    Submitted by <strong>{topup.vendor_username}</strong>
                </p>
            )}

            <div className="premium-modal-grid">
                <div className="left-col">
                    <div className="info-card product-info-card">
                        <h3 className="card-title">Payment Details</h3>
                        <div className="info-row"><div className="info-label">Transaction ID</div><div className="info-value" style={{ fontFamily: 'monospace' }}>{topup.transaction_id}</div></div>
                        <div className="info-row"><div className="info-label">Payment Method</div><div className="info-value">{topup.payment_method?.provider_name || '—'}</div></div>
                        <div className="info-row"><div className="info-label">Submitted</div><div className="info-value">{fmtDate(topup.created_at)}</div></div>
                        <div className="info-row"><div className="info-label">Last Updated</div><div className="info-value">{fmtDate(topup.updated_at)}</div></div>
                    </div>

                    <div className="info-card">
                        <h3 className="card-title">Screenshot</h3>
                        {topup.screenshot_url ? (
                            <img src={topup.screenshot_url} alt="Payment screenshot" onClick={() => setLightboxSrc(topup.screenshot_url)}
                                style={{ maxWidth: '100%', borderRadius: 'var(--dash-radius-sm)', cursor: 'pointer' }} />
                        ) : (
                            <p className="description-text">No screenshot on file.</p>
                        )}
                    </div>

                    {topup.status === 'REJECTED' && topup.rejection_reason && (
                        <div className="info-card">
                            <h3 className="card-title">Rejection Reason</h3>
                            <p className="description-text">{topup.rejection_reason}</p>
                        </div>
                    )}

                    {editMode && (
                        <div className="info-card">
                            <h3 className="card-title">Correct Details</h3>
                            <form onSubmit={submitEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                <div className="form-group">
                                    <label>Amount</label>
                                    <input type="number" min="1" max={MAX_AMOUNT} step="0.01" value={editForm.amount}
                                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Transaction ID</label>
                                    <input type="text" maxLength={TRANSACTION_ID_MAX_LENGTH} value={editForm.transaction_id}
                                        onChange={(e) => setEditForm({ ...editForm, transaction_id: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Upload size={14} /> Replace Screenshot (optional)
                                    </label>
                                    <input type="file" accept="image/png,image/jpeg,image/webp"
                                        onChange={(e) => setEditForm({ ...editForm, screenshot: e.target.files?.[0] || null })} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={busy}>
                                        {busy ? 'Saving…' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {canRespond && (
                        <div className="info-card">
                            <h3 className="card-title">{topup.status === 'REJECTED' ? 'Resubmit This Top-up' : 'Respond to Admin'}</h3>
                            {topup.status === 'INFO_REQUIRED' && topup.info_request_message && (
                                <div style={{ background: 'var(--dash-info-soft)', borderRadius: 'var(--dash-radius-sm)', padding: '0.7rem 0.9rem', fontSize: '0.87rem', marginBottom: '0.9rem' }}>
                                    <strong style={{ color: 'var(--dash-info)' }}>Admin asked:</strong> {topup.info_request_message}
                                </div>
                            )}
                            <form onSubmit={submitRespond} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                <div className="form-group">
                                    <label>Transaction ID</label>
                                    <input type="text" maxLength={TRANSACTION_ID_MAX_LENGTH} value={respondForm.transaction_id}
                                        onChange={(e) => setRespondForm({ ...respondForm, transaction_id: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Note</label>
                                    <textarea rows={3} value={respondForm.vendor_note}
                                        onChange={(e) => setRespondForm({ ...respondForm, vendor_note: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>New Screenshot (optional)</label>
                                    <input type="file" accept="image/*"
                                        onChange={(e) => setRespondForm({ ...respondForm, screenshot: e.target.files?.[0] || null })} />
                                </div>
                                <div className="modal-actions">
                                    <button type="submit" className="btn btn-primary" disabled={busy}>
                                        {busy ? 'Submitting…' : (topup.status === 'REJECTED' ? 'Resubmit' : 'Submit Response')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>

                <div className="right-col">
                    <div className="info-card">
                        <h3 className="card-title"><MessageSquare size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Information Requests</h3>
                        {rounds.length === 0 ? (
                            <p className="description-text">No information has been requested for this top-up.</p>
                        ) : (
                            <div className="dash-qa-list">
                                {rounds.slice().reverse().map(({ request, reply }, idx) => (
                                    <div key={request.id} className="dash-qa-round">
                                        <div className="dash-qa-round-head">Request {rounds.length - idx}</div>
                                        <div className="dash-qa-block dash-qa-block-ask">
                                            <div className="dash-qa-label"><HelpCircle size={14} /> Admin asked</div>
                                            <div className="dash-qa-message">{request.new_state?.info_request_message || '—'}</div>
                                            <div className="dash-qa-meta">{request.actor_username || 'admin'} · {fmtDate(request.created_at)}</div>
                                        </div>
                                        {reply ? (
                                            <div className="dash-qa-block dash-qa-block-reply">
                                                <div className="dash-qa-label"><Check size={14} /> Vendor replied</div>
                                                <div className="dash-qa-message">{reply.new_state?.vendor_note || '(no note added)'}</div>
                                                <div className="dash-qa-meta">{reply.actor_username || 'vendor'} · {fmtDate(reply.created_at)}</div>
                                                {replyHasNewScreenshot(reply) ? (
                                                    <div className="dash-qa-thumb" onClick={() => setLightboxSrc(reply.new_state.screenshot_url)}>
                                                        <img src={reply.new_state.screenshot_url} alt="Reply screenshot" />
                                                    </div>
                                                ) : (
                                                    <div className="dash-qa-meta">No new screenshot attached</div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="dash-qa-block dash-qa-block-pending">
                                                <div className="dash-qa-label"><Clock3 size={14} /> Awaiting vendor response</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {activityEvents.length > 0 && (
                        <div className="info-card">
                            <h3 className="card-title">Activity Log</h3>
                            <div className="dash-timeline dash-qa-list">
                                {activityEvents.map((log) => {
                                    const shot = screenshotDiff(log);
                                    const diffs = fieldDiffs(log);
                                    const hasDetail = !!shot || diffs.length > 0;
                                    return (
                                        <div key={log.id} className={`dash-timeline-item${hasDetail ? ' dash-timeline-item--detailed' : ''}`}>
                                            <div className="dash-timeline-icon"><Clock3 size={15} /></div>
                                            <div className="dash-timeline-body-wrap">
                                                <div className="dash-timeline-body">
                                                    <div className="timeline-main">
                                                        <strong>{log.action_display}</strong> by {log.actor_username || 'system'}
                                                    </div>
                                                    <div className="timeline-dates">{fmtDate(log.created_at)}</div>
                                                </div>
                                                {diffs.length > 0 && (
                                                    <div className="dash-timeline-diffs">
                                                        {diffs.map((d) => (
                                                            <div key={d.label} className="dash-qa-meta">{d.label}: {d.before} → {d.after}</div>
                                                        ))}
                                                    </div>
                                                )}
                                                {shot && (
                                                    <div className="dash-timeline-shots">
                                                        {shot.before && (
                                                            <div className="dash-qa-thumb" onClick={() => setLightboxSrc(shot.before)}>
                                                                <img src={shot.before} alt="Previous screenshot" />
                                                            </div>
                                                        )}
                                                        {shot.before && <span className="dash-timeline-arrow">→</span>}
                                                        <div className="dash-qa-thumb" onClick={() => setLightboxSrc(shot.after)}>
                                                            <img src={shot.after} alt="New screenshot" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Reject modal */}
            {showReject && (
                <div className="modal" style={{ display: 'flex' }}>
                    <div className="modal-content" style={{ maxWidth: '480px' }}>
                        <div className="modal-header"><h3>Reject Top-up</h3><X className="close-modal" onClick={() => setShowReject(false)} /></div>
                        <form onSubmit={submitReject} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--dash-ink-soft)' }}>
                                Rejecting {topup.vendor_username}'s top-up of {Number(topup.amount).toLocaleString()} credits. The vendor will see the reason.
                            </p>
                            <div className="form-group">
                                <label>Rejection Reason (required)</label>
                                <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowReject(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Rejecting…' : 'Reject Request'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Request-info modal */}
            {showRequestInfo && (
                <div className="modal" style={{ display: 'flex' }}>
                    <div className="modal-content" style={{ maxWidth: '480px' }}>
                        <div className="modal-header"><h3>Request More Information</h3><X className="close-modal" onClick={() => setShowRequestInfo(false)} /></div>
                        <form onSubmit={submitRequestInfo} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--dash-ink-soft)' }}>
                                Ask {topup.vendor_username} for more details. The request will move to "More Information Required" until they respond.
                            </p>
                            <div className="form-group">
                                <label>Message to vendor (required)</label>
                                <textarea rows={3} value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} required />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowRequestInfo(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send Request'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {lightboxSrc && (
                <div
                    onClick={() => setLightboxSrc(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 2000, cursor: 'zoom-out', padding: '2rem',
                    }}
                >
                    <X size={28} color="#fff" style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(null); }} />
                    <img src={lightboxSrc} alt="Full size screenshot" onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px', objectFit: 'contain' }} />
                </div>
            )}
        </div>
    );
};

export default TopUpDetail;
