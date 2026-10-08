import React from 'react';

// Full-viewport blurred overlay + spinner, layered on top of a page's
// skeleton while its *first* data fetch is in flight. Never use this for
// action-triggered refetches (approve/save/delete etc.) — those should show
// a local busy state on the relevant button/section only, leaving the rest
// of the page untouched. See FRONTEND_GUIDELINES.md.
const PageLoaderOverlay = ({ label = 'Loading…' }) => (
    <div className="page-loader-overlay">
        <div className="page-loader-box">
            <span className="page-loader-spinner" />
            <span className="page-loader-text">{label}</span>
        </div>
    </div>
);

export default PageLoaderOverlay;
