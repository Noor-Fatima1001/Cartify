/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { Search, Smartphone, Heart, Users } from 'lucide-react';
import DataTable from '../../components/tables/DataTable';
import AnalyticsDetailModal from '../../components/common/AnalyticsDetailModal';
import StatusBadge from '../../components/common/StatusBadge';
import { customerService } from '../../services/customerService';
import { analyticsService } from '../../services/analyticsService';
import { useToast } from '../../context/ToastContext';
import { ANALYTICS_PAGE_SIZE, normalizeAnalyticsPagination } from '../../utils/analyticsPagination';

const Guests = () => {
    const [guests, setGuests] = useState([]);
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
    const [selectedGuest, setSelectedGuest] = useState(null);
    const { showToast } = useToast();
    const PAGE_SIZE = 10;

    const fetchGuests = async () => {
        try {
            setLoading(true);
            const response = await customerService.getGuests({
                page: currentPage,
                limit: PAGE_SIZE,
                search: searchTerm,
                status: statusFilter
            });
            setGuests(response.results || []);
            setTotalPages(response.total_pages || 1);
            setTotalItems(response.total_items || 0);
        } catch (error) {
            console.error('Error fetching guests:', error);
            showToast('Failed to load guest data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchGuestFavorites = async (guest, page = 1, search = '') => {
        if (!guest) {
            return;
        }

        try {
            setFavoritesModalLoading(true);
            const params = {
                guest_id: guest.id,
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
            setSelectedGuest(guest);
            setShowFavoritesModal(true);
        } catch (error) {
            console.error('Error fetching guest favorites:', error);
            showToast('Failed to load favorite details', 'error');
        } finally {
            setFavoritesModalLoading(false);
        }
    };

    const openGuestFavoritesModal = (guest) => {
        setFavoritesModalSearch('');
        fetchGuestFavorites(guest, 1, '');
    };

    const handleFavoriteSearch = (value) => {
        setFavoritesModalSearch(value);
        fetchGuestFavorites(selectedGuest, 1, value);
    };

    useEffect(() => {
        fetchGuests();
    }, [currentPage, searchTerm, statusFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);
    const columns = ['Guest', 'Mobile Number', 'First Visit', 'Last Active', 'Favorites', 'Status'];

    const renderRow = (guest) => (
        <>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'var(--dash-accent-soft)',
                        color: 'var(--dash-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.85rem'
                    }}>
                        {String(guest.device_id || 'G')[0].toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600 }}>{guest.device_id || 'Unknown'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--dash-ink-faint)' }}>ID: #{guest.id || '—'}</div>
                    </div>
                </div>
            </td>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--dash-ink-soft)' }}>
                    <Smartphone size={14} />
                    <span>{guest.mobile_number || '—'}</span>
                </div>
            </td>
            <td>
                <span style={{ color: 'var(--dash-ink-soft)' }}>{new Date(guest.first_visit).toLocaleString()}</span>
            </td>
            <td>
                <span style={{ color: 'var(--dash-ink-soft)' }}>{guest.last_active ? new Date(guest.last_active).toLocaleString() : 'N/A'}</span>
            </td>
            <td>
                <button
                    type="button"
                    className="status-badge analytics-badge"
                    onClick={() => openGuestFavoritesModal(guest)}
                >
                    <Heart size={13} />
                    {(guest.favorites_count ?? guest.favorite_count ?? guest.favoritesCount ?? 0)}
                </button>
            </td>
            <td>
                <StatusBadge label="Anonymous" />
            </td>
        </>
    );

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Users size={20} /> Guest Tracking</h3>
                    <p>Monitor anonymous users and their interaction with the platform.</p>
                </div>
                <div className="toolbar2-controls">
                    <div className="search-box">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search guest id..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="filter-select"
                    >
                        <option value="ALL">All Guests</option>
                        <option value="HAS_FAVORITES">Has Favorites</option>
                        <option value="NO_FAVORITES">No Favorites</option>
                    </select>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={guests}
                    renderRow={renderRow}
                    keyExtractor={(guest) => guest.id || guest.device_id}
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
                title={selectedGuest ? `Favorite Details — ${selectedGuest.device_id || `Guest #${selectedGuest.id}`}` : 'Favorite Details'}
                data={favoritesModalData}
                loading={favoritesModalLoading}
                currentPage={favoritesModalPage}
                totalPages={favoritesModalTotalPages}
                totalItems={favoritesModalTotalItems}
                onPageChange={(page) => fetchGuestFavorites(selectedGuest, page, favoritesModalSearch)}
                searchTerm={favoritesModalSearch}
                onSearch={handleFavoriteSearch}
            />
        </div>
    );
};

export default Guests;
