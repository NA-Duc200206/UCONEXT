import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  Compass,
  ArrowUp,
  ArrowRight,
  ChevronDown,
  X,
  Minimize2,
  Maximize2,
  RotateCcw,
  Check,
  Copy,
  Star,
  AlertCircle,
  RefreshCw,
  Plus,
  Tag,
  Package,
  SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { GlowLogoIcon } from './GlowLogo';
import { formatVND, formatDate, getSafeImageUrl, handleImageError } from '../utils/formatters';

const GUEST_STORAGE_KEY = 'uconext_ai_chat_guest';

const ORDER_STATUS_META = {
  pending: { label: 'Pending', dot: '#f59e0b' },
  confirmed: { label: 'Confirmed', dot: '#2454F4' },
  packaging: { label: 'Packaging', dot: '#2454F4' },
  shipping: { label: 'Shipping', dot: '#0ea5e9' },
  delivered: { label: 'Delivered', dot: '#10b981' },
  completed: { label: 'Completed', dot: '#10b981' },
  cancelled: { label: 'Cancelled', dot: '#ef4444' },
  refund_requested: { label: 'Refund Requested', dot: '#f59e0b' },
  refund_completed: { label: 'Refunded', dot: 'var(--text-muted)' },
};

function createWelcomeMessage(userName) {
  const firstName = userName ? userName.trim().split(' ')[0] : '';
  return {
    id: 'welcome',
    sender: 'ai',
    text: firstName
      ? `Hi ${firstName}, how can I help you shop today? Ask for product picks within a budget, side-by-side comparisons, active promo codes, or an update on your orders.`
      : 'How can I help you shop today? Ask for product picks within a budget, side-by-side comparisons, active promo codes, or delivery and payment details.',
    time: 'Just now',
  };
}

function renderInlineSegments(line, keyPrefix) {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b-${idx}`} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={`${keyPrefix}-c-${idx}`} className="uc-chat-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{part}</React.Fragment>;
  });
}

function renderFormattedText(text) {
  if (!text) return null;
  const lines = String(text).split('\n');
  return (
    <div className="uc-chat-prose">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={`sp-${idx}`} className="uc-chat-prose-spacer" />;
        }
        const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
        if (headingMatch) {
          return (
            <div key={`hd-${idx}`} className="uc-chat-prose-heading">
              {renderInlineSegments(headingMatch[1], `hd-${idx}`)}
            </div>
          );
        }
        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (orderedMatch) {
          return (
            <div key={`ol-${idx}`} className="uc-chat-prose-ordered">
              <span className="uc-chat-ordered-num uc-tabular">{orderedMatch[1]}.</span>
              <span>{renderInlineSegments(orderedMatch[2], `ol-${idx}`)}</span>
            </div>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={`li-${idx}`} className="uc-chat-prose-bullet">
              <span className="uc-chat-bullet-dot" aria-hidden="true" />
              <span>{renderInlineSegments(trimmed.slice(2), `li-${idx}`)}</span>
            </div>
          );
        }
        return <div key={`ln-${idx}`}>{renderInlineSegments(line, `ln-${idx}`)}</div>;
      })}
    </div>
  );
}

const AIFloatingChat = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { addToCart, getCartTotal, getCartItemsCount } = useCart();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [messages, setMessages] = useState(() => [createWelcomeMessage()]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [addedProdIds, setAddedProdIds] = useState({});
  const [copiedCode, setCopiedCode] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const drawerRef = useRef(null);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const timersRef = useRef([]);

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (confirmClear) {
          setConfirmClear(false);
        } else {
          setIsOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, confirmClear]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [inputValue, isOpen]);

  const handleThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distanceFromBottom > 120);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const drawerEl = drawerRef.current;
    if (!drawerEl) return;

    const handleWheel = (e) => {
      const threadEl = threadRef.current;
      if (!threadEl || !threadEl.contains(e.target)) {
        e.preventDefault();
        return;
      }

      const canScroll = threadEl.scrollHeight > threadEl.clientHeight;
      if (!canScroll) {
        e.preventDefault();
        return;
      }

      const atTop = threadEl.scrollTop <= 0 && e.deltaY < 0;
      const atBottom =
        threadEl.scrollTop + threadEl.clientHeight >= threadEl.scrollHeight - 1 && e.deltaY > 0;

      if (atTop || atBottom) {
        e.preventDefault();
      }
    };

    drawerEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => drawerEl.removeEventListener('wheel', handleWheel);
  }, [isOpen]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const productMatch = location.pathname.match(/^\/product\/([a-f0-9]{24})$/i);
  const currentProductId = productMatch ? productMatch[1] : null;
  const userId = user?._id || user?.id || null;

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.ai.getStatus();
      setAiStatus(status);
    } catch {
      // Leave status unchanged when server is unreachable
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (isOpen && (!aiStatus || !aiStatus.configured)) {
      refreshStatus();
    }
  }, [isOpen, aiStatus, refreshStatus]);

  useEffect(() => {
    let cancelled = false;

    const loadConversation = async () => {
      if (userId) {
        try {
          const res = await api.ai.getHistory();
          if (cancelled) return;
          const serverMessages = Array.isArray(res?.messages) ? res.messages : [];
          if (serverMessages.length > 0) {
            const mapped = serverMessages.map((m, idx) => ({
              id: `srv-${idx}-${m.createdAt || idx}`,
              sender: m.role === 'user' ? 'user' : 'ai',
              text: m.text,
              products: m.products || [],
              coupons: m.coupons || [],
              orders: m.orders || [],
              comparison: m.comparison || null,
              time: m.createdAt ? formatDate(m.createdAt) : 'Earlier',
            }));
            setMessages(mapped);
            return;
          }
        } catch {
          // Fall back cleanly to welcome greeting
        }
        if (!cancelled) {
          setMessages([createWelcomeMessage(user?.name)]);
        }
        return;
      }

      try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.filter((m) => !m.isError).slice(-24));
          return;
        }
      } catch {
        // Ignore storage errors
      }
      setMessages([createWelcomeMessage()]);
    };

    loadConversation();
    return () => {
      cancelled = true;
    };
  }, [userId, user?.name]);

  useEffect(() => {
    if (userId) return;
    try {
      const meaningful = messages.filter((m) => m.id !== 'welcome' && !m.isError);
      if (meaningful.length > 0) {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(meaningful.slice(-24)));
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [messages, userId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isTyping]);

  const handleQuickAdd = (prod) => {
    if (!prod || (prod.stock !== undefined && prod.stock <= 0)) return;
    const pid = prod.id || prod._id;
    addToCart(
      {
        id: pid,
        name: prod.name,
        price: Number(prod.price || 0),
        image: prod.image,
      },
      1,
      prod.options?.colors?.[0] || null,
      prod.options?.sizes?.[0] || null
    );
    setAddedProdIds((prev) => ({ ...prev, [pid]: true }));
    const timer = setTimeout(() => {
      setAddedProdIds((prev) => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });
    }, 1500);
    timersRef.current.push(timer);
  };

  const handleCopyCoupon = async (code) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      }
    } catch {
      // Ignore clipboard errors
    }
    setCopiedCode(code);
    const timer = setTimeout(() => {
      setCopiedCode((prev) => (prev === code ? null : prev));
    }, 1500);
    timersRef.current.push(timer);
  };

  const handleConfirmClearHistory = async () => {
    setClearingHistory(true);
    try {
      if (userId) {
        await api.ai.clearHistory();
      } else {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      }
      setMessages([createWelcomeMessage(user?.name)]);
      setConfirmClear(false);
    } catch {
      setConfirmClear(false);
    } finally {
      setClearingHistory(false);
    }
  };

  const handleSendMessage = useCallback(
    async (textToSend) => {
      const text = (typeof textToSend === 'string' ? textToSend : inputValue).trim();
      if (!text || isTyping) return;

      const userMsg = {
        id: `u-${Date.now()}`,
        sender: 'user',
        text,
        time: 'Just now',
      };

      const historySnapshot = messagesRef.current
        .filter((m) => m.id !== 'welcome' && !m.isError && m.text)
        .slice(-8)
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          text: m.text,
        }));

      setMessages((prev) => [...prev, userMsg]);
      if (typeof textToSend !== 'string') {
        setInputValue('');
      }
      setIsTyping(true);
      setConfirmClear(false);

      try {
        const res = await api.ai.chat(text, {
          history: historySnapshot,
          context: {
            page: location.pathname,
            productId: currentProductId || undefined,
            cartTotal: getCartTotal(),
            cartCount: getCartItemsCount(),
          },
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now() + 1}`,
            sender: 'ai',
            text: res.message,
            products: res.products || [],
            coupons: res.coupons || [],
            orders: res.orders || [],
            comparison: res.comparison || null,
            time: 'Just now',
          },
        ]);
      } catch (err) {
        if (err.code === 'AI_NOT_CONFIGURED') {
          setAiStatus({ configured: false, provider: null, model: null });
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now() + 1}`,
            sender: 'ai',
            isError: true,
            errorCode: err.code || 'AI_ERROR',
            text: err.message || 'Unable to reach assistant service.',
            retryText: text,
            time: 'Just now',
          },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [inputValue, isTyping, location.pathname, currentProductId, getCartTotal, getCartItemsCount]
  );

  const sendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  useEffect(() => {
    const onOpenAIChat = (event) => {
      setIsOpen(true);
      const prompt = event?.detail?.prompt;
      if (typeof prompt === 'string' && prompt.trim()) {
        setTimeout(() => {
          sendMessageRef.current(prompt.trim());
        }, 60);
      }
    };

    window.addEventListener('uconext:open-ai-chat', onOpenAIChat);
    return () => window.removeEventListener('uconext:open-ai-chat', onOpenAIChat);
  }, []);

  const starterSuggestions = (() => {
    const list = [];
    if (currentProductId) {
      list.push(
        { label: 'Analyze this product', prompt: 'Tell me the highlights and details of this product', icon: 'sparkles' },
        { label: 'Compare similar items', prompt: 'Compare this product with similar alternatives', icon: 'compare' }
      );
    }
    if (user) {
      list.push(
        { label: 'Picks for me', prompt: 'Recommend products based on my preferences', icon: 'sparkles' },
        { label: 'Track my orders', prompt: 'Check the status of my recent orders', icon: 'order' }
      );
    } else {
      list.push(
        { label: 'Top headphones', prompt: 'Best noise-canceling headphones in store', icon: 'sparkles' },
        { label: 'Skincare essentials', prompt: 'Top rated skincare essentials', icon: 'sparkles' }
      );
    }
    list.push(
      { label: 'Under 1,000,000 VND', prompt: 'Find great products under 1,000,000 VND', icon: 'compare' },
      { label: 'Active promo codes', prompt: 'Show available promo codes for my cart', icon: 'coupon' }
    );
    const seen = new Set();
    return list.filter((item) => {
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    }).slice(0, 4);
  })();

  const renderStarterIcon = (type) => {
    switch (type) {
      case 'coupon':
        return <Tag size={13} />;
      case 'order':
        return <Package size={13} />;
      case 'compare':
        return <SlidersHorizontal size={13} />;
      default:
        return <Compass size={13} />;
    }
  };

  const hasConversationStarted = messages.some((m) => m.sender === 'user');
  const isUnconfigured = aiStatus !== null && !aiStatus.configured;
  const headerSubtitle = isUnconfigured
    ? 'Setup required'
    : currentProductId
      ? 'Viewing current item'
      : user?.name
        ? `Welcome back, ${user.name.trim().split(' ')[0]}`
        : 'Shopping & order assistant';

  return (
    <div className="uc-chat-root">
      {!isOpen && (
        <motion.button
          type="button"
          onClick={() => setIsOpen(true)}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="uc-chat-trigger"
          aria-label="Open UCONEXT shopping assistant"
        >
          <span className="uc-chat-trigger-icon" aria-hidden="true">
            <MessageCircle size={15} strokeWidth={2.2} />
            <span className={`uc-chat-live-dot ${isUnconfigured ? 'is-warn' : ''}`} />
          </span>
          <span>UCONEXT AI</span>
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={drawerRef}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`uc-chat-drawer ${isExpanded ? 'is-expanded' : ''} ${isDark ? 'is-dark' : 'is-light'}`}
            role="dialog"
            aria-label="UCONEXT Assistant"
          >
            {/* Standardized UCONEXT Header */}
            <header className="uc-chat-header">
              <div className="uc-chat-header-id">
                <div className="uc-chat-avatar" aria-hidden="true">
                  <GlowLogoIcon size={18} color="#2454F4" />
                  <span className={`uc-chat-avatar-dot ${isUnconfigured ? 'is-warn' : ''}`} />
                </div>
                <div className="uc-chat-header-text">
                  <div className="uc-chat-title-row">
                    <span className="uc-chat-title">UCONEXT Assistant</span>
                    <span className="uc-chat-ai-badge">AI</span>
                  </div>
                  <div className="uc-chat-subtitle">
                    <span>{headerSubtitle}</span>
                  </div>
                </div>
              </div>

              <div className="uc-chat-header-actions">
                <button
                  type="button"
                  onClick={() => setConfirmClear((prev) => !prev)}
                  className={`uc-chat-icon-btn ${confirmClear ? 'is-danger' : ''}`}
                  title="Reset conversation"
                  aria-label="Reset conversation"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="uc-chat-icon-btn uc-chat-expand-btn"
                  title={isExpanded ? 'Compact view' : 'Expand view'}
                  aria-label={isExpanded ? 'Compact view' : 'Expand view'}
                >
                  {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="uc-chat-icon-btn"
                  title="Close (Esc)"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            {/* Setup Notice (only when backend has no API key configured) */}
            {isUnconfigured && (
              <div className="uc-chat-notice-bar" role="status">
                <AlertCircle size={15} className="uc-chat-notice-icon" />
                <span>
                  Assistant API key is not configured. Add a provider key in <code>backend/.env</code> and restart the server.
                </span>
              </div>
            )}

            {/* Inline Clear Confirmation */}
            {confirmClear && (
              <div className="uc-chat-confirm-bar">
                <span>Clear this conversation?</span>
                <div className="uc-chat-confirm-actions">
                  <button
                    type="button"
                    disabled={clearingHistory}
                    onClick={handleConfirmClearHistory}
                    className="uc-chat-confirm-btn danger"
                  >
                    {clearingHistory ? 'Clearing...' : 'Clear'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="uc-chat-confirm-btn"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Messages Thread */}
            <div ref={threadRef} onScroll={handleThreadScroll} className="uc-chat-thread">
              {messages.map((msg) => {
                if (msg.sender === 'user') {
                  return (
                    <div key={msg.id} className="uc-chat-turn is-user">
                      <div className="uc-chat-user-pill">{msg.text}</div>
                      {msg.time && <span className="uc-chat-time is-user">{msg.time}</span>}
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="uc-chat-turn is-assistant">
                    <div className="uc-chat-assistant-row">
                      <div className="uc-chat-mini-avatar" aria-hidden="true">
                        <GlowLogoIcon size={13} color="#2454F4" />
                      </div>
                      <div className="uc-chat-assistant-col">
                        {msg.isError ? (
                          <div className="uc-chat-error-box" role="alert">
                            <div className="uc-chat-error-row">
                              <AlertCircle size={15} className="uc-chat-error-icon" />
                              <span>{msg.text}</span>
                            </div>
                            {msg.retryText && (
                              <button
                                type="button"
                                disabled={isTyping}
                                onClick={() => handleSendMessage(msg.retryText)}
                                className="uc-chat-retry-btn"
                              >
                                <RefreshCw size={12} />
                                <span>Retry</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="uc-chat-assistant-bubble">
                            {renderFormattedText(msg.text)}
                          </div>
                        )}
                        {msg.time && <span className="uc-chat-time">{msg.time}</span>}
                      </div>
                    </div>

                    {/* Comparison Block */}
                    {msg.comparison && msg.comparison.products?.length >= 2 && (
                      <div className="uc-chat-block">
                        <div className="uc-chat-block-header">Comparison</div>
                        <div className="uc-chat-list">
                          {msg.comparison.products.map((item) => {
                            const isAdded = Boolean(addedProdIds[item.id]);
                            const outOfStock = (item.stock ?? 0) <= 0;
                            return (
                              <div key={item.id} className="uc-chat-item-row">
                                <Link
                                  to={`/product/${item.id}`}
                                  onClick={() => setIsOpen(false)}
                                  className="uc-chat-item-link"
                                >
                                  <img
                                    src={getSafeImageUrl(item.image)}
                                    alt={item.name}
                                    onError={handleImageError}
                                    className="uc-chat-thumb"
                                  />
                                  <div className="uc-chat-item-meta">
                                    <div className="uc-chat-item-name">{item.name}</div>
                                    <div className="uc-chat-item-sub">
                                      <span className="uc-chat-price uc-tabular">{formatVND(item.price)}</span>
                                      <span aria-hidden="true">·</span>
                                      <span className="uc-chat-highlight-tag">{item.highlight}</span>
                                      {item.rating && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="uc-chat-rating uc-tabular">
                                            <Star size={11} fill="#f59e0b" color="#f59e0b" />
                                            {item.rating}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                                <button
                                  type="button"
                                  disabled={outOfStock}
                                  onClick={() =>
                                    handleQuickAdd({
                                      ...item,
                                      options: { colors: item.colors, sizes: item.sizes },
                                    })
                                  }
                                  className={`uc-chat-add-btn ${isAdded ? 'is-added' : ''}`}
                                  aria-label={outOfStock ? 'Out of stock' : `Add ${item.name} to cart`}
                                >
                                  {isAdded ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} />}
                                  <span>{outOfStock ? 'Sold out' : isAdded ? 'Added' : 'Add'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="uc-chat-verdict">{msg.comparison.verdict}</div>
                      </div>
                    )}

                    {/* Product Recommendations Block */}
                    {!msg.comparison && msg.products && msg.products.length > 0 && (
                      <div className="uc-chat-block">
                        <div className="uc-chat-list">
                          {msg.products.map((prod) => {
                            const pid = prod.id || prod._id;
                            const isAdded = Boolean(addedProdIds[pid]);
                            const outOfStock = prod.stock !== undefined && prod.stock <= 0;
                            return (
                              <div key={pid} className="uc-chat-item-row">
                                <Link
                                  to={`/product/${pid}`}
                                  onClick={() => setIsOpen(false)}
                                  className="uc-chat-item-link"
                                >
                                  <img
                                    src={getSafeImageUrl(prod.image)}
                                    alt={prod.name}
                                    onError={handleImageError}
                                    className="uc-chat-thumb"
                                  />
                                  <div className="uc-chat-item-meta">
                                    <div className="uc-chat-item-name">{prod.name}</div>
                                    <div className="uc-chat-item-sub">
                                      <span className="uc-chat-price uc-tabular">{formatVND(prod.price)}</span>
                                      {prod.rating && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="uc-chat-rating uc-tabular">
                                            <Star size={11} fill="#f59e0b" color="#f59e0b" />
                                            {prod.rating}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                                <button
                                  type="button"
                                  disabled={outOfStock}
                                  onClick={() => handleQuickAdd(prod)}
                                  className={`uc-chat-add-btn ${isAdded ? 'is-added' : ''}`}
                                  aria-label={outOfStock ? 'Out of stock' : `Add ${prod.name} to cart`}
                                >
                                  {isAdded ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} />}
                                  <span>{outOfStock ? 'Sold out' : isAdded ? 'Added' : 'Add'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Order Status Block */}
                    {msg.orders && msg.orders.length > 0 && (
                      <div className="uc-chat-block">
                        <div className="uc-chat-list">
                          {msg.orders.map((ord) => {
                            const st = ORDER_STATUS_META[ord.status] || ORDER_STATUS_META.pending;
                            return (
                              <Link
                                key={ord.id}
                                to="/orders"
                                onClick={() => setIsOpen(false)}
                                className="uc-chat-order-row"
                              >
                                <div className="uc-chat-order-top">
                                  <span className="uc-chat-order-id">#{ord.shortId}</span>
                                  <span className="uc-chat-order-status">
                                    <span
                                      className="uc-chat-status-dot"
                                      style={{ background: st.dot }}
                                      aria-hidden="true"
                                    />
                                    <span>{st.label}</span>
                                  </span>
                                </div>
                                <div className="uc-chat-order-sub">
                                  <span>
                                    {ord.itemCount} {ord.itemCount === 1 ? 'item' : 'items'} ·{' '}
                                    {String(ord.paymentMethod || '').toUpperCase()}
                                  </span>
                                  <span className="uc-chat-order-total uc-tabular">
                                    {formatVND(ord.totalAmount)}
                                  </span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Coupon Block */}
                    {msg.coupons && msg.coupons.length > 0 && (
                      <div className="uc-chat-block">
                        <div className="uc-chat-list">
                          {msg.coupons.map((coupon) => {
                            const isCopied = copiedCode === coupon.code;
                            return (
                              <div key={coupon.code} className="uc-chat-coupon-row">
                                <div className="uc-chat-coupon-meta">
                                  <div className="uc-chat-coupon-top">
                                    <span className="uc-chat-coupon-code">{coupon.code}</span>
                                    <span className="uc-chat-coupon-val uc-tabular">
                                      {coupon.discountType === 'percentage'
                                        ? `${coupon.discountValue}% off`
                                        : `-${formatVND(coupon.discountValue)}`}
                                    </span>
                                  </div>
                                  {(coupon.minOrderAmount > 0 || coupon.estimatedSavings > 0) && (
                                    <div className="uc-chat-coupon-sub uc-tabular">
                                      {coupon.estimatedSavings > 0
                                        ? `Saves ${formatVND(coupon.estimatedSavings)} on current cart`
                                        : `Min order ${formatVND(coupon.minOrderAmount)}`}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCoupon(coupon.code)}
                                  className={`uc-chat-copy-btn ${isCopied ? 'is-copied' : ''}`}
                                >
                                  {isCopied ? <Check size={12} /> : <Copy size={12} />}
                                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Starter Prompts before first user message */}
              {!hasConversationStarted && !isTyping && (
                <div className="uc-chat-starters-wrap">
                  <div className="uc-chat-starters-label">Quick actions</div>
                  <div className="uc-chat-starters">
                    {starterSuggestions.map((sug, i) => (
                      <button
                        key={`${sug.label}-${i}`}
                        type="button"
                        onClick={() => handleSendMessage(sug.prompt)}
                        className="uc-chat-starter-btn"
                      >
                        <span className="uc-chat-starter-icon" aria-hidden="true">
                          {renderStarterIcon(sug.icon)}
                        </span>
                        <span className="uc-chat-starter-text">{sug.label}</span>
                        <ArrowRight size={12} className="uc-chat-starter-arrow" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Typing Indicator */}
              {isTyping && (
                <div className="uc-chat-typing-row">
                  <div className="uc-chat-mini-avatar" aria-hidden="true">
                    <GlowLogoIcon size={13} color="#2454F4" />
                  </div>
                  <div className="uc-chat-typing" aria-label="Assistant is typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Scroll-to-bottom Floating Pill */}
            {showScrollBtn && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="uc-chat-scroll-btn"
                aria-label="Scroll to latest messages"
              >
                <ChevronDown size={15} />
              </button>
            )}

            {/* Unified Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="uc-chat-composer-wrap"
            >
              <div className="uc-chat-composer">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={currentProductId ? 'Ask about this product or compare...' : 'Ask about products, coupons, or orders...'}
                  className="uc-chat-input"
                  aria-label="Message UCONEXT Assistant"
                />
                <button
                  type="submit"
                  disabled={isTyping || !inputValue.trim()}
                  className="uc-chat-send-btn"
                  aria-label="Send message"
                >
                  <ArrowUp size={16} strokeWidth={2.25} />
                </button>
              </div>
              <div className="uc-chat-composer-hint">
                <span>Enter to send · Shift+Enter for new line</span>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{chatStyles}</style>
    </div>
  );
};

const chatStyles = `
  .uc-chat-root {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999;
  }

  .uc-chat-trigger {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 46px;
    padding: 0 18px 0 14px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--brand) 0%, #3b6cff 100%);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow:
      0 8px 24px rgba(36, 84, 244, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: -0.01em;
    transition: background-color 150ms ease, transform 150ms ease-out, box-shadow 180ms ease-out;
  }

  .uc-chat-trigger:hover {
    transform: translateY(-2px);
    box-shadow:
      0 12px 28px rgba(36, 84, 244, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .uc-chat-trigger:active {
    transform: scale(0.96);
  }

  .uc-chat-trigger-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
  }

  .uc-chat-live-dot {
    position: absolute;
    top: -1px;
    right: -1px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #34d399;
    border: 1.5px solid var(--brand);
    box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.28);
  }

  .uc-chat-live-dot.is-warn {
    background: var(--color-warning);
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.28);
  }

  .uc-chat-drawer {
    position: relative;
    width: 410px;
    max-width: calc(100vw - 32px);
    height: 580px;
    max-height: calc(100vh - 96px);
    border-radius: 22px;
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    overscroll-behavior: contain;
    transition: width 180ms ease-out, height 180ms ease-out;
  }

  .uc-chat-drawer.is-dark {
    background: rgba(15, 17, 25, 0.96);
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  }

  .uc-chat-drawer.is-light {
    background: rgba(255, 255, 255, 0.98);
    box-shadow:
      0 22px 48px rgba(15, 23, 42, 0.14),
      0 0 0 1px rgba(15, 23, 42, 0.04) inset;
  }

  .uc-chat-drawer.is-expanded {
    width: 520px;
    height: 680px;
  }

  .uc-chat-header {
    padding: 14px 14px 14px 16px;
    border-bottom: 1px solid var(--glass-border);
    background: radial-gradient(circle at 12% 0%, rgba(36, 84, 244, 0.12), transparent 65%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
  }

  .uc-chat-header-id {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }

  .uc-chat-avatar {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: rgba(36, 84, 244, 0.1);
    border: 1px solid rgba(36, 84, 244, 0.22);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .uc-chat-avatar-dot {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--color-success);
    border: 2px solid var(--bg-secondary);
  }

  .uc-chat-avatar-dot.is-warn {
    background: var(--color-warning);
  }

  .uc-chat-header-text {
    min-width: 0;
  }

  .uc-chat-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .uc-chat-title {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    line-height: 1.25;
  }

  .uc-chat-ai-badge {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(36, 84, 244, 0.12);
    color: var(--brand);
    border: 1px solid rgba(36, 84, 244, 0.22);
    line-height: 1.5;
  }

  .uc-chat-subtitle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .uc-chat-header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .uc-chat-icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease, transform 120ms ease;
  }

  .uc-chat-icon-btn:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }

  .uc-chat-icon-btn:active {
    transform: scale(0.95);
  }

  .uc-chat-icon-btn.is-danger {
    color: #ef4444;
  }

  .uc-chat-notice-bar {
    padding: 9px 16px;
    border-bottom: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-secondary);
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-shrink: 0;
  }

  .uc-chat-notice-icon {
    color: #f59e0b;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .uc-chat-confirm-bar {
    padding: 8px 16px;
    border-bottom: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    flex-shrink: 0;
  }

  .uc-chat-confirm-actions {
    display: flex;
    gap: 6px;
  }

  .uc-chat-confirm-btn {
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .uc-chat-confirm-btn.danger {
    border-color: transparent;
    background: #ef4444;
    color: #ffffff;
  }

  .uc-chat-thread {
    flex: 1;
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .uc-chat-turn.is-user {
    align-self: flex-end;
    max-width: 84%;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .uc-chat-turn.is-assistant {
    align-self: flex-start;
    width: 100%;
    max-width: 96%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .uc-chat-assistant-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }

  .uc-chat-mini-avatar {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    background: rgba(36, 84, 244, 0.1);
    border: 1px solid rgba(36, 84, 244, 0.18);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .uc-chat-assistant-col {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .uc-chat-time {
    font-size: 11px;
    color: var(--text-muted);
    padding: 0 4px;
  }

  .uc-chat-time.is-user {
    text-align: right;
  }

  .uc-chat-user-pill {
    padding: 10px 14px;
    border-radius: 16px 16px 4px 16px;
    background: linear-gradient(135deg, var(--brand) 0%, #1d46d8 100%);
    color: #ffffff;
    font-size: 13.5px;
    line-height: 1.5;
    box-shadow: 0 4px 14px rgba(36, 84, 244, 0.24);
    text-wrap: pretty;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .uc-chat-assistant-bubble {
    padding: 11px 14px;
    border-radius: 4px 16px 16px 16px;
    background: var(--bg-elevated);
    border: 1px solid var(--glass-border);
    max-width: 100%;
  }

  .uc-chat-prose {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--text-primary);
    text-wrap: pretty;
    word-break: break-word;
  }

  .uc-chat-prose-heading {
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--text-primary);
    margin-top: 4px;
  }

  .uc-chat-inline-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(36, 84, 244, 0.1);
    color: var(--brand);
    border: 1px solid rgba(36, 84, 244, 0.16);
  }

  .uc-chat-prose-ordered {
    display: flex;
    align-items: flex-start;
    gap: 7px;
  }

  .uc-chat-ordered-num {
    font-weight: 700;
    color: var(--brand);
    flex-shrink: 0;
  }

  .uc-chat-prose-spacer {
    height: 4px;
  }

  .uc-chat-prose-bullet {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .uc-chat-bullet-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--brand);
    margin-top: 9px;
    flex-shrink: 0;
  }

  .uc-chat-error-box {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .uc-chat-error-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-primary);
  }

  .uc-chat-error-icon {
    color: #ef4444;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .uc-chat-retry-btn {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 140ms ease, color 140ms ease, transform 120ms ease;
  }

  .uc-chat-retry-btn:hover {
    border-color: #2454F4;
    color: #2454F4;
  }

  .uc-chat-retry-btn:active {
    transform: scale(0.96);
  }

  .uc-chat-block {
    border-radius: 12px;
    border: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    overflow: hidden;
  }

  .uc-chat-block-header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--glass-border);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .uc-chat-list > *:not(:last-child) {
    border-bottom: 1px solid var(--glass-border);
  }

  .uc-chat-item-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
  }

  .uc-chat-item-link {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    text-decoration: none;
    color: var(--text-primary);
  }

  .uc-chat-item-link:hover .uc-chat-item-name {
    color: #2454F4;
  }

  .uc-chat-thumb {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    outline: 1px solid rgba(128, 128, 128, 0.16);
    outline-offset: -1px;
  }

  .uc-chat-item-meta {
    flex: 1;
    min-width: 0;
  }

  .uc-chat-item-name {
    font-size: 12.5px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 140ms ease;
  }

  .uc-chat-item-sub {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    font-size: 11.5px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  .uc-chat-price {
    color: #2454F4;
    font-weight: 700;
  }

  .uc-chat-highlight-tag {
    color: var(--text-muted);
    font-weight: 600;
  }

  .uc-chat-rating {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .uc-chat-add-btn {
    height: 30px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid #2454F4;
    background: #2454F4;
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 150ms ease, border-color 150ms ease, transform 120ms ease;
  }

  .uc-chat-add-btn:hover:not(:disabled) {
    background: #1b3ec8;
    border-color: #1b3ec8;
  }

  .uc-chat-add-btn:active:not(:disabled) {
    transform: scale(0.96);
  }

  .uc-chat-add-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .uc-chat-add-btn.is-added {
    border-color: #10b981;
    background: #10b981;
    color: #ffffff;
  }

  .uc-chat-verdict {
    padding: 9px 12px;
    border-top: 1px solid var(--glass-border);
    border-left: 2px solid #2454F4;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
    text-wrap: pretty;
  }

  .uc-chat-order-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    text-decoration: none;
    color: var(--text-primary);
    transition: background-color 140ms ease;
  }

  .uc-chat-order-row:hover {
    background: var(--bg-elevated);
  }

  .uc-chat-order-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .uc-chat-order-id {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    font-weight: 700;
  }

  .uc-chat-order-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .uc-chat-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .uc-chat-order-sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .uc-chat-order-total {
    color: #2454F4;
    font-weight: 700;
  }

  .uc-chat-coupon-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
  }

  .uc-chat-coupon-meta {
    min-width: 0;
  }

  .uc-chat-coupon-top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .uc-chat-coupon-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .uc-chat-coupon-val {
    font-size: 11.5px;
    font-weight: 700;
    color: #2454F4;
  }

  .uc-chat-coupon-sub {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .uc-chat-copy-btn {
    height: 28px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: 11px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 120ms ease;
  }

  .uc-chat-copy-btn:hover {
    border-color: #2454F4;
    color: #2454F4;
  }

  .uc-chat-copy-btn:active {
    transform: scale(0.96);
  }

  .uc-chat-copy-btn.is-copied {
    border-color: #10b981;
    background: #10b981;
    color: #ffffff;
  }

  .uc-chat-starters-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 32px;
  }

  .uc-chat-starters-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .uc-chat-starters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .uc-chat-starter-btn {
    padding: 9px 10px;
    border-radius: 12px;
    border: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    transition: border-color 140ms ease, color 140ms ease, background-color 140ms ease, transform 120ms ease, box-shadow 140ms ease;
  }

  .uc-chat-starter-icon {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: rgba(36, 84, 244, 0.1);
    color: var(--brand);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .uc-chat-starter-text {
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }

  .uc-chat-starter-arrow {
    color: var(--text-muted);
    flex-shrink: 0;
    opacity: 0.65;
    transition: transform 140ms ease, color 140ms ease, opacity 140ms ease;
  }

  .uc-chat-starter-btn:hover {
    border-color: rgba(36, 84, 244, 0.45);
    background: var(--bg-elevated);
    box-shadow: 0 4px 12px rgba(36, 84, 244, 0.08);
  }

  .uc-chat-starter-btn:hover .uc-chat-starter-arrow {
    color: var(--brand);
    opacity: 1;
    transform: translateX(2px);
  }

  .uc-chat-starter-btn:active {
    transform: scale(0.98);
  }

  .uc-chat-typing-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .uc-chat-typing {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 10px 14px;
    border-radius: 4px 14px 14px 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--glass-border);
    align-self: flex-start;
  }

  .uc-chat-typing span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand);
    opacity: 0.7;
    animation: ucChatPulse 1.1s infinite ease-in-out;
  }

  .uc-chat-typing span:nth-child(2) {
    animation-delay: 0.16s;
  }

  .uc-chat-typing span:nth-child(3) {
    animation-delay: 0.32s;
  }

  @keyframes ucChatPulse {
    0%, 80%, 100% { opacity: 0.25; transform: scale(0.84); }
    40% { opacity: 1; transform: scale(1); }
  }

  .uc-chat-scroll-btn {
    position: absolute;
    right: 16px;
    bottom: 84px;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    border: 1px solid var(--glass-border);
    background: var(--bg-elevated);
    color: var(--text-primary);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 4;
    transition: border-color 140ms ease, color 140ms ease, transform 140ms ease;
  }

  .uc-chat-scroll-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  .uc-chat-composer-wrap {
    padding: 10px 14px 10px 14px;
    border-top: 1px solid var(--glass-border);
    flex-shrink: 0;
  }

  .uc-chat-composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border-radius: 14px;
    border: 1px solid var(--glass-border);
    background: var(--input-bg);
    transition: border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
  }

  .uc-chat-composer:focus-within {
    background: var(--input-focus-bg);
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(36, 84, 244, 0.14);
  }

  .uc-chat-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13.5px;
    line-height: 1.45;
    padding: 6px 0;
    resize: none;
    max-height: 96px;
    overflow-y: auto;
    outline: none;
  }

  .uc-chat-input:focus,
  .uc-chat-input:focus-visible {
    outline: none;
  }

  .uc-chat-input::placeholder {
    color: var(--text-muted);
  }

  .uc-chat-send-btn {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, var(--brand) 0%, #3b6cff 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 140ms ease, opacity 140ms ease, transform 120ms ease, box-shadow 140ms ease;
  }

  .uc-chat-send-btn:hover:not(:disabled) {
    box-shadow: 0 4px 12px rgba(36, 84, 244, 0.34);
  }

  .uc-chat-send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .uc-chat-send-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .uc-chat-composer-hint {
    margin-top: 6px;
    text-align: center;
    font-size: 11px;
    color: var(--text-muted);
    opacity: 0.8;
  }

  .uc-tabular {
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 640px) {
    .uc-chat-root {
      bottom: 14px;
      right: 14px;
      left: 14px;
      display: flex;
      justify-content: flex-end;
      pointer-events: none;
    }

    .uc-chat-trigger,
    .uc-chat-drawer {
      pointer-events: auto;
    }

    .uc-chat-drawer,
    .uc-chat-drawer.is-expanded {
      width: 100%;
      max-width: 100%;
      height: min(78vh, 620px);
      max-height: calc(100vh - 28px);
      border-radius: 20px;
    }

    .uc-chat-expand-btn {
      display: none;
    }

    .uc-chat-starters-wrap {
      padding-left: 0;
    }

    .uc-chat-starters {
      grid-template-columns: 1fr;
    }

    .uc-chat-composer-hint {
      display: none;
    }
  }
`;

export default AIFloatingChat;
