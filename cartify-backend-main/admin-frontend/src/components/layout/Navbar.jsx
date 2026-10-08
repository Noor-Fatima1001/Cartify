import React, { useEffect, useState } from 'react';
import { Menu, Plus, PackagePlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../common/NotificationBell';

const Navbar = ({ toggleMenu, onCreateVendor, onAddProduct }) => {
    const [currentDate, setCurrentDate] = useState('');
    const { user } = useAuth();

    useEffect(() => {
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        setCurrentDate(new Date().toLocaleDateString(undefined, dateOptions));
    }, []);

    return (
        <div className="dash-topbar">
            <div className="dash-topbar-left">
                <button type="button" className="menu-toggle" onClick={toggleMenu}>
                    <Menu size={18} />
                </button>
                <div>
                    <div className="dash-topbar-title">{user?.role === 'ADMIN' ? 'Admin Dashboard' : 'Vendor Dashboard'}</div>
                    <div className="dash-topbar-date">{currentDate}</div>
                </div>
            </div>

            <div className="dash-topbar-actions">
                <NotificationBell />
                {user?.role === 'ADMIN' && (
                    <button type="button" className="dash-btn dash-btn-primary" onClick={onCreateVendor}>
                        <Plus size={18} /> <span>Create Vendor</span>
                    </button>
                )}
                <button type="button" className="dash-btn dash-btn-secondary" onClick={onAddProduct}>
                    <PackagePlus size={18} /> <span>Add Product</span>
                </button>
            </div>
        </div>
    );
};

export default Navbar;
