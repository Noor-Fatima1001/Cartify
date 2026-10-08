import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { feedService } from '../services/feedService';
import ProductGrid from '../components/ProductGrid';

const normalizeProducts = (products) => {
    if (!Array.isArray(products)) return [];
    return products.filter((product) => product.is_active !== false);
};

const SearchResults = () => {
    const { city, user } = useStorefrontAuth();
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        feedService
            .getFeed({ search: query || undefined, city: city || undefined, vendor: user?.role === 'VENDOR' ? user.id : undefined })
            .then((data) => setResults(normalizeProducts(data)))
            .catch(() => setResults([]))
            .finally(() => setLoading(false));
    }, [query, city, user]);

    return (
        <div className="sf-page">
            <div className="sf-container">
                <div className="sf-section-title" style={{ marginBottom: 4 }}>
                    {query ? `Results for "${query}"` : 'All products'}
                </div>
                <div className="sf-section-sub" style={{ marginBottom: 20 }}>{results.length} products found</div>
                {loading ? <div className="sf-empty">Searching...</div> : <ProductGrid products={results} emptyMessage="No products matched your search." />}
            </div>
        </div>
    );
};

export default SearchResults;
