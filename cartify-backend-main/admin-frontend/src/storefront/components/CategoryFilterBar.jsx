import React from 'react';

const SORT_OPTIONS = [
    { value: '', label: 'Newest' },
    { value: '-favorite_count', label: 'Most favourited' },
    { value: 'price', label: 'Price: low to high' },
    { value: '-price', label: 'Price: high to low' },
];

const CategoryFilterBar = ({ categories, activeCategory, onSelectCategory, sort, onSortChange }) => {
    return (
        <div className="sf-filter-bar-wrap">
            <div className="sf-filter-bar">
                <button
                    className={`sf-chip ${!activeCategory ? 'active' : ''}`}
                    onClick={() => onSelectCategory(null)}
                >
                    All
                </button>
                {categories.map((cat) => (
                    <button
                        key={cat.id}
                        className={`sf-chip ${activeCategory === String(cat.id) ? 'active' : ''}`}
                        onClick={() => onSelectCategory(String(cat.id))}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>
            {/* Kept outside the scrollable chip row so it stays reachable
                regardless of how many categories there are. */}
            <select className="sf-sort-select" value={sort} onChange={(e) => onSortChange(e.target.value)}>
                {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default CategoryFilterBar;
