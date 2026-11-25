import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { ShoppingCart, Star, Heart, Eye, Check } from 'lucide-react';
import { formatVND, translateCategoryName, getSafeImageUrl, handleImageError } from '../utils/formatters';

const ProductCard = ({ product }) => {
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const [isHovered, setIsHovered] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const timerRef = useRef(null);
  const productId = product._id || product.id;
  const wishlisted = isWishlisted(productId);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const formattedPrice = formatVND(product.price);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultColor = product.options?.colors?.length > 0 ? product.options.colors[0] : null;
    const defaultSize = product.options?.sizes?.length > 0 ? product.options.sizes[0] : null;
    addToCart(product, 1, defaultColor, defaultSize);
    setIsAdded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsAdded(false), 1400);
  };

  const hasDiscount = Boolean(product.originalPrice && product.originalPrice > product.price);
  const discountPercent = hasDiscount 
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) 
    : 0;

  const hasRating = typeof product.rating === 'number' && product.rating > 0;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Link 
        to={`/product/${product._id || product.id}`} 
        className="product-card-hover" 
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: '400px',
          padding: '16px',
          position: 'relative',
          borderRadius: 'var(--radius-lg, 20px)',
          background: 'var(--glass-bg)',
          border: '1px solid',
          borderColor: isHovered ? 'var(--brand, #2454F4)' : 'var(--glass-border)',
          transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
          boxShadow: isHovered ? '0 20px 40px -10px rgba(36, 84, 244, 0.18)' : '0 8px 24px -10px rgba(0,0,0,0.08)',
          zIndex: isHovered ? 10 : 1
        }}
      >
        {/* Product Image Container */}
        <div style={{
          borderRadius: 'var(--radius-md, 14px)',
          overflow: 'hidden',
          position: 'relative',
          paddingTop: '100%', // 1:1 Aspect Ratio
          marginBottom: '16px',
          background: 'var(--bg-secondary)'
        }}>
          <img 
            src={getSafeImageUrl(product.image)} 
            alt={product.name} 
            loading="lazy"
            onError={handleImageError}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: isHovered ? 'scale(1.06)' : 'scale(1)'
            }}
          />
          
          {/* Badges */}
          <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 2 }}>
            {hasDiscount && (
              <span style={{
                background: '#0f172a', color: '#ffffff', fontSize: '11px', fontWeight: '700',
                padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.02em'
              }}>
                -{discountPercent}%
              </span>
            )}
            {product.stock === 0 && (
              <span style={{
                background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '700',
                padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--glass-border)', letterSpacing: '0.04em'
              }}>
                OUT OF STOCK
              </span>
            )}
          </div>

          {/* Hover Action Buttons */}
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '0',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            opacity: isHovered || wishlisted ? 1 : 0,
            transform: isHovered || wishlisted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 3
          }}>
            <button
              type="button"
              title={wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleWishlist(productId, product);
              }}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'var(--glass-bg)', backdropFilter: 'blur(8px)',
                border: wishlisted ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--glass-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: wishlisted ? 'var(--color-error)' : 'var(--text-primary)', cursor: 'pointer',
                transition: 'color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-error)';
                e.currentTarget.style.borderColor = 'var(--color-error)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = wishlisted ? 'var(--color-error)' : 'var(--text-primary)';
                e.currentTarget.style.borderColor = wishlisted ? 'rgba(239, 68, 68, 0.5)' : 'var(--glass-border)';
              }}
            >
              <Heart size={15} fill={wishlisted ? '#ef4444' : 'none'} />
            </button>
            <span
              title="View Details"
              aria-hidden="true"
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'var(--glass-bg)', backdropFilter: 'blur(8px)',
                border: '1px solid var(--glass-border)',
                display: isHovered ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-primary)', cursor: 'pointer',
                transition: 'color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              <Eye size={15} />
            </span>
          </div>
        </div>

        <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <span style={{ fontSize: '11px', color: 'var(--brand)', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
            {translateCategoryName(product.category?.name || product.category || 'Featured')}
          </span>

          <h3 style={{
            fontSize: '15px',
            fontWeight: '700',
            marginBottom: '8px',
            lineHeight: '1.4',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            color: 'var(--text-primary)'
          }}>
            {product.name}
          </h3>

          {hasRating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const isFilled = i < Math.floor(product.rating);
                  return (
                    <Star 
                      key={i} 
                      size={13} 
                      fill={isFilled ? '#f59e0b' : 'none'} 
                      color={isFilled ? '#f59e0b' : 'var(--glass-border)'} 
                    />
                  );
                })}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                {product.rating.toFixed(1)} {product.reviewCount ? `(${product.reviewCount})` : ''}
              </span>
            </div>
          )}

          {/* Footer Info & Action */}
          <div style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: '12px',
            borderTop: '1px solid var(--glass-border)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {hasDiscount && (
                <span style={{ fontSize: '11px', textDecoration: 'line-through', color: 'var(--text-muted)', marginBottom: '2px' }}>
                  {formatVND(product.originalPrice)}
                </span>
              )}
              <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {formattedPrice}
              </span>
            </div>
            
            {product.stock > 0 && (
              <button 
                onClick={handleAddToCart}
                style={{
                  width: isAdded ? 'auto' : '38px',
                  minWidth: '38px',
                  height: '38px',
                  padding: isAdded ? '0 10px' : '0',
                  borderRadius: '10px',
                  background: isAdded ? 'var(--color-success)' : isHovered ? 'var(--brand)' : 'var(--glass-bg)',
                  color: isAdded || isHovered ? '#ffffff' : 'var(--text-primary)',
                  border: '1px solid',
                  borderColor: isAdded ? 'var(--color-success)' : isHovered ? 'transparent' : 'var(--glass-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
                  boxShadow: isAdded
                    ? '0 6px 16px rgba(16, 185, 129, 0.3)'
                    : isHovered
                    ? '0 6px 16px rgba(36, 84, 244, 0.3)'
                    : 'none',
                  transform: isAdded ? 'scale(1.05)' : 'scale(1)',
                  flexShrink: 0
                }}
                title={isAdded ? 'Added to cart' : 'Add to cart'}
              >
                {isAdded ? (
                  <>
                    <Check size={15} strokeWidth={2.5} />
                    <span>Added</span>
                  </>
                ) : (
                  <ShoppingCart size={15} />
                )}
              </button>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
};

export default ProductCard;
