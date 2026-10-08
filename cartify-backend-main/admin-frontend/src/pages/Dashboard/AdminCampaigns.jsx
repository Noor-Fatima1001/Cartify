import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/tables/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { campaignService } from '../../services/campaignService';
import { useToast } from '../../context/ToastContext';
import { Eye, Megaphone, Search } from 'lucide-react';

const PAGE_SIZE = 10;
const STATUS_FILTERS = ['ALL', 'DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'OUT_OF_BUDGET'];

const AdminCampaigns = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const fetchCampaigns = useCallback(async () => {
        try {
            setLoading(true);
            const data = await campaignService.adminGetCampaigns({
                page: currentPage, limit: PAGE_SIZE, status: statusFilter, search: searchTerm,
            });
            setCampaigns(data.results || []);
            setTotalPages(data.total_pages || 1);
            setTotalItems(data.total_items || 0);
        } catch (e) {
            console.error('Error fetching campaigns:', e);
            showToast('Failed to load campaigns', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, searchTerm, showToast]);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Megaphone size={20} /> Campaigns</h3>
                    <p>Monitor campaign activity and keep an eye on budgets, status, and performance.</p>
                </div>
                <div className="toolbar2-controls">
                    <div className="search-box">
                        <Search size={16} />
                        <input type="text" placeholder="Search name / vendor…" value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                    </div>
                    <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
                        {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                    </select>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={['Campaign', 'Vendor', 'Status', 'Budget', 'Spent', 'Remaining', 'Products', 'Started', 'Ends', 'Actions']}
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
                            <td>{c.vendor_username}</td>
                            <td><StatusBadge status={c.display_status || c.status} label={c.display_status_label || c.status_display} /></td>
                            <td>{Number(c.total_budget).toLocaleString()}</td>
                            <td>{Number(c.spent).toLocaleString()}</td>
                            <td>{Number(c.remaining).toLocaleString()}</td>
                            <td>{c.products?.length || 0}</td>
                            <td>{c.started_at ? new Date(c.started_at).toLocaleDateString() : '—'}</td>
                            <td>{c.ends_at ? new Date(c.ends_at).toLocaleDateString() : '—'}</td>
                            <td>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => navigate(`/admin/dashboard/campaigns/${c.id}`)}
                                >
                                    <Eye size={14} /> Details
                                </button>
                            </td>
                        </>
                    )}
                />
            </div>
        </div>
    );
};

export default AdminCampaigns;
