import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const DashboardButton = ({ userRole: propUserRole, canAccessDashboard: propCanAccessDashboard }) => {
    const { user, isAuthenticated } = useAuth();
    const location = useLocation();
    const userRole = propUserRole ?? user?.role;
    const canAccessDashboard = propCanAccessDashboard ?? (isAuthenticated && (userRole === 'ADMIN' || userRole === 'VENDOR'));

    if (!canAccessDashboard) return null;

    const to = userRole === 'ADMIN' ? '/admin/dashboard' : '/admin/vendor-dashboard';
    const isActive = location.pathname.startsWith('/admin');

    return (
        <Link to={to} className={`sf-dashboard-btn ${isActive ? 'active' : ''}`}>
            Dashboard
        </Link>
    );
};

export default DashboardButton;
