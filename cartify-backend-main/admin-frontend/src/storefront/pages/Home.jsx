import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useAuth } from '../../context/AuthContext';
import { feedService } from '../services/feedService';
import { brandService } from '../services/brandService';
import ProductCard from '../components/ProductCard';
import SectionRow from '../components/SectionRow';
import BrandCard from '../components/BrandCard';

const normalizeProducts = (products) => {
    if (!Array.isArray(products)) return [];
    return products.filter((product) => product.is_active !== false);
};

const Home = () => {
    const navigate = useNavigate();
    const { city, user: storefrontUser } = useStorefrontAuth();
    const { user: adminUser, isAuthenticated: isAdminAuthenticated } = useAuth();
    const activeUser = isAdminAuthenticated ? adminUser : storefrontUser;
    const vendorFilterId = activeUser?.role === 'VENDOR' ? activeUser.id : undefined;

    const [mostFavourite, setMostFavourite] = useState([]);
    const [loadingFavourite, setLoadingFavourite] = useState(true);
    const [topBrands, setTopBrands] = useState([]);
    const [loadingBrands, setLoadingBrands] = useState(true);
    const [categories, setCategories] = useState([]);
    const [heroQuery, setHeroQuery] = useState('');

    useEffect(() => {
        setLoadingFavourite(true);
        feedService
            .getFeed({ city: city || undefined, sort: '-favorite_count' })
            .then((data) => setMostFavourite(normalizeProducts(data).slice(0, 10)))
            .catch(() => setMostFavourite([]))
            .finally(() => setLoadingFavourite(false));
    }, [city, vendorFilterId]);

    useEffect(() => {
        setLoadingBrands(true);
        brandService
            .getTopVendors({ city: city || undefined, limit: 10 })
            .then((data) => setTopBrands(data.results || []))
            .catch(() => setTopBrands([]))
            .finally(() => setLoadingBrands(false));
    }, [city]);

    useEffect(() => {
        feedService
            .getCategoriesAndVendors()
            .then((data) => setCategories((data.categories || []).slice(0, 8)))
            .catch(() => setCategories([]));
    }, []);

    const handleHeroSearch = (e) => {
        e.preventDefault();
        const trimmed = heroQuery.trim();
        navigate({ pathname: '/products', search: trimmed ? `?search=${encodeURIComponent(trimmed)}` : '' });
    };

    return (
        <div className="sf-page">
            <div className="sf-hero-band">
                <div className="sf-container">
                    <div className="sf-hero-content">
                        <div className="sf-hero-eyebrow">{city ? `Now browsing ${city}` : 'Marketplace'}</div>
                        <div className="sf-hero-title">Discover great products from vendors near you</div>
                        <div className="sf-hero-sub">
                            {city
                                ? `Fresh picks and trending brands from vendors in ${city}, updated daily.`
                                : 'Choose your city to personalise your feed, or start browsing everything on offer.'}
                        </div>

                        <form className="sf-hero-search" onSubmit={handleHeroSearch}>
                            <Search size={18} />
                            <input
                                type="text"
                                value={heroQuery}
                                onChange={(e) => setHeroQuery(e.target.value)}
                                placeholder="Search for products, brands, categories..."
                                aria-label="Search products"
                            />
                            <button type="submit" className="sf-btn sf-btn-primary">Search</button>
                        </form>

                        {categories.length > 0 && (
                            <div className="sf-hero-categories">
                                <Link to="/products" className="sf-chip sf-chip-light">All products</Link>
                                {categories.map((category) => (
                                    <Link
                                        key={category.id}
                                        to={`/products?category=${category.id}`}
                                        className="sf-chip sf-chip-light"
                                    >
                                        {category.name}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <SectionRow
                title="Most Favourite"
                subtitle="Loved by shoppers like you"
                viewAllHref="/products?sort=-favorite_count"
                isEmpty={!loadingFavourite && mostFavourite.length === 0}
                emptyMessage="No favourites yet in this city. Be the first to explore what's here."
            >
                {loadingFavourite
                    ? Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="sf-card sf-card-skeleton" />
                    ))
                    : mostFavourite.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
            </SectionRow>

            <SectionRow
                title="Top Brands"
                subtitle="Vendors getting the most attention"
                viewAllHref="/products"
                isEmpty={!loadingBrands && topBrands.length === 0}
                emptyMessage="No ranked brands yet in this city."
            >
                {loadingBrands
                    ? Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="sf-skeleton sf-brand-card-skeleton" />
                    ))
                    : topBrands.map((brand) => (
                        <BrandCard key={brand.id} brand={brand} />
                    ))}
            </SectionRow>
        </div>
    );
};

export default Home;
