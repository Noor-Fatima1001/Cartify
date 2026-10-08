import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const CategoryDropdown = ({ categories, activeCategory, onSelectCategory }) => {
    const [open, setOpen] = useState(false);
    const selectedName = useMemo(() => {
        if (!activeCategory) return 'Categories';
        const match = categories.find((category) => String(category.id) === String(activeCategory));
        return match?.name || 'Categories';
    }, [activeCategory, categories]);

    return (
        <div className="sf-category-dropdown">
            <button className="sf-category-trigger" onClick={() => setOpen((value) => !value)}>
                <span>{selectedName}</span>
                <ChevronDown size={16} />
            </button>
            {open && (
                <div className="sf-category-menu">
                    <button
                        className={!activeCategory ? 'active' : ''}
                        onClick={() => {
                            onSelectCategory(null);
                            setOpen(false);
                        }}
                    >
                        All categories
                    </button>
                    {categories.map((category) => (
                        <button
                            key={category.id}
                            className={String(activeCategory) === String(category.id) ? 'active' : ''}
                            onClick={() => {
                                onSelectCategory(String(category.id));
                                setOpen(false);
                            }}
                        >
                            {category.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CategoryDropdown;
