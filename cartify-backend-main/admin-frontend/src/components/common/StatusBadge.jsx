import React from 'react';

const COLORS = {
    PENDING: { bg: 'var(--dash-warning-soft)', fg: 'var(--dash-warning)' },
    APPROVED: { bg: 'var(--dash-success-soft)', fg: 'var(--dash-success)' },
    REJECTED: { bg: 'var(--dash-danger-soft)', fg: 'var(--dash-danger)' },
    INFO_REQUIRED: { bg: 'var(--dash-info-soft)', fg: 'var(--dash-info)' },
    DRAFT: { bg: 'var(--dash-neutral-soft)', fg: 'var(--dash-neutral)' },
    ACTIVE: { bg: 'var(--dash-success-soft)', fg: 'var(--dash-success)' },
    PAUSED: { bg: 'var(--dash-warning-soft)', fg: 'var(--dash-warning)' },
    COMPLETED: { bg: 'var(--dash-info-soft)', fg: 'var(--dash-info)' },
    STOPPED: { bg: 'var(--dash-neutral-soft)', fg: 'var(--dash-neutral)' },
    OUT_OF_BUDGET: { bg: 'var(--dash-danger-soft)', fg: 'var(--dash-danger)' },
    EXPIRED: { bg: 'var(--dash-danger-soft)', fg: 'var(--dash-danger)' },
    CANCELLED: { bg: 'var(--dash-neutral-soft)', fg: 'var(--dash-neutral)' },
    RENEWED: { bg: 'var(--dash-info-soft)', fg: 'var(--dash-info)' },
};

const StatusBadge = ({ status, label, onClick, title }) => {
    const color = COLORS[status] || { bg: 'var(--dash-neutral-soft)', fg: 'var(--dash-neutral)' };
    return (
        <span
            className="dash-badge"
            style={{
                background: color.bg,
                color: color.fg,
                cursor: onClick ? 'pointer' : undefined,
            }}
            onClick={onClick}
            title={onClick ? (title || 'Click to toggle') : undefined}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {label || status?.replaceAll('_', ' ')}
        </span>
    );
};

export default StatusBadge;
