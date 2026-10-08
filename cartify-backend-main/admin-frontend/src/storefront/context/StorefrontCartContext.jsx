import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { cartService } from '../services/cartService';
import { favoriteService } from '../services/favoriteService';

const StorefrontCartContext = createContext();

export const useStorefrontCart = () => useContext(StorefrontCartContext);

export const StorefrontCartProvider = ({ children }) => {
    const [cartCount, setCartCount] = useState(0);
    const [favoriteCount, setFavoriteCount] = useState(0);

    const refreshCounts = useCallback(async () => {
        try {
            const [cart, favorites] = await Promise.all([cartService.getCart(), favoriteService.list()]);
            setCartCount(cart.total_items || 0);
            setFavoriteCount(favorites.total_items || 0);
        } catch (e) {
            // Fail silently — badges just stay at their last known value.
        }
    }, []);

    useEffect(() => {
        refreshCounts();
    }, [refreshCounts]);

    const addToCart = useCallback(async (productId) => {
        await cartService.add(productId);
        refreshCounts();
    }, [refreshCounts]);

    const removeFromCart = useCallback(async (productId) => {
        await cartService.remove(productId);
        refreshCounts();
    }, [refreshCounts]);

    const toggleFavorite = useCallback(async (productId) => {
        const result = await favoriteService.toggle(productId);
        refreshCounts();
        return result;
    }, [refreshCounts]);

    const value = { cartCount, favoriteCount, refreshCounts, addToCart, removeFromCart, toggleFavorite };

    return (
        <StorefrontCartContext.Provider value={value}>
            {children}
        </StorefrontCartContext.Provider>
    );
};
