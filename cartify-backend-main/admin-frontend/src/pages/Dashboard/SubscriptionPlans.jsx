import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { subscriptionService } from '../../services/subscriptionService';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import { Crown, Plus, Edit2, Trash2 } from 'lucide-react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

const EMPTY_FORM = {
    name: '',
    description: '',
    price_credits: '',
    max_active_products: 4,
    visitor_detail_limit: '',
    allow_cart: false,
    can_view_viewers: false,
    can_view_favoriters: false,
    can_view_cart_users: false,
    can_view_clickers: false,
    is_active: true,
};

const BOOL_FIELDS = [
    ['allow_cart', 'Add to Cart available'],
    ['can_view_viewers', 'Can see product view users'],
    ['can_view_favoriters', 'Can see favorite users'],
    ['can_view_cart_users', 'Can see cart users'],
    ['can_view_clickers', 'Can see link click users'],
    ['is_active', 'Plan active (purchasable)'],
];

const SubscriptionPlans = () => {
    const { showToast } = useToast();
    const { prompt } = usePrompt();
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);

    const fetchPlans = useCallback(async () => {
        try {
            setLoading(true);
            const data = await subscriptionService.adminGetPlans();
            setPlans(data.results || []);
        } catch (e) {
            console.error('Error fetching plans:', e);
            showToast('Failed to load plans', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { fetchPlans(); }, [fetchPlans]);

    const openModal = (plan = null) => {
        setEditing(plan);
        setForm(plan ? {
            name: plan.name,
            description: plan.description || '',
            price_credits: plan.price_credits,
            max_active_products: plan.max_active_products,
            visitor_detail_limit: plan.visitor_detail_limit ?? '',
            allow_cart: plan.allow_cart,
            can_view_viewers: plan.can_view_viewers,
            can_view_favoriters: plan.can_view_favoriters,
            can_view_cart_users: plan.can_view_cart_users,
            can_view_clickers: plan.can_view_clickers,
            is_active: plan.is_active,
        } : EMPTY_FORM);
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = {
            ...form,
            visitor_detail_limit: form.visitor_detail_limit === '' ? null : Number(form.visitor_detail_limit),
        };
        try {
            setSubmitting(true);
            if (editing) {
                await subscriptionService.adminUpdatePlan(editing.id, payload);
                showToast('Plan updated');
            } else {
                await subscriptionService.adminCreatePlan(payload);
                showToast('Plan created');
            }
            setShowModal(false);
            fetchPlans();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to save plan', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (plan) => {
        const ok = await prompt({
            title: 'Delete Plan',
            message: `Delete "${plan.name}"? Plans with subscribers are deactivated instead.`,
            showInput: false,
        });
        if (!ok) return;
        try {
            const res = await subscriptionService.adminDeletePlan(plan.id);
            showToast(res.message || 'Plan deleted');
            fetchPlans();
        } catch (e) {
            showToast(e.response?.data?.error || 'Failed to delete plan', 'error');
        }
    };

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Crown size={20} /> Subscription Plans</h3>
                    <p>Create and manage subscription offerings with consistent controls and clearer actions.</p>
                </div>
                <button className="btn btn-primary page-action-btn" onClick={() => openModal()}>
                    <Plus size={18} /> Add Plan
                </button>
            </div>

            <div className="data-section">
                <DataTable
                    columns={['Plan', 'Price (credits/mo)', 'Product Limit', 'Cart', 'Analytics', 'Visitor Limit', 'Subscribers', 'Status', 'Actions']}
                    data={plans}
                    loading={loading}
                    keyExtractor={(p) => p.id}
                    renderRow={(p) => (
                        <>
                            <td>
                                <strong>{p.name}</strong>
                                {p.is_free_default && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--dash-info)', fontWeight: 700 }}>DEFAULT</span>}
                            </td>
                            <td>{Number(p.price_credits).toLocaleString()}</td>
                            <td>{p.max_active_products}</td>
                            <td>{p.allow_cart ? 'Yes' : 'No'}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                                {[p.can_view_viewers && 'Views', p.can_view_favoriters && 'Favorites',
                                  p.can_view_cart_users && 'Cart', p.can_view_clickers && 'Clicks']
                                    .filter(Boolean).join(', ') || '—'}
                            </td>
                            <td>{p.visitor_detail_limit ?? 'Unlimited'}</td>
                            <td>{p.active_subscribers ?? 0}</td>
                            <td>
                                <StatusBadge status={p.is_active ? 'ACTIVE' : 'STOPPED'} label={p.is_active ? 'Active' : 'Inactive'} />
                            </td>
                            <td>
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                    <button className="action-btn" title="Edit" onClick={() => openModal(p)}><Edit2 size={16} /></button>
                                    {!p.is_free_default && (
                                        <button className="action-btn" title="Delete" onClick={() => handleDelete(p)}><Trash2 size={16} color="var(--dash-danger)" /></button>
                                    )}
                                </div>
                            </td>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={showModal} onClose={() => setShowModal(false)}
                title={editing ? `Edit Plan: ${editing.name}` : 'Add Subscription Plan'} maxWidth="560px">
                <form onSubmit={handleSubmit} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div className="modal-form-grid">
                        <div className="form-group">
                            <label>Plan Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Monthly Price (credits)</label>
                            <input type="number" min="0" step="0.01" value={form.price_credits}
                                onChange={(e) => setForm({ ...form, price_credits: e.target.value })} required />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <div className="ckeditor-wrapper">
                            <CKEditor
                                editor={ClassicEditor}
                                data={form.description}
                                onChange={(event, editor) => {
                                    const data = editor.getData();
                                    setForm((prev) => ({ ...prev, description: data }));
                                }}
                            />
                        </div>
                    </div>
                    <div className="modal-form-grid">
                        <div className="form-group">
                            <label>Max Active Products</label>
                            <input type="number" min="0" value={form.max_active_products}
                                onChange={(e) => setForm({ ...form, max_active_products: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Visitor Detail Limit (empty = unlimited)</label>
                            <input type="number" min="0" value={form.visitor_detail_limit}
                                onChange={(e) => setForm({ ...form, visitor_detail_limit: e.target.value })} />
                        </div>
                    </div>
                    <div className="checkbox-grid">
                        {BOOL_FIELDS.map(([key, label]) => (
                            <label key={key} className="checkbox-pill">
                                <input type="checkbox" checked={!!form[key]}
                                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                                {label}
                            </label>
                        ))}
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving…' : (editing ? 'Save Changes' : 'Create Plan')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default SubscriptionPlans;
