import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, Check, ArrowRight, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import {
  formatVND,
  translateCategoryName,
  getSafeImageUrl,
  handleImageError,
} from '../utils/formatters';

const Wishlist = () => {
  const { user } = useAuth();
  const { wishlistProducts, loading, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();
  const { isDark } = useTheme();
  const [addedIds, setAddedIds] = useState({});
  const timersRef = useRef({});

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleAddToCart = (product) => {
    if (product.stock === 0) return;
    const id = String(product._id || product.id);
    const defaultColor = product.options?.colors?.length > 0 ? product.options.colors[0] : null;
    const defaultSize = product.options?.sizes?.length > 0 ? product.options.sizes[0] : null;
    addToCart(product, 1, defaultColor, defaultSize);

    setAddedIds((prev) => ({ ...prev, [id]: true }));
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [id]: false }));
    }, 1500);
  };

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 140px)',
        paddingTop: '104px',
        paddingBottom: '80px',
        background: 'var(--bg-primary)',
      }}
    >
      <style>{`
        .wishlist-container {
          max-width: 1560px;
          margin: 0 auto;
          padding: 0 48px;
        }
        .wishlist-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 20px;
        }
        @media (max-width: 1200px) {
          .wishlist-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 900px) {
          .wishlist-container {
            padding: 0 28px;
          }
          .wishlist-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 560px) {
          .wishlist-container {
            padding: 0 16px;
          }
          .wishlist-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="wishlist-container">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '32px',
            paddingBottom: '20px',
            borderBottom: '1px solid var(--glass-border)',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: isDark ? '#93c5fd' : '#2454F4',
                marginBottom: '8px',
              }}
            >
              <Heart size={14} strokeWidth={1.75} />
              <span>Saved Collection</span>
            </div>
            <h1
              style={{
                fontSize: 'clamp(26px, 3vw, 34px)',
                fontWeight: '800',
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              My Wishlist
            </h1>
          </div>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontSize: '13.5px',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                  padding: '8px 14px',
                  borderRadius: '999px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                {wishlistProducts.length} {wishlistProducts.length === 1 ? 'item' : 'items'} saved
              </span>
              <Link
                to="/products"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: '#2454F4',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: '700',
                  textDecoration: 'none',
                }}
              >
                <span>Explore Catalog</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>

        {/* Guest State */}
        {!user ? (
          <div
            style={{
              maxWidth: '520px',
              margin: '60px auto',
              padding: '40px 32px',
              borderRadius: '20px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              textAlign: 'center',
            }}
          >
            <div className="ui-empty-icon">
              <Heart size={26} strokeWidth={1.6} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 10px' }}>
              Sign in to view your Wishlist
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 24px' }}>
              Save your favorite products across devices and access them anytime.
            </p>
            <Link
              to="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: '12px',
                background: '#2454F4',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              <LogIn size={16} />
              <span>Sign In</span>
            </Link>
          </div>
        ) : loading && wishlistProducts.length === 0 ? (
          <div className="wishlist-grid">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                style={{
                  height: '380px',
                  borderRadius: '16px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--glass-border)',
                }}
              />
            ))}
          </div>
        ) : wishlistProducts.length === 0 ? (
          <div
            style={{
              maxWidth: '520px',
              margin: '60px auto',
              padding: '44px 32px',
              borderRadius: '20px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              textAlign: 'center',
            }}
          >
            <div className="ui-empty-icon">
              <Heart size={26} strokeWidth={1.6} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 10px' }}>
              Your wishlist is empty
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 24px' }}>
              Tap the heart icon on any product in the store to save it here for later.
            </p>
            <Link
              to="/products"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: '12px',
                background: '#2454F4',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              <span>Browse Products</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="wishlist-grid">
            {wishlistProducts.map((product) => {
              const id = String(product._id || product.id);
              const isAdded = Boolean(addedIds[id]);
              const isOutOfStock = product.stock === 0;
              const categoryName = translateCategoryName(
                product.categoryId?.name || product.category?.name || product.category || 'Featured'
              );

              return (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '16px',
                    padding: '14px',
                    background: isDark ? 'rgba(18, 22, 36, 0.72)' : '#ffffff',
                    border: '1px solid var(--glass-border)',
                    transition: 'transform 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  <Link
                    to={`/product/${id}`}
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      background: 'var(--bg-secondary)',
                      marginBottom: '14px',
                      display: 'block',
                    }}
                  >
                    <img
                      src={getSafeImageUrl(product.image)}
                      alt={product.name}
                      loading="lazy"
                      onError={handleImageError}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                    {isOutOfStock && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '10px',
                          left: '10px',
                          background: 'rgba(15, 23, 42, 0.88)',
                          color: '#f87171',
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '4px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        OUT OF STOCK
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeFromWishlist(id);
                      }}
                      title="Remove from wishlist"
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        border: '1px solid var(--glass-border)',
                        background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.92)',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </Link>

                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#2454F4',
                      marginBottom: '4px',
                    }}
                  >
                    {categoryName}
                  </span>

                  <Link
                    to={`/product/${id}`}
                    style={{
                      fontSize: '15px',
                      fontWeight: '700',
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      lineHeight: '1.35',
                      marginBottom: '10px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {product.name}
                  </Link>

                  <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: '800',
                        color: 'var(--text-primary)',
                        marginBottom: '12px',
                      }}
                    >
                      {formatVND(product.price)}
                    </div>

                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => handleAddToCart(product)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isOutOfStock
                          ? 'var(--bg-secondary)'
                          : isAdded
                          ? '#10b981'
                          : '#2454F4',
                        color: isOutOfStock ? 'var(--text-muted)' : '#ffffff',
                        fontSize: '13.5px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      {isOutOfStock ? (
                        <span>Out of Stock</span>
                      ) : isAdded ? (
                        <>
                          <Check size={16} strokeWidth={2.5} />
                          <span>Added to Cart</span>
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={16} />
                          <span>Add to Cart</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wishlist;

