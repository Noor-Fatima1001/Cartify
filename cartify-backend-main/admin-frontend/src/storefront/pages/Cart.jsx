import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ExternalLink } from 'lucide-react';
import { cartService } from '../services/cartService';
import { useStorefrontCart } from '../context/StorefrontCartContext';
import { useStorefrontToast } from '../context/StorefrontToastContext';

const Cart = () => {
    const { refreshCounts } = useStorefrontCart();
    const { showToast } = useStorefrontToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        cartService
            .getCart()
            .then((data) => setItems(data.results || []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const handleRemove = async (productId) => {
        try {
            await cartService.remove(productId);
            setItems((prev) => prev.filter((item) => item.product.id !== productId));
            refreshCounts();
            showToast('Removed from cart');
        } catch (err) {
            showToast('Could not remove item');
        }
    };

    return (
        <div className="sf-page">
            <div className="sf-container">
                <div className="sf-section-title" style={{ marginBottom: 20 }}>Your Cart</div>

                {loading ? (
                    <div className="sf-empty">Loading cart...</div>
                ) : items.length === 0 ? (
                    <div className="sf-empty">Your cart is empty. <Link to="/" className="sf-section-link">Start browsing</Link></div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {items.map(({ cart_item_id, product }) => (
                            <div
                                key={cart_item_id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 16,
                                    background: 'var(--sf-surface)', borderRadius: 'var(--sf-radius-md)',
                                    padding: 14, boxShadow: 'var(--sf-shadow)',
                                }}
                            >
                                <img
                                    src={product.image || '/favicon.svg'}
                                    alt={product.name}
                                    style={{ width: 76, height: 76, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="sf-card-vendor">{product.vendor_name}</div>
                                    <Link to={`/product/${product.id}`} style={{ fontWeight: 600, fontSize: '0.95rem' }}>{product.name}</Link>
                                    <div className="sf-card-price" style={{ marginTop: 4 }}>Rs {Number(product.price).toLocaleString()}</div>
                                </div>
                                {product.purchase_short_link && (
                                    <a href={product.purchase_short_link} target="_blank" rel="noopener noreferrer" className="sf-icon-btn" aria-label="Visit vendor">
                                        <ExternalLink size={16} />
                                    </a>
                                )}
                                <button className="sf-icon-btn" onClick={() => handleRemove(product.id)} aria-label="Remove from cart">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Cart;
