import React from 'react';
import ProductCard from './ProductCard';

const ProductGrid = ({ products, emptyMessage = 'No products found.' }) => {
    if (!products || products.length === 0) {
        return <div className="sf-empty">{emptyMessage}</div>;
    }
    return (
        <div className="sf-grid">
            {products.map((product) => (
                <ProductCard key={product.id} product={product} />
            ))}
        </div>
    );
};

export default ProductGrid;
