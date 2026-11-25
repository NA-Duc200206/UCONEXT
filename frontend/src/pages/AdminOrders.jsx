import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { subscribeToEvent } from '../services/socket';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Calendar,
  MapPin,
  CreditCard,
  Search,
  Tag,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { formatVND, getSafeImageUrl, handleImageError } from '../utils/formatters';
import AdminNav from '../components/AdminNav';

const ORDERS_PER_PAGE = 10;

const AdminOrders = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isAdmin) {
      showToast('Access denied.', 'error');
      navigate('/');
      return;
    }
    loadOrders();

    const unsubCreated = subscribeToEvent('order:created', (newOrder) => {
      showToast(`New order received: #${String(newOrder.id || newOrder._id).slice(-6)}!`, 'info');
      loadOrders();
    });

    const unsubUpdated = subscribeToEvent('order:updated', () => {
      loadOrders();
    });

    const unsubCancelled = subscribeToEvent('order:cancelled', (ord) => {
      showToast(`Order #${String(ord.id || ord._id).slice(-6)} was cancelled.`, 'warning');
      loadOrders();
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubCancelled();
    };
  }, [isAdmin]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.orders.getAll();
      setOrders(res.orders || []);
    } catch (err) {
      showToast(err.message || 'Failed to load orders.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      let paymentStatus = undefined;
      if (newStatus === 'delivered' || newStatus === 'completed') {
        paymentStatus = 'paid';
      }

      await api.orders.updateStatus(orderId, newStatus, paymentStatus);
      showToast(`Order #${String(orderId).slice(-6)} updated!`, 'success');
      loadOrders();
    } catch (err) {
      showToast(err.message || 'Failed to update order status.', 'error');
    }
  };

  const handlePaymentStatusChange = async (orderId, newPaymentStatus) => {
    try {
      await api.orders.updateStatus(orderId, undefined, newPaymentStatus);
      showToast(`Order #${String(orderId).slice(-6)} payment status updated!`, 'success');
      loadOrders();
    } catch (err) {
      showToast(err.message || 'Failed to update payment status.', 'error');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'pending':
      case 'refund_requested':
        return 'badge-warning';
      case 'confirmed':
      case 'packaging':
        return 'badge-secondary';
      case 'shipping':
        return 'badge-primary';
      case 'delivered':
      case 'completed':
        return 'badge-success';
      case 'cancelled':
      case 'refund_completed':
        return 'badge-error';
      default:
        return '';
    }
  };

  const getOrderBorderColor = (status) => {
    if (status === 'cancelled' || status === 'refund_completed') return '#ef4444';
    if (status === 'delivered' || status === 'completed') return '#10b981';
    if (status === 'pending' || status === 'refund_requested') return '#f59e0b';
    return 'var(--brand)';
  };

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && o.paymentStatus !== paymentFilter) return false;
      if (!q) return true;
      const orderIdStr = String(o.id || o._id || '').toLowerCase();
      const customerName = String(o.user?.name || '').toLowerCase();
      const customerEmail = String(o.user?.email || '').toLowerCase();
      const address = String(o.shippingAddress || '').toLowerCase();
      const coupon = String(o.couponCode || '').toLowerCase();
      return (
        orderIdStr.includes(q) ||
        customerName.includes(q) ||
        customerEmail.includes(q) ||
        address.includes(q) ||
        coupon.includes(q)
      );
    });
  }, [orders, searchTerm, statusFilter, paymentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const pagedOrders = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * ORDERS_PER_PAGE;
    return filteredOrders.slice(start, start + ORDERS_PER_PAGE);
  }, [filteredOrders, page, totalPages]);

  const toggleExpandOrder = (id) => {
    setExpandedOrderId(expandedOrderId === id ? null : id);
  };

  return (
    <div className="admin-page-container">
      <AdminNav />

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '30px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="ui-icon-box-lg"><ShoppingBag size={20} strokeWidth={1.75} /></span> Manage Orders
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
          Showing {filteredOrders.length} of {orders.length} total orders.
        </p>
      </div>

      {/* Search & Filters */}
      <div
        className="admin-surface"
        style={{
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
          <Search size={17} color="var(--text-muted)" />
          <input
            type="search"
            aria-label="Search orders"
            placeholder="Search order ID, customer, email, address, or coupon..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setPage(1);
              }}
              aria-label="Clear search"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          aria-label="Filter by order status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            padding: '8px 12px',
            borderRadius: '10px',
            border: '1px solid var(--glass-border)',
            background: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="packaging">Packaging</option>
          <option value="shipping">Shipping</option>
          <option value="delivered">Delivered</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="refund_requested">Refund Requested</option>
          <option value="refund_completed">Refund Completed</option>
        </select>

        <select
          aria-label="Filter by payment status"
          value={paymentFilter}
          onChange={(e) => {
            setPaymentFilter(e.target.value);
            setPage(1);
          }}
          style={{
            padding: '8px 12px',
            borderRadius: '10px',
            border: '1px solid var(--glass-border)',
            background: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        >
          <option value="all">All Payments</option>
          <option value="pending">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Orders Container */}
      <div className="admin-surface" style={{ padding: '24px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading orders...</p>
        ) : pagedOrders.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No orders match the current filters.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {pagedOrders.map((order) => {
              const refundEntry = (order.statusHistory || [])
                .slice()
                .reverse()
                .find((h) => h.status === 'refund_requested' && h.note);

              return (
                <div
                  key={order.id}
                  className="admin-surface-elevated"
                  style={{
                    padding: '20px',
                    borderLeft: `4px solid ${getOrderBorderColor(order.status)}`,
                    transition: 'var(--transition-smooth)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '15.5px', color: 'var(--text-primary)' }}>
                          Order #{order.id}
                        </span>
                        {order.couponCode && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: 'rgba(36, 84, 244, 0.1)',
                              color: 'var(--brand)',
                            }}
                          >
                            <Tag size={11} /> {order.couponCode}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Customer: {order.user?.name || 'Customer'} ({order.user?.email || '—'})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>Total</span>
                        <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brand)' }}>
                          {formatVND(order.totalAmount)}
                        </span>
                      </div>

                      <select
                        aria-label="Update order status"
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className={`badge ${getStatusClass(order.status)}`}
                        style={{ border: 'none', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', outline: 'none' }}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="packaging">Packaging</option>
                        <option value="shipping">Shipping</option>
                        <option value="delivered">Delivered</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="refund_requested">Refund Requested</option>
                        <option value="refund_completed">Refund Completed</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => toggleExpandOrder(order.id)}
                        className="btn btn-secondary"
                        style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}
                      >
                        {expandedOrderId === order.id ? 'Collapse' : 'View Details'}
                      </button>
                    </div>
                  </div>

                  {expandedOrderId === order.id && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px dashed var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                            <Calendar size={14} /> <span>Date: {formatDate(order.createdAt)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                            <MapPin size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                            <span>Address: {order.shippingAddress}</span>
                          </div>
                          {refundEntry && (
                            <div
                              style={{
                                padding: '8px 10px',
                                borderRadius: '8px',
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.25)',
                                color: '#f59e0b',
                                fontSize: '12px',
                              }}
                            >
                              {refundEntry.note}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                            <CreditCard size={14} />
                            <span>Method: {order.paymentMethod === 'vnpay' ? 'VNPAY Online Payment' : 'Cash on Delivery (COD)'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Payment:</span>
                            <select
                              aria-label="Update payment status"
                              value={order.paymentStatus}
                              onChange={(e) => handlePaymentStatusChange(order.id, e.target.value)}
                              className={`badge ${order.paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'}`}
                              style={{ border: 'none', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', outline: 'none' }}
                            >
                              <option value="pending">Unpaid</option>
                              <option value="paid">Paid</option>
                              <option value="failed">Failed</option>
                            </select>
                          </div>
                          {order.discountAmount > 0 && (
                            <div style={{ color: 'var(--color-success)', fontSize: '12.5px', fontWeight: 600 }}>
                              Coupon Discount ({order.couponCode}): -{formatVND(order.discountAmount)}
                            </div>
                          )}
                          {order.vnpayTxnRef && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>VNPAY TxnRef: {order.vnpayTxnRef}</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '10px' }}>Ordered Items:</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {order.items?.map((item, idx) => {
                            const itemImg = item.image || item.productId?.image || item.product?.image;
                            const itemName = item.name || item.productId?.name || item.product?.name || 'Product';
                            return (
                              <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '13px' }}>
                                <img
                                  src={getSafeImageUrl(itemImg)}
                                  onError={handleImageError}
                                  alt={itemName}
                                  style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }}
                                />
                                <div style={{ flex: 1 }}>
                                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{itemName}</span>
                                  <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    <span>Quantity: {item.quantity}</span>
                                    {item.color && <span>• Color: {item.color}</span>}
                                    {item.size && <span>• Size: {item.size}</span>}
                                  </div>
                                </div>
                                <span style={{ fontWeight: '600' }}>{formatVND(item.price * item.quantity)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--glass-border)' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  Page {Math.min(page, totalPages)} of {totalPages}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', opacity: page <= 1 ? 0.5 : 1 }}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', opacity: page >= totalPages ? 0.5 : 1 }}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOrders;
