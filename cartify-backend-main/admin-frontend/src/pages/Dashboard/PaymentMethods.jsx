import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import CopyField from '../../components/common/CopyField';
import StatusBadge from '../../components/common/StatusBadge';
import { billingService } from '../../services/billingService';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import { Plus, Edit2, Trash2, CreditCard, Wallet, Landmark, User, Hash, FileText, Eye } from 'lucide-react';

const EMPTY_FORM = {
    method_type: 'WALLET',
    provider_name: '',
    account_holder: '',
    account_number: '',
    instructions: '',
    is_active: true,
};

const PaymentMethods = () => {
    const { showToast } = useToast();
    const { prompt } = usePrompt();
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);

    const fetchMethods = useCallback(async () => {
        try {
            setLoading(true);
            const data = await billingService.adminGetPaymentMethods();
            setMethods(data.results || []);
        } catch (e) {
            console.error('Error fetching payment methods:', e);
            showToast('Failed to load payment methods', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchMethods(); }, [fetchMethods]);

    const openModal = (method = null) => {
        setEditing(method);
        setForm(method ? {
            method_type: method.method_type,
            provider_name: method.provider_name,
            account_holder: method.account_holder,
            account_number: method.account_number,
            instructions: method.instructions || '',
            is_active: method.is_active,
        } : EMPTY_FORM);
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.provider_name.trim() || !form.account_holder.trim() || !form.account_number.trim()) {
            showToast('Name, account holder and account number are required', 'error');
            return;
        }
        try {
            setSubmitting(true);
            if (editing) {
                await billingService.adminUpdatePaymentMethod(editing.id, form);
                showToast('Payment method updated');
            } else {
                await billingService.adminCreatePaymentMethod(form);
                showToast('Payment method created');
            }
            setShowModal(false);
            fetchMethods();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to save payment method', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleActive = async (method) => {
        const nextActive = !method.is_active;
        setMethods((prev) => prev.map((m) => (m.id === method.id ? { ...m, is_active: nextActive } : m)));
        try {
            await billingService.adminUpdatePaymentMethod(method.id, { is_active: nextActive });
            showToast(`${method.provider_name} is now ${nextActive ? 'active' : 'inactive'}`);
        } catch (e) {
            setMethods((prev) => prev.map((m) => (m.id === method.id ? { ...m, is_active: method.is_active } : m)));
            showToast(e.response?.data?.error || 'Failed to update status', 'error');
        }
    };

    const handleDelete = async (method) => {
        const ok = await prompt({
            title: 'Delete Payment Method',
            message: `Delete "${method.provider_name} — ${method.account_number}"? Vendors will no longer see it.`,
            showInput: false,
        });
        if (!ok) return;
        try {
            await billingService.adminDeletePaymentMethod(method.id);
            showToast('Payment method deleted');
            fetchMethods();
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to delete payment method', 'error');
        }
    };

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><CreditCard size={20} /> Payment Methods</h3>
                    <p>Manage payment options that vendors can use for wallet top-ups.</p>
                </div>
                <button className="btn btn-primary page-action-btn" onClick={() => openModal()}>
                    <Plus size={18} /> Add Method
                </button>
            </div>

            <div className="data-section">
                <DataTable
                    columns={['Type', 'Name', 'Account Holder', 'Account Number', 'Instructions', 'Status', 'Actions']}
                    data={methods}
                    loading={loading}
                    keyExtractor={(m) => m.id}
                    renderRow={(m) => (
                        <>
                            <td>{m.method_type === 'BANK' ? 'Bank' : 'Wallet'}</td>
                            <td><strong>{m.provider_name}</strong></td>
                            <td>{m.account_holder}</td>
                            <td><CopyField value={m.account_number} /></td>
                            <td style={{ maxWidth: 240, fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>{m.instructions || '—'}</td>
                            <td>
                                <StatusBadge
                                    status={m.is_active ? 'ACTIVE' : 'CANCELLED'}
                                    label={m.is_active ? 'Active' : 'Inactive'}
                                    onClick={() => handleToggleActive(m)}
                                    title={`Click to mark ${m.is_active ? 'inactive' : 'active'}`}
                                />
                            </td>
                            <td>
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                    <button className="action-btn" title="Edit" onClick={() => openModal(m)}><Edit2 size={16} /></button>
                                    <button className="action-btn" title="Delete" onClick={() => handleDelete(m)}><Trash2 size={16} color="var(--dash-danger)" /></button>
                                </div>
                            </td>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={showModal} onClose={() => setShowModal(false)}
                title={editing ? 'Edit Payment Method' : 'Add Payment Method'} maxWidth="560px">
                <form onSubmit={handleSubmit} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                        <label>Payment Type</label>
                        <div className="dash-type-picker">
                            <button type="button"
                                className={`dash-type-option${form.method_type === 'WALLET' ? ' is-selected' : ''}`}
                                onClick={() => setForm({ ...form, method_type: 'WALLET' })}>
                                <div className="dash-type-option-icon"><Wallet size={18} /></div>
                                <div>
                                    <div className="dash-type-option-label">Mobile Wallet</div>
                                    <div className="dash-type-option-hint">JazzCash, Easypaisa, etc.</div>
                                </div>
                            </button>
                            <button type="button"
                                className={`dash-type-option${form.method_type === 'BANK' ? ' is-selected' : ''}`}
                                onClick={() => setForm({ ...form, method_type: 'BANK' })}>
                                <div className="dash-type-option-icon"><Landmark size={18} /></div>
                                <div>
                                    <div className="dash-type-option-label">Bank Account</div>
                                    <div className="dash-type-option-hint">Direct bank transfer</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="modal-form-grid">
                        <div className="dash-field-icon-row">
                            <div className="dash-field-icon">{form.method_type === 'BANK' ? <Landmark size={18} /> : <Wallet size={18} />}</div>
                            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label>{form.method_type === 'BANK' ? 'Bank Name' : 'Wallet Name'}</label>
                                <input type="text" value={form.provider_name} placeholder="e.g. JazzCash"
                                    onChange={(e) => setForm({ ...form, provider_name: e.target.value })} required />
                            </div>
                        </div>
                        <div className="dash-field-icon-row">
                            <div className="dash-field-icon"><User size={18} /></div>
                            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label>Account Holder Name</label>
                                <input type="text" value={form.account_holder}
                                    onChange={(e) => setForm({ ...form, account_holder: e.target.value })} required />
                            </div>
                        </div>
                    </div>

                    <div className="dash-field-icon-row">
                        <div className="dash-field-icon"><Hash size={18} /></div>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label>Account Number</label>
                            <input type="text" value={form.account_number}
                                onChange={(e) => setForm({ ...form, account_number: e.target.value })} required />
                        </div>
                    </div>

                    <div className="dash-field-icon-row align-top">
                        <div className="dash-field-icon"><FileText size={18} /></div>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label>Payment Instructions (optional)</label>
                            <textarea rows={3} value={form.instructions} placeholder="e.g. Please add your order ID as the transfer note"
                                onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
                        </div>
                    </div>

                    <div className="dash-toggle-row">
                        <div>
                            <div className="dash-toggle-label"><Eye size={15} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />Active</div>
                            <div className="dash-toggle-hint">Visible to vendors when enabled</div>
                        </div>
                        <label className="dash-toggle">
                            <input type="checkbox" checked={form.is_active}
                                onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                            <span className="dash-toggle-track"><span className="dash-toggle-thumb" /></span>
                        </label>
                    </div>

                    <div>
                        <div className="dash-preview-section">Live Preview — what vendors will see</div>
                        <div className="dash-method-card is-preview" style={{ marginTop: '0.5rem' }}>
                            <div className="dash-method-card-top">
                                <strong>{form.provider_name || (form.method_type === 'BANK' ? 'Bank Name' : 'Wallet Name')}</strong>
                                <span className="dash-method-card-type">
                                    {form.method_type === 'BANK' ? 'Bank Account' : 'Mobile Wallet'}
                                </span>
                            </div>
                            <div className="dash-method-card-account">
                                {form.account_holder || 'Account holder'} — {form.account_number || 'Account number'}
                            </div>
                            {form.instructions && (
                                <div className="dash-method-card-instructions">{form.instructions}</div>
                            )}
                        </div>
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving…' : (editing ? 'Save Changes' : 'Create')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default PaymentMethods;
