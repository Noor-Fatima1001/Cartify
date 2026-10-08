import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    ShieldCheck, LayoutDashboard, UserCheck, Store,
    Package, Users, UserX, Layers, BarChart3, Eye, Settings, LogOut, X,
    Wallet, CreditCard, Banknote, Megaphone, Crown, ShoppingCart, History, Link2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({ isMenuOpen, onToggle }) => {
    const { user, logout } = useAuth();
    const isAdmin = user?.role === 'ADMIN';
    const canAccessAnalytics = user?.analytics_permission?.can_access_analytics ?? user?.can_access_analytics ?? true;

    return (
        <aside className={`sidebar ${isMenuOpen ? 'open' : ''}`} id="sidebar">
            <button
                type="button"
                className="sidebar-close"
                onClick={onToggle}
                aria-label="Close menu"
            >
                <X size={24} />
            </button>
            <div className="sidebar-header">
                <div className="logo-container">
                    <ShieldCheck style={{ color: 'white', width: '22px', height: '22px' }} />
                </div>
                <span className="brand-name">{isAdmin ? 'Cartify Admin' : 'Vendor Panel'}</span>
            </div>
            <nav className="nav-links">
                <div className="sidebar-nav-scroller">
                    {isAdmin ? (
                        <>
                            <NavLink to="/admin/dashboard" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <LayoutDashboard /> <span>Dashboard</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/kyc" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <UserCheck /> <span>KYC Requests</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/vendors" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Store /> <span>Vendors</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/products" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Package /> <span>Products</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/customers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Users /> <span>Customers</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/guests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <UserX /> <span>Guests</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/categories" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Layers /> <span>Categories</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/scraped-links" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Link2 /> <span>Scraped Links</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <BarChart3 /> <span>Analytics</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/visitor-analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Eye /> <span>Visitor Analytics</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/topup-requests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Banknote /> <span>Top-up Requests</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/campaigns" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Megaphone /> <span>Campaigns</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/subscription-plans" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Crown /> <span>Subscription Plans</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/vendor-subscriptions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <History /> <span>Vendor Subscriptions</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/billing-reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <BarChart3 /> <span>Billing Reports</span>
                            </NavLink>
                            <NavLink to="/admin/dashboard/payment-methods" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <CreditCard /> <span>Payment Methods</span>
                            </NavLink>
                            {/* <NavLink to="/admin/dashboard/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Settings /> <span>Settings</span>
                            </NavLink> */}
                        </>
                    ) : (
                        <>
                            <NavLink to="/admin/vendor-dashboard" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <LayoutDashboard /> <span>Dashboard</span>
                            </NavLink>
                            <NavLink to="/admin/vendor-dashboard/products" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Package /> <span>My Products</span>
                            </NavLink>
                            <NavLink to="/admin/vendor-dashboard/wallet" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Wallet /> <span>Wallet</span>
                            </NavLink>
                            <NavLink to="/admin/vendor-dashboard/campaigns" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Megaphone /> <span>Campaigns</span>
                            </NavLink>
                            <NavLink to="/admin/vendor-dashboard/cart-details" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <ShoppingCart /> <span>Cart Details</span>
                            </NavLink>
                            <NavLink to="/admin/vendor-dashboard/subscription" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Crown /> <span>Subscription</span>
                            </NavLink>
                            {canAccessAnalytics && (
                                <NavLink to="/admin/vendor-dashboard/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                    <Eye /> <span>Analytics</span>
                                </NavLink>
                            )}
                            <NavLink to="/admin/vendor-dashboard/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Store /> <span>Store Profile</span>
                            </NavLink>
                            {/* <NavLink to="/admin/vendor-dashboard/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Settings /> <span>Settings</span>
                            </NavLink> */}
                        </>
                    )}
                </div>

                <button
                    onClick={logout}
                    type="button"
                    className="nav-item logout-item flex items-center gap-2 px-4 py-2 rounded-md bg-transparent hover:bg-transparent text-red-500 transition-colors duration-200"
                >
                    <LogOut
                        size={20}
                        strokeWidth={2}
                        className="shrink-0"
                    />
                    <span>Logout</span>
                </button>
            </nav>
        </aside>
    );
};

export default Sidebar;
