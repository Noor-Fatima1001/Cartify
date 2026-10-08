import React from 'react';
import { X, Plus } from 'lucide-react';

export const CAMPAIGN_OBJECTIVES = [
    { key: 'views', label: 'Views' },
    { key: 'favorites', label: 'Favorites' },
    { key: 'cart_adds', label: 'Cart Adds' },
    { key: 'link_clicks', label: 'Link Clicks' },
];

// Extracted from VendorCampaignDetail (was duplicated inline there and used
// for both its Edit and Duplicate modals). Two sections: products already in
// the campaign (with per-objective checkboxes + remove), and — when `onAdd`
// is passed — a second list of products still available to add.
const ProductPicker = ({ selected, available, onToggleObjective, onRemove, onAdd, emptyAvailableLabel, objectives = CAMPAIGN_OBJECTIVES }) => (
    <>
        <div>
            <label style={{ fontWeight: 600 }}>In This Campaign ({selected.length})</label>
            <div className="product-picker" style={{ marginTop: '0.4rem' }}>
                {selected.length === 0 && (
                    <p className="product-picker-empty">No products selected — add at least one below.</p>
                )}
                {selected.map(({ product: p, objectives: selObjectives }) => (
                    <div key={p.id} className={`product-picker-item selected${p.is_active === false ? ' inactive' : ''}`}>
                        <span className="product-picker-name">
                            {p.name}{p.is_active === false ? ' (inactive)' : ''}
                        </span>
                        <div className="product-picker-objectives">
                            {objectives.map((obj) => (
                                <label key={obj.key}>
                                    <input
                                        type="checkbox"
                                        checked={!!selObjectives?.[obj.key]}
                                        onChange={() => onToggleObjective(p.id, obj.key)}
                                    />
                                    {obj.label}
                                </label>
                            ))}
                            {onRemove && (
                                <button type="button" className="btn-remove-inline" onClick={() => onRemove(p.id)} title="Remove from campaign">
                                    <X size={14} /> Remove
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {onAdd && (
            <div>
                <label style={{ fontWeight: 600 }}>Add More Products</label>
                <div className="product-picker" style={{ maxHeight: 180, marginTop: '0.4rem' }}>
                    {available.length === 0 && (
                        <p className="product-picker-empty">{emptyAvailableLabel}</p>
                    )}
                    {available.map((p) => (
                        <div key={p.id} className={`product-picker-item${p.is_active === false ? ' inactive' : ''}`}>
                            <span style={{ fontSize: '0.88rem' }}>{p.name}{p.is_active === false ? ' (inactive)' : ''}</span>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAdd(p.id)}>
                                <Plus size={14} /> Add
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </>
);

export default ProductPicker;
