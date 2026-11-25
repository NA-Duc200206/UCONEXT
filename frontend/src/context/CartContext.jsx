import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const { user, updateUser } = useAuth();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const hydratedUserIdRef = useRef(undefined);

  const currentUserId = user?.id || user?._id || null;

  // Immutably merge guest cart into database cart while respecting item stock caps
  const mergeCarts = (localCart, dbCart) => {
    const merged = (dbCart || []).map((item) => ({ ...item }));

    (localCart || []).forEach((localItem) => {
      if (!localItem?.productId) return;
      const matchIndex = merged.findIndex(
        (item) =>
          String(item.productId) === String(localItem.productId) &&
          (item.color || null) === (localItem.color || null) &&
          (item.size || null) === (localItem.size || null)
      );

      if (matchIndex > -1) {
        const existing = merged[matchIndex];
        const maxStock =
          typeof localItem.stock === 'number'
            ? localItem.stock
            : typeof existing.stock === 'number'
              ? existing.stock
              : undefined;
        const combinedQty = (Number(existing.quantity) || 1) + (Number(localItem.quantity) || 1);
        merged[matchIndex] = {
          ...existing,
          stock: maxStock,
          quantity: typeof maxStock === 'number' && maxStock > 0 ? Math.min(combinedQty, maxStock) : combinedQty,
        };
      } else {
        merged.push({ ...localItem });
      }
    });

    return merged;
  };

  // Only re-hydrate cart when the authenticated user identity actually changes
  useEffect(() => {
    if (hydratedUserIdRef.current === currentUserId) {
      return;
    }
    hydratedUserIdRef.current = currentUserId;

    const loadCart = async () => {
      setLoading(true);
      if (currentUserId && user) {
        let guestCart = [];
        try {
          const guestCartStr = localStorage.getItem('cart_guest');
          guestCart = guestCartStr ? JSON.parse(guestCartStr) : [];
        } catch {
          guestCart = [];
        }

        const userCart = Array.isArray(user.cart) ? user.cart : [];

        if (guestCart.length > 0) {
          // Clear guest storage immediately to prevent duplicate merges on rapid re-renders
          localStorage.removeItem('cart_guest');
          const merged = mergeCarts(guestCart, userCart);
          setCart(merged);
          updateUser({ cart: merged });
          try {
            await api.auth.syncCart(merged);
          } catch (err) {
            console.error('Failed to sync merged cart to backend:', err.message);
          }
        } else {
          setCart(userCart);
        }
      } else {
        try {
          const guestCartStr = localStorage.getItem('cart_guest');
          setCart(guestCartStr ? JSON.parse(guestCartStr) : []);
        } catch {
          setCart([]);
        }
      }
      setLoading(false);
    };

    loadCart();
  }, [currentUserId, user, updateUser]);

  const updateCartStateAndSync = async (newCart) => {
    setCart(newCart);
    if (currentUserId) {
      updateUser({ cart: newCart });
      try {
        await api.auth.syncCart(newCart);
      } catch (err) {
        console.error('Failed to sync cart to backend:', err.message);
      }
    } else {
      localStorage.setItem('cart_guest', JSON.stringify(newCart));
    }
  };

  const addToCart = (product, quantity = 1, color = null, size = null) => {
    const resolvedId = product?.id || product?._id;
    if (!resolvedId) return;

    const requestedQty = Math.max(1, parseInt(quantity, 10) || 1);
    const maxStock = typeof product?.stock === 'number' ? product.stock : undefined;
    if (typeof maxStock === 'number' && maxStock <= 0) return;

    const normalizedColor = color || null;
    const normalizedSize = size || null;

    const newCart = cart.map((item) => ({ ...item }));
    const matchIndex = newCart.findIndex(
      (item) =>
        String(item.productId) === String(resolvedId) &&
        (item.color || null) === normalizedColor &&
        (item.size || null) === normalizedSize
    );

    if (matchIndex > -1) {
      const nextQty = newCart[matchIndex].quantity + requestedQty;
      const effectiveMax = typeof maxStock === 'number' ? maxStock : newCart[matchIndex].stock;
      newCart[matchIndex].quantity =
        typeof effectiveMax === 'number' ? Math.min(nextQty, effectiveMax) : nextQty;
      if (typeof maxStock === 'number') {
        newCart[matchIndex].stock = maxStock;
      }
    } else {
      newCart.push({
        productId: resolvedId,
        name: product.name,
        price: parseFloat(product.price) || 0,
        image: product.image,
        stock: maxStock,
        quantity: typeof maxStock === 'number' ? Math.min(requestedQty, maxStock) : requestedQty,
        color: normalizedColor,
        size: normalizedSize,
      });
    }

    return updateCartStateAndSync(newCart);
  };

  const removeFromCart = (productId, color = null, size = null) => {
    const normalizedColor = color || null;
    const normalizedSize = size || null;
    const newCart = cart.filter(
      (item) =>
        !(
          String(item.productId) === String(productId) &&
          (item.color || null) === normalizedColor &&
          (item.size || null) === normalizedSize
        )
    );
    return updateCartStateAndSync(newCart);
  };

  const updateQuantity = (productId, quantity, color = null, size = null) => {
    if (quantity <= 0) {
      return removeFromCart(productId, color, size);
    }
    const normalizedColor = color || null;
    const normalizedSize = size || null;
    const newCart = cart.map((item) => {
      if (
        String(item.productId) === String(productId) &&
        (item.color || null) === normalizedColor &&
        (item.size || null) === normalizedSize
      ) {
        const cappedQty =
          typeof item.stock === 'number' && item.stock > 0 ? Math.min(quantity, item.stock) : quantity;
        return { ...item, quantity: cappedQty };
      }
      return item;
    });
    return updateCartStateAndSync(newCart);
  };

  const clearCart = () => {
    return updateCartStateAndSync([]);
  };

  const restoreCartIfEmpty = async (snapshotItems) => {
    if (!Array.isArray(snapshotItems) || snapshotItems.length === 0) return;
    if (cart.length > 0) return;
    await updateCartStateAndSync(snapshotItems);
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const getCartItemsCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        loading,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        restoreCartIfEmpty,
        getCartTotal,
        getCartItemsCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
