import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StatCard from '../../components/common/StatCard';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/tables/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import CopyField from '../../components/common/CopyField';
import { billingService } from '../../services/billingService';
import { useToast } from '../../context/ToastContext';
import { Wallet, Plus, ArrowLeft, Upload, Info, Image as ImageIcon, Eye, RotateCcw } from 'lucide-react';

const PAGE_SIZE = 10;
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

const VendorWallet = () => {
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [wallet, setWallet] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
    const [ledgerTotalItems, setLedgerTotalItems] = useState(0);
    const [ledgerLoading, setLedgerLoading] = useState(true);

    const [topups, setTopups] = useState([]);
    const [topupPage, setTopupPage] = useState(1);
    const [topupTotalPages, setTopupTotalPages] = useState(1);
    const [topupTotalItems, setTopupTotalItems] = useState(0);
    const [topupLoading, setTopupLoading] = useState(true);

    const [showTopupModal, setShowTopupModal] = useState(false);
    const [topupStep, setTopupStep] = useState(1);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [selectedMethod, setSelectedMethod] = useState(null);
    const [form, setForm] = useState({ amount: '', transaction_id: '', screenshot: null });
    const [submitting, setSubmitting] = useState(false);

    const [infoTopup, setInfoTopup] = useState(null);
    const [infoForm, setInfoForm] = useState({ transaction_id: '', vendor_note: '', screenshot: null });

    const [screenshotUrl, setScreenshotUrl] = useState(null);

    const fetchWallet = useCallback(async () => {
        try {
            const data = await billingService.getWallet();
            setWallet(data);
        } catch (e) {
            console.error('Error fetching wallet:', e);
            showToast('Failed to load wallet', 'error');
        }
    }, [showToast]);

    const fetchLedger = useCallback(async () => {
        try {
            setLedgerLoading(true);
            const data = await billingService.getLedger({ page: ledgerPage, limit: PAGE_SIZE });
            setLedger(data.results || []);
            setLedgerTotalPages(data.total_pages || 1);
            setLedgerTotalItems(data.total_items || 0);
        } catch (e) {
            console.error('Error fetching ledger:', e);
        } finally {
            setLedgerLoading(false);
        }
    }, [ledgerPage]);

    const fetchTopups = useCallback(async () => {
        try {
            setTopupLoading(true);
            const data = await billingService.getTopups({ page: topupPage, limit: PAGE_SIZE });
            setTopups(data.results || []);
            setTopupTotalPages(data.total_pages || 1);
            setTopupTotalItems(data.total_items || 0);
        } catch (e) {
            console.error('Error fetching top-ups:', e);
        } finally {
            setTopupLoading(false);
        }
    }, [topupPage]);

    useEffect(() => { fetchWallet(); }, [fetchWallet]);
    useEffect(() => { fetchLedger(); }, [fetchLedger]);
    useEffect(() => { fetchTopups(); }, [fetchTopups]);

    const openTopupModal = async () => {
        setTopupStep(1);
        setSelectedMethod(null);
        setForm({ amount: '', transaction_id: '', screenshot: null });
        setShowTopupModal(true);
        try {
            const data = await billingService.getPaymentMethods();
            setPaymentMethods(data.results || []);
        } catch (e) {
            console.error('Error fetching payment methods:', e);
            showToast('Failed to load payment methods', 'error');
        }
    };

    const submitTopup = async (e) => {
        e.preventDefault();
        if (!form.amount || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }
        if (Number(form.amount) > MAX_AMOUNT) {
            showToast(`Amount cannot exceed ${MAX_AMOUNT.toLocaleString()}`, 'error');
            return;
        }
        if (!form.transaction_id.trim()) {
            showToast('Transaction ID is required', 'error');
            return;
        }
        if (form.transaction_id.trim().length > TRANSACTION_ID_MAX_LENGTH) {
            showToast(`Transaction ID cannot be longer than ${TRANSACTION_ID_MAX_LENGTH} characters`, 'error');
            return;
        }
        if (!form.screenshot) {
            showToast('Payment screenshot is required', 'error');
            return;
        }
        const screenshotError = validateScreenshotFile(form.screenshot);
        if (screenshotError) {
            showToast(screenshotError, 'error');
            return;
        }
        try {
            setSubmitting(true);
            const fd = new FormData();
            fd.append('amount', form.amount);
            fd.append('transaction_id', form.transaction_id.trim());
            fd.append('screenshot', form.screenshot);
            if (selectedMethod) fd.append('payment_method_id', selectedMethod.id);
            await billingService.createTopup(fd);
            showToast('Top-up request submitted');
            setShowTopupModal(false);
            fetchTopups();
            fetchWallet();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to submit top-up', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const openInfoModal = (topup) => {
        setInfoTopup(topup);
        setInfoForm({ transaction_id: topup.transaction_id || '', vendor_note: '', screenshot: null });
    };

    const submitInfo = async (e) => {
        e.preventDefault();
        const screenshotError = validateScreenshotFile(infoForm.screenshot);
        if (screenshotError) {
            showToast(screenshotError, 'error');
            return;
        }
        try {
            setSubmitting(true);
            const fd = new FormData();
            if (infoForm.transaction_id.trim()) fd.append('transaction_id', infoForm.transaction_id.trim());
            if (infoForm.vendor_note.trim()) fd.append('vendor_note', infoForm.vendor_note.trim());
            if (infoForm.screenshot) fd.append('screenshot', infoForm.screenshot);
            await billingService.updateTopup(infoTopup.id, fd);
            showToast(infoTopup.status === 'REJECTED' ? 'Top-up resubmitted — pending review again' : 'Information submitted — request is pending again');
            setInfoTopup(null);
            fetchTopups();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to update request', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const fmtDate = (iso) => new Date(iso).toLocaleString();

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Wallet size={20} /> Wallet & Credits</h3>
                    <p>Manage your credits, top-ups and transaction history.</p>
                </div>
                <button className="btn btn-primary page-action-btn" onClick={openTopupModal}>
                    <Plus size={18} /> Top-up
                </button>
            </div>

            <div className="dash-stats-grid">
                <StatCard label="Available Credits" value={wallet ? Number(wallet.balance).toLocaleString() : '—'} />
                <StatCard label="Pending Top-ups" value={wallet ? wallet.pending_topups : '—'} />
            </div>

            <div className="data-section" style={{ marginBottom: '1.5rem' }}>
                <div className="section-header"><h3>Top-up History</h3></div>
                <DataTable
                    columns={['Date', 'Amount', 'Transaction ID', 'Method', 'Screenshot', 'Status', 'Actions']}
                    data={topups}
                    loading={topupLoading}
                    keyExtractor={(t) => t.id}
                    currentPage={topupPage}
                    totalPages={topupTotalPages}
                    totalItems={topupTotalItems}
                    onPageChange={setTopupPage}
                    renderRow={(t) => (
                        <>
                            <td>{fmtDate(t.created_at)}</td>
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
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                    <button className="action-btn" title="View details" onClick={() => navigate(`/admin/vendor-dashboard/wallet/${t.id}`)}>
                                        <Eye size={16} />
                                    </button>
                                    {t.status === 'INFO_REQUIRED' && (
                                        <button className="btn btn-secondary" onClick={() => openInfoModal(t)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', padding: '0.6rem 0.85rem' }}>
                                            <Info size={14} /> Provide Info
                                        </button>
                                    )}
                                    {t.status === 'REJECTED' && (
                                        <button className="btn btn-secondary" onClick={() => openInfoModal(t)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', padding: '0.6rem 0.85rem' }}>
                                            <RotateCcw size={14} /> Resubmit
                                        </button>
                                    )}
                                </div>
                            </td>
                        </>
                    )}
                />
            </div>

            <div className="data-section">
                <div className="section-header"><h3>Credit Ledger</h3></div>
                <DataTable
                    columns={['Date', 'Type', 'Description', 'Amount', 'Balance After']}
                    data={ledger}
                    loading={ledgerLoading}
                    keyExtractor={(e) => e.id}
                    currentPage={ledgerPage}
                    totalPages={ledgerTotalPages}
                    totalItems={ledgerTotalItems}
                    onPageChange={setLedgerPage}
                    renderRow={(entry) => {
                        const amount = Number(entry.amount);
                        return (
                            <>
                                <td>{fmtDate(entry.created_at)}</td>
                                <td>{entry.entry_type_display}</td>
                                <td>{entry.description}</td>
                                <td style={{ color: amount >= 0 ? 'var(--dash-success)' : 'var(--dash-danger)', fontWeight: 600 }}>
                                    {amount >= 0 ? '+' : ''}{amount.toLocaleString()}
                                </td>
                                <td>{Number(entry.balance_after).toLocaleString()}</td>
                            </>
                        );
                    }}
                />
            </div>

            {/* Top-up modal */}
            <Modal isOpen={showTopupModal} onClose={() => setShowTopupModal(false)}
                title={topupStep === 1 ? 'Choose Payment Method' : 'Submit Top-up'} maxWidth="620px">
                {topupStep === 1 ? (
                    <div style={{ padding: '1rem' }}>
                        <p style={{ color: 'var(--dash-ink-soft)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Send your payment to one of the accounts below, then continue to submit the details.
                        </p>
                        {paymentMethods.length === 0 && (
                            <p style={{ color: 'var(--dash-ink-soft)' }}>No payment methods are available yet. Please contact support.</p>
                        )}
                        <div className="dash-method-list">
                            {paymentMethods.map((pm) => (
                                <div key={pm.id}
                                    onClick={() => setSelectedMethod(pm)}
                                    className={`dash-method-card${selectedMethod?.id === pm.id ? ' is-selected' : ''}`}>
                                    <div className="dash-method-card-top">
                                        <strong>{pm.provider_name}</strong>
                                        <span className="dash-method-card-type">
                                            {pm.method_type === 'BANK' ? 'Bank Account' : 'Mobile Wallet'}
                                        </span>
                                    </div>
                                    <div className="dash-method-card-account">
                                        {pm.account_holder} — <CopyField value={pm.account_number} />
                                    </div>
                                    {pm.instructions && (
                                        <div className="dash-method-card-instructions">
                                            {pm.instructions}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginTop: '1.2rem' }}>
                            {paymentMethods.length > 0 && !selectedMethod && (
                                <span style={{ fontSize: '0.82rem', color: 'var(--dash-ink-soft)' }}>Select a payment method to continue</span>
                            )}
                            <button className="btn btn-primary" disabled={paymentMethods.length === 0 || !selectedMethod}
                                onClick={() => setTopupStep(2)}>
                                I have paid — Continue
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submitTopup} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <button type="button" onClick={() => setTopupStep(1)}
                            style={{ background: 'none', border: 'none', color: 'var(--dash-accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: 0 }}>
                            <ArrowLeft size={15} /> Back to payment methods
                        </button>
                        {selectedMethod && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>
                                Paying via <strong>{selectedMethod.provider_name}</strong> ({selectedMethod.account_number})
                            </div>
                        )}
                        <div className="form-group">
                            <label>Amount (PKR)</label>
                            <input type="number" min="1" max={MAX_AMOUNT} step="0.01" value={form.amount}
                                onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Transaction ID</label>
                            <input type="text" maxLength={TRANSACTION_ID_MAX_LENGTH} value={form.transaction_id}
                                onChange={(e) => setForm({ ...form, transaction_id: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Upload size={15} /> Payment Screenshot
                            </label>
                            <input type="file" accept="image/*"
                                onChange={(e) => setForm({ ...form, screenshot: e.target.files?.[0] || null })} required />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowTopupModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Submitting…' : 'Submit Top-up Request'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Provide-info / resubmit modal */}
            <Modal isOpen={!!infoTopup} onClose={() => setInfoTopup(null)}
                title={infoTopup?.status === 'REJECTED' ? 'Resubmit Top-up' : 'Provide More Information'} maxWidth="520px">
                {infoTopup && (
                    <form onSubmit={submitInfo} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        {infoTopup.status === 'REJECTED' ? (
                            <div style={{ background: 'var(--dash-danger-soft)', borderRadius: 'var(--dash-radius-sm)', padding: '0.7rem 0.9rem', fontSize: '0.87rem' }}>
                                <strong style={{ color: 'var(--dash-danger)' }}>Rejected — reason:</strong> {infoTopup.rejection_reason}
                            </div>
                        ) : (
                            <div style={{ background: 'var(--dash-info-soft)', borderRadius: 'var(--dash-radius-sm)', padding: '0.7rem 0.9rem', fontSize: '0.87rem' }}>
                                <strong style={{ color: 'var(--dash-info)' }}>Admin asked:</strong> {infoTopup.info_request_message}
                            </div>
                        )}
                        <div className="form-group">
                            <label>Transaction ID</label>
                            <input type="text" maxLength={TRANSACTION_ID_MAX_LENGTH} value={infoForm.transaction_id}
                                onChange={(e) => setInfoForm({ ...infoForm, transaction_id: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Note</label>
                            <textarea rows={3} value={infoForm.vendor_note}
                                onChange={(e) => setInfoForm({ ...infoForm, vendor_note: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>New Screenshot (optional)</label>
                            <input type="file" accept="image/*"
                                onChange={(e) => setInfoForm({ ...infoForm, screenshot: e.target.files?.[0] || null })} />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setInfoTopup(null)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Submitting…' : 'Submit'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Screenshot quick-viewer */}
            <Modal isOpen={!!screenshotUrl} onClose={() => setScreenshotUrl(null)} title="Payment Screenshot" maxWidth="640px">
                {screenshotUrl && (
                    <div style={{ padding: '1rem', textAlign: 'center' }}>
                        <img src={screenshotUrl} alt="Payment screenshot" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default VendorWallet;
