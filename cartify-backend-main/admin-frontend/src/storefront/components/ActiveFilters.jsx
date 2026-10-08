import React from 'react';
import { X } from 'lucide-react';

const ActiveFilters = ({ filters, onRemove, onClearAll }) => {
    if (!filters || filters.length === 0) return null;

    return (
        <div className="sf-active-filters">
            <div className="sf-active-filters-title">Applied filters</div>
            <div className="sf-active-filters-list">
                {filters.map((filter) => (
                    <button key={`${filter.type}-${filter.value}`} className="sf-active-filter-chip" onClick={() => onRemove(filter)}>
                        <span>{filter.label}</span>
                        <X size={12} />
                    </button>
                ))}
            </div>
            <button className="sf-btn sf-btn-ghost sf-btn-inline" onClick={onClearAll}>
                Reset filters
            </button>
        </div>
    );
};

export default ActiveFilters;
