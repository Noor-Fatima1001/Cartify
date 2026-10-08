import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { StorefrontAuthProvider } from './context/StorefrontAuthContext';
import { StorefrontCartProvider } from './context/StorefrontCartContext';
import { StorefrontToastProvider } from './context/StorefrontToastContext';
import StorefrontLayout from './StorefrontLayout';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import SearchResults from './pages/SearchResults';
import BrandPage from './pages/BrandPage';
import Favorites from './pages/Favorites';
import Cart from './pages/Cart';
import Account from './pages/Account';

const StorefrontApp = () => {
    useEffect(() => {
        document.title = 'Cartify — Shop products near you';
    }, []);

    return (
        <StorefrontAuthProvider>
            <StorefrontToastProvider>
                <StorefrontCartProvider>
                    <Routes>
                        <Route element={<StorefrontLayout />}>
                            <Route index element={<Home />} />
                            <Route path="products" element={<Products />} />
                            <Route path="search" element={<SearchResults />} />
                            <Route path="product/:id" element={<ProductDetail />} />
                            <Route path="brand/:vendorId" element={<BrandPage />} />
                            <Route path="favorites" element={<Favorites />} />
                            <Route path="cart" element={<Cart />} />
                            <Route path="account" element={<Account />} />
                        </Route>
                    </Routes>
                </StorefrontCartProvider>
            </StorefrontToastProvider>
        </StorefrontAuthProvider>
    );
};

export default StorefrontApp;
