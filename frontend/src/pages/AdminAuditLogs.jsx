import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import AdminNav from '../components/AdminNav';

const TARGET_TYPES = ['all', 'Product', 'Category', 'Order', 'Coupon', 'User'];

const formatCompactJson = (val) => {
  if (!val || typeof val !== 'object') return '';
  try {
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  } catch {
    return '';
  }
};

const AdminAuditLogs = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.analytics.getAuditLogs({
        page,
        limit: 15,
        targetType: targetType === 'all' ? undefined : targetType,
      });
      setLogs(res.logs || []);
      setTotalPages(res.totalPages || 1);
      setTotalLogs(res.totalLogs || 0);
    } catch (err) {
      showToast(err.message || 'Failed to load audit logs.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, targetType, showToast]);

  useEffect(() => {
    if (!isAdmin) {
      showToast('Access denied.', 'error');
      navigate('/');
      return;
    }
    loadLogs();
  }, [isAdmin, loadLogs, navigate, showToast]);

  return (
    <div className="admin-page-container">
      <AdminNav />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '28px',
              color: 'var(--text-primary)',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span className="ui-icon-box-lg">
              <ShieldCheck size={20} strokeWidth={1.75} />
            </span>
            Security & Admin Audit Logs
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Traceable record of administrative changes and authentication events ({totalLogs} entries).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            aria-label="Filter audit logs by entity type"
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid var(--glass-border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All Entities' : t}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadLogs}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="admin-surface" style={{ padding: '20px', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            Loading audit trail...
          </p>
        ) : logs.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No audit events recorded for this filter.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px' }}>Timestamp</th>
                <th style={{ padding: '12px' }}>Actor</th>
                <th style={{ padding: '12px' }}>Action</th>
                <th style={{ padding: '12px' }}>Target</th>
                <th style={{ padding: '12px' }}>Change Summary</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const oldSummary = formatCompactJson(log.oldValue);
                const newSummary = formatCompactJson(log.newValue);
                return (
                  <tr key={log.id || log._id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString('en-GB')}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {log.user?.name || 'User'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {log.user?.email || log.ipAddress || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <code
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(36, 84, 244, 0.1)',
                          color: 'var(--brand)',
                          fontWeight: 700,
                          fontSize: '11.5px',
                        }}
                      >
                        {log.action}
                      </code>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 600 }}>{log.targetType}</span>{' '}
                      <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                        #{String(log.targetId || '').slice(-6)}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', maxWidth: '420px' }}>
                      {oldSummary && (
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          From: {oldSummary}
                        </div>
                      )}
                      {newSummary && (
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                          To: {newSummary}
                        </div>
                      )}
                      {!oldSummary && !newSummary && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '18px',
              paddingTop: '14px',
              borderTop: '1px solid var(--glass-border)',
            }}
          >
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Page {page} of {totalPages}
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
    </div>
  );
};

export default AdminAuditLogs;
