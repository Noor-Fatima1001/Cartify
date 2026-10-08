import React, { useEffect, useState } from 'react';
import { favoriteService } from '../services/favoriteService';
import ProductGrid from '../components/ProductGrid';

const Favorites = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        favoriteService
            .list()
            .then((data) => setProducts((data.results || []).map((r) => r.product)))
            .catch(() => setProducts([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="sf-page">
            <div className="sf-container">
                <div className="sf-section-title" style={{ marginBottom: 20 }}>Your Favourites</div>
                {loading ? (
                    <div className="sf-empty">Loading favourites...</div>
                ) : (
                    <ProductGrid products={products} emptyMessage="You haven't favourited anything yet." />
                )}
            </div>
        </div>
    );
};

export default Favorites;
