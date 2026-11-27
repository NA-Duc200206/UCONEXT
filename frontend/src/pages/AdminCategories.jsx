import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderTree, Plus, Pencil, Trash2, Search, X, Package } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import AdminNav from '../components/AdminNav';

const AdminCategories = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.categories.getAll();
      setCategories(res.categories || []);
    } catch (err) {
      showToast(err.message || 'Failed to load categories.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!isAdmin) {
      showToast('Access denied.', 'error');
      navigate('/');
      return;
    }
    loadCategories();
  }, [isAdmin, loadCategories, navigate, showToast]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setFormData({ name: '', description: '' });
    setModalOpen(true);
  };

  const openEditModal = (cat) => {
    setModalMode('edit');
    setEditingId(cat.id || cat._id);
    setFormData({
      name: cat.name || '',
      description: cat.description || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Category name is required.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      if (modalMode === 'edit' && editingId) {
        await api.categories.update(editingId, formData.name.trim(), formData.description.trim());
        showToast('Category updated successfully.', 'success');
      } else {
        await api.categories.create(formData.name.trim(), formData.description.trim());
        showToast('Category created successfully.', 'success');
      }
      setModalOpen(false);
      loadCategories();
    } catch (err) {
      showToast(err.message || 'Failed to save category.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cat) => {
    const id = cat.id || cat._id;
    try {
      await api.categories.delete(id);
      showToast(`Category "${cat.name}" deleted.`, 'success');
      setConfirmDeleteId(null);
      loadCategories();
    } catch (err) {
      showToast(err.message || 'Cannot delete category.', 'error');
    }
  };

  const filteredCategories = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.slug || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
    );
  }, [categories, searchTerm]);

  const totalCatalogItems = useMemo(
    () => categories.reduce((sum, c) => sum + (Number(c.productCount) || 0), 0),
    [categories]
  );

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
              <FolderTree size={20} strokeWidth={1.75} />
            </span>
            Catalog Categories
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Manage storefront taxonomy ({categories.length} categories · {totalCatalogItems} active products).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--brand)', color: '#fff' }}
        >
          <Plus size={16} /> New Category
        </button>
      </div>

      {/* Search Bar */}
      <div
        className="admin-surface"
        style={{
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Search size={17} color="var(--text-muted)" />
        <input
          type="search"
          aria-label="Search categories"
          placeholder="Search category name, slug, or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
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
            onClick={() => setSearchTerm('')}
            aria-label="Clear search"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Categories Table / Grid */}
      <div className="admin-surface" style={{ padding: '20px', overflowX: 'auto' }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            Loading categories...
          </p>
        ) : filteredCategories.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No matching categories found.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px' }}>Category Name</th>
                <th style={{ padding: '12px' }}>Slug</th>
                <th style={{ padding: '12px' }}>Description</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Products</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((cat) => {
                const catId = cat.id || cat._id;
                const count = Number(cat.productCount) || 0;
                const isConfirming = confirmDeleteId === catId;

                return (
                  <tr key={catId} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '14px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {cat.name}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <code
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--glass-border)',
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {cat.slug}
                      </code>
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--text-secondary)', maxWidth: '380px' }}>
                      {cat.description || '—'}
                    </td>
                    <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: count > 0 ? 'rgba(36, 84, 244, 0.1)' : 'var(--bg-elevated)',
                          color: count > 0 ? 'var(--brand)' : 'var(--text-muted)',
                        }}
                      >
                        <Package size={12} /> {count}
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isConfirming ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleDelete(cat)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--glass-border)',
                              background: 'var(--bg-elevated)',
                              color: 'var(--text-secondary)',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => openEditModal(cat)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            disabled={count > 0}
                            title={
                              count > 0
                                ? `Cannot delete while ${count} active products belong to this category`
                                : 'Delete category'
                            }
                            onClick={() => setConfirmDeleteId(catId)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              background: 'transparent',
                              color: count > 0 ? 'var(--text-muted)' : '#ef4444',
                              opacity: count > 0 ? 0.45 : 1,
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: count > 0 ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modalMode === 'edit' ? 'Edit category' : 'Create category'}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div className="admin-surface-elevated" style={{ maxWidth: '480px', width: '100%', padding: '28px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {modalMode === 'edit' ? 'Edit Category' : 'Create Category'}
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="cat-name-input" style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Category Name *
                </label>
                <input
                  id="cat-name-input"
                  type="text"
                  required
                  placeholder="e.g. Smart Home, Audio"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label htmlFor="cat-desc-input" style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  id="cat-desc-input"
                  rows={3}
                  placeholder="Short editorial description shown in catalog headers..."
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ background: 'var(--brand)', color: '#fff' }}
                >
                  {submitting ? 'Saving...' : modalMode === 'edit' ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCategories;
