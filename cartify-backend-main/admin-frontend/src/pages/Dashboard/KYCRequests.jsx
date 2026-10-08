import React, { useState, useEffect } from 'react';
import { UserCheck, Search, CheckCircle, XCircle, Eye, Loader2 } from 'lucide-react';
import DataTable from '../../components/tables/DataTable';
import Modal from '../../components/common/Modal';
import StatusBadge from '../../components/common/StatusBadge';
import { vendorService } from '../../services/vendorService';
import { useToast } from '../../context/ToastContext';
import { usePrompt } from '../../components/common/CustomPrompt';
import { getImageUrl } from '../../utils/image';

const PAGE_SIZE = 10;

const KYCRequests = () => {
    const [vendors, setVendors] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [vendorDetailsLoading, setVendorDetailsLoading] = useState(false);
    const { showToast } = useToast();
    const { prompt } = usePrompt();

    const fetchVendors = async (page = currentPage) => {
        try {
            setLoading(true);
            const params = {
                page,
                limit: PAGE_SIZE,
                search: searchTerm || undefined,
                kyc: statusFilter && statusFilter !== 'ALL' ? statusFilter : undefined
            };
            const res = await vendorService.getVendors(params);
            const items = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
            setVendors(items);
            setTotalPages(res.total_pages || Math.max(1, Math.ceil((res.total_items || items.length) / PAGE_SIZE)));
            setTotalItems(res.total_items ?? items.length);
            setCurrentPage(res.current_page || page);
        } catch (error) {
            console.error('Error fetching vendors:', error);
            showToast('Failed to load vendors', 'error');
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

    const handleApprove = async (vendorId) => {
        const confirmed = await prompt({
            title: 'Approve Vendor',
            message: 'Are you sure you want to approve this vendor?',
            placeholder: null,
            showInput: false
        });
        if (!confirmed) return;
        try {
            await vendorService.approveVendor(vendorId, 'APPROVED');
            showToast('Vendor approved successfully', 'success');
            fetchVendors();
        } catch (error) {
            showToast('Failed to approve vendor', 'error');
        }
    };

    const handleReject = async (vendorId) => {
        const reason = await prompt({
            title: 'Reject Vendor',
            message: 'Enter rejection reason:',
            placeholder: 'Reason for rejection',
        });

        if (reason === null) return;

        try {
            await vendorService.approveVendor(vendorId, 'REJECTED', reason);
            showToast('Vendor rejected', 'success');
            fetchVendors();
        } catch (error) {
            showToast('Failed to reject vendor', 'error');
        }
    };

    const handleViewDetails = async (vendor) => {
        setVendorDetailsLoading(true);
        try {
            const details = await vendorService.getVendorDetail(vendor.id);
            setSelectedVendor(details);
            setShowVendorModal(true);
        } catch (error) {
            console.error('Failed to load vendor details:', error);
            showToast('Unable to load vendor details', 'error');
        } finally {
            setVendorDetailsLoading(false);
        }
    };

    // Server-side pagination: `vendors` is current page items
    const displayedVendors = vendors;

    const columns = ['Vendor', 'Email / Phone', 'Submitted', 'Status', 'Actions'];
    const renderRow = (vendor) => (
        <>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="vendor-avatar">
                        {vendor.logo ? (
                            <img src={getImageUrl(vendor.logo)} alt={vendor.brand_name || 'Vendor logo'} />
                        ) : (
                            vendor.brand_name?.charAt(0)
                        )}
                    </div>
                    <span style={{ fontWeight: 600 }}>{vendor.brand_name}</span>
                </div>
            </td>
            <td>
                <div style={{ fontSize: '0.85rem' }}>
                    <div>{vendor.email}</div>
                    <div style={{ color: 'var(--dash-ink-soft)' }}>{vendor.phone}</div>
                </div>
            </td>
            <td>{new Date(vendor.created_at).toLocaleDateString()}</td>
            <td>
                <StatusBadge status={vendor.kyc_status} />
            </td>
            <td>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {vendor.kyc_status === 'PENDING' && (
                        <>
                            <button onClick={() => handleApprove(vendor.id)} className="action-btn" style={{ color: 'var(--dash-success)' }} title="Approve">
                                <CheckCircle size={16} />
                            </button>
                            <button onClick={() => handleReject(vendor.id)} className="action-btn" style={{ color: 'var(--dash-danger)' }} title="Reject">
                                <XCircle size={16} />
                            </button>
                        </>
                    )}
                    <button onClick={() => handleViewDetails(vendor)} className="action-btn" title="View Details">
                        <Eye size={16} />
                    </button>
                </div>
            </td>
        </>
    );

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><UserCheck size={20} /> KYC Requests</h3>
                    <p>Review and manage vendor verification requests.</p>
                </div>
                <div className="toolbar2-controls">
                    <div className="search-box">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search Vendor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                        <option value="ALL">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                    </select>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={displayedVendors}
                    renderRow={renderRow}
                    keyExtractor={(v) => v.id}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={totalItems}
                    loading={loading}
                />
            </div>

            <Modal isOpen={showVendorModal} onClose={() => setShowVendorModal(false)} title="Vendor Details" maxWidth="1100px" contentClassName="premium-modal-content">
                <div className="premium-modal">
                    {vendorDetailsLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                            <Loader2 className="spin" />
                            <div>Loading vendor details...</div>
                        </div>
                    ) : selectedVendor ? (
                        <div className="premium-modal-body">
                            <div className="premium-modal-header-row">
                                <div className="product-header">
                                    <div className="product-image">
                                        {selectedVendor.kyc?.logo ? (
                                            <img src={getImageUrl(selectedVendor.kyc.logo)} alt="Vendor logo" />
                                        ) : (
                                            <div className="no-image">{selectedVendor.brand_name?.charAt(0) || selectedVendor.username?.charAt(0) || 'V'}</div>
                                        )}
                                    </div>
                                    <div className="product-meta">
                                        <h1 className="product-title">{selectedVendor.brand_name || selectedVendor.username}</h1>
                                        <div className="product-type">{selectedVendor.kyc?.business_type || ''}</div>
                                        <div className="vendor-row"><span className="vendor-badge">{selectedVendor.email || '—'}</span></div>
                                    </div>
                                </div>
                                <div className="product-status-wrapper">
                                    <StatusBadge status={selectedVendor.kyc_status || 'PENDING'} />
                                </div>
                            </div>

                            <div className="premium-modal-grid">
                                <div className="left-col">
                                    <div className="info-card">
                                        <h3 className="card-title">Contact &amp; Account</h3>
                                        <p className="description-text"><strong>Username:</strong> {selectedVendor.username || '—'}</p>
                                        <p className="description-text"><strong>Email:</strong> {selectedVendor.email || '—'}</p>
                                        <p className="description-text"><strong>Phone:</strong> {selectedVendor.kyc?.phone || '—'}</p>
                                        <p className="description-text"><strong>Status:</strong> <StatusBadge status={selectedVendor.kyc_status || 'PENDING'} /></p>
                                    </div>

                                    <div className="info-card">
                                        <h3 className="card-title">Business Info</h3>
                                        <p className="description-text"><strong>Brand Name:</strong> {selectedVendor.brand_name || '—'}</p>
                                        <p className="description-text"><strong>Address:</strong> {selectedVendor.kyc?.address || '—'}</p>
                                    </div>
                                </div>

                                <div className="right-col">
                                    <div className="info-card product-info-card">
                                        <h3 className="card-title">Vendor Information</h3>
                                        <div className="info-row"><div className="info-label">Vendor ID</div><div className="info-value">{selectedVendor.id}</div></div>
                                        <div className="info-row"><div className="info-label">Joined</div><div className="info-value">{selectedVendor.kyc?.created_at ? new Date(selectedVendor.kyc?.created_at).toLocaleString() : '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Products</div><div className="info-value">{selectedVendor.product_count ?? '—'}</div></div>
                                        <div className="info-row"><div className="info-label">Assigned Categories</div><div className="info-value">{selectedVendor.assigned_categories?.length ?? 0}</div></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>No vendor details available.</div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default KYCRequests;
