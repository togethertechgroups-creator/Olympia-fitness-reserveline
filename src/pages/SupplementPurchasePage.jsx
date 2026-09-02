import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getSupplements,
  getSupplementPurchases,
  addSupplementPurchase,
  updateSupplementPurchase,
  deleteSupplementPurchase
} from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './SupplementPurchasePage.css';

const SupplementPurchasePage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [searchParams] = useSearchParams();
  const preselectedSuppId = searchParams.get('supplementId');

  const [activeSupplements, setActiveSupplements] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    supplement_id: preselectedSuppId || '',
    vendor_name: '',
    quantity: 1,
    purchase_price_per_unit: '',
    purchase_date: new Date().toISOString().substring(0, 10),
    invoice_ref: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [suppSearchText, setSuppSearchText] = useState('');
  const [editSuppSearchText, setEditSuppSearchText] = useState('');

  const getInitialMonthDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(year, month + 1, 0).getDate();
    const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
    return { firstDay, lastDay };
  };

  const initialDates = getInitialMonthDates();

  // Filters State
  const [startDate, setStartDate] = useState(initialDates.firstDay);
  const [endDate, setEndDate] = useState(initialDates.lastDay);
  const [filterSuppId, setFilterSuppId] = useState('');
  const [searchVendor, setSearchVendor] = useState('');

  // Edit Modal State
  const [editModal, setEditModal] = useState({
    isOpen: false,
    purchase: null
  });
  const [editFormData, setEditFormData] = useState({
    supplement_id: '',
    vendor_name: '',
    quantity: 1,
    purchase_price_per_unit: '',
    purchase_date: '',
    invoice_ref: '',
    notes: ''
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete Modal State
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    purchase: null
  });
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [suppsData, purchasesData] = await Promise.all([
        getSupplements(true), // active items only
        getSupplementPurchases({ startDate, endDate, supplementId: filterSuppId, searchVendor })
      ]);
      setActiveSupplements(suppsData);
      setPurchases(purchasesData);

      if (preselectedSuppId && !formData.supplement_id) {
        setFormData(prev => ({ ...prev, supplement_id: preselectedSuppId }));
      }
    } catch (err) {
      console.error('Failed to load purchase data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, filterSuppId, searchVendor]);

  const selectedSupplement = activeSupplements.find(s => String(s.id) === String(formData.supplement_id));

  const filteredSupplements = activeSupplements.filter(s =>
    (s.name || '').toLowerCase().includes(suppSearchText.toLowerCase()) ||
    (s.brand || '').toLowerCase().includes(suppSearchText.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(suppSearchText.toLowerCase())
  );

  const filteredEditSupplements = activeSupplements.filter(s =>
    (s.name || '').toLowerCase().includes(editSuppSearchText.toLowerCase()) ||
    (s.brand || '').toLowerCase().includes(editSuppSearchText.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(editSuppSearchText.toLowerCase())
  );

  // Auto-calculated total cost for new form
  const qty = parseInt(formData.quantity, 10) || 0;
  const price = parseFloat(formData.purchase_price_per_unit) || 0;
  const totalCost = (qty * price).toFixed(2);

  // Auto-calculated total cost for edit form
  const editQty = parseInt(editFormData.quantity, 10) || 0;
  const editPrice = parseFloat(editFormData.purchase_price_per_unit) || 0;
  const editTotalCost = (editQty * editPrice).toFixed(2);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!formData.supplement_id) {
      setFormError('Please select a supplement');
      return;
    }
    if (!formData.vendor_name.trim()) {
      setFormError('Vendor name is required');
      return;
    }
    if (qty <= 0) {
      setFormError('Quantity must be greater than 0');
      return;
    }
    if (price <= 0) {
      setFormError('Purchase price per unit must be greater than 0');
      return;
    }

    try {
      setSaving(true);
      await addSupplementPurchase(formData);
      setSuccessMsg('Purchase logged successfully! Stock and reference cost updated.');

      // Reset form
      setFormData({
        supplement_id: '',
        vendor_name: '',
        quantity: 1,
        purchase_price_per_unit: '',
        purchase_date: new Date().toISOString().substring(0, 10),
        invoice_ref: '',
        notes: ''
      });

      // Reload data to reflect updated stock and purchase table
      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to log purchase');
    } finally {
      setSaving(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (p) => {
    setEditError('');
    setEditFormData({
      supplement_id: p.supplement_id,
      vendor_name: p.vendor_name || '',
      quantity: p.quantity || 1,
      purchase_price_per_unit: p.purchase_price_per_unit || '',
      purchase_date: p.purchase_date ? p.purchase_date.substring(0, 10) : new Date().toISOString().substring(0, 10),
      invoice_ref: p.invoice_ref || '',
      notes: p.notes || ''
    });
    setEditModal({ isOpen: true, purchase: p });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditError('');

    if (!editFormData.vendor_name.trim()) {
      setEditError('Vendor name is required');
      return;
    }
    if (editQty <= 0) {
      setEditError('Quantity must be greater than 0');
      return;
    }
    if (editPrice <= 0) {
      setEditError('Purchase price per unit must be greater than 0');
      return;
    }

    try {
      setEditSaving(true);
      await updateSupplementPurchase(editModal.purchase.id, editFormData);
      setEditModal({ isOpen: false, purchase: null });
      await loadData();
    } catch (err) {
      setEditError(err.message || 'Failed to update purchase entry');
    } finally {
      setEditSaving(false);
    }
  };

  // Open Delete Confirm
  const handleOpenDelete = (p) => {
    setDeleteConfirm({ isOpen: true, purchase: p });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.purchase) return;
    try {
      setDeleting(true);
      await deleteSupplementPurchase(deleteConfirm.purchase.id);
      setDeleteConfirm({ isOpen: false, purchase: null });
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete purchase entry');
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined) return '₹0';
    return `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">
        <div className="supplement-purchases-page">

          <div className="purchase-page-header">
            <h1 className="page-title">Log Vendor Purchase</h1>
            <p className="page-subtitle">Record stock incoming from vendors. Updating stock automatically adjusts reference cost price.</p>
          </div>

          {/* New Purchase Form Card */}
          <div className="purchase-card">
            <div className="card-header">
              <h2>+ Log New Purchase Entry</h2>
            </div>

            {formError && <div className="alert-box error-alert">{formError}</div>}
            {successMsg && <div className="alert-box success-alert">{successMsg}</div>}

            <form onSubmit={handleSubmit} className="purchase-form">
              <div className="form-grid">

                {/* Select Supplement */}
                <div className="form-group">
                  <label>Select Supplement <span className="req">*</span></label>
                  <input
                    type="text"
                    placeholder="🔍 Type to filter supplement name/brand..."
                    value={suppSearchText}
                    onChange={(e) => setSuppSearchText(e.target.value)}
                    style={{ marginBottom: '0.35rem', padding: '0.5rem 0.8rem', fontSize: '0.88rem' }}
                  />
                  <select
                    value={formData.supplement_id}
                    onChange={(e) => {
                      const suppId = e.target.value;
                      const supp = activeSupplements.find(s => String(s.id) === String(suppId));
                      setFormData(prev => ({
                        ...prev,
                        supplement_id: suppId,
                        purchase_price_per_unit: prev.purchase_price_per_unit || (supp?.default_purchase_price ? String(supp.default_purchase_price) : '')
                      }));
                    }}
                    required
                  >
                    <option value="">-- Choose Supplement Item ({filteredSupplements.length} found) --</option>
                    {filteredSupplements.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.brand || 'No brand'}) — Current Stock: {s.current_stock} {s.unit}s
                      </option>
                    ))}
                  </select>
                  {selectedSupplement && (
                    <span className="stock-hint">
                      Current Stock: <strong>{selectedSupplement.current_stock} {selectedSupplement.unit}s</strong>
                      {selectedSupplement.default_purchase_price && ` (Last Cost: ₹${selectedSupplement.default_purchase_price})`}
                    </span>
                  )}
                </div>

                {/* Vendor Name */}
                <div className="form-group">
                  <label>Vendor / Supplier Name <span className="req">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HealthKart Wholesale, MuscleBlaze Distributors"
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                  />
                </div>

                {/* Quantity */}
                <div className="form-group">
                  <label>Quantity Bought <span className="req">*</span></label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </div>

                {/* Purchase Price per Unit */}
                <div className="form-group">
                  <label>Purchase Price / Unit (₹) <span className="req">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 2800"
                    value={formData.purchase_price_per_unit}
                    onChange={(e) => setFormData({ ...formData, purchase_price_per_unit: e.target.value })}
                  />
                </div>

                {/* Auto Calculated Total Cost */}
                <div className="form-group">
                  <label>Total Cost (Calculated)</label>
                  <input
                    type="text"
                    readOnly
                    className="read-only-input"
                    value={`₹${Number(totalCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  />
                </div>

                {/* Purchase Date */}
                <div className="form-group">
                  <label>Purchase Date <span className="req">*</span></label>
                  <input
                    type="date"
                    required
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  />
                </div>

                {/* Invoice Ref */}
                <div className="form-group">
                  <label>Invoice / Bill Ref. No. (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-9921"
                    value={formData.invoice_ref}
                    onChange={(e) => setFormData({ ...formData, invoice_ref: e.target.value })}
                  />
                </div>

                {/* Notes */}
                <div className="form-group full-width">
                  <label>Notes / Reminders (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Batch expiry Dec 2027, paid via NEFT"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

              </div>

              <div className="form-actions">
                <button type="submit" className="btn-submit-purchase" disabled={saving}>
                  {saving ? 'Logging Purchase...' : 'Save Purchase Entry'}
                </button>
              </div>
            </form>
          </div>

          {/* Running Purchase Logs List */}
          <div className="recent-purchases-section">
            <div className="section-header">
              <h2>Purchase Log History</h2>
            </div>

            {/* Filter Bar */}
            <div className="purchase-filter-bar">
              <div className="filter-item">
                <label>From Date:</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="filter-item">
                <label>To Date:</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="filter-item">
                <label>Supplement:</label>
                <select value={filterSuppId} onChange={(e) => setFilterSuppId(e.target.value)}>
                  <option value="">All Items</option>
                  {activeSupplements.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="filter-item">
                <label>Vendor Search:</label>
                <input
                  type="text"
                  placeholder="Filter vendor..."
                  value={searchVendor}
                  onChange={(e) => setSearchVendor(e.target.value)}
                />
              </div>
            </div>

            <div className="table-container">
              {loading ? (
                <div className="loading-state">Loading purchases...</div>
              ) : purchases.length === 0 ? (
                <div className="empty-state">No purchase logs found for selected filters.</div>
              ) : (
                <table className="purchases-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>S.No</th>
                      <th>Date</th>
                      <th>Supplement Item</th>
                      <th>Vendor Name</th>
                      <th>Quantity</th>
                      <th>Cost / Unit</th>
                      <th>Total Cost</th>
                      <th>Invoice Ref</th>
                      <th>Notes</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p, idx) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: '700', color: '#64748b' }}>{idx + 1}</td>
                        <td><strong>{formatDateDDMMYYYY(p.purchase_date)}</strong></td>
                        <td>
                          <strong>{p.supplement_name}</strong>
                          {p.supplement_brand && <span className="sub-detail"> ({p.supplement_brand})</span>}
                        </td>
                        <td>{p.vendor_name}</td>
                        <td><strong>{p.quantity}</strong> {p.supplement_unit}s</td>
                        <td>{formatCurrency(p.purchase_price_per_unit)}</td>
                        <td className="total-cost-cell">{formatCurrency(p.total_cost)}</td>
                        <td>{p.invoice_ref || '—'}</td>
                        <td>{p.notes || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {isSuperAdmin && (
                            <div className="purchase-actions-group">
                              <button
                                className="btn-action-edit-purchase"
                                onClick={() => handleOpenEdit(p)}
                                title="Edit Purchase Log"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  <path d="m15 5 4 4" />
                                </svg>
                              </button>
                              <button
                                className="btn-action-delete-purchase"
                                onClick={() => handleOpenDelete(p)}
                                title="Delete Purchase Log"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>

        </div>
      </main>

      {/* Edit Purchase Modal */}
      {editModal.isOpen && editModal.purchase && (
        <div className="alert-modal-overlay">
          <div className="purchase-modal-card">
            <div className="purchase-modal-header">
              <h3>Edit Purchase Log</h3>
              <button className="btn-close-x" onClick={() => setEditModal({ isOpen: false, purchase: null })}>✕</button>
            </div>

            {editError && <div className="alert-box error-alert">{editError}</div>}

            <form onSubmit={handleSaveEdit} className="purchase-form" style={{ marginTop: '1rem' }}>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {/* Supplement */}
                <div className="form-group full-width">
                  <label>Supplement Item *</label>
                  <input
                    type="text"
                    placeholder="🔍 Type to filter supplement name/brand..."
                    value={editSuppSearchText}
                    onChange={(e) => setEditSuppSearchText(e.target.value)}
                    style={{ marginBottom: '0.35rem', padding: '0.5rem 0.8rem', fontSize: '0.88rem' }}
                  />
                  <select
                    value={editFormData.supplement_id}
                    onChange={(e) => setEditFormData({ ...editFormData, supplement_id: e.target.value })}
                    required
                  >
                    <option value="">-- Select Supplement ({filteredEditSupplements.length} found) --</option>
                    {filteredEditSupplements.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.brand || 'No brand'})</option>
                    ))}
                  </select>
                </div>

                {/* Vendor Name */}
                <div className="form-group full-width">
                  <label>Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.vendor_name}
                    onChange={(e) => setEditFormData({ ...editFormData, vendor_name: e.target.value })}
                  />
                </div>

                {/* Quantity */}
                <div className="form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })}
                  />
                </div>

                {/* Price / Unit */}
                <div className="form-group">
                  <label>Cost / Unit (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editFormData.purchase_price_per_unit}
                    onChange={(e) => setEditFormData({ ...editFormData, purchase_price_per_unit: e.target.value })}
                  />
                </div>

                {/* Total Cost */}
                <div className="form-group">
                  <label>Total Cost (Calculated)</label>
                  <input
                    type="text"
                    readOnly
                    className="read-only-input"
                    value={`₹${Number(editTotalCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  />
                </div>

                {/* Purchase Date */}
                <div className="form-group">
                  <label>Purchase Date *</label>
                  <input
                    type="date"
                    required
                    value={editFormData.purchase_date}
                    onChange={(e) => setEditFormData({ ...editFormData, purchase_date: e.target.value })}
                  />
                </div>

                {/* Invoice Ref */}
                <div className="form-group full-width">
                  <label>Invoice Ref. No.</label>
                  <input
                    type="text"
                    value={editFormData.invoice_ref}
                    onChange={(e) => setEditFormData({ ...editFormData, invoice_ref: e.target.value })}
                  />
                </div>

                {/* Notes */}
                <div className="form-group full-width">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="purchase-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setEditModal({ isOpen: false, purchase: null })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit-purchase"
                  disabled={editSaving}
                >
                  {editSaving ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Purchase Confirm Modal */}
      {deleteConfirm.isOpen && deleteConfirm.purchase && (
        <div className="alert-modal-overlay">
          <div className="alert-modal-card">
            <div className="alert-icon-circle warning">
              🗑
            </div>
            <h3>Delete Purchase Log?</h3>
            <p>
              Are you sure you want to delete the purchase log for <strong>{deleteConfirm.purchase.supplement_name}</strong> ({deleteConfirm.purchase.quantity} units from {deleteConfirm.purchase.vendor_name})?<br />
              This will automatically deduct the purchased quantity from inventory stock.
            </p>
            <div className="alert-modal-actions">
              <button
                className="btn-alert-secondary"
                onClick={() => setDeleteConfirm({ isOpen: false, purchase: null })}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn-alert-primary error"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SupplementPurchasePage;
