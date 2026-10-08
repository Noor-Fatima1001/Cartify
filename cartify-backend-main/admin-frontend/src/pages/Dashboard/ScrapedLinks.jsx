/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { Search, ExternalLink, Image as ImageIcon, Link2 } from 'lucide-react';
import DataTable from '../../components/tables/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import { scrapeService } from '../../services/scrapeService';
import { useToast } from '../../context/ToastContext';

const ScrapedLinks = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [availableCategories, setAvailableCategories] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const { showToast } = useToast();
    const PAGE_SIZE = 10;

    const fetchScrapedItems = async () => {
        try {
            setLoading(true);
            const response = await scrapeService.getAllScrapedItems({
                page: currentPage,
                limit: PAGE_SIZE,
                search: searchTerm,
                category: categoryFilter
            });
            setItems(response.results || []);
            setTotalPages(response.total_pages || 1);
            setTotalItems(response.total_items || 0);
            setAvailableCategories(response.available_categories || []);
        } catch (error) {
            console.error('Error fetching scraped items:', error);
            showToast('Failed to load scraped links', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchScrapedItems();
    }, [currentPage, searchTerm, categoryFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, categoryFilter]);

    const columns = ['Product', 'User', 'Site', 'Price', 'URL', 'Scraped At'];

    const renderRow = (item) => {
        const thumbSrc = item.images?.[0];

        return (
        <>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="vendor-avatar">
                        {thumbSrc ? (
                            <img
                                src={thumbSrc}
                                alt={item.title || 'Scraped product'}
                                style={{ cursor: 'zoom-in' }}
                                onClick={() => setLightboxSrc(thumbSrc)}
                            />
                        ) : (
                            <ImageIcon size={16} />
                        )}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title || 'Untitled'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--dash-ink-faint)' }}>ID: #{item.id}</div>
                    </div>
                </div>
            </td>
            <td>
                <span>{item.user || 'System'}</span>
            </td>
            <td>
                <StatusBadge label={item.category || 'Others'} />
            </td>
            <td>
                <span>{item.price || '—'}</span>
            </td>
            <td>
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--dash-accent)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={item.url}
                >
                    <ExternalLink size={14} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.url}</span>
                </a>
            </td>
            <td>
                <span style={{ color: 'var(--dash-ink-soft)' }}>
                    {item.scraped_at ? new Date(item.scraped_at).toLocaleString() : '—'}
                </span>
            </td>
        </>
        );
    };

    return (
        <div className="view active">
            <div className="page-header">
                <div className="header-left">
                    <h3><Link2 size={20} /> Scraped Links</h3>
                    <p>View every product link users have scraped, across all accounts.</p>
                </div>
                <div className="toolbar2-controls">
                    <div className="search-box">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search by title, URL, or user..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="filter-select"
                    >
                        <option value="ALL">All Sites</option>
                        {availableCategories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="data-section">
                <DataTable
                    columns={columns}
                    data={items}
                    renderRow={renderRow}
                    keyExtractor={(item) => item.id}
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

export default ScrapedLinks;
