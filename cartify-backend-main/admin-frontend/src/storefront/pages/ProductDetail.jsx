import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Heart, ShoppingBag, ExternalLink } from 'lucide-react';
import { feedService } from '../services/feedService';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontCart } from '../context/StorefrontCartContext';
import { useStorefrontToast } from '../context/StorefrontToastContext';
import ProductGrid from '../components/ProductGrid';

const ProductDetail = () => {
    const { id } = useParams();
    const { phoneVerified, requirePhone } = useStorefrontAuth();
    const { toggleFavorite, addToCart } = useStorefrontCart();
    const { showToast } = useStorefrontToast();

    const [product, setProduct] = useState(null);
    const [related, setRelated] = useState([]);
    const [activeImage, setActiveImage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const load = () => {
        setLoading(true);
        feedService
            .getProductDetail(id)
            .then((data) => {
                setProduct(data);
                setActiveImage(data.image);
            })
            .catch(() => setProduct(null))
            .finally(() => setLoading(false));
        feedService
            .getRelated(id)
            .then((data) => setRelated(data.results || []))
            .catch(() => setRelated([]));
    };

    useEffect(() => {
        if (phoneVerified) {
            load();
        } else {
            requirePhone(load);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, phoneVerified]);

    if (loading) return <div className="sf-container sf-page"><div className="sf-empty">Loading product...</div></div>;
    if (!product) return <div className="sf-container sf-page"><div className="sf-empty">Product not found.</div></div>;

    const performFavorite = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await toggleFavorite(product.id);
            const nowFavorited = result.message === 'Added to favorites';
            setProduct((p) => ({ ...p, is_favorited: nowFavorited }));
            showToast(nowFavorited ? 'Added to favourites' : 'Removed from favourites');
        } finally {
            setBusy(false);
        }
    };

    const handleFavorite = () => requirePhone(performFavorite);

    const performCart = async () => {
        if (product.can_add_to_cart === false) {
            return;
        }
        if (busy || product.in_cart) return;
        setBusy(true);
        try {
            await addToCart(product.id);
            setProduct((p) => ({ ...p, in_cart: true }));
            showToast('Added to cart');
        } catch (err) {
            showToast(err.response?.data?.error || 'Could not add to cart');
        } finally {
            setBusy(false);
        }
    };

    const handleCart = () => requirePhone(performCart);

    const handleVisitWebsite = (e) => {
        if (!product?.purchase_link && !product?.purchase_short_link) return;
        e.preventDefault();
        const url = product.purchase_link || product.purchase_short_link;
        requirePhone(() => window.open(url, '_blank', 'noopener,noreferrer'));
    };

    const gallery = [...new Set([product.image, ...(product.images || [])].filter(Boolean))];

    return (
        <div className="sf-page">
            <div className="sf-container" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 40 }}>
                <div>
                    <div className="sf-card-media" style={{ borderRadius: 'var(--sf-radius-lg)' }}>
                        <img src={activeImage || '/favicon.svg'} alt={product.name} />
                    </div>
                    {gallery.length > 1 && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                            {gallery.map((img) => (
                                <button
                                    key={img}
                                    onClick={() => setActiveImage(img)}
                                    style={{
                                        width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                                        border: activeImage === img ? '2px solid var(--sf-accent)' : '1px solid var(--sf-border)',
                                        padding: 0, cursor: 'pointer',
                                    }}
                                >
                                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <div className="sf-card-vendor">{product.vendor_name} {product.vendor_city ? `· ${product.vendor_city}` : ''}</div>
                    <h1 style={{ fontFamily: 'var(--sf-font-display)', fontSize: '1.8rem', margin: '6px 0 12px' }}>{product.name}</h1>
                    <div className="sf-card-price-row" style={{ fontSize: '1.1rem', marginBottom: 18 }}>
                        <span className="sf-card-price" style={{ fontSize: '1.5rem' }}>Rs {Number(product.price).toLocaleString()}</span>
                        {product.original_price && Number(product.original_price) > Number(product.price) && (
                            <span className="sf-card-original-price">Rs {Number(product.original_price).toLocaleString()}</span>
                        )}
                        {Number(product.discount) > 0 && <span className="sf-card-discount">-{product.discount}%</span>}
                    </div>

                    {product.description && (
                        <div
                            style={{ color: 'var(--sf-ink-soft)', lineHeight: 1.6, marginBottom: 24 }}
                            dangerouslySetInnerHTML={{ __html: product.description }}
                        />
                    )}

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {(product.purchase_link || product.purchase_short_link) && (
                            <a href={product.purchase_link || product.purchase_short_link} target="_blank" rel="noopener noreferrer" className="sf-btn sf-btn-primary" onClick={handleVisitWebsite}>
                                <ExternalLink size={16} /> Visit website
                            </a>
                        )}
                        {product.can_add_to_cart !== false && (
                            <button className="sf-btn sf-btn-dark" onClick={handleCart} disabled={busy || product.in_cart}>
                                <ShoppingBag size={16} /> {product.in_cart ? 'In cart' : 'Add to cart'}
                            </button>
                        )}
                        <button className="sf-btn sf-btn-ghost" onClick={handleFavorite} disabled={busy}>
                            <Heart size={16} fill={product.is_favorited ? 'currentColor' : 'none'} color={product.is_favorited ? 'var(--sf-heart)' : 'currentColor'} />
                            {product.is_favorited ? 'Favourited' : 'Favourite'}
                        </button>
                    </div>
                </div>
            </div>

            {related.length > 0 && (
                <div className="sf-container" style={{ marginTop: 48 }}>
                    <div className="sf-section-title" style={{ marginBottom: 16 }}>You might also like</div>
                    <ProductGrid products={related} />
                </div>
            )}
        </div>
    );
};

export default ProductDetail;
