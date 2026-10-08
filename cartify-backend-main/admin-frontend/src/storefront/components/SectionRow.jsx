import React from 'react';
import { Link } from 'react-router-dom';

const SectionRow = ({ title, subtitle, viewAllHref, children, isEmpty, emptyMessage }) => {
    return (
        <section className="sf-section">
            <div className="sf-container">
                <div className="sf-section-head">
                    <div>
                        <div className="sf-section-title">{title}</div>
                        {subtitle && <div className="sf-section-sub">{subtitle}</div>}
                    </div>
                    {viewAllHref && (
                        <Link className="sf-section-link" to={viewAllHref}>
                            View all
                        </Link>
                    )}
                </div>
                {isEmpty ? <div className="sf-empty">{emptyMessage || 'Nothing here yet.'}</div> : <div className="sf-row">{children}</div>}
            </div>
        </section>
    );
};

export default SectionRow;
