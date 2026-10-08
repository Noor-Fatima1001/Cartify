import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

// Consolidates the "N more hidden — Subscribe to unlock" upsell pattern used
// across VendorHome, VendorCartDetails and VisitorAnalytics. Mirrors the
// blurred-dummy-rows + centered unlock overlay treatment from
// AnalyticsDetailModal so every locked-rows table in the app looks the same.

const DUMMY_TEXT = '••••••';

export const LockedTableRows = ({ lockedCount = 0, columnsCount, max = 3, withImage = true }) => {
    if (lockedCount <= 0) return null;
    return (
        <>
            {Array.from({ length: Math.min(lockedCount, max) }).map((_, idx) => (
                <tr key={`locked-${idx}`}>
                    <td>
                        {withImage ? (
                            <div className="vendor-info">
                                <div className="vendor-avatar" style={{ background: 'var(--dash-border-strong)' }} />
                                <div>
                                    <div style={{ fontWeight: 600 }}>Hidden Product</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)' }}>{DUMMY_TEXT}</div>
                                </div>
                            </div>
                        ) : DUMMY_TEXT}
                    </td>
                    {Array.from({ length: Math.max(0, columnsCount - 1) }).map((_, c) => (
                        <td key={c}>{DUMMY_TEXT}</td>
                    ))}
                </tr>
            ))}
        </>
    );
};

// A blurred preview table (real-looking dummy rows) with a centered
// lock/message/CTA overlay layered on top — render this as its own block
// below the real table, not mixed into the real table's <tbody>, so the
// overlay has a clean area to center itself over.
export const LockedRowsPanel = ({
    lockedCount = 0,
    columnsCount,
    noun = 'item',
    withImage = true,
    hint = null,
    ctaTo = '/admin/vendor-dashboard/subscription',
}) => {
    const navigate = useNavigate();
    if (lockedCount <= 0) return null;
    return (
        <div style={{ padding: '0 1.4rem 1.4rem' }}>
            {hint && (
                <div style={{ fontSize: '0.8rem', color: 'var(--dash-ink-soft)', margin: '0 0 0.6rem' }}>{hint}</div>
            )}
            <div className="table-container dash-locked-panel">
                <table aria-hidden="true" className="dash-locked-table">
                    <tbody>
                        <LockedTableRows lockedCount={lockedCount} columnsCount={columnsCount} withImage={withImage} />
                    </tbody>
                </table>
                <div className="dash-locked-overlay">
                    <Lock size={22} style={{ color: 'var(--dash-accent)' }} />
                    <div style={{ fontWeight: 600 }}>
                        {lockedCount} more {noun}{lockedCount === 1 ? '' : 's'} hidden
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--dash-ink-soft)', maxWidth: 360 }}>
                        Subscribe to unlock all {noun}s for your products.
                    </div>
                    {ctaTo && (
                        <button
                            type="button"
                            className="dash-btn dash-btn-primary"
                            style={{ marginTop: '0.25rem' }}
                            onClick={() => navigate(ctaTo)}
                        >
                            Subscribe to Unlock
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// Plain text-only banner — kept for spots that don't render a table (e.g. an
// admin view with no subscription CTA of its own).
const LockedRowsBanner = ({ lockedCount = 0, noun = 'item', ctaTo = '/admin/vendor-dashboard/subscription', ctaLabel = 'Subscribe to Unlock' }) => {
    if (lockedCount <= 0) return null;
    return (
        <div className="dash-locked-banner">
            <div className="dash-locked-banner-text">
                <Lock size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                {lockedCount} more {noun}{lockedCount === 1 ? '' : 's'} {lockedCount === 1 ? 'is' : 'are'} hidden. Subscribe to unlock all {noun}s.
            </div>
            {ctaTo && (
                <Link to={ctaTo} className="dash-btn dash-btn-primary dash-btn-sm">
                    {ctaLabel}
                </Link>
            )}
        </div>
    );
};

export default LockedRowsBanner;
