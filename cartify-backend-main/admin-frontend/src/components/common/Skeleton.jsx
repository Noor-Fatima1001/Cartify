import React from 'react';

// Building blocks for page-specific skeleton layouts. Compose these to roughly
// mirror a page's real structure (title bar, stat row, cards, table rows) so
// the loading state reads as "this page, not yet populated" instead of a
// blank screen or generic spinner. Pair with <PageLoaderOverlay /> on top
// while the *first* fetch for a page is in flight — see PageLoader.jsx.

export const SkeletonBlock = ({ width = '100%', height = '14px', radius, style, className = '' }) => (
    <div
        className={`dash-skeleton ${className}`.trim()}
        style={{ width, height, borderRadius: radius, ...style }}
    />
);

export const SkeletonCircle = ({ size = '40px', style }) => (
    <SkeletonBlock width={size} height={size} radius="50%" style={style} />
);

export const SkeletonText = ({ width = '100%', height = '12px', style }) => (
    <SkeletonBlock width={width} height={height} radius="6px" style={{ marginBottom: '0.45rem', ...style }} />
);

export const SkeletonButton = ({ width = '110px', height = '38px' }) => (
    <SkeletonBlock width={width} height={height} radius="var(--dash-radius-sm)" style={{ marginBottom: 0 }} />
);

// Mirrors the ubiquitous `.info-card` panel: a title bar plus a handful of
// text lines of decreasing width.
export const SkeletonCard = ({ lines = 3, titleWidth = '40%', className = 'info-card' }) => (
    <div className={className}>
        <SkeletonText width={titleWidth} height="16px" style={{ marginBottom: '1rem' }} />
        {Array.from({ length: lines }).map((_, i) => (
            <SkeletonText key={i} width={`${88 - i * 14}%`} />
        ))}
    </div>
);

// Mirrors `.info-row` / `.info-label` / `.info-value` detail blocks.
export const SkeletonInfoRows = ({ rows = 4 }) => (
    <>
        {Array.from({ length: rows }).map((_, i) => (
            <div className="info-row" key={i}>
                <SkeletonText width="35%" height="12px" style={{ marginBottom: '0.3rem' }} />
                <SkeletonText width="55%" height="14px" style={{ marginBottom: 0 }} />
            </div>
        ))}
    </>
);

// Mirrors `.stat-cards` / `.stat-card-small` rows used on dashboard-style pages.
export const SkeletonStatRow = ({ count = 4 }) => (
    <div className="stat-cards">
        {Array.from({ length: count }).map((_, i) => (
            <div className="stat-card-small" key={i}>
                <SkeletonCircle size="38px" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <SkeletonText width="60%" height="10px" />
                    <SkeletonText width="42%" height="16px" style={{ marginBottom: 0 }} />
                </div>
            </div>
        ))}
    </div>
);

// Skeleton <tr> rows for tables built on the shared `Table` component or a
// raw `.visitor-table`. Render inside the real <tbody>.
export const SkeletonTableRows = ({ rows = 6, columns = 4 }) => (
    <>
        {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
                {Array.from({ length: columns }).map((_, c) => (
                    <td key={c}><SkeletonText width={c === 0 ? '75%' : '50%'} style={{ marginBottom: 0 }} /></td>
                ))}
            </tr>
        ))}
    </>
);

// A grid of card-shaped tiles, for product/vendor grid pages.
export const SkeletonTileGrid = ({ count = 6, className = 'stat-cards' }) => (
    <div className={className} style={{ flexWrap: 'wrap' }}>
        {Array.from({ length: count }).map((_, i) => (
            <div className="info-card" key={i} style={{ flex: '1 1 220px' }}>
                <SkeletonBlock width="100%" height="110px" style={{ marginBottom: '0.8rem' }} />
                <SkeletonText width="70%" />
                <SkeletonText width="45%" style={{ marginBottom: 0 }} />
            </div>
        ))}
    </div>
);
