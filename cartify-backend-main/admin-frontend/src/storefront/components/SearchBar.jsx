import React from 'react';
import { Search, X } from 'lucide-react';

const SearchBar = ({ value, onChange, onClear, placeholder = 'Search products...' }) => {
    return (
        <label className="sf-live-search">
            <Search size={16} />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label="Search products"
            />
            {value ? (
                <button type="button" className="sf-live-search-clear" onClick={onClear}>
                    <X size={14} />
                </button>
            ) : null}
        </label>
    );
};

export default SearchBar;
