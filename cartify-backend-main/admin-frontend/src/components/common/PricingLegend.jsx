import React from 'react';
import { Eye, Heart, ShoppingCart, Link2 } from 'lucide-react';

const ITEMS = [
    { key: 'cost_per_view', label: 'View', Icon: Eye },
    { key: 'cost_per_favorite', label: 'Favorite', Icon: Heart },
    { key: 'cost_per_cart_add', label: 'Cart Add', Icon: ShoppingCart },
    { key: 'cost_per_link_click', label: 'Link Click', Icon: Link2 },
];

// Reusable "what does each objective cost" strip — same look everywhere pricing
// is shown (campaign list page, create-campaign modal, ...) instead of each
// place hand-rolling its own sentence/spans.
const PricingLegend = ({ pricing, compact }) => {
    if (!pricing) return null;

    return (
        <div className={`pricing-legend${compact ? ' pricing-legend-compact' : ''}`}>
            {ITEMS.map(({ key, label, Icon }) => (
                <span key={key} className="pricing-legend-item">
                    <Icon size={13} />
                    <span className="pricing-legend-label">{label}</span>
                    <strong>{Number(pricing[key])}</strong>
                    <span className="pricing-legend-unit">cr</span>
                </span>
            ))}
        </div>
    );
};

export default PricingLegend;
