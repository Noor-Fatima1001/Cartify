import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { brandService } from '../services/brandService';
import { feedService } from '../services/feedService';
import ProductGrid from '../components/ProductGrid';

const normalizeProducts = (products) => {
    if (!Array.isArray(products)) return [];
    return products.filter((product) => product.is_active !== false);
};

const BrandPage = () => {
    const { vendorId } = useParams();
    const [brand, setBrand] = useState(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            brandService.getVendorProfile(vendorId),
            feedService.getFeed({ vendor: vendorId }),
        ])
            .then(([brandData, feedData]) => {
                setBrand(brandData);
                setProducts(normalizeProducts(feedData));
            })
            .catch(() => {
                setBrand(null);
                setProducts([]);
            })
            .finally(() => setLoading(false));
    }, [vendorId]);

    if (loading) return <div className="sf-container sf-page"><div className="sf-empty">Loading brand...</div></div>;
    if (!brand) return <div className="sf-container sf-page"><div className="sf-empty">Brand not found.</div></div>;

    return (
        <div className="sf-page">
            <div className="sf-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                    <img
                        src={brand.logo || '/favicon.svg'}
                        alt={brand.brand_name}
                        style={{
                            width: 80, height: 80, borderRadius: 18, objectFit: 'contain',
                            background: '#fff', border: '1px solid var(--sf-border)', padding: 10, boxSizing: 'border-box',
                        }}
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/favicon.svg'; }}
                    />
                    <div>
                        <div className="sf-section-title">{brand.brand_name}</div>
                        <div className="sf-section-sub">{products.length} products</div>
                    </div>
                </div>
                <ProductGrid products={products} emptyMessage="This brand has no active products right now." />
            </div>
        </div>
    );
};

export default BrandPage;
