import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { api } from '../services/api';

const WishlistContext = createContext();

export const WishlistProvider = ({ children }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const userId = user?._id || user?.id || null;

  const fetchWishlist = useCallback(async () => {
    if (!userId) {
      setWishlistProducts([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.wishlist.getAll();
      setWishlistProducts(Array.isArray(res.wishlist) ? res.wishlist : []);
    } catch (err) {
      console.error('Failed to load wishlist:', err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const wishlistIds = useMemo(
    () => new Set(wishlistProducts.map((p) => String(p._id || p.id))),
    [wishlistProducts]
  );

  const isWishlisted = useCallback(
    (productId) => {
      if (!productId) return false;
      return wishlistIds.has(String(productId));
    },
    [wishlistIds]
  );

  const toggleWishlist = useCallback(
    async (productId, productObj = null) => {
      if (!userId) {
        showToast('Please sign in to save items to your wishlist.', 'info');
        navigate('/login');
        return false;
      }
      if (!productId) return false;

      const idStr = String(productId);
      const currentlyWishlisted = wishlistIds.has(idStr);
      const previous = wishlistProducts;

      // Optimistic update
      if (currentlyWishlisted) {
        setWishlistProducts((prev) => prev.filter((p) => String(p._id || p.id) !== idStr));
      } else if (productObj) {
        setWishlistProducts((prev) => [productObj, ...prev]);
      } else {
        setWishlistProducts((prev) => [{ _id: idStr }, ...prev]);
      }

      try {
        const res = await api.wishlist.toggle(idStr);
        if (Array.isArray(res.wishlist)) {
          setWishlistProducts(res.wishlist);
        }
        showToast(
          res.wishlisted ? 'Added to wishlist' : 'Removed from wishlist',
          res.wishlisted ? 'success' : 'info'
        );
        return res.wishlisted;
      } catch (err) {
        setWishlistProducts(previous);
        showToast(err.message || 'Failed to update wishlist.', 'error');
        return currentlyWishlisted;
      }
    },
    [userId, wishlistIds, wishlistProducts, navigate, showToast]
  );

  const removeFromWishlist = useCallback(
    async (productId) => {
      if (!userId || !productId) return;
      const idStr = String(productId);
      const previous = wishlistProducts;

      setWishlistProducts((prev) => prev.filter((p) => String(p._id || p.id) !== idStr));

      try {
        const res = await api.wishlist.remove(idStr);
        if (Array.isArray(res.wishlist)) {
          setWishlistProducts(res.wishlist);
        }
        showToast('Removed from wishlist', 'info');
      } catch (err) {
        setWishlistProducts(previous);
        showToast(err.message || 'Failed to remove from wishlist.', 'error');
      }
    },
    [userId, wishlistProducts, showToast]
  );

  const value = useMemo(
    () => ({
      wishlistProducts,
      wishlistIds,
      wishlistCount: wishlistProducts.length,
      loading,
      isWishlisted,
      toggleWishlist,
      removeFromWishlist,
      refreshWishlist: fetchWishlist,
    }),
    [wishlistProducts, wishlistIds, loading, isWishlisted, toggleWishlist, removeFromWishlist, fetchWishlist]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => useContext(WishlistContext);

