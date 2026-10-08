import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Search, Heart, ShoppingBag, MapPin, User, LogOut } from 'lucide-react';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontCart } from '../context/StorefrontCartContext';
import { feedService } from '../services/feedService';
import { useAuth } from '../../context/AuthContext';
import CityPickerModal from './CityPickerModal';
import CategoryDropdown from './CategoryDropdown';
import DashboardButton from './DashboardButton';

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { city, isCustomer, isGuest, user, isAuthenticated, canAccessDashboard, logout } = useStorefrontAuth();
    const { isAuthenticated: isAdminAuthenticated, user: adminUser } = useAuth();
    const isVendorOrAdmin = canAccessDashboard || adminUser?.role === 'ADMIN' || adminUser?.role === 'VENDOR';
    const { cartCount, favoriteCount } = useStorefrontCart();
    const [query, setQuery] = useState('');
    const [categories, setCategories] = useState([]);
    const [cityModalOpen, setCityModalOpen] = useState(false);

    useEffect(() => {
        let isMounted = true;
        feedService
            .getCategoriesAndVendors()
            .then((data) => {
                if (isMounted) setCategories(data.categories || []);
            })
            .catch(() => {
                if (isMounted) setCategories([]);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        const trimmed = query.trim();
        navigate({ pathname: '/products', search: trimmed ? `?search=${encodeURIComponent(trimmed)}` : '' });
    };

    const handleCategorySelect = (categoryId) => {
        navigate({ pathname: '/products', search: categoryId ? `?category=${encodeURIComponent(categoryId)}` : '' });
    };

    const navItems = useMemo(() => [
        { to: '/', label: 'Home' },
        { to: '/products', label: 'Products' },
    ], []);

    return (
        <>
            <header className="sf-header">
                <div className="sf-header-inner">
                    <Link to="/" className="sf-logo">
                        cart<span>ify</span>
                    </Link>

                    <form className="sf-search" onSubmit={handleSearch}>
                        <Search size={16} color="var(--sf-ink-soft)" />
                        <input
                            type="text"
                            placeholder="Search for products, brands..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </form>

                    <div className="sf-header-actions">
                        <nav className="sf-nav-links" aria-label="Storefront navigation">
                            {navItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.to === '/'}
                                    className={({ isActive }) => `sf-nav-link ${isActive ? 'active' : ''}`}
                                >
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                        <CategoryDropdown categories={categories} activeCategory={null} onSelectCategory={handleCategorySelect} />
                        <button className="sf-city-pill" onClick={() => setCityModalOpen(true)}>
                            <MapPin size={14} />
                            {city || 'Choose city'}
                        </button>

                        <Link to="/favorites" className="sf-icon-btn" aria-label="Favourites">
                            <Heart size={18} />
                            {favoriteCount > 0 && <span className="sf-badge">{favoriteCount}</span>}
                        </Link>

                        <Link to="/cart" className="sf-icon-btn" aria-label="Cart">
                            <ShoppingBag size={18} />
                            {cartCount > 0 && <span className="sf-badge">{cartCount}</span>}
                        </Link>

                        {(isAuthenticated || isAdminAuthenticated) && isVendorOrAdmin && (
                            <DashboardButton
                                userRole={user?.role || adminUser?.role}
                                canAccessDashboard={isVendorOrAdmin}
                            />
                        )}

                        {isAuthenticated && !isGuest ? (
                            <button
                                type="button"
                                className="sf-auth-btn sf-auth-btn-logout"
                                onClick={() => {
                                    logout();
                                    navigate('/');
                                }}
                            >
                                <LogOut size={15} />
                                Logout
                            </button>
                        ) : (
                            <Link to="/account" className="sf-auth-btn sf-auth-btn-login">
                                <User size={15} />
                                Login
                            </Link>
                        )}

                        {isAuthenticated && isCustomer && (
                            <Link to="/account" className="sf-account-btn">
                                <User size={15} />
                                {user?.username || 'Account'}
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <CityPickerModal isOpen={cityModalOpen} onClose={() => setCityModalOpen(false)} />
        </>
    );
};

export default Header;
