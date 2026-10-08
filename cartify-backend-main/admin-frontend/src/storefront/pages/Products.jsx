import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useAuth } from '../../context/AuthContext';
import { feedService } from '../services/feedService';
import { brandService } from '../services/brandService';
import CategoryFilterBar from '../components/CategoryFilterBar';
import ProductGrid from '../components/ProductGrid';
import ActiveFilters from '../components/ActiveFilters';
import BrandFilter from '../components/BrandFilter';
import SearchBar from '../components/SearchBar';

const PAGE_SIZE = 12;

const normalizeProducts = (products) => {
    if (!Array.isArray(products)) return [];
    return products.filter((product) => product.is_active !== false);
};

const Products = () => {
    const { city, user: storefrontUser } = useStorefrontAuth();
    const { user: adminUser, isAuthenticated: isAdminAuthenticated } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeUser = isAdminAuthenticated ? adminUser : storefrontUser;
    const vendorFilterId = activeUser?.role === 'VENDOR' ? activeUser.id : undefined;

    const [categories, setCategories] = useState([]);
    const [brands, setBrands] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || null);
    const [activeBrand, setActiveBrand] = useState(searchParams.get('brand') || null);
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [sort, setSort] = useState(searchParams.get('sort') || '');
    const [page, setPage] = useState(Number(searchParams.get('page') || 1));

    useEffect(() => {
        const nextCategory = searchParams.get('category') || null;
        const nextBrand = searchParams.get('brand') || null;
        const nextSearch = searchParams.get('search') || '';
        const nextSort = searchParams.get('sort') || '';
        const nextPage = Number(searchParams.get('page') || 1);

        setActiveCategory(nextCategory);
        setActiveBrand(nextBrand);
        setSearchQuery(nextSearch);
        setSort(nextSort);
        setPage(Number.isNaN(nextPage) ? 1 : nextPage);
    }, [searchParams]);

    useEffect(() => {
        let isMounted = true;
        feedService.getCategoriesAndVendors()
            .then((data) => {
                if (!isMounted) return;
                setCategories(data.categories || []);
                setBrands(data.vendors || []);
            })
            .catch(() => {
                if (isMounted) {
                    setCategories([]);
                    setBrands([]);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setLoading(true);
            feedService
                .getFeed({
                    city: city || undefined,
                    search: searchQuery.trim() || undefined,
                    category: activeCategory || undefined,
                    vendor: vendorFilterId || (storefrontUser?.role === 'VENDOR' ? storefrontUser.id : activeBrand || undefined),
                    sort: sort || undefined,
                })
                .then((data) => setAllProducts(normalizeProducts(data)))
                .catch(() => setAllProducts([]))
                .finally(() => setLoading(false));
        }, 250);

        return () => window.clearTimeout(timer);
    }, [city, activeCategory, activeBrand, searchQuery, sort, vendorFilterId, storefrontUser?.id, storefrontUser?.role]);

    useEffect(() => {
        brandService
            .getTopVendors({ city: city || undefined, limit: 10 })
            .then((data) => setBrands((prev) => prev.length > 0 ? prev : data.results || []))
            .catch(() => setBrands([]));
    }, [city]);

    useEffect(() => {
        setPage(1);
        const next = new URLSearchParams(searchParams);
        next.delete('page');
        setSearchParams(next, { replace: true });
    }, [activeCategory, activeBrand, searchQuery, sort]);

    const applyFilters = (updates) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(updates).forEach(([key, value]) => {
            if (value) next.set(key, value);
            else next.delete(key);
        });
        next.delete('page');
        setSearchParams(next, { replace: true });
    };

    const activeFilters = useMemo(() => {
        const filters = [];
        if (searchQuery.trim()) {
            filters.push({ type: 'search', value: searchQuery, label: `Search: ${searchQuery}` });
        }
        if (activeCategory) {
            const matchingCategory = categories.find((category) => String(category.id) === String(activeCategory));
            filters.push({ type: 'category', value: activeCategory, label: matchingCategory?.name || 'Category' });
        }
        if (activeBrand) {
            const matchingBrand = brands.find((brand) => String(brand.id) === String(activeBrand));
            filters.push({ type: 'brand', value: activeBrand, label: matchingBrand?.brand_name || matchingBrand?.username || 'Brand' });
        }
        if (sort) {
            const sortLabel = sort === '-favorite_count'
                ? 'Most favourited'
                : sort === 'price'
                    ? 'Price: low to high'
                    : sort === '-price'
                        ? 'Price: high to low'
                        : 'Newest';
            filters.push({ type: 'sort', value: sort, label: sortLabel });
        }
        return filters;
    }, [activeBrand, activeCategory, brands, categories, searchQuery, sort]);

    const totalPages = Math.max(1, Math.ceil(allProducts.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * PAGE_SIZE;
    const visibleProducts = allProducts.slice(startIndex, startIndex + PAGE_SIZE);

    const handlePageChange = (nextPage) => {
        const next = new URLSearchParams(searchParams);
        next.set('page', String(nextPage));
        setSearchParams(next, { replace: true });
    };

    const handleRemoveFilter = (filter) => {
        if (filter.type === 'search') applyFilters({ search: null });
        if (filter.type === 'category') applyFilters({ category: null });
        if (filter.type === 'brand') applyFilters({ brand: null });
        if (filter.type === 'sort') applyFilters({ sort: null });
    };

    const renderPagination = () => {
        if (totalPages <= 1) return null;
        const pages = [];
        const rangeStart = Math.max(1, safePage - 1);
        const rangeEnd = Math.min(totalPages, safePage + 1);

        for (let index = rangeStart; index <= rangeEnd; index += 1) {
            pages.push(
                <button
                    key={index}
                    type="button"
                    className={`sf-page-btn ${safePage === index ? 'active' : ''}`}
                    onClick={() => handlePageChange(index)}
                >
                    {index}
                </button>
            );
        }

        return (
            <div className="sf-pagination-wrap">
                <div className="sf-pagination">
                    <button type="button" className="sf-page-btn" disabled={safePage === 1} onClick={() => handlePageChange(Math.max(1, safePage - 1))}>
                        Previous
                    </button>
                    {pages}
                    <button type="button" className="sf-page-btn" disabled={safePage === totalPages} onClick={() => handlePageChange(Math.min(totalPages, safePage + 1))}>
                        Next
                    </button>
                </div>
                <div className="sf-pagination-summary">Page {safePage} of {totalPages}</div>
            </div>
        );
    };

    return (
        <div className="sf-page">
            <div className="sf-container sf-hero" style={{ paddingTop: 48 }}>
                <div className="sf-hero-title">Browse products with filters, search, and quick access to your favourites</div>
                <div className="sf-hero-sub">
                    {city ? `Showing refreshed results for ${city}` : 'Choose your city to tailor the products you see'}
                </div>
            </div>

            <div className="sf-container sf-toolbar">
                <SearchBar
                    value={searchQuery}
                    onChange={(value) => applyFilters({ search: value })}
                    onClear={() => applyFilters({ search: null })}
                    placeholder="Search products or brands"
                />
                <CategoryFilterBar
                    categories={categories}
                    activeCategory={activeCategory}
                    onSelectCategory={(value) => applyFilters({ category: value })}
                    sort={sort}
                    onSortChange={(value) => applyFilters({ sort: value })}
                />
            </div>

            <div className="sf-container">
                <BrandFilter brands={brands} activeBrand={activeBrand} onSelectBrand={(value) => applyFilters({ brand: value })} />
                {activeFilters.length > 0 && (
                    <ActiveFilters
                        filters={activeFilters}
                        onRemove={handleRemoveFilter}
                        onClearAll={() => setSearchParams({}, { replace: true })}
                    />
                )}
            </div>

            <section className="sf-section">
                <div className="sf-container">
                    <div className="sf-section-head">
                        <div>
                            <div className="sf-section-title">Products</div>
                            <div className="sf-section-sub">
                                {loading
                                    ? 'Searching...'
                                    : allProducts.length === 0
                                        ? 'Explore the full catalog near you'
                                        : `${allProducts.length} product${allProducts.length === 1 ? '' : 's'} found${city ? ` in ${city}` : ''}`}
                            </div>
                        </div>
                    </div>
                    {loading ? (
                        <div className="sf-grid sf-grid-skeleton">
                            {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                                <div key={index} className="sf-card sf-card-skeleton" />
                            ))}
                        </div>
                    ) : visibleProducts.length === 0 ? (
                        <div className="sf-empty-state">
                            <Search size={28} />
                            <div className="sf-empty-state-title">No products matched your filters</div>
                            <div className="sf-empty-state-sub">Try a different search term or clear your filters to see everything.</div>
                            {activeFilters.length > 0 && (
                                <button
                                    type="button"
                                    className="sf-btn sf-btn-dark"
                                    onClick={() => setSearchParams({}, { replace: true })}
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <ProductGrid products={visibleProducts} />
                            {renderPagination()}
                        </>
                    )}
                </div>
            </section>
        </div>
    );
};

export default Products;
