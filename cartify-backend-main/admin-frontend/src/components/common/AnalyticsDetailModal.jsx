import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import Modal from './Modal';
import Pagination from './Pagination';
import { formatPKT } from '../../utils/date';

const AnalyticsDetailModal = ({
    isOpen,
    onClose,
    type = 'views',
    title,
    data = [],
    loading = false,
    currentPage = 1,
    totalPages = 1,
    totalItems = 0,
    onPageChange = () => {},
    searchTerm = '',
    onSearch = null,
    visitorLimit = null,
    lockedCount = 0,
    totalViews = null,
    eventLevel = false,
}) => {
    const navigate = useNavigate();
    const handleSearchChange = (value) => {
        if (onSearch) {
            onSearch(value);
        }
    };
    const isViews = type === 'views';
    const isFavorites = type === 'favorites';
    const isClicks = type === 'clicks' || type === 'purchase_link_click';
    const isCart = type === 'cart';
    const modalTitle = title || (isViews ? 'Visitor Details' : isFavorites ? 'Favorite Details' : isClicks ? 'Purchase Link Clicks' : isCart ? 'Cart Details' : 'Details');
    // "Total Views" (eventLevel) shows one row per individual view event, so
    // its hidden-count is phrased in views, not visitors like "Visitor Details".
    const noun = isViews ? (eventLevel ? 'view' : 'visitor') : isFavorites ? 'favorite' : isCart ? 'cart add' : 'click';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} maxWidth="900px">
            <div style={{ padding: '1rem' }}>
                {isViews && !eventLevel && totalViews != null && (
                    <div style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>
                        <strong style={{ color: 'var(--dash-ink)' }}>{totalItems}</strong> unique visitor{totalItems === 1 ? '' : 's'} ·{' '}
                        <strong style={{ color: 'var(--dash-ink)' }}>{totalViews}</strong> total view{totalViews === 1 ? '' : 's'}
                        {lockedCount > 0 ? ' across all visitors (including hidden ones below).' : '.'}
                    </div>
                )}
                {lockedCount > 0 && (
                    <div style={{
                        marginBottom: '1rem', padding: '0.6rem 0.9rem', borderRadius: 'var(--dash-radius-sm)',
                        background: 'var(--dash-accent-soft)', color: 'var(--dash-accent-hover)', fontSize: '0.85rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                        <Lock size={16} />
                        {visitorLimit != null
                            ? `Your plan shows only the first ${visitorLimit} ${noun}${visitorLimit === 1 ? '' : 's'} per product. `
                            : ''}
                        {lockedCount} more {noun}{lockedCount === 1 ? '' : 's'} {lockedCount === 1 ? 'is' : 'are'} hidden. Subscribe to unlock all {noun}s.
                    </div>
                )}
                {onSearch && (
                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search favorites by product, guest or mobile..."
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                    </div>
                )}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>Loading analytics...</div>
                ) : data.length > 0 || lockedCount > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        {data.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)', backgroundColor: 'var(--glass)' }}>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Product</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Guest</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Mobile Number</th>
                                    {isClicks && (
                                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Device</th>
                                    )}
                                    {isViews && eventLevel ? (
                                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Viewed At</th>
                                    ) : (
                                        <>
                                            {isViews && (
                                                <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Total Visits</th>
                                            )}
                                            {isFavorites && (
                                                <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Total Favorites</th>
                                            )}
                                            {isClicks && (
                                                <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Total Clicks</th>
                                            )}
                                            {isCart && (
                                                <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Cart Adds</th>
                                            )}
                                            <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>{isViews ? 'First Visit' : (isFavorites || isCart) ? 'First Added' : 'First Click'}</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>{isViews ? 'Last Visit' : (isFavorites || isCart) ? 'Last Added' : 'Last Click'}</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                {item.product_image ? (
                                                    <img
                                                        src={item.product_image}
                                                        alt={item.product_name || 'Product image'}
                                                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                                                    />
                                                ) : (
                                                    <div style={{ width: 56, height: 56, borderRadius: 'var(--dash-radius-sm)', backgroundColor: 'var(--dash-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dash-ink-soft)', fontSize: '0.75rem' }}>
                                                        No Image
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{item.product_name || item.product?.name || '—'}</div>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>{item.product_category || item.product?.category_name || '—'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <span>{item.visitor_name || item.user_name || item.user || '—'}</span>
                                                {item.guest_id ? (
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ID: {item.guest_id}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>{item.mobile_number || item.visitor_mobile || item.mobile || item.phone_number || item.phone || '—'}</td>
                                        {isClicks && (
                                            <td style={{ padding: '0.75rem' }}>{item.device || item.device_type || '—'}</td>
                                        )}
                                        {isViews && eventLevel ? (
                                            <td style={{ padding: '0.75rem' }}>{formatPKT(item.viewed_at)}</td>
                                        ) : (
                                            <>
                                                {isViews && (
                                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.visit_count || 0}</td>
                                                )}
                                                {isFavorites && (
                                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.total_favorites || 0}</td>
                                                )}
                                                {isClicks && (
                                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.total_clicks || 0}</td>
                                                )}
                                                {isCart && (
                                                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.total_cart_adds || 0}</td>
                                                )}
                                                <td style={{ padding: '0.75rem' }}>{formatPKT(isViews ? item.first_visit : (isFavorites || isCart) ? item.first_add : item.first_click)}</td>
                                                <td style={{ padding: '0.75rem' }}>{formatPKT(isViews ? item.last_visit : (isFavorites || isCart) ? item.last_add : item.last_click)}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        )}
                        {data.length > 0 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={onPageChange}
                                totalItems={totalItems}
                            />
                        )}
                        {lockedCount > 0 && (
                            <div style={{ position: 'relative', marginTop: data.length > 0 ? '1.5rem' : 0 }}>
                                <table
                                    aria-hidden="true"
                                    style={{
                                        width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem',
                                        filter: 'blur(5px)', opacity: 0.6, userSelect: 'none', pointerEvents: 'none',
                                    }}
                                >
                                    <tbody>
                                        {Array.from({ length: Math.min(lockedCount, 3) }).map((_, idx) => (
                                            <tr key={`locked-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.75rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ width: 56, height: 56, borderRadius: 'var(--dash-radius-sm)', backgroundColor: 'var(--dash-border-strong)' }} />
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>Hidden Product</div>
                                                            <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>••••••</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem' }}>•••• ••••••</td>
                                                <td style={{ padding: '0.75rem' }}>+92 ••• •••••••</td>
                                                <td style={{ padding: '0.75rem' }}>-- --- ----, --:-- --</td>
                                                {!eventLevel && <td style={{ padding: '0.75rem' }}>-- --- ----, --:-- --</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div style={{
                                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: '0.5rem', textAlign: 'center', padding: '1rem',
                                }}>
                                    <Lock size={22} style={{ color: 'var(--dash-accent)' }} />
                                    <div style={{ fontWeight: 600 }}>
                                        {lockedCount} more {noun}{lockedCount === 1 ? '' : 's'} hidden
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)', maxWidth: 360 }}>
                                        Subscribe to unlock all {noun}s for your products.
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/admin/vendor-dashboard/subscription')}
                                        className="dash-btn dash-btn-primary"
                                        style={{ marginTop: '0.25rem' }}
                                    >
                                        Subscribe to Unlock
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        No {isViews ? 'visitor' : isFavorites ? 'favorite' : 'click'} analytics available.
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AnalyticsDetailModal;
