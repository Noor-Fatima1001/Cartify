import React from 'react';
import { Link } from 'react-router-dom';

const handleLogoError = (e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = '/favicon.svg';
};

const BrandCard = ({ brand }) => (
    <Link to={`/brand/${brand.id}`} className="sf-brand-card">
        <img
            src={brand.logo || '/favicon.svg'}
            alt={brand.brand_name}
            className="sf-brand-logo"
            loading="lazy"
            onError={handleLogoError}
        />
        <span className="sf-brand-name">{brand.brand_name}</span>
        <span className="sf-brand-meta">{brand.product_count} products</span>
    </Link>
);

export default BrandCard;
