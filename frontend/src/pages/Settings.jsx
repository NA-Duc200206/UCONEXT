import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sun,
  Moon,
  User,
  Lock,
  Contrast,
  Check,
  AlertCircle,
  Upload,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  SlidersHorizontal,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Package,
  Heart,
  LogOut,
  Shield,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWishlist } from '../context/WishlistContext';
import { api } from '../services/api';
import { formatVND, getSafeImageUrl, handleImageError, translateCategoryName } from '../utils/formatters';

const InlineFeedback = ({ feedback }) => {
  if (!feedback?.message) return null;
  const isError = feedback.type === 'error';
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: '600',
        background: isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
        border: `1px solid ${isError ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
        color: isError ? 'var(--color-error)' : 'var(--color-success)',
      }}
    >
      {isError ? <AlertCircle size={16} strokeWidth={1.85} style={{ flexShrink: 0 }} /> : <Check size={16} strokeWidth={1.85} style={{ flexShrink: 0 }} />}
      <span>{feedback.message}</span>
    </div>
  );
};

const PasswordInput = ({ id, label, value, onChange, placeholder, autoComplete }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor={id} style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="settings-input"
          style={{ paddingRight: '42px' }}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px',
          }}
        >
          {visible ? <Eye size={16} strokeWidth={1.75} /> : <EyeOff size={16} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
};

const Settings = () => {
  const { isDark, toggleTheme } = useTheme();
  const { user, loading: authLoading, updateUser, logout } = useAuth();
  const { showToast } = useToast();
  const { wishlistCount } = useWishlist();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Profile form state
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState(null);

  // Shopping preferences state
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [preferredCategoryIds, setPreferredCategoryIds] = useState([]);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesFeedback, setPreferencesFeedback] = useState(null);

  // Saved addresses state
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrFullName, setAddrFullName] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState(null);
  const [addressFeedback, setAddressFeedback] = useState(null);
  const [confirmDeleteAddressId, setConfirmDeleteAddressId] = useState(null);
  const [deletingAddressId, setDeletingAddressId] = useState(null);

  // Personalization summary & recently viewed state
  const [ordersCount, setOrdersCount] = useState(null);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [confirmClearRecent, setConfirmClearRecent] = useState(false);
  const [clearingRecent, setClearingRecent] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setAvatar(user.avatar || '');
      setPreferredCategoryIds(
        (user.preferredCategories || []).map((c) => String(c?._id || c)).filter(Boolean)
      );
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const loadPersonalData = async () => {
      setLoadingCategories(true);
      setLoadingRecent(true);
      try {
        const [catRes, recentRes, ordersRes] = await Promise.allSettled([
          api.categories.getAll(),
          api.auth.getRecentlyViewed(),
          api.orders.getMyOrders(),
        ]);
        if (!mounted) return;
        if (catRes.status === 'fulfilled') {
          setCategories(catRes.value?.categories || []);
        }
        if (recentRes.status === 'fulfilled') {
          setRecentlyViewed(
            Array.isArray(recentRes.value?.products) ? recentRes.value.products.slice(0, 4) : []
          );
        }
        if (ordersRes.status === 'fulfilled') {
          setOrdersCount(
            Array.isArray(ordersRes.value?.orders) ? ordersRes.value.orders.length : 0
          );
        }
      } finally {
        if (mounted) {
          setLoadingCategories(false);
          setLoadingRecent(false);
        }
      }
    };
    loadPersonalData();
    return () => {
      mounted = false;
    };
  }, [user?._id, user?.id]);

  const handleConfirmClearRecent = async () => {
    setRecentFeedback(null);
    setClearingRecent(true);
    try {
      await api.auth.clearRecentlyViewed();
      try {
        localStorage.removeItem('uconext_recently_viewed');
      } catch {
        // Ignore storage errors
      }
      setRecentlyViewed([]);
      setConfirmClearRecent(false);
      setRecentFeedback({ type: 'success', message: 'Recently viewed history cleared.' });
      showToast('Recently viewed history cleared.', 'info');
    } catch (err) {
      setRecentFeedback({ type: 'error', message: err.message || 'Failed to clear history.' });
    } finally {
      setClearingRecent(false);
    }
  };

  const savedAddresses = Array.isArray(user?.savedAddresses) ? user.savedAddresses : [];

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setProfileFeedback(null);
    try {
      const res = await api.media.uploadAvatar(file);
      if (res?.imageUrl) {
        setAvatar(res.imageUrl);
        setProfileFeedback({ type: 'success', message: 'Avatar uploaded. Click "Save Profile" to apply.' });
      }
    } catch (err) {
      setProfileFeedback({ type: 'error', message: err.message || 'Failed to upload avatar.' });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileFeedback(null);

    const trimmedName = name.trim();
    const trimmedAvatar = avatar.trim();

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setProfileFeedback({ type: 'error', message: 'Name must be between 2 and 80 characters.' });
      return;
    }

    if (trimmedAvatar && trimmedAvatar.length > 500) {
      setProfileFeedback({ type: 'error', message: 'Avatar URL must be 500 characters or fewer.' });
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.auth.updateProfile({ name: trimmedName, avatar: trimmedAvatar });
      if (res?.user) {
        updateUser(res.user);
      }
      setProfileFeedback({ type: 'success', message: 'Profile updated successfully.' });
      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      setProfileFeedback({ type: 'error', message: err.message || 'Failed to update profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'Please fill in all password fields.' });
      return;
    }

    if (newPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      setPasswordFeedback({
        type: 'error',
        message: 'New password must be at least 8 characters and include uppercase, lowercase, and a number.',
      });
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordFeedback({ type: 'error', message: 'New password must be different from your current password.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    setSavingPassword(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordFeedback({ type: 'success', message: 'Password updated successfully.' });
      showToast('Password updated successfully.', 'success');
    } catch (err) {
      setPasswordFeedback({ type: 'error', message: err.message || 'Failed to update password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleTogglePreferredCategory = (catId) => {
    setPreferencesFeedback(null);
    const idStr = String(catId);
    setPreferredCategoryIds((prev) => {
      if (prev.includes(idStr)) {
        return prev.filter((id) => id !== idStr);
      }
      if (prev.length >= 5) {
        setPreferencesFeedback({
          type: 'error',
          message: 'You can select up to 5 favorite categories.',
        });
        return prev;
      }
      return [...prev, idStr];
    });
  };

  const handleSavePreferences = async () => {
    setPreferencesFeedback(null);
    setSavingPreferences(true);
    try {
      const res = await api.auth.updatePreferences(preferredCategoryIds);
      if (res?.user) {
        updateUser(res.user);
      }
      setPreferencesFeedback({ type: 'success', message: 'Shopping preferences saved.' });
      showToast('Shopping preferences saved.', 'success');
    } catch (err) {
      setPreferencesFeedback({
        type: 'error',
        message: err.message || 'Failed to save shopping preferences.',
      });
    } finally {
      setSavingPreferences(false);
    }
  };

  const resetAddressForm = () => {
    setShowAddressForm(false);
    setEditingAddressId(null);
    setAddrLabel('Home');
    setAddrFullName(user?.name || '');
    setAddrPhone('');
    setAddrStreet('');
    setAddrIsDefault(savedAddresses.length === 0);
  };

  const handleOpenAddAddress = () => {
    setAddressFeedback(null);
    setConfirmDeleteAddressId(null);
    setEditingAddressId(null);
    setAddrLabel('Home');
    setAddrFullName(user?.name || '');
    setAddrPhone('');
    setAddrStreet('');
    setAddrIsDefault(savedAddresses.length === 0);
    setShowAddressForm(true);
  };

  const handleOpenEditAddress = (addr) => {
    setAddressFeedback(null);
    setConfirmDeleteAddressId(null);
    setEditingAddressId(String(addr._id || addr.id));
    setAddrLabel(addr.label || 'Home');
    setAddrFullName(addr.fullName || '');
    setAddrPhone(addr.phone || '');
    setAddrStreet(addr.address || '');
    setAddrIsDefault(Boolean(addr.isDefault));
    setShowAddressForm(true);
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    setAddressFeedback(null);

    const payload = {
      label: addrLabel.trim() || 'Home',
      fullName: addrFullName.trim(),
      phone: addrPhone.trim(),
      address: addrStreet.trim(),
      isDefault: addrIsDefault,
    };

    if (payload.fullName.length < 2) {
      setAddressFeedback({ type: 'error', message: 'Recipient full name must be at least 2 characters.' });
      return;
    }
    if (!/^[0-9+\-\s()]{8,20}$/.test(payload.phone)) {
      setAddressFeedback({ type: 'error', message: 'Please enter a valid phone number (8-20 characters).' });
      return;
    }
    if (payload.address.length < 5) {
      setAddressFeedback({ type: 'error', message: 'Shipping address must be at least 5 characters.' });
      return;
    }

    setSavingAddress(true);
    try {
      const res = editingAddressId
        ? await api.auth.updateAddress(editingAddressId, payload)
        : await api.auth.addAddress(payload);
      if (res?.user) {
        updateUser(res.user);
      }
      resetAddressForm();
      const msg = editingAddressId ? 'Address updated successfully.' : 'Address added successfully.';
      setAddressFeedback({ type: 'success', message: msg });
      showToast(msg, 'success');
    } catch (err) {
      setAddressFeedback({ type: 'error', message: err.message || 'Failed to save address.' });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (addressId) => {
    setAddressFeedback(null);
    setSettingDefaultId(addressId);
    try {
      const res = await api.auth.updateAddress(addressId, { isDefault: true });
      if (res?.user) {
        updateUser(res.user);
      }
      setAddressFeedback({ type: 'success', message: 'Default shipping address updated.' });
      showToast('Default shipping address updated.', 'success');
    } catch (err) {
      setAddressFeedback({ type: 'error', message: err.message || 'Failed to update default address.' });
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleConfirmDeleteAddress = async (addressId) => {
    setAddressFeedback(null);
    setDeletingAddressId(addressId);
    try {
      const res = await api.auth.deleteAddress(addressId);
      if (res?.user) {
        updateUser(res.user);
      }
      setConfirmDeleteAddressId(null);
      if (editingAddressId === addressId) {
        resetAddressForm();
      }
      setAddressFeedback({ type: 'success', message: 'Address removed.' });
      showToast('Address removed.', 'success');
    } catch (err) {
      setAddressFeedback({ type: 'error', message: err.message || 'Failed to delete address.' });
    } finally {
      setDeletingAddressId(null);
    }
  };

  const avatarPreviewUrl = avatar.trim() ? getSafeImageUrl(avatar.trim()) : null;
  const userInitial = (name || user?.name || 'U').charAt(0).toUpperCase();

  return (
    <div className="settings-page-container">
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            marginBottom: '10px',
          }}
        >
          <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            Home
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>Settings</span>
        </div>
        <h1
          style={{
            fontSize: '30px',
            fontWeight: '800',
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
            margin: '0 0 6px 0',
          }}
        >
          Account & Preferences
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
          Manage your profile, shopping preferences, saved addresses, security, and display theme.
        </p>
      </div>

      <div className="settings-layout">
        {/* Left Sidebar Summary */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="settings-card">
            {authLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Loading account...</p>
            ) : user ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '84px',
                    height: '84px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: 'var(--brand)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '30px',
                    fontWeight: '800',
                    border: '2px solid var(--glass-border)',
                  }}
                >
                  {avatarPreviewUrl ? (
                    <img
                      src={avatarPreviewUrl}
                      alt={user.name}
                      onError={handleImageError}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    userInitial
                  )}
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                    {user.name}
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 10px 0', wordBreak: 'break-all' }}>
                    {user.email}
                  </p>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--glass-border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <ShieldCheck size={14} strokeWidth={1.75} />
                    {user.role || 'customer'}
                  </span>
                </div>

                {/* Personalization Summary Mini Stats */}
                <div
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '8px',
                    paddingTop: '14px',
                    marginTop: '4px',
                    borderTop: '1px solid var(--glass-border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {preferredCategoryIds.length}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600' }}>
                      Interests
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {savedAddresses.length}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600' }}>
                      Addresses
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {wishlistCount}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600' }}>
                      Wishlist
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                  <div className="settings-icon-box">
                    <LogIn size={18} strokeWidth={1.75} />
                  </div>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Sign in to your account</h2>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Log in to update your profile information or change your password. Theme preferences apply immediately.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <Link to="/login" className="settings-btn-primary" style={{ textDecoration: 'none' }}>
                    Sign In
                  </Link>
                  <Link to="/register" className="settings-btn-secondary" style={{ textDecoration: 'none' }}>
                    Create Account
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* My Account Quick Hub */}
          {user && (
            <div className="settings-card" style={{ padding: '16px' }}>
              <h2
                style={{
                  fontSize: '12px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  margin: '0 0 10px 10px',
                }}
              >
                My Account
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <Link to="/orders" className="settings-hub-link">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                    <Package size={17} strokeWidth={1.75} className="settings-hub-icon" />
                    <span>My Orders</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    {ordersCount !== null && <span className="settings-hub-badge">{ordersCount}</span>}
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-muted)" />
                  </span>
                </Link>
                <Link to="/wishlist" className="settings-hub-link">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                    <Heart size={17} strokeWidth={1.75} className="settings-hub-icon" />
                    <span>My Wishlist</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span className="settings-hub-badge">{wishlistCount}</span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-muted)" />
                  </span>
                </Link>
                {user.role === 'admin' && (
                  <Link to="/admin" className="settings-hub-link">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      <Shield size={17} strokeWidth={1.75} className="settings-hub-icon" />
                      <span>Admin Dashboard</span>
                    </span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-muted)" />
                  </Link>
                )}
                <div style={{ height: '1px', background: 'var(--glass-border)', margin: '6px 8px' }} />
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                  className="settings-hub-link"
                  style={{ color: 'var(--color-error)', width: '100%', textAlign: 'left' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                    <LogOut size={17} strokeWidth={1.75} />
                    <span>Sign Out</span>
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Appearance Card */}
          <div className="settings-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="settings-icon-box">
                <Contrast size={18} strokeWidth={1.75} />
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                Appearance
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Color Theme</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Currently using {isDark ? 'Dark' : 'Light'} mode
                </div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="settings-btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {isDark ? <Moon size={15} strokeWidth={1.75} /> : <Sun size={15} strokeWidth={1.75} />}
                {isDark ? 'Dark' : 'Light'}
              </button>
            </div>
          </div>
        </aside>

        {/* Right Main Forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {user && (
            <>
              {/* Profile Information */}
              <section className="settings-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div className="settings-icon-box">
                    <User size={18} strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                      Profile Information
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                      Update your display name and profile picture.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="settings-form-grid">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label htmlFor="settings-name" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                        Full Name
                      </label>
                      <input
                        id="settings-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your full name"
                        maxLength={80}
                        className="settings-input"
                        required
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label htmlFor="settings-email" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                        Email Address
                      </label>
                      <input
                        id="settings-email"
                        type="email"
                        value={user.email || ''}
                        disabled
                        className="settings-input"
                        style={{ opacity: 0.65, cursor: 'not-allowed' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="settings-avatar" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      Avatar URL
                    </label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input
                        id="settings-avatar"
                        type="text"
                        value={avatar}
                        onChange={(e) => setAvatar(e.target.value)}
                        placeholder="https://... or upload an image"
                        className="settings-input"
                        style={{ flex: 1, minWidth: '220px' }}
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="settings-btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                      >
                        <Upload size={15} strokeWidth={1.75} />
                        {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                      </button>
                    </div>
                  </div>

                  <InlineFeedback feedback={profileFeedback} />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" disabled={savingProfile} className="settings-btn-primary">
                      {savingProfile ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              </section>

              {/* Shopping Preferences */}
              <section className="settings-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="settings-icon-box">
                      <SlidersHorizontal size={18} strokeWidth={1.75} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                        Shopping Preferences
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        Pick up to 5 categories you love to personalize home recommendations and AI tips.
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: '700',
                      background: isDark ? 'rgba(36, 84, 244, 0.16)' : 'rgba(36, 84, 244, 0.1)',
                      color: isDark ? '#93c5fd' : 'var(--brand)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {preferredCategoryIds.length} / 5 selected
                  </span>
                </div>

                {loadingCategories ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                    Loading categories...
                  </p>
                ) : categories.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                    No categories available right now.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    {categories.map((cat) => {
                      const catId = String(cat._id || cat.id);
                      const isSelected = preferredCategoryIds.includes(catId);
                      return (
                        <button
                          key={catId}
                          type="button"
                          onClick={() => handleTogglePreferredCategory(catId)}
                          className={`settings-pref-chip ${isSelected ? 'active' : ''}`}
                        >
                          {isSelected && <Check size={13} strokeWidth={2.5} />}
                          <span>{translateCategoryName(cat.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <InlineFeedback feedback={preferencesFeedback} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleSavePreferences}
                      disabled={savingPreferences || loadingCategories}
                      className="settings-btn-primary"
                    >
                      {savingPreferences ? 'Saving...' : 'Save Preferences'}
                    </button>
                  </div>
                </div>
              </section>

              {/* Saved Addresses */}
              <section className="settings-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="settings-icon-box">
                      <MapPin size={18} strokeWidth={1.75} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                        Saved Addresses
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        Store delivery addresses for quick one-click autofill at checkout.
                      </p>
                    </div>
                  </div>
                  {!showAddressForm && (
                    <button
                      type="button"
                      onClick={handleOpenAddAddress}
                      className="settings-btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Plus size={15} strokeWidth={1.75} />
                      Add Address
                    </button>
                  )}
                </div>

                {showAddressForm && (
                  <form
                    onSubmit={handleSaveAddress}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                      padding: '18px',
                      borderRadius: '12px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--glass-border)',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {editingAddressId ? 'Edit Shipping Address' : 'New Shipping Address'}
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {['Home', 'Office', 'Other'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setAddrLabel(preset)}
                            className={`settings-pref-chip ${addrLabel === preset ? 'active' : ''}`}
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="settings-form-grid">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label htmlFor="addr-label" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          Label
                        </label>
                        <input
                          id="addr-label"
                          type="text"
                          value={addrLabel}
                          onChange={(e) => setAddrLabel(e.target.value)}
                          placeholder="e.g. Home, Office"
                          maxLength={40}
                          className="settings-input"
                          style={{ background: 'var(--bg-secondary)' }}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label htmlFor="addr-fullname" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          Recipient Name *
                        </label>
                        <input
                          id="addr-fullname"
                          type="text"
                          value={addrFullName}
                          onChange={(e) => setAddrFullName(e.target.value)}
                          placeholder="e.g. David Nguyen"
                          maxLength={80}
                          className="settings-input"
                          style={{ background: 'var(--bg-secondary)' }}
                          required
                        />
                      </div>
                    </div>

                    <div className="settings-form-grid">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label htmlFor="addr-phone" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          Phone Number *
                        </label>
                        <input
                          id="addr-phone"
                          type="tel"
                          value={addrPhone}
                          onChange={(e) => setAddrPhone(e.target.value)}
                          placeholder="0912 345 678"
                          maxLength={20}
                          className="settings-input"
                          style={{ background: 'var(--bg-secondary)' }}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label htmlFor="addr-street" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                          Full Address *
                        </label>
                        <input
                          id="addr-street"
                          type="text"
                          value={addrStreet}
                          onChange={(e) => setAddrStreet(e.target.value)}
                          placeholder="e.g. 120 Tran Duy Hung, Cau Giay, Hanoi"
                          maxLength={300}
                          className="settings-input"
                          style={{ background: 'var(--bg-secondary)' }}
                          required
                        />
                      </div>
                    </div>

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={addrIsDefault}
                        onChange={(e) => setAddrIsDefault(e.target.checked)}
                        style={{ accentColor: 'var(--brand)', width: '15px', height: '15px', cursor: 'pointer' }}
                      />
                      <span>Set as default delivery address</span>
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                      <button type="button" onClick={resetAddressForm} className="settings-btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" disabled={savingAddress} className="settings-btn-primary">
                        {savingAddress ? 'Saving...' : editingAddressId ? 'Update Address' : 'Save Address'}
                      </button>
                    </div>
                  </form>
                )}

                {savedAddresses.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                    No saved addresses yet. Add your primary address for faster checkout.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: addressFeedback ? '14px' : 0 }}>
                    {savedAddresses.map((addr) => {
                      const addrId = String(addr._id || addr.id);
                      const isConfirmingDelete = confirmDeleteAddressId === addrId;
                      return (
                        <div
                          key={addrId}
                          style={{
                            padding: '14px 16px',
                            borderRadius: '12px',
                            background: 'var(--bg-elevated)',
                            border: addr.isDefault ? '1px solid var(--brand)' : '1px solid var(--glass-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              <span
                                style={{
                                  fontSize: '11.5px',
                                  fontWeight: '700',
                                  padding: '2px 9px',
                                  borderRadius: '999px',
                                  background: 'var(--bg-secondary)',
                                  border: '1px solid var(--glass-border)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {addr.label || 'Home'}
                              </span>
                              {addr.isDefault && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '11.5px',
                                    fontWeight: '700',
                                    padding: '2px 9px',
                                    borderRadius: '999px',
                                    background: isDark ? 'rgba(36, 84, 244, 0.16)' : 'rgba(36, 84, 244, 0.1)',
                                    color: isDark ? '#93c5fd' : 'var(--brand)',
                                  }}
                                >
                                  <Check size={12} strokeWidth={2.25} />
                                  Default
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' }}>
                              {addr.fullName} · <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{addr.phone}</span>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              {addr.address}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {!addr.isDefault && (
                              <button
                                type="button"
                                onClick={() => handleSetDefaultAddress(addrId)}
                                disabled={settingDefaultId === addrId}
                                className="settings-btn-secondary"
                                style={{ padding: '6px 11px', fontSize: '12px' }}
                              >
                                {settingDefaultId === addrId ? 'Setting...' : 'Set Default'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditAddress(addr)}
                              className="settings-btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Pencil size={13} strokeWidth={1.75} />
                              Edit
                            </button>

                            {isConfirmingDelete ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  disabled={deletingAddressId === addrId}
                                  onClick={() => handleConfirmDeleteAddress(addrId)}
                                  style={{
                                    padding: '6px 11px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(239, 68, 68, 0.5)',
                                    background: 'rgba(239, 68, 68, 0.14)',
                                    color: 'var(--color-error)',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {deletingAddressId === addrId ? 'Deleting...' : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteAddressId(null)}
                                  className="settings-btn-secondary"
                                  style={{ padding: '6px 10px', fontSize: '12px' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAddressId(addrId)}
                                className="settings-btn-secondary"
                                aria-label="Delete address"
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  color: 'var(--color-error)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Trash2 size={13} strokeWidth={1.75} />
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <InlineFeedback feedback={addressFeedback} />
              </section>

              {/* Recently Viewed */}
              <section className="settings-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="settings-icon-box">
                      <Clock size={18} strokeWidth={1.75} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                        Recently Viewed
                      </h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        Products synced across your devices so you can pick up right where you left off.
                      </p>
                    </div>
                  </div>

                  {recentlyViewed.length > 0 && (
                    confirmClearRecent ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={clearingRecent}
                          onClick={handleConfirmClearRecent}
                          style={{
                            padding: '6px 11px',
                            borderRadius: '8px',
                            border: '1px solid rgba(239, 68, 68, 0.5)',
                            background: 'rgba(239, 68, 68, 0.14)',
                            color: 'var(--color-error)',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                          }}
                        >
                          {clearingRecent ? 'Clearing...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          disabled={clearingRecent}
                          onClick={() => setConfirmClearRecent(false)}
                          className="settings-btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClearRecent(true)}
                        className="settings-btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', fontSize: '12.5px' }}
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                        Clear History
                      </button>
                    )
                  )}
                </div>

                {loadingRecent ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    Loading browsing history...
                  </p>
                ) : recentlyViewed.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                      No recently viewed products yet.
                    </p>
                    <Link to="/products" className="settings-btn-secondary" style={{ textDecoration: 'none' }}>
                      Browse Catalog
                    </Link>
                  </div>
                ) : (
                  <div className="settings-recent-grid">
                    {recentlyViewed.map((item) => {
                      const pid = String(item._id || item.id);
                      const catName = translateCategoryName(
                        item.category?.name || item.categoryId?.name || 'Product'
                      );
                      return (
                        <Link
                          key={pid}
                          to={`/product/${pid}`}
                          className="settings-recent-card"
                        >
                          <img
                            src={getSafeImageUrl(item.image)}
                            alt={item.name}
                            onError={handleImageError}
                            style={{
                              width: '56px',
                              height: '56px',
                              borderRadius: '10px',
                              objectFit: 'cover',
                              flexShrink: 0,
                              border: '1px solid var(--glass-border)',
                              background: 'var(--bg-secondary)',
                            }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                marginBottom: '2px',
                              }}
                            >
                              {catName}
                            </div>
                            <div
                              style={{
                                fontSize: '13.5px',
                                fontWeight: '700',
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginBottom: '3px',
                              }}
                            >
                              {item.name}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: isDark ? '#93c5fd' : 'var(--brand)' }}>
                              {formatVND(item.price)}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {recentFeedback && (
                  <div style={{ marginTop: '14px' }}>
                    <InlineFeedback feedback={recentFeedback} />
                  </div>
                )}
              </section>

              {/* Change Password */}
              <section className="settings-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div className="settings-icon-box">
                    <Lock size={18} strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                      Change Password
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                      Use at least 8 characters with uppercase, lowercase, and a number.
                    </p>
                  </div>
                </div>

                <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <PasswordInput
                    id="current-password"
                    label="Current Password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                  />

                  <div className="settings-form-grid">
                    <PasswordInput
                      id="new-password"
                      label="New Password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 chars (A-Z, a-z, 0-9)"
                      autoComplete="new-password"
                    />
                    <PasswordInput
                      id="confirm-password"
                      label="Confirm New Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                    />
                  </div>

                  <InlineFeedback feedback={passwordFeedback} />

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" disabled={savingPassword} className="settings-btn-primary">
                      {savingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>
      </div>

      <style>{`
        .settings-page-container {
          max-width: 1560px;
          margin: 0 auto;
          padding: 32px 48px 64px;
          min-height: 75vh;
        }

        .settings-layout {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }

        .settings-card {
          background: var(--bg-secondary);
          border: 1px solid var(--glass-border);
          border-radius: 16px;
          padding: 24px;
        }

        .settings-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--glass-border);
          color: var(--text-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .settings-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .settings-input {
          width: 100%;
          padding: 11px 14px;
          border-radius: 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--glass-border);
          color: var(--text-primary);
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .settings-input:focus {
          border-color: var(--brand);
        }

        .settings-btn-primary {
          padding: 10px 20px;
          border-radius: 10px;
          background: var(--brand);
          border: 1px solid var(--brand);
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease, opacity 0.15s ease;
        }

        .settings-btn-primary:hover:not(:disabled) {
          background: var(--brand-hover);
        }

        .settings-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-btn-secondary {
          padding: 10px 16px;
          border-radius: 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--glass-border);
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }

        .settings-btn-secondary:hover:not(:disabled) {
          border-color: var(--brand);
        }

        .settings-btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .settings-pref-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 999px;
          background: var(--bg-elevated);
          border: 1px solid var(--glass-border);
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
        }

        .settings-pref-chip:hover {
          border-color: var(--brand);
          color: var(--text-primary);
        }

        .settings-pref-chip.active {
          background: ${isDark ? 'rgba(36, 84, 244, 0.16)' : 'rgba(36, 84, 244, 0.08)'};
          border-color: ${isDark ? 'rgba(96, 165, 250, 0.5)' : 'var(--brand)'};
          color: ${isDark ? '#93c5fd' : 'var(--brand)'};
          font-weight: 700;
        }

        .settings-hub-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-primary);
          font-size: 13.5px;
          font-weight: 600;
          font-family: inherit;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }

        .settings-hub-icon {
          color: var(--text-secondary);
          transition: color 0.15s ease;
          flex-shrink: 0;
        }

        .settings-hub-link:hover {
          background: var(--bg-elevated);
          border-color: var(--glass-border);
        }

        .settings-hub-link:hover .settings-hub-icon {
          color: var(--text-primary);
        }

        .settings-hub-badge {
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--bg-elevated);
          border: 1px solid var(--glass-border);
          color: var(--text-secondary);
          font-size: 11.5px;
          font-weight: 700;
          line-height: 1.4;
        }

        .settings-recent-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .settings-recent-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--glass-border);
          text-decoration: none;
          transition: border-color 0.15s ease;
        }

        .settings-recent-card:hover {
          border-color: var(--brand);
        }

        @media (max-width: 1024px) {
          .settings-page-container { padding: 28px 28px 56px; }
          .settings-layout { grid-template-columns: 1fr; }
        }

        @media (max-width: 640px) {
          .settings-page-container { padding: 20px 16px 48px; }
          .settings-form-grid { grid-template-columns: 1fr; }
          .settings-recent-grid { grid-template-columns: 1fr; }
          .settings-card { padding: 18px; }
        }
      `}</style>
    </div>
  );
};

export default Settings;
