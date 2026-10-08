import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import PricingLegend from '../../components/common/PricingLegend';
import { campaignService } from '../../services/campaignService';
import { billingService } from '../../services/billingService';
import { vendorService } from '../../services/vendorService';
import { useToast } from '../../context/ToastContext';
import { getImageUrl } from '../../utils/image';
import { Megaphone, Plus, Eye, Search, Trash2, PackageSearch } from 'lucide-react';

const PAGE_SIZE = 10;
const STATUS_FILTERS = ['ALL', 'DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'OUT_OF_BUDGET'];

const OBJECTIVES = [
    { key: 'views', label: 'Views', priceKey: 'cost_per_view' },
    { key: 'favorites', label: 'Favorites', priceKey: 'cost_per_favorite' },
    { key: 'cart_adds', label: 'Cart Adds', priceKey: 'cost_per_cart_add' },
    { key: 'link_clicks', label: 'Link Clicks', priceKey: 'cost_per_link_click' },
];

const VendorCampaigns = () => {
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [campaigns, setCampaigns] = useState([]);
    const [pricing, setPricing] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const [showCreate, setShowCreate] = useState(false);
    const [balance, setBalance] = useState(null);
    const [myProducts, setMyProducts] = useState([]);
    const [form, setForm] = useState({ name: '', budget: '' });
    const [selection, setSelection] = useState({}); // productId -> {views, favorites, cart_adds, link_clicks}
    const [submitting, setSubmitting] = useState(false);
    const [showProductPicker, setShowProductPicker] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const pickerRef = useRef(null);

    const fetchCampaigns = useCallback(async () => {
        try {
            setLoading(true);
            const data = await campaignService.getCampaigns({
                page: currentPage, limit: PAGE_SIZE, status: statusFilter,
            });
            setCampaigns(data.results || []);
            setPricing(data.pricing || null);
            setTotalPages(data.total_pages || 1);
            setTotalItems(data.total_items || 0);
        } catch (e) {
            console.error('Error fetching campaigns:', e);
            showToast('Failed to load campaigns', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, showToast]);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    const openCreate = async () => {
        setForm({ name: '', budget: '' });
        setSelection({});
        setShowProductPicker(false);
        setProductSearch('');
        setShowCreate(true);
        try {
            const [walletData, productsData] = await Promise.all([
                billingService.getWallet(),
                vendorService.getVendorProducts({ limit: 200 }),
            ]);
            setBalance(Number(walletData.balance));
            const productList = Array.isArray(productsData) ? productsData : (productsData?.results || []);
            setMyProducts(productList.filter((p) => p.is_active !== false));
        } catch (e) {
            console.error('Error loading create-campaign data:', e);
        }
    };

    const addProduct = (productId) => {
        setSelection((prev) => (prev[productId] ? prev : { ...prev, [productId]: {} }));
    };

    const removeProduct = (productId) => {
        setSelection((prev) => {
            const copy = { ...prev };
            delete copy[productId];
            return copy;
        });
    };

    const toggleObjective = (productId, key) => {
        setSelection((prev) => ({
            ...prev,
            [productId]: { ...prev[productId], [key]: !prev[productId]?.[key] },
        }));
    };

    const selectedProducts = useMemo(
        () => myProducts.filter((p) => selection[p.id]),
        [myProducts, selection],
    );

    const availableProducts = useMemo(
        () => myProducts.filter((p) => !selection[p.id] && p.name.toLowerCase().includes(productSearch.toLowerCase())),
        [myProducts, selection, productSearch],
    );

    useEffect(() => {
        if (!showProductPicker) return undefined;
        const handleClickOutside = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setShowProductPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showProductPicker]);

    const submitCreate = async (e) => {
        e.preventDefault();
        const products = Object.entries(selection)
            .filter(([, objectives]) => Object.values(objectives).some(Boolean))
            .map(([productId, objectives]) => ({ product_id: Number(productId), objectives }));
        if (!form.name.trim()) return showToast('Campaign name is required', 'error');
        if (!form.budget || Number(form.budget) <= 0) return showToast('Enter a valid budget', 'error');
        if (balance !== null && Number(form.budget) > balance) {
            return showToast(`Budget exceeds your available credits (${balance.toLocaleString()})`, 'error');
        }
        if (products.length === 0) return showToast('Add a product and pick at least one objective for it', 'error');

        try {
            setSubmitting(true);
            await campaignService.createCampaign({
                name: form.name.trim(),
                budget: form.budget,
                products,
            });
            showToast('Campaign created — budget reserved');
            setShowCreate(false);
            fetchCampaigns();
        } catch (e2) {
            showToast(e2.response?.data?.error || 'Failed to create campaign', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const budgetBar = (c) => {
        const total = Number(c.total_budget) || 1;
        const spent = Number(c.spent);
        const pct = Math.min(100, Math.round((spent / total) * 100));
        return (
            <div style={{ minWidth: 140 }}>
                <div style={{ fontSize: '0.8rem', marginBottom: 4, color: 'var(--text-secondary)' }}>
                    {spent.toLocaleString()} / {total.toLocaleString()}
                </div>
                <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--dash-danger)' : 'var(--dash-accent)' }} />
                </div>
            </div>
        );
    };

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Megaphone size={20} /> Campaigns</h3>
                    <p>Track your campaigns, budgets, and objective performance from one place.</p>
                </div>
                <div className="toolbar2-controls">
                    <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
                        {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                    </select>
                    <button className="btn btn-primary page-action-btn" onClick={openCreate}>
                        <Plus size={18} /> New Campaign
                    </button>
                </div>
            </div>

            {pricing && (
                <div style={{
                    margin: '0 0 1.2rem', padding: '0.75rem 1.1rem',
                    borderRadius: 'var(--dash-radius-md)', background: 'var(--dash-surface)',
                    border: '1px solid var(--dash-border)',
                }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--dash-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Cost per objective
                    </div>
                    <PricingLegend pricing={pricing} />
                </div>
            )}

            <div className="data-section">
                <DataTable
                    columns={['Name', 'Status', 'Budget Used', 'Products', 'Started', 'Ends', '']}
                    data={campaigns}
                    loading={loading}
                    keyExtractor={(c) => c.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    onPageChange={setCurrentPage}
                    renderRow={(c) => (
                        <>
                            <td><strong>{c.name}</strong></td>
                            <td><StatusBadge status={c.display_status || c.status} label={c.display_status_label || c.status_display} /></td>
                            <td>{budgetBar(c)}</td>
                            <td>{c.products?.length || 0}</td>
                            <td>{c.started_at ? new Date(c.started_at).toLocaleDateString() : '—'}</td>
                            <td>{c.ends_at ? new Date(c.ends_at).toLocaleDateString() : '—'}</td>
                            <td>
                                <button className="action-btn" onClick={() => navigate(`/admin/vendor-dashboard/campaigns/${c.id}`)}
                                    title="Manage campaign">
                                    <Eye size={15} />
                                </button>
                            </td>
                        </>
                    )}
                />
            </div>

            <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Campaign" maxWidth="700px">
                <form onSubmit={submitCreate} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Campaign Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>
                                Budget (credits)
                                {balance !== null && (
                                    <span style={{ marginLeft: 6, fontSize: '0.78rem', fontWeight: 400, color: Number(form.budget) > balance ? 'var(--dash-danger)' : 'var(--text-secondary)' }}>
                                        available: {balance.toLocaleString()}
                                    </span>
                                )}
                            </label>
                            <input type="number" min="1" step="0.01" value={form.budget}
                                onChange={(e) => setForm({ ...form, budget: e.target.value })} required />
                        </div>
                    </div>

                    <div>
                        <div className="campaign-products-header">
                            <label style={{ fontWeight: 600 }}>Target Products</label>
                            <p className="campaign-products-hint">
                                Add the products this campaign should promote, then pick what you're willing to pay for.
                            </p>
                            {pricing && <PricingLegend pricing={pricing} compact />}
                        </div>

                        <div className="campaign-products-toolbar">
                            <div className="product-add-wrap" ref={pickerRef}>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowProductPicker((v) => !v)}
                                    disabled={myProducts.length === 0}
                                >
                                    <Plus size={14} /> Add Product
                                </button>
                                {showProductPicker && (
                                    <div className="product-add-dropdown">
                                        <div className="product-add-search">
                                            <Search size={14} />
                                            <input
                                                type="text"
                                                placeholder="Search your products…"
                                                value={productSearch}
                                                onChange={(e) => setProductSearch(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        <div className="product-add-list">
                                            {availableProducts.length === 0 && (
                                                <p className="product-picker-empty">
                                                    {myProducts.length === selectedProducts.length
                                                        ? 'All your products are already in this campaign.'
                                                        : 'No products match your search.'}
                                                </p>
                                            )}
                                            {availableProducts.map((p) => (
                                                <button
                                                    type="button"
                                                    key={p.id}
                                                    className="product-add-option"
                                                    onClick={() => addProduct(p.id)}
                                                >
                                                    {p.image ? (
                                                        <img src={getImageUrl(p.image)} alt="" />
                                                    ) : (
                                                        <span className="product-add-option-noimg"><PackageSearch size={14} /></span>
                                                    )}
                                                    <span>{p.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="product-picker">
                            {myProducts.length === 0 && (
                                <p className="product-picker-empty">No active products found.</p>
                            )}
                            {myProducts.length > 0 && selectedProducts.length === 0 && (
                                <div className="product-picker-empty-state">
                                    <PackageSearch size={22} />
                                    <p>No products added yet</p>
                                    <span>Click "Add Product" above to choose what this campaign promotes.</span>
                                </div>
                            )}
                            {selectedProducts.map((p) => {
                                const objectives = selection[p.id] || {};
                                const hasObjective = Object.values(objectives).some(Boolean);
                                return (
                                    <div key={p.id} className="product-picker-item selected">
                                        <span className="product-picker-name">{p.name}</span>
                                        <div className="product-picker-item-footer">
                                            <div className="product-picker-objectives">
                                                {OBJECTIVES.map((obj) => (
                                                    <label key={obj.key} className="checkbox-pill">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!objectives[obj.key]}
                                                            onChange={() => toggleObjective(p.id, obj.key)}
                                                        />
                                                        {obj.label}
                                                    </label>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                className="btn-remove-inline"
                                                onClick={() => removeProduct(p.id)}
                                                title="Remove from campaign"
                                            >
                                                <Trash2 size={13} /> Remove
                                            </button>
                                        </div>
                                        {!hasObjective && <span className="product-picker-warning">Pick at least one objective</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Creating…' : 'Create & Reserve Budget'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default VendorCampaigns;
