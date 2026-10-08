import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { vendorService } from '../../services/vendorService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import { getImageUrl } from '../../utils/image';
import { Search, CheckCircle, XCircle, Eye, Layers, Trash2, Edit2, Package, Tags, FolderTree, Calendar, Mail, Phone, ShieldAlert } from 'lucide-react';

const PAGE_SIZE = 10;

const Vendors = () => {
    const { showToast } = useToast();
    const { prompt } = usePrompt();
    const [searchParams, setSearchParams] = useSearchParams();
    const [vendors, setVendors] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [formErrors, setFormErrors] = useState({});
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [vendorDetailsLoading, setVendorDetailsLoading] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [editingVendor, setEditingVendor] = useState(null);
    const [showVendorEditModal, setShowVendorEditModal] = useState(false);
    const [allCategories, setAllCategories] = useState([]);
    const [assignedCategories, setAssignedCategories] = useState([]);
    const [assignedSubcategories, setAssignedSubcategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [savingCategories, setSavingCategories] = useState(false);
    const [vendorForm, setVendorForm] = useState({
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        brand_name: '',
        phone_number: '',
        address: '',
        country: '',
        state: '',
        city: '',
        latitude: '',
        longitude: '',
        logo: null,
    });

    const showCreateVendorModal = searchParams.get('modal') === 'create';

    const closeVendorModal = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('modal');
        setSearchParams(nextParams);
    };

    const resetVendorForm = () => {
        setVendorForm({
            username: '',
            email: '',
            password: '',
            first_name: '',
            last_name: '',
            brand_name: '',
            phone_number: '',
            address: '',
            country: '',
            state: '',
            city: '',
            latitude: '',
            longitude: '',
            logo: null,
        });
        setFormErrors({});
    };

    const fetchVendors = async (page = currentPage) => {
        try {
            setLoading(true);
            const params = {
                page,
                limit: PAGE_SIZE,
                search: searchTerm || undefined,
                status: statusFilter || undefined
            };
            const res = await vendorService.getVendors(params);
            const items = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
            setVendors(items);
            setTotalPages(res.total_pages || Math.max(1, Math.ceil((res.total_items || items.length) / PAGE_SIZE)));
            setTotalItems(res.total_items ?? items.length);
            setCurrentPage(res.current_page || page);
        } catch (error) {
            console.error('Error fetching vendors:', error);
            showToast('Failed to fetch vendors', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVendors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchVendors(currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, searchTerm, statusFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    const handleFormChange = (event) => {
        const { name, value, files } = event.target;
        if (name === 'logo') {
            setVendorForm((prev) => ({ ...prev, logo: files[0] || null }));
            return;
        }
        setVendorForm((prev) => ({ ...prev, [name]: value }));
        setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormErrors({});
        setSubmitting(true);

        const requiredFields = ['username', 'email', 'password', 'first_name', 'last_name', 'brand_name', 'phone_number', 'address'];
        const errors = {};

        requiredFields.forEach((field) => {
            if (!vendorForm[field]?.trim()) {
                errors[field] = 'This field is required';
            }
        });

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setSubmitting(false);
            return;
        }

        try {
            const formData = new FormData();
            Object.entries(vendorForm).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    if (key === 'logo') return;
                    formData.append(key, value);
                }
            });
            if (vendorForm.logo) {
                formData.append('logo', vendorForm.logo);
            }

            await vendorService.createVendor(formData);

            showToast('Vendor created successfully');
            resetVendorForm();
            closeVendorModal();
            fetchVendors();
        } catch (error) {
            console.error('Vendor creation error:', error);
            const serverErrors = error.response?.data?.errors || error.response?.data || {};
            setFormErrors(serverErrors);
            showToast('Unable to create vendor', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenVendorEdit = async (vendor) => {
        setVendorDetailsLoading(true);
        try {
            const details = await vendorService.getVendorDetail(vendor.id);
            setVendorForm({
                username: details.username || '',
                email: details.email || '',
                password: '',
                first_name: details.first_name || '',
                last_name: details.last_name || '',
                brand_name: details.brand_name || details.kyc?.brand_name || '',
                phone_number: details.phone_number || details.phone || details.kyc?.phone_number || details.kyc?.phone || '',
                address: details.address || details.kyc?.address || '',
                country: details.country || '',
                state: details.state || '',
                city: details.city || '',
                latitude: details.latitude || '',
                longitude: details.longitude || '',
                logo: null,
            });
            setEditingVendor(details);
            setShowVendorEditModal(true);
        } catch (error) {
            console.error('Failed to load vendor for edit:', error);
            showToast('Failed to load vendor details', 'error');
        } finally {
            setVendorDetailsLoading(false);
        }
    };

    const handleVendorEditSubmit = async (event) => {
        event.preventDefault();
        if (!editingVendor) return;
        setSubmitting(true);
        try {
            const formData = new FormData();
            ['email', 'first_name', 'last_name', 'brand_name', 'phone_number', 'address'].forEach((key) => {
                const value = vendorForm[key];
                if (value !== null && value !== undefined && value !== '') {
                    formData.append(key, value);
                }
            });
            if (vendorForm.password) {
                formData.append('password', vendorForm.password);
            }
            if (vendorForm.logo) {
                formData.append('logo', vendorForm.logo);
            }

            await vendorService.updateVendor(editingVendor.id, formData);
            showToast('Vendor updated successfully');
            setShowVendorEditModal(false);
            setEditingVendor(null);
            resetVendorForm();
            fetchVendors();
        } catch (error) {
            console.error('Vendor update error:', error);
            const serverErrors = error.response?.data?.errors || error.response?.data || {};
            setFormErrors(serverErrors);
            showToast('Unable to update vendor', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenCategoryModal = async (vendor) => {
        setSelectedVendor(vendor);
        setShowCategoryModal(true);
        setLoadingCategories(true);
        try {
            const cats = await productService.getCategories();
            setAllCategories(cats);
            const details = await vendorService.getVendorDetail(vendor.id);
            const assignedCatsRaw = details.assigned_categories || [];
            // normalize to numbers
            const assignedCats = Array.isArray(assignedCatsRaw) ? assignedCatsRaw.map((id) => Number(id)).filter((v) => !Number.isNaN(v)) : [];
            setAssignedCategories(assignedCats);

            if (Array.isArray(details.assigned_subcategories) && details.assigned_subcategories.length > 0) {
                const subs = details.assigned_subcategories.map((id) => Number(id)).filter((v) => !Number.isNaN(v));
                setAssignedSubcategories(subs);
            } else {
                // default: if category is assigned, include all its subcategories
                const defaultSubs = [];
                (cats || []).forEach((c) => {
                    if (assignedCats.includes(Number(c.id)) && Array.isArray(c.subcategories)) {
                        c.subcategories.forEach((s) => defaultSubs.push(Number(s.id)));
                    }
                });
                setAssignedSubcategories(defaultSubs);
            }
        } catch (error) {
            console.error('Error opening category assignment:', error);
            showToast('Failed to load category details', 'error');
        } finally {
            setLoadingCategories(false);
        }
    };

    const handleToggleCategoryCheck = (categoryId) => {
        const cid = Number(categoryId);
        if (Number.isNaN(cid)) return;
        setAssignedCategories(prev => {
            if (prev.includes(cid)) {
                // remove category and its subcategories
                setAssignedSubcategories((subs) => {
                    const cat = allCategories.find(c => Number(c.id) === cid);
                    if (!cat || !Array.isArray(cat.subcategories)) return subs;
                    const removeIds = cat.subcategories.map(s => Number(s.id));
                    return subs.filter(id => !removeIds.includes(Number(id)));
                });
                return prev.filter(id => id !== cid);
            } else {
                // add category and default-select all its subcategories
                const cat = allCategories.find(c => Number(c.id) === cid);
                if (cat && Array.isArray(cat.subcategories)) {
                    setAssignedSubcategories((subs) => {
                        const addIds = cat.subcategories.map(s => Number(s.id)).filter(id => !subs.includes(id));
                        return [...subs, ...addIds];
                    });
                }
                return [...prev, cid];
            }
        });
    };

    const handleToggleSubcategory = (categoryId, subId) => {
        const cid = Number(categoryId);
        const sid = Number(subId);
        if (Number.isNaN(sid)) return;
        setAssignedSubcategories(prev => {
            if (prev.includes(sid)) {
                return prev.filter(id => id !== sid);
            } else {
                // ensure category is also assigned when adding a subcategory
                setAssignedCategories((cats) => cats.includes(cid) ? cats : [...cats, cid]);
                return [...prev, sid];
            }
        });
    };

    const handleSaveCategories = async () => {
        setSavingCategories(true);
        try {
            // compute disabled subcategories (those under an assigned category but not selected)
            const disabled = [];
            (allCategories || []).forEach((cat) => {
                const cid = Number(cat.id);
                if (assignedCategories.includes(cid) && Array.isArray(cat.subcategories)) {
                    cat.subcategories.forEach((s) => {
                        const sid = Number(s.id);
                        if (!assignedSubcategories.includes(sid)) disabled.push(sid);
                    });
                }
            });

            await vendorService.assignVendorCategories(selectedVendor.id, assignedCategories, disabled);
            showToast('Categories assigned successfully');
            setShowCategoryModal(false);
            fetchVendors();
        } catch (error) {
            console.error('Error saving categories:', error);
            showToast('Failed to assign categories', 'error');
        } finally {
            setSavingCategories(false);
        }
    };

    const handleDeleteVendor = async (vendorId) => {
        const confirmed = await prompt({
            title: 'Delete Vendor',
            message: 'Are you sure you want to delete this vendor? This action cannot be undone.',
            showInput: false
        });
        if (!confirmed) return;
        try {
            await vendorService.deleteVendor(vendorId);
            showToast('Vendor deleted successfully');
            fetchVendors();
        } catch (error) {
            console.error('Vendor delete error:', error);
            showToast('Unable to delete vendor', 'error');
        }
    };

    const handleToggleActive = async (vendorId, isActive) => {
        const confirmed = await prompt({
            title: 'Toggle Vendor Status',
            message: `Are you sure you want to ${isActive ? 'deactivate' : 'activate'} this vendor?`,
            showInput: false
        });
        if (!confirmed) return;
        try {
            await vendorService.toggleVendorStatus(vendorId);
            showToast(`Vendor ${isActive ? 'deactivated' : 'activated'} successfully`);
            fetchVendors();
        } catch (error) {
            console.error('Vendor toggle error:', error);
            showToast('Unable to update vendor status', 'error');
        }
    };

    const handleViewVendor = async (vendor) => {
        setVendorDetailsLoading(true);
        try {
            const details = await vendorService.getVendorDetail(vendor.id);
            setSelectedVendor(details);
            setShowVendorModal(true);
        } catch (error) {
            console.error('Failed to load vendor details:', error);
            showToast('Failed to load vendor details', 'error');
        } finally {
            setVendorDetailsLoading(false);
        }
    };

    const vendorPhone = selectedVendor?.phone || selectedVendor?.kyc_details?.phone || selectedVendor?.kyc?.phone || '—';
    const vendorAddress = selectedVendor?.address || selectedVendor?.kyc_details?.address || selectedVendor?.kyc?.address || '—';
    const vendorEmail = selectedVendor?.email || selectedVendor?.kyc_details?.email || '—';
    const vendorBrandName = selectedVendor?.brand_name || selectedVendor?.username || '—';
    const vendorUsername = selectedVendor?.username || selectedVendor?.brand_name || '—';

    const visitorAnalyticsEnabled = selectedVendor?.analytics_permission?.can_access_analytics ?? selectedVendor?.can_access_analytics ?? false;

    const handleToggleVisitorAnalytics = async () => {
        if (!selectedVendor) return;
        const newVal = !(selectedVendor?.analytics_permission?.can_access_analytics ?? selectedVendor?.can_access_analytics ?? false);
        try {
            setVendorDetailsLoading(true);
            await vendorService.updateVendorPermissions(selectedVendor.id, { can_access_analytics: newVal });
            const updated = await vendorService.getVendorDetail(selectedVendor.id);
            setSelectedVendor(updated);
            showToast(`Visitor analytics ${newVal ? 'enabled' : 'disabled'} for vendor`);
        } catch (err) {
            console.error('Failed to update permission:', err);
            showToast('Unable to update visitor analytics permission', 'error');
        } finally {
            setVendorDetailsLoading(false);
        }
    };

    const computeVendorStatus = (vendor) => {
        if (vendor.is_active) return 'ACTIVE';
        if (vendor.kyc_status === 'REJECTED') return 'BLOCKED';
        return 'INACTIVE';
    };

    // StatusBadge only ships ACTIVE/PAUSED/REJECTED color mappings; reuse the danger/warning
    // tones it already defines rather than inventing BLOCKED/INACTIVE-specific colors.
    const vendorStatusBadgeProps = (statusCode) => {
        if (statusCode === 'ACTIVE') return { status: 'ACTIVE', label: 'Active' };
        if (statusCode === 'BLOCKED') return { status: 'REJECTED', label: 'Blocked' };
        return { status: 'PAUSED', label: 'Inactive' };
    };

    // With server-side pagination, `vendors` already contains current page items
    const displayedVendors = vendors;

    const columns = ['Brand', 'Email', 'Status', 'Actions'];
    const renderRow = (vendor) => {
        const statusCode = computeVendorStatus(vendor);

        return (
            <>
                <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="vendor-avatar">
                            {vendor.logo ? (
                                <img
                                    src={getImageUrl(vendor.logo)}
                                    alt={vendor.brand_name || vendor.username || 'Vendor logo'}
                                    style={{ cursor: 'zoom-in' }}
                                    onClick={() => setLightboxSrc(getImageUrl(vendor.logo))}
                                />
                            ) : (
                                <span>{vendor.brand_name?.charAt(0) || vendor.username?.charAt(0) || 'V'}</span>
                            )}
                        </div>
                        <span style={{ fontWeight: 600 }}>{vendor.brand_name || vendor.username}</span>
                    </div>
                </td>
                <td>{vendor.email}</td>
                <td>
                    <StatusBadge {...vendorStatusBadgeProps(statusCode)} />
                </td>
                <td>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                            className="action-btn"
                            onClick={() => handleToggleActive(vendor.id, vendor.is_active)}
                            title={vendor.is_active ? 'Deactivate vendor' : 'Activate vendor'}
                        >
                            {vendor.is_active ? <XCircle size={16} color="var(--dash-danger)" /> : <CheckCircle size={16} color="var(--dash-success)" />}
                        </button>
                        <button
                            className="action-btn"
                            onClick={() => handleOpenCategoryModal(vendor)}
                            title="Manage categories"
                        >
                            <Layers size={16} />
                        </button>
                        <button
                            className="action-btn"
                            onClick={() => handleOpenVendorEdit(vendor)}
                            title="Edit vendor"
                        >
                            <Edit2 size={16} />
                        </button>
                        <button
                            className="action-btn"
                            onClick={() => handleDeleteVendor(vendor.id)}
                            title="Delete vendor"
                        >
                            <Trash2 size={16} color="var(--dash-danger)" />
                        </button>
                        <button
                            className="action-btn"
                            onClick={() => handleViewVendor(vendor)}
                            title="View vendor"
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
            <Modal isOpen={showCreateVendorModal} onClose={closeVendorModal} title="Create Vendor">
                <form onSubmit={handleSubmit}>
                    <div className="modal-form-grid">
                        <div className="form-group">
                            <label>Username</label>
                            <input name="username" value={vendorForm.username} onChange={handleFormChange} />
                            {formErrors.username && <small className="error-text">{formErrors.username}</small>}
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input name="email" type="email" value={vendorForm.email} onChange={handleFormChange} />
                            {formErrors.email && <small className="error-text">{formErrors.email}</small>}
                        </div>
                        <div className="form-group">
                            <label>First Name</label>
                            <input name="first_name" value={vendorForm.first_name} onChange={handleFormChange} />
                            {formErrors.first_name && <small className="error-text">{formErrors.first_name}</small>}
                        </div>
                        <div className="form-group">
                            <label>Last Name</label>
                            <input name="last_name" value={vendorForm.last_name} onChange={handleFormChange} />
                            {formErrors.last_name && <small className="error-text">{formErrors.last_name}</small>}
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input name="password" type="password" value={vendorForm.password} onChange={handleFormChange} />
                            {formErrors.password && <small className="error-text">{formErrors.password}</small>}
                        </div>
                        <div className="form-group">
                            <label>Brand Name</label>
                            <input name="brand_name" value={vendorForm.brand_name} onChange={handleFormChange} />
                            {formErrors.brand_name && <small className="error-text">{formErrors.brand_name}</small>}
                        </div>
                        <div className="form-group">
                            <label>Phone Number</label>
                            <input name="phone_number" value={vendorForm.phone_number} onChange={handleFormChange} />
                            {formErrors.phone_number && <small className="error-text">{formErrors.phone_number}</small>}
                        </div>
                        <div className="form-group">
                            <label>Address</label>
                            <input name="address" value={vendorForm.address} onChange={handleFormChange} />
                            {formErrors.address && <small className="error-text">{formErrors.address}</small>}
                        </div>
                        <div className="form-group">
                            <label>Country</label>
                            <input name="country" value={vendorForm.country} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                            <label>State</label>
                            <input name="state" value={vendorForm.state} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                            <label>City</label>
                            <input name="city" value={vendorForm.city} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                            <label>Logo</label>
                            <input name="logo" type="file" accept="image/*" onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                            <label>Latitude</label>
                            <input name="latitude" value={vendorForm.latitude} onChange={handleFormChange} />
                        </div>
                        <div className="form-group">
                            <label>Longitude</label>
                            <input name="longitude" value={vendorForm.longitude} onChange={handleFormChange} />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : 'Save Vendor'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showVendorEditModal} onClose={() => { setShowVendorEditModal(false); setEditingVendor(null); resetVendorForm(); }} title="Edit Vendor">
                <form onSubmit={handleVendorEditSubmit}>
                    <div className="modal-form-grid">
                        <div className="form-group">
                            <label>Email</label>
                            <input name="email" type="email" value={vendorForm.email} onChange={handleFormChange} required />
                            {formErrors.email && <small className="error-text">{formErrors.email}</small>}
                        </div>
                        <div className="form-group">
                            <label>Brand Name</label>
                            <input name="brand_name" value={vendorForm.brand_name} onChange={handleFormChange} required />
                            {formErrors.brand_name && <small className="error-text">{formErrors.brand_name}</small>}
                        </div>
                        <div className="form-group">
                            <label>First Name</label>
                            <input name="first_name" value={vendorForm.first_name} onChange={handleFormChange} />
                            {formErrors.first_name && <small className="error-text">{formErrors.first_name}</small>}
                        </div>
                        <div className="form-group">
                            <label>Last Name</label>
                            <input name="last_name" value={vendorForm.last_name} onChange={handleFormChange} />
                            {formErrors.last_name && <small className="error-text">{formErrors.last_name}</small>}
                        </div>
                        <div className="form-group">
                            <label>Phone Number</label>
                            <input name="phone_number" value={vendorForm.phone_number} onChange={handleFormChange} />
                            {formErrors.phone_number && <small className="error-text">{formErrors.phone_number}</small>}
                        </div>
                        <div className="form-group">
                            <label>Address</label>
                            <input name="address" value={vendorForm.address} onChange={handleFormChange} />
                            {formErrors.address && <small className="error-text">{formErrors.address}</small>}
                        </div>
                        <div className="form-group">
                            <label>New Password</label>
                            <input name="password" type="password" value={vendorForm.password} onChange={handleFormChange} placeholder="Leave blank to keep current password" />
                        </div>
                        <div className="form-group">
                            <label>Logo</label>
                            <input name="logo" type="file" accept="image/*" onChange={handleFormChange} />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => { setShowVendorEditModal(false); setEditingVendor(null); resetVendorForm(); }}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Updating...' : 'Save Vendor'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title={`Assign Categories to ${selectedVendor?.brand_name || selectedVendor?.username || 'Vendor'}`}>
                <p style={{ color: 'var(--dash-ink-soft)', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
                    Select default categories that this vendor is permitted to use for posting products.
                </p>

                {loadingCategories ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--dash-ink-soft)' }}>Loading categories...</div>
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            maxHeight: '320px',
                            overflowY: 'auto',
                            paddingRight: '0.4rem',
                            marginBottom: '1.25rem'
                        }}
                    >
                        {allCategories.map((cat) => (
                            <div
                                key={cat.id}
                                style={{
                                    border: '1px solid var(--dash-border)',
                                    borderRadius: 'var(--dash-radius-md)',
                                    background: 'var(--dash-surface-alt)',
                                    padding: '0.75rem'
                                }}
                            >
                                {/* Category */}
                                <label className="checkbox-pill" style={{ background: 'var(--dash-surface)' }}>
                                    <input
                                        type="checkbox"
                                        checked={assignedCategories.includes(Number(cat.id))}
                                        onChange={() => handleToggleCategoryCheck(cat.id)}
                                    />
                                    <span style={{ flex: 1, fontWeight: 600, color: 'var(--dash-ink)' }}>{cat.name}</span>
                                </label>

                                {/* Subcategories */}
                                {Array.isArray(cat.subcategories) && cat.subcategories.length > 0 && (
                                    <div
                                        style={{
                                            marginTop: '0.6rem',
                                            marginLeft: '1.1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.4rem'
                                        }}
                                    >
                                        {cat.subcategories.map((s) => (
                                            <label key={s.id} className="checkbox-pill">
                                                <input
                                                    type="checkbox"
                                                    checked={assignedSubcategories.includes(Number(s.id))}
                                                    onChange={() => handleToggleSubcategory(cat.id, s.id)}
                                                />
                                                <span style={{ flex: 1 }}>{s.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {allCategories.length === 0 && (
                            <div className="dash-empty">No categories found.</div>
                        )}
                    </div>
                )}

                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowCategoryModal(false)}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={handleSaveCategories} disabled={savingCategories}>
                        {savingCategories ? 'Saving...' : 'Save Assignments'}
                    </button>
                </div>
            </Modal>

            <Modal isOpen={showVendorModal} onClose={() => { setShowVendorModal(false); setSelectedVendor(null); }} title="Vendor Details" maxWidth="1100px" contentClassName="premium-modal-content">
                <div className="premium-modal">
                    {vendorDetailsLoading && !selectedVendor ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading vendor details...</div>
                    ) : selectedVendor ? (
                        <div className="premium-modal-body">
                            <div className="premium-modal-header-row">
                                <div className="product-header">
                                    <div className="product-image">
                                        {selectedVendor.kyc?.logo ? (
                                            <img
                                                src={getImageUrl(selectedVendor.kyc.logo)}
                                                alt="Vendor logo"
                                                style={{ cursor: 'zoom-in' }}
                                                onClick={() => setLightboxSrc(getImageUrl(selectedVendor.kyc.logo))}
                                            />
                                        ) : (
                                            <div className="no-image">{selectedVendor.brand_name?.charAt(0) || selectedVendor.username?.charAt(0) || 'V'}</div>
                                        )}
                                    </div>
                                    <div className="product-meta">
                                        <div className="vendor-name-row">
                                            <h1 className="product-title">{vendorBrandName}</h1>
                                            <StatusBadge {...vendorStatusBadgeProps(computeVendorStatus(selectedVendor))} />
                                        </div>
                                        <div className="product-type">@{vendorUsername}</div>
                                        <div className="vendor-row">
                                            <span className="vendor-badge"><Mail size={13} /> {vendorEmail}</span>
                                            <span className="vendor-badge"><Phone size={13} /> {vendorPhone}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="stat-cards">
                                <div className="stat-card-small">
                                    <div className="stat-icon"><Package size={16} /></div>
                                    <div>
                                        <div className="stat-label">Products</div>
                                        <div className="stat-value">{selectedVendor.product_count ?? '—'}</div>
                                    </div>
                                </div>
                                <div className="stat-card-small">
                                    <div className="stat-icon"><Tags size={16} /></div>
                                    <div>
                                        <div className="stat-label">Categories Assigned</div>
                                        <div className="stat-value">{selectedVendor.assigned_categories?.length ?? '—'}</div>
                                    </div>
                                </div>
                                <div className="stat-card-small">
                                    <div className="stat-icon"><FolderTree size={16} /></div>
                                    <div>
                                        <div className="stat-label">Categories Created</div>
                                        <div className="stat-value">{selectedVendor.categories_created ?? '—'}</div>
                                    </div>
                                </div>
                                <div className="stat-card-small">
                                    <div className="stat-icon"><Calendar size={16} /></div>
                                    <div>
                                        <div className="stat-label">Joined</div>
                                        <div className="stat-value">{(selectedVendor.date_joined || selectedVendor.created_at) ? new Date(selectedVendor.date_joined || selectedVendor.created_at).toLocaleDateString() : '—'}</div>
                                    </div>
                                </div>
                            </div>

                            {selectedVendor.kyc_status === 'REJECTED' && selectedVendor.rejection_reason && (
                                <div className="vendor-alert-card">
                                    <ShieldAlert size={18} />
                                    <div>
                                        <strong>Blocked reason</strong>
                                        <p>{selectedVendor.rejection_reason}</p>
                                    </div>
                                </div>
                            )}

                            <div className="premium-modal-grid">
                                <div className="left-col">
                                    <div className="info-card product-info-card">
                                        <h3 className="card-title">Business Details</h3>
                                        <div className="info-row"><div className="info-label">Brand Name</div><div className="info-value">{vendorBrandName}</div></div>
                                        <div className="info-row"><div className="info-label">Address</div><div className="info-value">{vendorAddress}</div></div>
                                        <div className="info-row"><div className="info-label">KYC Status</div><div className="info-value">{selectedVendor.kyc_status || '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Vendor ID</div><div className="info-value">#{selectedVendor.id}</div></div>
                                    </div>
                                </div>

                                <div className="right-col">
                                    <div className="info-card product-info-card">
                                        <h3 className="card-title">Contact</h3>
                                        <div className="info-row"><div className="info-label">Username</div><div className="info-value">{vendorUsername}</div></div>
                                        <div className="info-row"><div className="info-label">Email</div><div className="info-value">{vendorEmail}</div></div>
                                        <div className="info-row"><div className="info-label">Phone</div><div className="info-value">{vendorPhone}</div></div>
                                    </div>

                                    <div className="info-card">
                                        <h3 className="card-title">Access & Permissions</h3>
                                        <div className="dash-toggle-row">
                                            <div>
                                                <div className="dash-toggle-label">Visitor Analytics</div>
                                                <div className="dash-toggle-hint">Lets this vendor view their own visitor/analytics data</div>
                                            </div>
                                            <label className="dash-toggle">
                                                <input type="checkbox" checked={visitorAnalyticsEnabled} onChange={handleToggleVisitorAnalytics} disabled={vendorDetailsLoading} />
                                                <span className="dash-toggle-track"><span className="dash-toggle-thumb" /></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>No vendor details available.</div>
                    )}
                </div>
            </Modal>

            <div className="section-header" style={{ marginBottom: '2rem' }}>
                <div className="header-left">
                    <h3>Vendors</h3>
                    <p style={{ color: 'var(--dash-ink-soft)', fontSize: '0.9rem' }}>
                        Monitor vendors registered on the platform and manage their access and permissions.
                    </p>
                </div>
            </div>

            <div className="data-section" style={{ marginBottom: '1rem' }}>
                <div className="section-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="toolbar-controls">
                        <div className="search-box">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search vendors..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                            <option value="ALL">All Status</option>
                            <option value="ACTIVE">Active</option>
                            <option value="BLOCKED">Blocked</option>
                            <option value="INACTIVE">Inactive</option>
                        </select>
                    </div>
                </div>
            </div>
            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={displayedVendors}
                    renderRow={renderRow}
                    keyExtractor={(vendor) => vendor.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={totalItems}
                    loading={loading}
                />
            </div>

            {lightboxSrc && (
                <div className="image-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
                    <img src={lightboxSrc} alt="Full size" className="image-lightbox-img" />
                </div>
            )}
        </div>
    );
};

export default Vendors;
