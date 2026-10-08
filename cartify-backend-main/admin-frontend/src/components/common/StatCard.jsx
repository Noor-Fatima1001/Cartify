import React from 'react';

const StatCard = ({ label, value, icon, hint, onClick }) => {
    const Icon = icon;
    return (
        <div
            className={`stat-card${onClick ? ' clickable' : ''}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {Icon && (
                <div className="stat-icon">
                    <Icon size={20} />
                </div>
            )}
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            {hint && <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--dash-ink-soft)' }}>{hint}</div>}
        </div>
    );
};

export default StatCard;
