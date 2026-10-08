import React from 'react';

const BrandFilter = ({ brands, activeBrand, onSelectBrand }) => {
    if (!brands || brands.length === 0) return null;

    return (
        <div className="sf-brand-filter">
            <div className="sf-brand-filter-title">Brands</div>
            <div className="sf-brand-filter-list">
                <button className={!activeBrand ? 'active' : ''} onClick={() => onSelectBrand(null)}>
                    All brands
                </button>
                {brands.map((brand) => (
                    <button
                        key={brand.id}
                        className={String(activeBrand) === String(brand.id) ? 'active' : ''}
                        onClick={() => onSelectBrand(String(brand.id))}
                    >
                        {brand.brand_name || brand.username || 'Brand'}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default BrandFilter;
