import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  ArrowUp,
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

function renderBoldSegments(line, keyPrefix) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b-${idx}`} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
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
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={`li-${idx}`} className="uc-chat-prose-bullet">
              <span className="uc-chat-bullet-dot" aria-hidden="true" />
              <span>{renderBoldSegments(trimmed.slice(2), `li-${idx}`)}</span>
            </div>
          );
        }
        return <div key={`ln-${idx}`}>{renderBoldSegments(line, `ln-${idx}`)}</div>;
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

  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const timersRef = useRef([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
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
      list.push('Tư vấn chi tiết sản phẩm này', 'So sánh sản phẩm này với mẫu tương tự');
    }
    if (user) {
      list.push('Gợi ý theo sở thích của tôi', 'Kiểm tra đơn hàng của tôi');
    } else {
      list.push('Best noise-canceling headphones', 'Certified skincare essentials');
    }
    list.push('Tìm sản phẩm dưới 1 triệu', 'Mã giảm giá cho giỏ hàng');
    return Array.from(new Set(list)).slice(0, 4);
  })();

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
          <MessageCircle size={17} strokeWidth={2} />
          <span>UCONEXT Assistant</span>
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
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
                <div className="ui-icon-box" style={{ width: '36px', height: '36px' }} aria-hidden="true">
                  <GlowLogoIcon size={18} color="#2454F4" />
                </div>
                <div className="uc-chat-header-text">
                  <div className="uc-chat-title">UCONEXT Assistant</div>
                  <div className="uc-chat-subtitle">
                    {isUnconfigured && <span className="uc-chat-setup-dot" aria-hidden="true" />}
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
                  className="uc-chat-icon-btn"
                  title={isExpanded ? 'Compact view' : 'Expand view'}
                  aria-label={isExpanded ? 'Compact view' : 'Expand view'}
                >
                  {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="uc-chat-icon-btn"
                  title="Close"
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
            <div className="uc-chat-thread">
              {messages.map((msg) => {
                if (msg.sender === 'user') {
                  return (
                    <div key={msg.id} className="uc-chat-turn is-user">
                      <div className="uc-chat-user-pill">{msg.text}</div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="uc-chat-turn is-assistant">
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
                <div className="uc-chat-starters">
                  {starterSuggestions.map((sug, i) => (
                    <button
                      key={`${sug}-${i}`}
                      type="button"
                      onClick={() => handleSendMessage(sug)}
                      className="uc-chat-starter-btn"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}

              {/* Typing Indicator */}
              {isTyping && (
                <div className="uc-chat-typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Unified Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="uc-chat-composer-wrap"
            >
              <div className="uc-chat-composer">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={currentProductId ? 'Ask about this product or compare...' : 'Ask about products, coupons, or orders...'}
                  className="uc-chat-input"
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
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    background: #2454F4;
    color: #ffffff;
    border: none;
    box-shadow: 0 4px 14px rgba(36, 84, 244, 0.28);
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: -0.01em;
    transition: background-color 150ms ease, transform 150ms ease-out, box-shadow 180ms ease-out;
  }

  .uc-chat-trigger:hover {
    background: #1b3ec8;
    transform: translateY(-1px);
    box-shadow: 0 8px 22px rgba(36, 84, 244, 0.34);
  }

  .uc-chat-trigger:active {
    transform: scale(0.96);
  }

  .uc-chat-drawer {
    width: 396px;
    max-width: calc(100vw - 32px);
    height: 560px;
    max-height: calc(100vh - 96px);
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 180ms ease-out, height 180ms ease-out;
  }

  .uc-chat-drawer.is-dark {
    background: rgba(18, 20, 29, 0.96);
    box-shadow: 0 24px 50px rgba(0, 0, 0, 0.5);
  }

  .uc-chat-drawer.is-light {
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
  }

  .uc-chat-drawer.is-expanded {
    width: 500px;
    height: 660px;
  }

  .uc-chat-header {
    padding: 14px 14px 14px 16px;
    border-bottom: 1px solid var(--glass-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
  }

  .uc-chat-header-id {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .uc-chat-header-text {
    min-width: 0;
  }

  .uc-chat-title {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    line-height: 1.25;
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
    margin-top: 1px;
  }

  .uc-chat-setup-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    flex-shrink: 0;
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
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .uc-chat-turn.is-user {
    align-self: flex-end;
    max-width: 82%;
  }

  .uc-chat-turn.is-assistant {
    align-self: flex-start;
    max-width: 92%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .uc-chat-user-pill {
    padding: 10px 14px;
    border-radius: 14px 14px 4px 14px;
    background: #2454F4;
    color: #ffffff;
    font-size: 13.5px;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .uc-chat-assistant-bubble {
    padding: 11px 14px;
    border-radius: 14px 14px 14px 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--glass-border);
  }

  .uc-chat-prose {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--text-primary);
    text-wrap: pretty;
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
    background: #2454F4;
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

  .uc-chat-starters {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 2px;
  }

  .uc-chat-starter-btn {
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid var(--glass-border);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: border-color 140ms ease, color 140ms ease, background-color 140ms ease, transform 120ms ease;
  }

  .uc-chat-starter-btn:hover {
    border-color: #2454F4;
    color: #2454F4;
    background: var(--bg-elevated);
  }

  .uc-chat-starter-btn:active {
    transform: scale(0.98);
  }

  .uc-chat-typing {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 10px 14px;
    border-radius: 14px 14px 14px 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--glass-border);
    align-self: flex-start;
  }

  .uc-chat-typing span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: ucChatPulse 1.1s infinite ease-in-out;
  }

  .uc-chat-typing span:nth-child(2) {
    animation-delay: 0.16s;
  }

  .uc-chat-typing span:nth-child(3) {
    animation-delay: 0.32s;
  }

  @keyframes ucChatPulse {
    0%, 80%, 100% { opacity: 0.28; transform: scale(0.88); }
    40% { opacity: 1; transform: scale(1); }
  }

  .uc-chat-composer-wrap {
    padding: 10px 14px 14px 14px;
    border-top: 1px solid var(--glass-border);
    flex-shrink: 0;
  }

  .uc-chat-composer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 5px 5px 14px;
    border-radius: 10px;
    border: 1px solid var(--glass-border);
    background: var(--input-bg);
    transition: border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
  }

  .uc-chat-composer:focus-within {
    background: var(--input-focus-bg);
    border-color: #2454F4;
    box-shadow: 0 0 0 3px rgba(36, 84, 244, 0.14);
  }

  .uc-chat-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
  }

  .uc-chat-input::placeholder {
    color: var(--text-muted);
  }

  .uc-chat-send-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: none;
    background: #2454F4;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 140ms ease, opacity 140ms ease, transform 120ms ease;
  }

  .uc-chat-send-btn:hover:not(:disabled) {
    background: #1b3ec8;
  }

  .uc-chat-send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .uc-chat-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .uc-tabular {
    font-variant-numeric: tabular-nums;
  }
`;

export default AIFloatingChat;
