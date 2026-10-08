import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Eye, Check } from 'lucide-react';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontCart } from '../context/StorefrontCartContext';
import { useStorefrontToast } from '../context/StorefrontToastContext';

const ProductCard = ({ product }) => {
    const navigate = useNavigate();
    const { requirePhone } = useStorefrontAuth();
    const { addToCart } = useStorefrontCart();
    const { showToast } = useStorefrontToast();
    const [inCart, setInCart] = useState(!!product.in_cart);
    const [busy, setBusy] = useState(false);
    const canAddToCart = product.can_add_to_cart !== false;

    const openProduct = () => {
        requirePhone(() => navigate(`/product/${product.id}`));
    };

    const handleCart = async (e) => {
        e.stopPropagation();
        if (!canAddToCart || inCart) return;
        requirePhone(async () => {
            if (busy || inCart) return;
            setBusy(true);
            try {
                await addToCart(product.id);
                setInCart(true);
                showToast('Added to cart');
            } catch (err) {
                showToast(err.response?.data?.error || 'Could not add to cart');
            } finally {
                setBusy(false);
            }
        });
    };

    const viewCount = Number(product.unique_visitors ?? product.total_views ?? product.view_count ?? 0);
    const hasDiscount = Number(product.discount || 0) > 0;
    const hasOriginalPrice = product.original_price && Number(product.original_price) > Number(product.price || 0);

    return (
        <div className="sf-card" onClick={openProduct} role="button">
            <div className="sf-card-media">
                <div className="sf-card-badges">
                    {product.is_sponsored && <span className="sf-card-sponsored">Sponsored</span>}
                    {hasDiscount && <span className="sf-card-discount-badge">-{product.discount}%</span>}
                </div>
                <img src={product.image || '/favicon.svg'} alt={product.name} loading="lazy" />
            </div>
            <div className="sf-card-body">
                {product.vendor_name && <span className="sf-card-vendor">{product.vendor_name}</span>}
                <span className="sf-card-name">{product.name}</span>
                <div className="sf-card-price-row">
                    <span className="sf-card-price">Rs {Number(product.price || 0).toLocaleString()}</span>
                    {hasOriginalPrice && (
                        <span className="sf-card-original-price">Rs {Number(product.original_price).toLocaleString()}</span>
                    )}
                </div>
                <div className="sf-card-stats">
                    <span><Eye size={12} /> {viewCount} views</span>
                </div>
                <div className="sf-card-actions">
                    <button
                        type="button"
                        className="sf-card-view-btn"
                        onClick={(e) => { e.stopPropagation(); openProduct(); }}
                    >
                        View Details
                    </button>
                    {canAddToCart && (
                        <button
                            type="button"
                            className={`sf-card-cart-icon-btn ${inCart ? 'in-cart' : ''}`}
                            onClick={handleCart}
                            disabled={busy || inCart}
                            aria-label={inCart ? 'Already in cart' : 'Add to cart'}
                            title={inCart ? 'Already in cart' : 'Add to cart'}
                        >
                            {inCart ? <Check size={16} /> : <ShoppingBag size={16} />}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
