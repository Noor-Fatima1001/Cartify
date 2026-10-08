import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useAuth } from '../../context/AuthContext';

const DashboardLayout = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { user } = useAuth();
    const navigate = useNavigate();

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const handleCreateVendor = () => {
        if (user?.role === 'ADMIN') {
            navigate('/admin/dashboard/vendors?modal=create');
        }
    };

    const handleAddProduct = () => {
        if (user?.role === 'ADMIN') {
            navigate('/admin/dashboard/products?modal=add');
        } else {
            navigate('/admin/vendor-dashboard/products?modal=add');
        }
    };

    return (
        <div className="app-shell">
            <Sidebar isMenuOpen={isMenuOpen} onToggle={toggleMenu} />
            <main className={`main-content ${isMenuOpen ? 'shifted' : ''}`}>
                <Navbar
                    toggleMenu={toggleMenu}
                    onCreateVendor={handleCreateVendor}
                    onAddProduct={handleAddProduct}
                />
                <Outlet />
            </main>
        </div>
    );
};

export default DashboardLayout;
