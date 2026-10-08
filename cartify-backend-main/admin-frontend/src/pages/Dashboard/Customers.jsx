import React, { useState, useEffect } from 'react';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import StatusBadge from '../../components/common/StatusBadge';
import { customerService } from '../../services/customerService';
import { analyticsService } from '../../services/analyticsService';
import { useToast } from '../../context/ToastContext';
import { Users, Mail, Calendar, Heart, ShieldCheck, ShieldAlert, Trash2, Search, Eye, Edit2, Clock, Phone } from 'lucide-react';
import { usePrompt } from '../../components/common/CustomPrompt';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';
import { getImageUrl } from '../../utils/image';

const PAGE_SIZE = 10;

const Customers = () => {
    const { showToast } = useToast();
    const { prompt } = usePrompt();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [showFavoritesModal, setShowFavoritesModal] = useState(false);
    const [favoritesModalData, setFavoritesModalData] = useState([]);
    const [favoritesModalLoading, setFavoritesModalLoading] = useState(false);
    const [favoritesModalPage, setFavoritesModalPage] = useState(1);
    const [favoritesModalTotalPages, setFavoritesModalTotalPages] = useState(1);
    const [favoritesModalTotalItems, setFavoritesModalTotalItems] = useState(0);
    const [favoritesModalSearch, setFavoritesModalSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerDetails, setCustomerDetails] = useState(null);
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [customerDetailsLoading, setCustomerDetailsLoading] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [showCustomerEditModal, setShowCustomerEditModal] = useState(false);
    const [customerForm, setCustomerForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        status: 'ACTIVE',
        profile_image: null,
        previewImage: null,
    });
    const [lightboxSrc, setLightboxSrc] = useState(null);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const response = await customerService.getCustomers({
                page: currentPage,
                limit: PAGE_SIZE,
                search: searchTerm,
                status: statusFilter
            });
            setCustomers(response.results || []);
            setTotalPages(response.total_pages || 1);
            setTotalItems(response.total_items || 0);
        } catch (error) {
            console.error('Error fetching customers:', error);
            showToast('Failed to fetch customers', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomerFavorites = async (customer, page = 1, search = '') => {
        if (!customer) {
            return;
        }

        try {
            setFavoritesModalLoading(true);
            const params = {
                customer_id: customer.id,
                limit: ANALYTICS_PAGE_SIZE,
                page,
                search
            };
            const response = await analyticsService.getAdminDetailedFavorites(params);
            const pagination = normalizeAnalyticsPagination(response, page, ANALYTICS_PAGE_SIZE);
            setFavoritesModalData(pagination.results);
            setFavoritesModalTotalPages(pagination.totalPages);
            setFavoritesModalTotalItems(pagination.totalItems);
            setFavoritesModalPage(pagination.currentPage);
            setSelectedCustomer(customer);
            setShowFavoritesModal(true);
        } catch (error) {
            console.error('Error fetching customer favorites:', error);
            showToast('Failed to load favorite details', 'error');
        } finally {
            setFavoritesModalLoading(false);
        }
    };

    const openCustomerFavoritesModal = (customer) => {
        setFavoritesModalSearch('');
        fetchCustomerFavorites(customer, 1, '');
    };

    const handleFavoriteSearch = (value) => {
        setFavoritesModalSearch(value);
        fetchCustomerFavorites(selectedCustomer, 1, value);
    };

    useEffect(() => {
        fetchCustomers();
    }, [currentPage, searchTerm, statusFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    const columns = ['Customer', 'Email', 'Phone', 'Joined Date', 'Favorites', 'Status', 'Actions'];

    const handleToggleStatus = async (id, isActive) => {
        try {
            await customerService.toggleCustomerStatus(id);
            showToast(`Customer ${isActive ? 'blocked' : 'activated'} successfully`);
            fetchCustomers();
        } catch (error) {
            console.error('Error toggling customer status:', error);
            showToast('Failed to update customer status', 'error');
        }
    };

    const handleSoftDelete = async (id, isActive) => {
        const confirmed = await prompt({
            title: isActive ? 'Soft Delete Customer' : 'Restore Customer',
            message: isActive ? 'Soft delete this customer?' : 'Restore this customer?',
            showInput: false
        });
        if (!confirmed) return;

        try {
            await customerService.toggleCustomerStatus(id);
            showToast(isActive ? 'Customer soft deleted successfully' : 'Customer restored successfully');
            fetchCustomers();
        } catch (error) {
            console.error('Error soft deleting customer:', error);
            showToast('Failed to update customer', 'error');
        }
    };

    const handleViewCustomer = async (customerId) => {
        setCustomerDetailsLoading(true);
        try {
            const details = await customerService.getCustomerDetail(customerId);
            setCustomerDetails(details);
            setShowCustomerModal(true);
        } catch (error) {
            console.error('Failed to load customer details:', error);
            showToast('Failed to load customer details', 'error');
        } finally {
            setCustomerDetailsLoading(false);
        }
    };

    const handleOpenCustomerEdit = async (customerId) => {
        setCustomerDetailsLoading(true);
        try {
            const details = await customerService.getCustomerDetail(customerId);
            setCustomerForm({
                first_name: details.first_name || '',
                last_name: details.last_name || '',
                email: details.email || '',
                password: '',
                status: details.status || (details.is_active ? 'ACTIVE' : 'BLOCKED'),
                profile_image: null,
                previewImage: details.profile_image || null,
            });
            setEditingCustomer(details);
            setShowCustomerEditModal(true);
        } catch (error) {
            console.error('Failed to load customer for edit:', error);
            showToast('Failed to load customer details', 'error');
        } finally {
            setCustomerDetailsLoading(false);
        }
    };

    const handleCustomerFormChange = (event) => {
        const { name, value, files } = event.target;
        if (name === 'profile_image') {
            const file = files?.[0] || null;
            setCustomerForm((prev) => ({
                ...prev,
                profile_image: file,
                previewImage: file ? URL.createObjectURL(file) : prev.previewImage,
            }));
            return;
        }
        setCustomerForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleCustomerFormSubmit = async (event) => {
        event.preventDefault();
        if (!editingCustomer) return;
        try {
            setCustomerDetailsLoading(true);
            const formData = new FormData();
            formData.append('email', customerForm.email);
            formData.append('first_name', customerForm.first_name);
            formData.append('last_name', customerForm.last_name);
            formData.append('status', customerForm.status);
            if (customerForm.password) {
                formData.append('password', customerForm.password);
            }
            if (customerForm.profile_image) {
                formData.append('profile_image', customerForm.profile_image);
            }
            await customerService.updateCustomer(editingCustomer.id, formData);
            showToast('Customer updated successfully');
            setShowCustomerEditModal(false);
            setEditingCustomer(null);
            fetchCustomers();
        } catch (error) {
            console.error('Failed to update customer:', error);
            showToast('Failed to update customer', 'error');
        } finally {
            setCustomerDetailsLoading(false);
        }
    };

    const renderRow = (customer) => {
        const avatarSrc = customer.profile_image || customer.logo || customer.image || customer.avatar || customer.profile_picture || customer.profilePicture;

        return (
        <>
            <td>
                <div className="vendor-info">
                    <div className="vendor-avatar" style={{ borderRadius: '50%' }}>
                        {avatarSrc ? (
                            <img
                                src={getImageUrl(avatarSrc)}
                                alt={customer.username || 'Customer logo'}
                                style={{ cursor: 'zoom-in' }}
                                onClick={() => setLightboxSrc(getImageUrl(avatarSrc))}
                            />
                        ) : (
                            <span>{customer.username?.charAt(0)?.toUpperCase() || 'C'}</span>
                        )}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600 }}>{customer.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--dash-ink-soft)' }}>ID: #{customer.id}</div>
                    </div>
                </div>
            </td>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--dash-ink-soft)' }}>
                    <Mail size={14} />
                    <span>{customer.email}</span>
                </div>
            </td>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--dash-ink-soft)' }}>
                    <Phone size={14} />
                    <span>{customer.mobile_number || '—'}</span>
                </div>
            </td>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--dash-ink-soft)' }}>
                    <Calendar size={14} />
                    <span>{new Date(customer.date_joined).toLocaleDateString()}</span>
                </div>
            </td>
            <td>
                <button
                    type="button"
                    className="dash-badge analytics-badge"
                    onClick={() => openCustomerFavoritesModal(customer)}
                >
                    <Heart size={13} />
                    {(customer.favorites_count ?? customer.favorite_count ?? customer.favoritesCount ?? 0)}
                </button>
            </td>
            <td>
                <StatusBadge status={customer.is_active ? 'ACTIVE' : 'REJECTED'} label={customer.is_active ? 'Active' : 'Blocked'} />
            </td>
            <td>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                        className="action-btn"
                        onClick={() => handleToggleStatus(customer.id, customer.is_active)}
                        title={customer.is_active ? 'Block Customer' : 'Unblock Customer'}
                    >
                        {customer.is_active ? <ShieldAlert size={16} color="var(--dash-danger)" /> : <ShieldCheck size={16} color="var(--dash-success)" />}
                    </button>
                    <button
                        className="action-btn"
                        onClick={() => handleSoftDelete(customer.id, customer.is_active)}
                        title={customer.is_active ? 'Soft Delete Customer' : 'Restore Customer'}
                    >
                        <Trash2 size={16} color="var(--dash-danger)" />
                    </button>
                    <button
                        className="action-btn"
                        onClick={() => handleOpenCustomerEdit(customer.id)}
                        title="Edit Customer"
                    >
                        <Edit2 size={16} color="var(--dash-accent)" />
                    </button>
                    <button
                        className="action-btn"
                        onClick={() => handleViewCustomer(customer.id)}
                        title="View Details"
                    >
                        <Eye size={16} />
                    </button>
                </div>
            </td>
        </>
        );
    };

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Users size={20} /> Customers</h3>
                    <p>Monitor registered customers and their interaction with the platform.</p>
                </div>
                <div className="toolbar2-controls">
                    <div className="search-box">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search customers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                        <option value="ALL">All Status</option>
                        <option value="ACTIVE">Active</option>
                        <option value="BLOCKED">Blocked</option>
                    </select>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={customers}
                    renderRow={renderRow}
                    keyExtractor={(c) => c.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={totalItems}
                    loading={loading}
                />
            </div>

            <AnalyticsDetailModal
                isOpen={showFavoritesModal}
                onClose={() => setShowFavoritesModal(false)}
                type="favorites"
                title={selectedCustomer ? `Favorite Details — ${selectedCustomer.username}` : 'Favorite Details'}
                data={favoritesModalData}
                loading={favoritesModalLoading}
                currentPage={favoritesModalPage}
                totalPages={favoritesModalTotalPages}
                totalItems={favoritesModalTotalItems}
                onPageChange={(page) => fetchCustomerFavorites(selectedCustomer, page, favoritesModalSearch)}
                searchTerm={favoritesModalSearch}
                onSearch={handleFavoriteSearch}
            />

            <Modal
                isOpen={showCustomerModal}
                onClose={() => {
                    setShowCustomerModal(false);
                    setCustomerDetails(null);
                }}
                title="Customer Details"
                maxWidth="800px"
                contentClassName="premium-modal-content"
            >
                <div className="premium-modal">
                    {customerDetailsLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading customer details...</div>
                    ) : customerDetails ? (
                        <div className="premium-modal-body">
                            <div className="premium-modal-header-row">
                                <div className="product-header">
                                    <div className="product-image" style={{ width: 72, height: 72, borderRadius: '50%' }}>
                                        {(customerDetails.profile_image || customerDetails.logo) ? (
                                            <img
                                                src={getImageUrl(customerDetails.profile_image || customerDetails.logo)}
                                                alt={customerDetails.username || 'Customer logo'}
                                                style={{ cursor: 'zoom-in' }}
                                                onClick={() => setLightboxSrc(getImageUrl(customerDetails.profile_image || customerDetails.logo))}
                                            />
                                        ) : (
                                            <div className="no-image">{customerDetails.username?.charAt(0)?.toUpperCase() || 'C'}</div>
                                        )}
                                    </div>
                                    <div className="product-meta">
                                        <h1 className="product-title" style={{ fontSize: '1.2rem' }}>
                                            {(customerDetails.first_name || customerDetails.last_name)
                                                ? `${customerDetails.first_name || ''} ${customerDetails.last_name || ''}`.trim()
                                                : customerDetails.username}
                                        </h1>
                                        <div className="product-type">@{customerDetails.username} · #{customerDetails.id}</div>
                                    </div>
                                </div>
                                <div className="product-status-wrapper">
                                    <StatusBadge status={customerDetails.is_active ? 'ACTIVE' : 'REJECTED'} label={customerDetails.is_active ? 'Active' : 'Blocked'} />
                                </div>
                            </div>

                            <div className="stat-cards">
                                <div className="stat-card-small">
                                    <div className="stat-icon"><Heart size={16} /></div>
                                    <div>
                                        <div className="stat-label">Favorites</div>
                                        <div className="stat-value">{customerDetails.favorites_count ?? customerDetails.favorites?.length ?? 0}</div>
                                    </div>
                                </div>
                                <div className="stat-card-small">
                                    <div className="stat-icon"><Calendar size={16} /></div>
                                    <div>
                                        <div className="stat-label">Joined</div>
                                        <div className="stat-value">{customerDetails.signup_date ? new Date(customerDetails.signup_date).toLocaleDateString() : '—'}</div>
                                    </div>
                                </div>
                                <div className="stat-card-small">
                                    <div className="stat-icon"><Clock size={16} /></div>
                                    <div>
                                        <div className="stat-label">Last Active</div>
                                        <div className="stat-value">{customerDetails.last_login ? new Date(customerDetails.last_login).toLocaleDateString() : 'Never'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="premium-modal-grid" style={customerDetails.favorites?.length ? undefined : { gridTemplateColumns: '1fr' }}>
                                <div className="left-col">
                                    <div className="info-card product-info-card">
                                        <h3 className="card-title">Profile</h3>
                                        <div className="info-row"><div className="info-label">Full Name</div><div className="info-value">{(customerDetails.first_name || customerDetails.last_name) ? `${customerDetails.first_name || ''} ${customerDetails.last_name || ''}`.trim() : '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Username</div><div className="info-value">{customerDetails.username || '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Email</div><div className="info-value">{customerDetails.email || '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Phone</div><div className="info-value">{customerDetails.mobile_number || '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Location</div><div className="info-value">{[customerDetails.city, customerDetails.state, customerDetails.country].filter(Boolean).join(', ') || '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Account Status</div><div className="info-value">{customerDetails.is_active ? 'Active' : 'Blocked'}</div></div>
                                    </div>
                                </div>

                                {customerDetails.favorites?.length > 0 && (
                                    <div className="right-col">
                                        <div className="info-card">
                                            <h3 className="card-title">Favorites</h3>
                                            <div className="dash-qa-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '320px' }}>
                                                {customerDetails.favorites.map((fav) => (
                                                    <div key={fav.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        {fav.image ? (
                                                            <img
                                                                src={getImageUrl(fav.image)}
                                                                alt={fav.name || 'Favorite product'}
                                                                style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 'var(--dash-radius-sm)', flexShrink: 0, cursor: 'zoom-in' }}
                                                                onClick={() => setLightboxSrc(getImageUrl(fav.image))}
                                                            />
                                                        ) : (
                                                            <div style={{ width: 40, height: 40, borderRadius: 'var(--dash-radius-sm)', background: 'var(--dash-surface)', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dash-ink-soft)', fontSize: '0.7rem', flexShrink: 0 }}>No Image</div>
                                                        )}
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fav.name}</div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--dash-ink-soft)' }}>Rs. {fav.price}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--dash-ink-soft)' }}>No customer details available.</div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={showCustomerEditModal}
                onClose={() => {
                    setShowCustomerEditModal(false);
                    setEditingCustomer(null);
                }}
                title="Edit Customer"
                maxWidth="640px"
            >
                <form onSubmit={handleCustomerFormSubmit} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div className="modal-form-grid">
                        <div className="form-group">
                            <label>Email</label>
                            <input name="email" type="email" value={customerForm.email} onChange={handleCustomerFormChange} required />
                        </div>
                        <div className="form-group">
                            <label>Status</label>
                            <select name="status" value={customerForm.status} onChange={handleCustomerFormChange}>
                                <option value="ACTIVE">Active</option>
                                <option value="BLOCKED">Blocked</option>
                                <option value="INACTIVE">Inactive</option>
                            </select>
                        </div>
                    </div>
                    <div className="modal-form-grid">
                        <div className="form-group">
                            <label>First Name</label>
                            <input name="first_name" value={customerForm.first_name} onChange={handleCustomerFormChange} />
                        </div>
                        <div className="form-group">
                            <label>Last Name</label>
                            <input name="last_name" value={customerForm.last_name} onChange={handleCustomerFormChange} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>New Password</label>
                        <input name="password" type="password" value={customerForm.password} onChange={handleCustomerFormChange} placeholder="Leave blank to keep current password" />
                    </div>
                    <div className="form-group">
                        <label>Profile Image</label>
                        <input name="profile_image" type="file" accept="image/*" onChange={handleCustomerFormChange} />
                        {customerForm.previewImage ? (
                            <img
                                src={customerForm.previewImage}
                                alt="Preview"
                                style={{ width: 72, height: 72, objectFit: 'contain', marginTop: '0.6rem', borderRadius: 'var(--dash-radius-md)', border: '1px solid var(--dash-border)', cursor: 'zoom-in' }}
                                onClick={() => setLightboxSrc(customerForm.previewImage)}
                            />
                        ) : null}
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => { setShowCustomerEditModal(false); setEditingCustomer(null); }}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={customerDetailsLoading}>
                            {customerDetailsLoading ? 'Updating...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </Modal>

            {lightboxSrc && (
                <div className="image-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
                    <img src={lightboxSrc} alt="Full size" className="image-lightbox-img" />
                </div>
            )}
        </div>
    );
};

export default Customers;
