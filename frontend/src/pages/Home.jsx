import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import FeaturedProductShowcase from '../components/FeaturedProductShowcase';
import TrendingSpotlight from '../components/TrendingSpotlight';
import { ProductListSkeleton } from '../components/SkeletonLoader';
import ScrollReveal from '../components/ScrollReveal';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ShoppingCart,
  Check,
  Heart,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatVND,
  translateCategoryName,
  getCategoryEditorialImage,
  getSafeImageUrl,
  handleImageError,
} from '../utils/formatters';

const CATEGORY_TITLE_MAP = {
  'Smart Tech, Audio': 'Smart Technology',
  'Fashion, Apparel': 'Fashion',
  'Watches, Accessories': 'Watches',
  'Home Living': 'Home Living',
  'Beauty, Skincare': 'Beauty',
};

const CategoryTile = ({ cat }) => {
  const { isDark } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  const rawTitle = translateCategoryName(cat.name);
  const displayTitle = CATEGORY_TITLE_MAP[rawTitle] || rawTitle;
  const imgUrl = getCategoryEditorialImage(cat.name);
  const targetUrl =
    cat._id || cat.id
      ? `/products?categoryId=${cat._id || cat.id}`
      : `/products?search=${encodeURIComponent(cat.name)}`;

  return (
    <Link
      to={targetUrl}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        aspectRatio: '4 / 3',
        minHeight: '160px',
        borderRadius: '14px',
        overflow: 'hidden',
        textDecoration: 'none',
        backgroundColor: isDark ? '#111626' : '#e2e8f0',
        border: '1px solid var(--glass-border)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        borderColor: isHovered ? 'rgba(36, 84, 244, 0.45)' : 'var(--glass-border)',
      }}
    >
      <img
        src={imgUrl}
        alt={displayTitle}
        decoding="async"
        onError={handleImageError}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: isHovered ? 'scale(1.04)' : 'scale(1)',
          transition: 'transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to top, rgba(7, 11, 24, 0.86) 0%, rgba(7, 11, 24, 0.22) 45%, transparent 100%)',
          zIndex: 1,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: '18px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <h3
          style={{
            fontSize: '16px',
            fontWeight: '700',
            color: '#ffffff',
            margin: 0,
            letterSpacing: '-0.015em',
            lineHeight: '1.25',
            fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
          }}
        >
          {displayTitle}
        </h3>
        <ChevronRight
          size={16}
          color="#93c5fd"
          style={{
            flexShrink: 0,
            transform: isHovered ? 'translateX(3px)' : 'translateX(0)',
            transition: 'transform 0.2s ease',
          }}
        />
      </div>
    </Link>
  );
};

const HomeProductCard = ({ product }) => {
  const { isDark } = useTheme();
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const [isHovered, setIsHovered] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const addedTimerRef = useRef(null);
  const productId = product._id || product.id;
  const wishlisted = isWishlisted(productId);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const hasDiscount = Boolean(product.originalPrice && product.originalPrice > product.price);
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultColor = product.options?.colors?.length > 0 ? product.options.colors[0] : null;
    const defaultSize = product.options?.sizes?.length > 0 ? product.options.sizes[0] : null;
    addToCart(product, 1, defaultColor, defaultSize);
    setIsAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setIsAdded(false), 1400);
  };

  return (
    <Link
      to={`/product/${product._id || product.id}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        textDecoration: 'none',
        color: 'inherit',
        borderRadius: '14px',
        padding: '12px',
        background: isDark ? 'rgba(18, 22, 36, 0.7)' : '#ffffff',
        border: '1px solid',
        borderColor: isHovered ? 'rgba(36, 84, 244, 0.45)' : 'var(--glass-border)',
        transition: 'transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: isHovered
          ? isDark
            ? '0 14px 28px rgba(0, 0, 0, 0.4)'
            : '0 14px 28px rgba(15, 23, 42, 0.08)'
          : 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: '10px',
          overflow: 'hidden',
          backgroundColor: isDark ? '#0e1320' : '#f1f5f9',
          marginBottom: '12px',
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
            transform: isHovered ? 'scale(1.04)' : 'scale(1)',
            transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
        {hasDiscount && (
          <span
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '700',
              padding: '3px 7px',
              borderRadius: '5px',
            }}
          >
            -{discountPercent}%
          </span>
        )}
        <button
          type="button"
          title={wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(productId, product);
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: wishlisted
              ? '1px solid rgba(239, 68, 68, 0.45)'
              : '1px solid var(--glass-border)',
            background: isDark ? 'rgba(15, 23, 42, 0.78)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(6px)',
            color: wishlisted ? '#ef4444' : isDark ? '#e2e8f0' : '#334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: isHovered || wishlisted ? 1 : 0.85,
            transition: 'opacity 0.2s ease, border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease',
            zIndex: 3,
          }}
        >
          <Heart size={15} fill={wishlisted ? '#ef4444' : 'none'} />
        </button>
        {product.stock === 0 && (
          <span
            style={{
              position: 'absolute',
              bottom: '10px',
              right: '10px',
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#f87171',
              fontSize: '11px',
              fontWeight: '700',
              padding: '3px 8px',
              borderRadius: '5px',
            }}
          >
            Out of Stock
          </span>
        )}
        <span
          style={{
            position: 'absolute',
            left: '10px',
            bottom: '10px',
            padding: '5px 10px',
            borderRadius: '7px',
            background: 'rgba(11, 19, 43, 0.8)',
            backdropFilter: 'blur(6px)',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '600',
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            pointerEvents: 'none',
          }}
        >
          View Details
        </span>
      </div>

      {product.category?.name && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--brand)',
            marginBottom: '4px',
          }}
        >
          {translateCategoryName(product.category.name)}
        </span>
      )}

      <h3
        style={{
          fontSize: '14.5px',
          fontWeight: '600',
          color: isDark ? '#f8fafc' : '#0b132b',
          lineHeight: '1.35',
          margin: '0 0 8px 0',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {product.name}
      </h3>

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontSize: '15px',
            fontWeight: '700',
            color: isDark ? '#f8fafc' : '#0b132b',
          }}
        >
          {formatVND(product.price)}
        </span>

        {product.stock !== 0 && (
          <button
            type="button"
            onClick={handleAddToCart}
            aria-label={isAdded ? `Added ${product.name} to cart` : `Add ${product.name} to cart`}
            title={isAdded ? 'Added to cart' : 'Add to cart'}
            style={{
              width: isAdded ? 'auto' : '34px',
              minWidth: '34px',
              height: '34px',
              padding: isAdded ? '0 10px' : '0',
              borderRadius: '9px',
              background: isAdded
                ? '#10b981'
                : isHovered
                ? '#2454F4'
                : isDark
                ? 'rgba(255, 255, 255, 0.05)'
                : '#f8fafc',
              color: isAdded || isHovered ? '#ffffff' : 'var(--text-primary)',
              border: '1px solid',
              borderColor: isAdded || isHovered ? 'transparent' : 'var(--glass-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontSize: '11.5px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease',
              transform: isAdded ? 'scale(1.06)' : 'scale(1)',
              flexShrink: 0,
            }}
          >
            {isAdded ? (
              <>
                <Check size={14} strokeWidth={2.5} />
                <span>Added</span>
              </>
            ) : (
              <ShoppingCart size={14} />
            )}
          </button>
        )}
      </div>
    </Link>
  );
};

const TrustBenefitsSection = () => {
  const { isDark } = useTheme();
  const benefits = [
    { index: '01', title: 'Genuine Certified' },
    { index: '02', title: 'Nationwide Express Shipping' },
    { index: '03', title: '30-Day Hassle-Free Returns' },
    { index: '04', title: 'Protected Online Payments' },
  ];

  return (
    <section
      style={{
        borderTop: '1px solid var(--glass-border)',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.28)' : 'rgba(255, 255, 255, 0.75)',
        padding: '28px 48px',
      }}
      className="home-section-pad"
    >
      <div
        className="trust-benefits-grid"
        style={{
          maxWidth: '1560px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '28px',
        }}
      >
        {benefits.map((item) => (
          <div key={item.index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: '800',
                color: '#2454F4',
                letterSpacing: '0.08em',
              }}
            >
              {item.index}
            </span>
            <span
              style={{
                fontSize: '13.5px',
                fontWeight: '600',
                color: isDark ? '#f8fafc' : '#0b132b',
                letterSpacing: '-0.01em',
              }}
            >
              {item.title}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

const Home = () => {
  const { isDark } = useTheme();
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Personalized recommendations state
  const [recommendedRaw, setRecommendedRaw] = useState([]);
  const [isPersonalizedRecs, setIsPersonalizedRecs] = useState(false);
  const [matchedRecCategories, setMatchedRecCategories] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(true);

  // Quick onboarding preferences banner (for logged-in users without preferred categories)
  const [quickPrefIds, setQuickPrefIds] = useState([]);
  const [savingQuickPrefs, setSavingQuickPrefs] = useState(false);
  const [dismissedPrefPrompt, setDismissedPrefPrompt] = useState(false);
  const [quickPrefError, setQuickPrefError] = useState('');

  // Recently Viewed section state
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  // Catalog state for "Explore All Products"
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('featured');
  const [visibleCount, setVisibleCount] = useState(12);

  // Fetch live categories and products from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catResult, prodResult] = await Promise.allSettled([
          api.categories.getAll(),
          api.products.getAll({ limit: 100 }),
        ]);
        if (catResult.status === 'fulfilled') {
          setCategories(catResult.value?.categories || []);
        } else {
          console.error('Error fetching home categories:', catResult.reason?.message || catResult.reason);
        }
        if (prodResult.status === 'fulfilled') {
          setProducts(prodResult.value?.products || []);
        } else {
          console.error('Error fetching home products:', prodResult.reason?.message || prodResult.reason);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const userPrefsKey = JSON.stringify(user?.preferredCategories || []);

  useEffect(() => {
    let cancelled = false;
    const fetchRecommended = async () => {
      setLoadingRecs(true);
      try {
        const res = await api.products.getRecommended(24);
        if (cancelled) return;
        setRecommendedRaw(res?.products || []);
        setIsPersonalizedRecs(Boolean(res?.personalized));
        setMatchedRecCategories(Array.isArray(res?.matchedCategories) ? res.matchedCategories : []);
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching recommended products:', error?.message || error);
        }
      } finally {
        if (!cancelled) setLoadingRecs(false);
      }
    };
    fetchRecommended();
    return () => {
      cancelled = true;
    };
  }, [user?._id, user?.id, userPrefsKey]);

  const readLocalRecentlyViewed = () => {
    try {
      const raw = localStorage.getItem('uconext_recently_viewed');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadRecentlyViewed = async () => {
      const userId = user?._id || user?.id;
      if (!userId) {
        if (!cancelled) setRecentlyViewed(readLocalRecentlyViewed());
        return;
      }
      try {
        const res = await api.auth.getRecentlyViewed();
        if (!cancelled) {
          setRecentlyViewed(Array.isArray(res?.products) ? res.products.slice(0, 4) : []);
        }
      } catch {
        if (!cancelled) {
          setRecentlyViewed(readLocalRecentlyViewed());
        }
      }
    };
    loadRecentlyViewed();
    return () => {
      cancelled = true;
    };
  }, [user?._id, user?.id]);

  const handleToggleQuickPref = (catId) => {
    setQuickPrefError('');
    const idStr = String(catId);
    setQuickPrefIds((prev) => {
      if (prev.includes(idStr)) return prev.filter((id) => id !== idStr);
      if (prev.length >= 5) {
        setQuickPrefError('You can select up to 5 favorite categories.');
        return prev;
      }
      return [...prev, idStr];
    });
  };

  const handleSaveQuickPrefs = async () => {
    if (quickPrefIds.length === 0) {
      setQuickPrefError('Please select at least 1 category.');
      return;
    }
    setQuickPrefError('');
    setSavingQuickPrefs(true);
    try {
      const res = await api.auth.updatePreferences(quickPrefIds);
      if (res?.user) updateUser(res.user);
      setQuickPrefIds([]);
      showToast('Shopping preferences saved.', 'success');
    } catch (err) {
      setQuickPrefError(err.message || 'Failed to save preferences.');
    } finally {
      setSavingQuickPrefs(false);
    }
  };

  const handleConfirmClearHistory = async () => {
    setClearingHistory(true);
    try {
      if (user?._id || user?.id) {
        await api.auth.clearRecentlyViewed();
      }
      try {
        localStorage.removeItem('uconext_recently_viewed');
      } catch {
        // Ignore storage errors
      }
      setRecentlyViewed([]);
      setConfirmClearHistory(false);
      showToast('Recently viewed history cleared.', 'info');
    } catch (err) {
      showToast(err.message || 'Failed to clear history.', 'error');
    } finally {
      setClearingHistory(false);
    }
  };

  const showQuickPrefBanner = Boolean(
    user &&
      !dismissedPrefPrompt &&
      (!Array.isArray(user.preferredCategories) || user.preferredCategories.length === 0) &&
      categories.length > 0
  );

  // Featured products for the top animated showcase (12 diverse items with unique images)
  const featuredProducts = useMemo(() => {
    if (!products.length) return [];
    const sorted = [...products].sort(
      (a, b) => (b.rating || 0) - (a.rating || 0) || (b.price || 0) - (a.price || 0)
    );
    const buckets = new Map();
    sorted.forEach((p) => {
      const catKey = String(p.categoryId?._id || p.categoryId || p.category?.name || 'other');
      if (!buckets.has(catKey)) buckets.set(catKey, []);
      buckets.get(catKey).push(p);
    });
    const interleaved = [];
    const usedImages = new Set();
    const lists = Array.from(buckets.values());
    let round = 0;
    while (interleaved.length < 12) {
      let addedInRound = false;
      for (const list of lists) {
        if (round < list.length && interleaved.length < 12) {
          const candidate = list[round];
          const imgKey = candidate.image || String(candidate._id || candidate.id);
          if (!usedImages.has(imgKey)) {
            usedImages.add(imgKey);
            interleaved.push(candidate);
          }
          addedInRound = true;
        }
      }
      if (!addedInRound) break;
      round++;
    }
    return interleaved;
  }, [products]);

  // Trending products collection (8 diverse items with unique images, not in featuredProducts)
  const trendingProducts = useMemo(() => {
    if (!products.length) return [];
    const featuredIds = new Set(featuredProducts.map((p) => String(p._id || p.id)));
    const usedImages = new Set(featuredProducts.map((p) => p.image).filter(Boolean));
    const pool = products.filter(
      (p) => !featuredIds.has(String(p._id || p.id)) && (!p.image || !usedImages.has(p.image))
    );
    const source = pool.length >= 8 ? pool : products.filter((p) => !featuredIds.has(String(p._id || p.id)));

    const buckets = new Map();
    source.forEach((p) => {
      const catKey = String(p.categoryId?._id || p.categoryId || p.category?.name || 'other');
      if (!buckets.has(catKey)) buckets.set(catKey, []);
      buckets.get(catKey).push(p);
    });
    const result = [];
    const trendingImages = new Set();
    const lists = Array.from(buckets.values());
    let round = 0;
    while (result.length < 8) {
      let added = false;
      for (const list of lists) {
        if (round < list.length && result.length < 8) {
          const candidate = list[round];
          const imgKey = candidate.image || String(candidate._id || candidate.id);
          if (!trendingImages.has(imgKey) || pool.length < 8) {
            trendingImages.add(imgKey);
            result.push(candidate);
          }
          added = true;
        }
      }
      if (!added) break;
      round++;
    }
    return result;
  }, [products, featuredProducts]);

  // Recommended For You products (up to 8 diverse items avoiding Featured & Trending duplicates)
  const recommendedProducts = useMemo(() => {
    if (!recommendedRaw.length) return [];
    const usedIds = new Set([
      ...featuredProducts.map((p) => String(p._id || p.id)),
      ...trendingProducts.map((p) => String(p._id || p.id)),
    ]);
    const usedImages = new Set([
      ...featuredProducts.map((p) => p.image).filter(Boolean),
      ...trendingProducts.map((p) => p.image).filter(Boolean),
    ]);

    const picked = [];
    const pickedIds = new Set();
    const pickedImages = new Set();

    for (const p of recommendedRaw) {
      if (picked.length >= 8) break;
      const pid = String(p._id || p.id);
      const img = p.image;
      if (!usedIds.has(pid) && (!img || (!usedImages.has(img) && !pickedImages.has(img)))) {
        pickedIds.add(pid);
        if (img) pickedImages.add(img);
        picked.push(p);
      }
    }

    if (picked.length < 4) {
      for (const p of recommendedRaw) {
        if (picked.length >= 8) break;
        const pid = String(p._id || p.id);
        if (!usedIds.has(pid) && !pickedIds.has(pid)) {
          pickedIds.add(pid);
          picked.push(p);
        }
      }
    }

    return picked;
  }, [recommendedRaw, featuredProducts, trendingProducts]);

  // Filtered & sorted catalog products (prioritizing unseen items & unique images on default view)
  const catalogProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      if (selectedCategory === 'all') return true;
      const catId = p.categoryId?._id || p.categoryId;
      return String(catId) === String(selectedCategory);
    });

    const sorted = [...filtered];
    if (sortBy === 'price-asc') {
      sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === 'price-desc') {
      sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (selectedCategory === 'all') {
      const usedIds = new Set([
        ...featuredProducts.map((p) => String(p._id || p.id)),
        ...trendingProducts.map((p) => String(p._id || p.id)),
        ...recommendedProducts.map((p) => String(p._id || p.id)),
      ]);
      const seenImages = new Set([
        ...featuredProducts.map((p) => p.image).filter(Boolean),
        ...trendingProducts.map((p) => p.image).filter(Boolean),
        ...recommendedProducts.map((p) => p.image).filter(Boolean),
      ]);
      const distinctFresh = [];
      const fallbackRest = [];
      sorted.forEach((p) => {
        const pid = String(p._id || p.id);
        if (!usedIds.has(pid) && (!p.image || !seenImages.has(p.image))) {
          if (p.image) seenImages.add(p.image);
          distinctFresh.push(p);
        } else {
          fallbackRest.push(p);
        }
      });
      return [...distinctFresh, ...fallbackRest];
    }
    return sorted;
  }, [products, selectedCategory, sortBy, featuredProducts, trendingProducts, recommendedProducts]);

  const catTrackRef = useRef(null);
  const [canScrollCatLeft, setCanScrollCatLeft] = useState(false);
  const [canScrollCatRight, setCanScrollCatRight] = useState(true);

  const fallbackCategories = [
    { name: 'Laptops, Tablets', description: 'Ultrabooks, tablets and e-readers built for portable power' },
    { name: 'Monitors, Desk', description: 'Studio displays, mechanical keyboards and precision mice' },
    { name: 'Audio', description: 'Wireless headphones, earbuds, microphones and speakers' },
    { name: 'Charging, Storage', description: 'GaN chargers, power banks, portable SSDs and action cameras' },
    { name: 'Watches', description: 'Mechanical, automatic and smart timepieces' },
    { name: 'Bags, Luggage', description: 'Backpacks, slings, leather wallets and cabin luggage' },
    { name: 'Eyewear, Jewelry', description: 'Designer sunglasses, fine jewelry and leather belts' },
    { name: 'Tops, Shirts', description: 'Tees, polo shirts, knitwear and tailored poplin shirts' },
    { name: 'Outerwear', description: 'Trench coats, leather jackets, blazers and insulated vests' },
    { name: 'Bottoms, Dresses', description: 'Selvedge denim, tailored trousers, joggers and dresses' },
    { name: 'Skincare', description: 'Serums, moisturizers, cleansers and daily UV protection' },
    { name: 'Fragrance', description: 'Signature Eau de Parfum and cologne compositions' },
    { name: 'Makeup, Hair', description: 'Lip care, complexion essentials and nourishing hair oils' },
    { name: 'Kitchen, Coffee', description: 'Specialty coffee gear, cast iron cookware and appliances' },
    { name: 'Home Living', description: 'Smart home vacuums, air purifiers, lighting and bedding' },
  ];
  const displayCategories = categories.length > 0 ? categories : fallbackCategories;

  const updateCatScrollButtons = () => {
    const el = catTrackRef.current;
    if (!el) return;
    setCanScrollCatLeft(el.scrollLeft > 4);
    setCanScrollCatRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateCatScrollButtons();
    window.addEventListener('resize', updateCatScrollButtons);
    return () => window.removeEventListener('resize', updateCatScrollButtons);
  }, [displayCategories.length]);

  const scrollCategories = (dir) => {
    const el = catTrackRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.65, 320);
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <style>{`
        .home-categories-stage {
          position: relative;
        }
        .home-categories-grid {
          display: grid;
          grid-auto-flow: column;
          grid-template-rows: repeat(2, minmax(0, 1fr));
          grid-auto-columns: calc((100% - 64px) / 5);
          gap: 16px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 2px 0;
        }
        .home-categories-grid::-webkit-scrollbar {
          display: none;
        }
        .home-categories-grid > a {
          scroll-snap-align: start;
        }
        .home-cat-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid var(--glass-border);
          background: var(--bg-elevated);
          color: var(--text-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 4;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
          transition: border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
        }
        .home-cat-arrow:hover:not(:disabled) {
          border-color: #2454F4;
          color: #2454F4;
          transform: translateY(-50%) scale(1.05);
        }
        .home-cat-arrow:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }
        .home-cat-arrow.prev {
          left: -20px;
        }
        .home-cat-arrow.next {
          right: -20px;
        }
        @media (max-width: 768px) {
          .home-cat-arrow.prev {
            left: -8px;
          }
          .home-cat-arrow.next {
            right: -8px;
          }
        }
        .home-products-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 22px;
        }
        @media (max-width: 1120px) {
          .home-categories-grid {
            grid-auto-columns: calc((100% - 32px) / 3);
          }
          .home-products-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 820px) {
          .home-categories-grid {
            grid-auto-columns: calc((100% - 16px) / 2);
          }
          .home-products-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
          .trust-benefits-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 520px) {
          .home-section-pad {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
          .home-categories-grid {
            grid-auto-columns: calc((100% - 12px) / 1.5);
            gap: 12px;
          }
          .home-products-grid {
            grid-template-columns: 1fr;
          }
          .trust-benefits-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* 1. Animated Featured Products Showcase (Directly below Navbar) */}
      <FeaturedProductShowcase products={featuredProducts} loading={loading} />

      {/* 2. Product Categories */}
      <section
        id="categories"
        className="home-section-pad"
        style={{
          padding: '48px 48px 24px 48px',
          maxWidth: '1560px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <ScrollReveal direction="up">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(22px, 2.2vw, 26px)',
                fontWeight: '700',
                color: isDark ? '#f8fafc' : '#0b132b',
                letterSpacing: '-0.025em',
                margin: 0,
                lineHeight: '1.2',
                fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
              }}
            >
              Shop by Category
            </h2>

            <Link
              to="/products"
              style={{
                color: '#2454F4',
                textDecoration: 'none',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '13.5px',
              }}
            >
              <span>All Categories</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </ScrollReveal>

        <div className="home-categories-stage">
          <button
            type="button"
            onClick={() => scrollCategories(-1)}
            disabled={!canScrollCatLeft}
            className="home-cat-arrow prev"
            aria-label="Previous categories"
          >
            <ChevronLeft size={18} />
          </button>

          <div
            ref={catTrackRef}
            onScroll={updateCatScrollButtons}
            className="home-categories-grid"
          >
            {displayCategories.map((cat, idx) => (
              <CategoryTile key={cat._id || cat.id || cat.name || idx} cat={cat} />
            ))}
          </div>

          <button
            type="button"
            onClick={() => scrollCategories(1)}
            disabled={!canScrollCatRight}
            className="home-cat-arrow next"
            aria-label="Next categories"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      {/* 3. Featured Product Collections: "Trending Products" */}
      <section
        id="trending"
        className="home-section-pad"
        style={{
          padding: '48px 48px 24px 48px',
          maxWidth: '1560px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <ScrollReveal direction="up">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: '12px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <span
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#2454F4',
                  marginBottom: '6px',
                }}
              >
                Curated Picks
              </span>
              <h2
                style={{
                  fontSize: 'clamp(22px, 2.2vw, 26px)',
                  fontWeight: '700',
                  color: isDark ? '#f8fafc' : '#0b132b',
                  letterSpacing: '-0.025em',
                  margin: 0,
                  lineHeight: '1.2',
                  fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
                }}
              >
                Trending Products
              </h2>
            </div>

            <Link
              to="/products"
              style={{
                color: '#2454F4',
                textDecoration: 'none',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '13.5px',
              }}
            >
              <span>View Collection</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </ScrollReveal>

        {loading ? (
          <ProductListSkeleton count={4} />
        ) : (
          <TrendingSpotlight products={trendingProducts} />
        )}
      </section>

      {/* 3.5. Recommended For You */}
      {(loadingRecs || recommendedProducts.length > 0) && (
        <section
          id="recommended"
          className="home-section-pad"
          style={{
            padding: '48px 48px 24px 48px',
            maxWidth: '1560px',
            margin: '0 auto',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <ScrollReveal direction="up">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <span
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: '700',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#2454F4',
                    marginBottom: '6px',
                  }}
                >
                  {isPersonalizedRecs ? 'Personalized For You' : 'Top Rated Picks'}
                </span>
                <h2
                  style={{
                    fontSize: 'clamp(22px, 2.2vw, 26px)',
                    fontWeight: '700',
                    color: isDark ? '#f8fafc' : '#0b132b',
                    letterSpacing: '-0.025em',
                    margin: 0,
                    lineHeight: '1.2',
                    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
                  }}
                >
                  Recommended For You
                </h2>
                {isPersonalizedRecs && matchedRecCategories.length > 0 && (
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      margin: '6px 0 0 0',
                    }}
                  >
                    Tailored from {matchedRecCategories.map(translateCategoryName).join(', ')}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {user ? (
                  <>
                    <Link
                      to="/settings"
                      style={{
                        color: 'var(--text-secondary)',
                        textDecoration: 'none',
                        fontWeight: '600',
                        fontSize: '13.5px',
                      }}
                    >
                      Preferences
                    </Link>
                    <Link
                      to="/products?sort=recommended"
                      style={{
                        color: '#2454F4',
                        textDecoration: 'none',
                        fontWeight: '600',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '13.5px',
                      }}
                    >
                      <span>See All</span>
                      <ArrowRight size={14} />
                    </Link>
                  </>
                ) : (
                  <Link
                    to="/products"
                    style={{
                      color: '#2454F4',
                      textDecoration: 'none',
                      fontWeight: '600',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '13.5px',
                    }}
                  >
                    <span>View Collection</span>
                    <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </div>
          </ScrollReveal>

          {showQuickPrefBanner && (
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--glass-border)',
                borderRadius: '14px',
                padding: '18px 20px',
                marginBottom: '22px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="ui-icon-box">
                    <SlidersHorizontal size={17} strokeWidth={1.75} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Personalize your feed
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Pick up to 5 categories you shop most to tailor recommendations and AI tips.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedPrefPrompt(true)}
                  aria-label="Dismiss interest picker"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {categories.map((cat) => {
                  const catId = String(cat._id || cat.id);
                  const isSelected = quickPrefIds.includes(catId);
                  return (
                    <button
                      key={catId}
                      type="button"
                      onClick={() => handleToggleQuickPref(catId)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 13px',
                        borderRadius: '999px',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? '700' : '600',
                        border: isSelected
                          ? `1px solid ${isDark ? 'rgba(96, 165, 250, 0.5)' : '#2454F4'}`
                          : '1px solid var(--glass-border)',
                        background: isSelected
                          ? isDark
                            ? 'rgba(36, 84, 244, 0.16)'
                            : 'rgba(36, 84, 244, 0.08)'
                          : 'var(--bg-elevated)',
                        color: isSelected
                          ? isDark
                            ? '#93c5fd'
                            : '#2454F4'
                          : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease, color 0.15s ease',
                      }}
                    >
                      {isSelected && <Check size={13} strokeWidth={2.25} />}
                      <span>{translateCategoryName(cat.name)}</span>
                    </button>
                  );
                })}
              </div>

              {quickPrefError && (
                <p style={{ fontSize: '12.5px', color: 'var(--color-error)', fontWeight: '600', margin: '0 0 10px 0' }}>
                  {quickPrefError}
                </p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                  {quickPrefIds.length} / 5 selected
                </span>
                <button
                  type="button"
                  onClick={handleSaveQuickPrefs}
                  disabled={savingQuickPrefs || quickPrefIds.length === 0}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9px',
                    border: 'none',
                    background: '#2454F4',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: savingQuickPrefs || quickPrefIds.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: savingQuickPrefs || quickPrefIds.length === 0 ? 0.55 : 1,
                  }}
                >
                  {savingQuickPrefs ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}

          {loadingRecs ? (
            <ProductListSkeleton count={4} />
          ) : (
            <div className="home-products-grid">
              {recommendedProducts.map((prod) => (
                <HomeProductCard key={prod._id || prod.id} product={prod} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3.6. Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <section
          id="recently-viewed"
          className="home-section-pad"
          style={{
            padding: '40px 48px 20px 48px',
            maxWidth: '1560px',
            margin: '0 auto',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <ScrollReveal direction="up">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <span
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: '700',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#2454F4',
                    marginBottom: '6px',
                  }}
                >
                  Your History
                </span>
                <h2
                  style={{
                    fontSize: 'clamp(22px, 2.2vw, 26px)',
                    fontWeight: '700',
                    color: isDark ? '#f8fafc' : '#0b132b',
                    letterSpacing: '-0.025em',
                    margin: 0,
                    lineHeight: '1.2',
                    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
                  }}
                >
                  Recently Viewed
                </h2>
              </div>

              {confirmClearHistory ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={clearingHistory}
                    onClick={handleConfirmClearHistory}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: 'var(--color-error)',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      cursor: clearingHistory ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {clearingHistory ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    disabled={clearingHistory}
                    onClick={() => setConfirmClearHistory(false)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                      fontSize: '12.5px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearHistory(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                  <span>Clear History</span>
                </button>
              )}
            </div>
          </ScrollReveal>

          <div className="home-products-grid">
            {recentlyViewed.map((prod) => (
              <HomeProductCard key={prod._id || prod.id} product={prod} />
            ))}
          </div>
        </section>
      )}

      {/* 4. All Products / Product Catalog: "Explore All Products" */}
      <section
        id="catalog"
        className="home-section-pad"
        style={{
          padding: '48px 48px 68px 48px',
          maxWidth: '1560px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <ScrollReveal direction="up">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: '22px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(22px, 2.2vw, 26px)',
                fontWeight: '700',
                color: isDark ? '#f8fafc' : '#0b132b',
                letterSpacing: '-0.025em',
                margin: 0,
                lineHeight: '1.2',
                fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
              }}
            >
              Explore All Products
            </h2>

            {/* Sorting Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SlidersHorizontal size={15} color="var(--text-muted)" />
              <label htmlFor="home-sort-select" className="sr-only">
                Sort products
              </label>
              <select
                id="home-sort-select"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setVisibleCount(12);
                }}
                style={{
                  height: '42px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--glass-border)',
                  backgroundColor: isDark ? '#111626' : '#ffffff',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="featured">Sort: Featured</option>
                <option value="newest">Sort: Newest</option>
                <option value="rating">Sort: Top Rated</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              paddingBottom: '16px',
              marginBottom: '26px',
              borderBottom: '1px solid var(--glass-border)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setVisibleCount(12);
              }}
              style={{
                flexShrink: 0,
                padding: '9px 18px',
                borderRadius: '999px',
                fontSize: '14px',
                fontWeight: '600',
                border: selectedCategory === 'all' ? '1px solid transparent' : '1px solid var(--glass-border)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: selectedCategory === 'all' ? 'var(--brand)' : 'transparent',
                color: selectedCategory === 'all' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
              }}
            >
              All Products
            </button>
            {categories.map((cat) => {
              const catId = cat._id || cat.id;
              const isSelected = selectedCategory === catId;
              return (
                <button
                  key={catId}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(catId);
                    setVisibleCount(12);
                  }}
                  style={{
                    flexShrink: 0,
                    padding: '9px 18px',
                    borderRadius: '999px',
                    fontSize: '14px',
                    fontWeight: '600',
                    border: isSelected ? '1px solid transparent' : '1px solid var(--glass-border)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    background: isSelected ? 'var(--brand)' : 'transparent',
                    color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                  }}
                >
                  {translateCategoryName(cat.name)}
                </button>
              );
            })}
          </div>
        </ScrollReveal>

        {loading ? (
          <ProductListSkeleton count={8} />
        ) : catalogProducts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--text-secondary)',
              fontSize: '14.5px',
            }}
          >
            No products found in this category.
          </div>
        ) : (
          <>
            <div className="home-products-grid">
              {catalogProducts.slice(0, visibleCount).map((prod) => (
                <HomeProductCard key={prod._id || prod.id} product={prod} />
              ))}
            </div>

            {/* Load More / Catalog Footer */}
            <div
              style={{
                marginTop: '36px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Showing {Math.min(visibleCount, catalogProducts.length)} of {catalogProducts.length} products
              </span>

              {visibleCount < catalogProducts.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 12)}
                  style={{
                    height: '44px',
                    padding: '0 28px',
                    borderRadius: '10px',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.14)'}`,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0b132b',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s ease, transform 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#2454F4';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isDark
                      ? 'rgba(255, 255, 255, 0.14)'
                      : 'rgba(15, 23, 42, 0.14)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Load More Products
                </button>
              ) : (
                <Link
                  to="/products"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#2454F4',
                    textDecoration: 'none',
                  }}
                >
                  <span>Open Full Shop Page</span>
                  <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </>
        )}
      </section>

      {/* 5. Trust & Benefits Section */}
      <TrustBenefitsSection />
    </div>
  );
};

export default Home;
