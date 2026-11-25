import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Ticket, Plus, Pencil, Trash2, Copy, Power } from 'lucide-react';
import { formatVND } from '../utils/formatters';
import AdminNav from '../components/AdminNav';

const defaultFormState = () => ({
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: 10,
  minOrderAmount: 0,
  maxDiscountAmount: '',
  usageLimit: 100,
  perUserLimit: 1,
  isActive: true,
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
});

const AdminCoupons = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [formData, setFormData] = useState(defaultFormState);

  useEffect(() => {
    if (!isAdmin) {
      showToast('Access denied. Administrator privileges required.', 'error');
      navigate('/');
      return;
    }
    loadCoupons();
  }, [isAdmin]);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const res = await api.coupons.getAll();
      setCoupons(res.coupons || []);
    } catch (err) {
      showToast(err.message || 'Failed to load coupons.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setFormData(defaultFormState());
    setShowModal(true);
  };

  const openEditModal = (coupon) => {
    setModalMode('edit');
    setEditingId(coupon.id || coupon._id);
    setFormData({
      code: coupon.code || '',
      description: coupon.description || '',
      discountType: coupon.discountType || 'percentage',
      discountValue: coupon.discountValue ?? 10,
      minOrderAmount: coupon.minOrderAmount ?? 0,
      maxDiscountAmount: coupon.maxDiscountAmount ?? '',
      usageLimit: coupon.usageLimit ?? 100,
      perUserLimit: coupon.perUserLimit ?? 1,
      isActive: coupon.isActive !== false,
      startDate: coupon.startDate ? new Date(coupon.startDate).toISOString().split('T')[0] : defaultFormState().startDate,
      endDate: coupon.endDate ? new Date(coupon.endDate).toISOString().split('T')[0] : defaultFormState().endDate,
    });
    setShowModal(true);
  };

  const handleSaveCoupon = async (e) => {
    e.preventDefault();
    if (!formData.code.trim()) {
      showToast('Coupon code is required.', 'warning');
      return;
    }
    if (Number(formData.discountValue) <= 0) {
      showToast('Discount value must be greater than zero.', 'warning');
      return;
    }
    if (formData.discountType === 'percentage' && Number(formData.discountValue) > 100) {
      showToast('Percentage discount cannot exceed 100%.', 'warning');
      return;
    }
    if (new Date(`${formData.endDate}T23:59:59`) <= new Date(formData.startDate)) {
      showToast('Expiry date must be after start date.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim(),
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue),
        minOrderAmount: Number(formData.minOrderAmount) || 0,
        maxDiscountAmount: formData.maxDiscountAmount ? Number(formData.maxDiscountAmount) : undefined,
        usageLimit: Number(formData.usageLimit) || 100,
        perUserLimit: Number(formData.perUserLimit) || 1,
        isActive: Boolean(formData.isActive),
        startDate: new Date(formData.startDate),
        endDate: new Date(`${formData.endDate}T23:59:59`),
      };

      if (modalMode === 'edit' && editingId) {
        await api.coupons.update(editingId, payload);
        showToast(`Coupon ${payload.code} updated!`, 'success');
      } else {
        await api.coupons.create(payload);
        showToast(`Coupon ${payload.code} created!`, 'success');
      }

      setShowModal(false);
      setFormData(defaultFormState());
      loadCoupons();
    } catch (err) {
      showToast(err.message || 'Failed to save coupon.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon) => {
    const id = coupon.id || coupon._id;
    const nextActive = coupon.isActive === false;
    try {
      await api.coupons.update(id, { isActive: nextActive });
      showToast(`Coupon ${coupon.code} ${nextActive ? 'activated' : 'paused'}.`, 'success');
      loadCoupons();
    } catch (err) {
      showToast(err.message || 'Failed to toggle coupon state.', 'error');
    }
  };

  const handleDeleteCoupon = async (id, code) => {
    try {
      await api.coupons.delete(id);
      showToast(`Coupon ${code} removed.`, 'success');
      setConfirmDeleteId(null);
      loadCoupons();
    } catch (err) {
      showToast(err.message || 'Failed to delete coupon.', 'error');
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    showToast(`Copied ${code} to clipboard!`, 'info');
  };

  return (
    <div className="admin-page-container">
      <AdminNav />

      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '28px', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="ui-icon-box-lg"><Ticket size={20} strokeWidth={1.75} /></span> Discount Coupons & Vouchers
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Create, edit, pause, or retire promotional discount vouchers for checkout campaigns.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', fontSize: '14px', background: 'var(--brand)', color: '#fff' }}
          >
            <Plus size={16} /> Create New Coupon
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading coupons...
        </div>
      ) : coupons.length === 0 ? (
        <div className="admin-surface" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div className="ui-empty-icon">
            <Ticket size={26} strokeWidth={1.6} />
          </div>
          <p style={{ fontSize: '16px', fontWeight: '500' }}>No discount coupons created yet.</p>
          <button
            onClick={openCreateModal}
            className="btn btn-secondary"
            style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} /> Create your first coupon
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {coupons.map((c) => {
            const couponId = c.id || c._id;
            const now = new Date();
            const isPaused = c.isActive === false;
            const isExpired = new Date(c.endDate) < now;
            const isExhausted = c.usedCount >= c.usageLimit;
            const isLive = !isPaused && !isExpired && !isExhausted;
            const statusLabel = isPaused ? 'Paused' : isExpired ? 'Expired' : isExhausted ? 'Exhausted' : 'Active';

            return (
              <div
                key={couponId}
                className="admin-surface"
                style={{
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  border: isLive ? '1px solid var(--glass-border)' : '1px solid rgba(239, 68, 68, 0.28)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: isLive ? 'var(--brand)' : isPaused ? '#f59e0b' : '#ef4444',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: '800',
                        letterSpacing: '0.05em',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        background: 'var(--input-bg)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--glass-border)',
                      }}
                    >
                      {c.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyCode(c.code)}
                      title="Copy code"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      padding: '3px 8px',
                      borderRadius: '100px',
                      textTransform: 'uppercase',
                      background: isLive ? 'rgba(16, 185, 129, 0.1)' : isPaused ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.1)',
                      color: isLive ? '#10b981' : isPaused ? '#f59e0b' : '#ef4444',
                      border: `1px solid ${isLive ? 'rgba(16, 185, 129, 0.2)' : isPaused ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.2)'}`,
                    }}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {c.description || 'Special store discount'}
                </div>

                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Discount:</span>
                    <strong style={{ color: 'var(--brand)' }}>
                      {c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `-${formatVND(c.discountValue)}`}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Min Order:</span>
                    <span>{formatVND(c.minOrderAmount)}</span>
                  </div>
                  {c.maxDiscountAmount && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Max Discount:</span>
                      <span>{formatVND(c.maxDiscountAmount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Usage:</span>
                    <span>{c.usedCount || 0} / {c.usageLimit}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>Valid window:</span>
                    <span>
                      {new Date(c.startDate).toLocaleDateString('vi-VN')} → {new Date(c.endDate).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: 'auto', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(c)}
                      className="btn btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(c)}
                      className="btn btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Power size={12} /> {isPaused ? 'Activate' : 'Pause'}
                    </button>
                  </div>

                  {confirmDeleteId === couponId ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteCoupon(couponId, c.code)}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(couponId)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div className="admin-surface-elevated" style={{ maxWidth: '540px', width: '100%', padding: '30px', borderRadius: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' }}>
              {modalMode === 'edit' ? `Edit Voucher ${formData.code}` : 'Create New Discount Voucher'}
            </h3>

            <form onSubmit={handleSaveCoupon} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="WELCOME10"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Description / Note
                </label>
                <input
                  type="text"
                  placeholder="10% discount for seasonal campaign"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Type
                  </label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (VND)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Min Order Amount (VND)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Max Discount (VND)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Optional"
                    value={formData.maxDiscountAmount}
                    onChange={(e) => setFormData({ ...formData, maxDiscountAmount: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Usage Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.usageLimit}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Per-Customer Limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.perUserLimit}
                    onChange={(e) => setFormData({ ...formData, perUserLimit: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(formData.isActive)}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Active and redeemable at checkout
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  style={{ padding: '10px 20px', borderRadius: '8px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ padding: '10px 24px', borderRadius: '8px', background: 'var(--brand)', color: '#fff' }}
                >
                  {submitting ? 'Saving...' : modalMode === 'edit' ? 'Save Changes' : 'Create Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCoupons;
