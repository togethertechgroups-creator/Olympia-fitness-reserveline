import React, { useState, useEffect } from 'react';
import { getSupplements, addSupplement, updateSupplement, toggleSupplementActive, deleteSupplement } from '../api';
import './SupplementCatalogPage.css';

const CATEGORIES = ['Protein', 'Creatine', 'Vitamins', 'Pre-Workout', 'Mass Gainer', 'Other'];
const UNITS = ['bottle', 'kg', 'pack', 'box', 'tub', 'scoop', 'sachet', 'piece'];

const SupplementCatalogPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [supplements, setSupplements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'Protein',
    unit: 'bottle',
    low_stock_threshold: 5,
    default_sale_price: '',
    active: true
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Delete Confirm State
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    item: null
  });
  const [deleting, setDeleting] = useState(false);

  const fetchCatalog = async () => {
    try {
      setLoading(true);
      const data = await getSupplements(false); // fetch all including inactive
      setSupplements(data);
    } catch (err) {
      console.error('Failed to load supplements catalog', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const handleOpenModal = (item = null) => {
    setError('');
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name || '',
        brand: item.brand || '',
        category: item.category || 'Protein',
        unit: item.unit || 'bottle',
        low_stock_threshold: item.low_stock_threshold ?? 5,
        default_sale_price: item.default_sale_price ?? '',
        active: item.active === 1
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        brand: '',
        category: 'Protein',
        unit: 'bottle',
        low_stock_threshold: 5,
        default_sale_price: '',
        active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.name.trim()) {
      setError('Supplement name is required');
      return;
    }

    try {
      setSubmitting(true);
      if (editingItem) {
        await updateSupplement(editingItem.id, formData);
      } else {
        await addSupplement(formData);
      }
      await fetchCatalog();
      handleCloseModal();
    } catch (err) {
      setError(err.message || 'Failed to save supplement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id) => {
    try {
      await toggleSupplementActive(id);
      fetchCatalog();
    } catch (err) {
      alert(err.message || 'Failed to toggle active status');
    }
  };

  const handleOpenDelete = (item) => {
    setDeleteConfirm({ isOpen: true, item });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.item) return;
    try {
      setDeleting(true);
      await deleteSupplement(deleteConfirm.item.id);
      setDeleteConfirm({ isOpen: false, item: null });
      await fetchCatalog();
    } catch (err) {
      alert(err.message || 'Failed to delete supplement');
    } finally {
      setDeleting(false);
    }
  };

  const lowStockCount = supplements.filter(item => {
    const stock = Number(item.current_stock || 0);
    const thresh = Number(item.low_stock_threshold ?? 5);
    return stock > 0 && stock <= thresh;
  }).length;

  const availableCount = supplements.filter(item => {
    const stock = Number(item.current_stock || 0);
    const thresh = Number(item.low_stock_threshold ?? 5);
    return stock > thresh;
  }).length;

  const outOfStockCount = supplements.filter(item => Number(item.current_stock || 0) === 0).length;

  const filteredSupplements = supplements.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes(search.toLowerCase()) ||
                          (item.brand || '').toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'ALL' || item.category === categoryFilter;

    let matchesStock = true;
    const stock = Number(item.current_stock || 0);
    const thresh = Number(item.low_stock_threshold ?? 5);

    if (stockFilter === 'AVAILABLE') {
      matchesStock = stock > thresh;
    } else if (stockFilter === 'LOW_STOCK') {
      matchesStock = stock > 0 && stock <= thresh;
    } else if (stockFilter === 'OUT_OF_STOCK') {
      matchesStock = stock === 0;
    }

    return matchesSearch && matchesCat && matchesStock;
  });

  const formatCurrency = (val) => {
    if (val === null || val === undefined || val === '') return '—';
    return `₹${Number(val).toLocaleString('en-IN')}`;
  };

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">
        <div className="supplements-catalog-page">

          {/* Page Header */}
          <div className="catalog-header">
            <div>
              <h1 className="catalog-title">Supplement Catalog</h1>
              <p className="catalog-subtitle">Manage sellable supplement items, pricing, and threshold alerts</p>
            </div>
            {isSuperAdmin && (
              <button className="btn-add-supplement" onClick={() => handleOpenModal(null)}>
                + Add Supplement
              </button>
            )}
          </div>

          {/* Controls / Filter Bar */}
          <div className="catalog-filter-bar" style={{ flexWrap: 'wrap' }}>
            <div className="search-input-wrapper">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                type="text"
                placeholder="Search by name or brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="catalog-search-input"
              />
            </div>

            <div className="filter-select-wrapper">
              <label>Stock Filter:</label>
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                className="catalog-select"
                style={{ fontWeight: '700' }}
              >
                <option value="AVAILABLE">Available ({availableCount})</option>
                <option value="LOW_STOCK">Low Stock ({lowStockCount})</option>
                <option value="OUT_OF_STOCK">Out of Stock ({outOfStockCount})</option>
                <option value="ALL">All Items ({supplements.length})</option>
              </select>
            </div>

            <div className="filter-select-wrapper">
              <label>Category:</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="catalog-select">
                <option value="ALL">All Categories</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Stock Filter Pills */}
          <div className="stock-filter-pills" style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setStockFilter('AVAILABLE')}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '10px',
                border: stockFilter === 'AVAILABLE' ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                background: stockFilter === 'AVAILABLE' ? '#dcfce7' : '#ffffff',
                color: stockFilter === 'AVAILABLE' ? '#15803d' : '#475569',
                fontWeight: '800',
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: stockFilter === 'AVAILABLE' ? '0 2px 8px rgba(22, 163, 74, 0.2)' : 'none'
              }}
            >
              <span>Available</span>
              <span style={{ background: stockFilter === 'AVAILABLE' ? '#16a34a' : '#94a3b8', color: '#ffffff', padding: '1px 7px', borderRadius: '100px', fontSize: '0.72rem', fontWeight: '800' }}>
                {availableCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStockFilter('LOW_STOCK')}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '10px',
                border: stockFilter === 'LOW_STOCK' ? '1.5px solid #ea580c' : '1px solid #cbd5e1',
                background: stockFilter === 'LOW_STOCK' ? '#fff7ed' : '#ffffff',
                color: stockFilter === 'LOW_STOCK' ? '#c2410c' : '#475569',
                fontWeight: '800',
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: stockFilter === 'LOW_STOCK' ? '0 2px 8px rgba(234, 88, 12, 0.2)' : 'none'
              }}
            >
              <span>Low Stock</span>
              <span style={{ background: stockFilter === 'LOW_STOCK' ? '#ea580c' : '#94a3b8', color: '#ffffff', padding: '1px 7px', borderRadius: '100px', fontSize: '0.72rem', fontWeight: '800' }}>
                {lowStockCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStockFilter('OUT_OF_STOCK')}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '10px',
                border: stockFilter === 'OUT_OF_STOCK' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                background: stockFilter === 'OUT_OF_STOCK' ? '#fef2f2' : '#ffffff',
                color: stockFilter === 'OUT_OF_STOCK' ? '#b91c1c' : '#475569',
                fontWeight: '800',
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: stockFilter === 'OUT_OF_STOCK' ? '0 2px 8px rgba(220, 38, 38, 0.2)' : 'none'
              }}
            >
              <span>Out of Stock</span>
              <span style={{ background: stockFilter === 'OUT_OF_STOCK' ? '#dc2626' : '#94a3b8', color: '#ffffff', padding: '1px 7px', borderRadius: '100px', fontSize: '0.72rem', fontWeight: '800' }}>
                {outOfStockCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStockFilter('ALL')}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '10px',
                border: stockFilter === 'ALL' ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                background: stockFilter === 'ALL' ? '#e0e7ff' : '#ffffff',
                color: stockFilter === 'ALL' ? '#4338ca' : '#475569',
                fontWeight: '800',
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: stockFilter === 'ALL' ? '0 2px 8px rgba(99, 102, 241, 0.2)' : 'none'
              }}
            >
              <span>All Items</span>
              <span style={{ background: stockFilter === 'ALL' ? '#6366f1' : '#94a3b8', color: '#ffffff', padding: '1px 7px', borderRadius: '100px', fontSize: '0.72rem', fontWeight: '800' }}>
                {supplements.length}
              </span>
            </button>
          </div>

          {/* Table Container */}
          <div className="catalog-table-container">
            {loading ? (
              <div className="catalog-loading">Loading catalog items...</div>
            ) : filteredSupplements.length === 0 ? (
              <div className="catalog-empty">No supplements found. Click "+ Add Supplement" to create one.</div>
            ) : (
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>S.No</th>
                    <th>Item Name</th>
                    <th>Brand</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th>Current Stock</th>
                    <th>Ref. Cost Price</th>
                    <th>Default Sale Price</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSupplements.map((item, idx) => {
                    const isLowStock = item.current_stock <= item.low_stock_threshold;
                    return (
                      <tr key={item.id} className={!item.active ? 'row-inactive' : ''}>
                        <td style={{ fontWeight: '700', color: '#64748b' }}>{idx + 1}</td>
                        <td className="item-name-cell">
                          <strong>{item.name}</strong>
                        </td>
                        <td>{item.brand || '—'}</td>
                        <td>
                          <span className="category-badge">{item.category}</span>
                        </td>
                        <td>{item.unit}</td>
                        <td>
                          <div className="stock-cell">
                            <span className="stock-value">{item.current_stock}</span>
                            {isLowStock && (
                              <span className={`stock-badge ${item.current_stock === 0 ? 'stock-out' : 'stock-low'}`}>
                                {item.current_stock === 0 ? 'Out of Stock' : `Low (≤${item.low_stock_threshold})`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{formatCurrency(item.default_purchase_price)}</td>
                        <td>{formatCurrency(item.default_sale_price)}</td>
                        <td>
                          {isSuperAdmin ? (
                            <button
                              className={`status-toggle-btn ${item.active ? 'active' : 'inactive'}`}
                              onClick={() => handleToggleActive(item.id)}
                              title="Click to toggle status"
                            >
                              {item.active ? 'Active' : 'Inactive'}
                            </button>
                          ) : (
                            <span className={`status-toggle-btn ${item.active ? 'active' : 'inactive'}`} style={{ cursor: 'default' }}>
                              {item.active ? 'Active' : 'Inactive'}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isSuperAdmin && (
                            <div className="catalog-actions-group">
                              <button
                                className="btn-edit-catalog"
                                onClick={() => handleOpenModal(item)}
                                title="Edit Supplement"
                              >
                                Edit
                              </button>
                              <button
                                className="btn-delete-catalog"
                                onClick={() => handleOpenDelete(item)}
                                title="Delete Supplement"
                              >
                                Delete
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

        </div>
      </main>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content catalog-modal">
            <div className="modal-header">
              <h2>{editingItem ? 'Edit Supplement' : 'Add New Supplement'}</h2>
              <button className="close-btn" onClick={handleCloseModal}>&times;</button>
            </div>

            {error && <div className="modal-error-alert">{error}</div>}

            <form onSubmit={handleSubmit} className="catalog-form">
              <div className="form-group">
                <label>Item Name <span className="req">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Optimum Gold Standard 100% Whey"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Brand</label>
                  <input
                    type="text"
                    placeholder="e.g. Optimum Nutrition"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Unit</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  >
                    {UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Low Stock Alert Threshold</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 5"
                    value={formData.low_stock_threshold}
                    onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Default Sale Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 4500"
                  value={formData.default_sale_price}
                  onChange={(e) => setFormData({ ...formData, default_sale_price: e.target.value })}
                />
                <span className="form-hint">Reference cost price will be updated automatically on each purchase entry.</span>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn-save" disabled={submitting}>
                  {submitting ? 'Saving...' : (editingItem ? 'Update Supplement' : 'Save Supplement')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Supplement Confirm Modal */}
      {deleteConfirm.isOpen && deleteConfirm.item && (
        <div className="modal-overlay">
          <div className="modal-content catalog-modal" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗑️</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
              Delete Supplement?
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Are you sure you want to delete <strong>{deleteConfirm.item.name}</strong> from the catalog?<br />
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                className="btn-cancel"
                onClick={() => setDeleteConfirm({ isOpen: false, item: null })}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn-save"
                style={{ background: '#dc2626', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)' }}
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Item'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SupplementCatalogPage;
