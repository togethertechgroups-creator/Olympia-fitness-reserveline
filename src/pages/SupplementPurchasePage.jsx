import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSupplements, getSupplementPurchases, addSupplementPurchase } from '../api';
import './SupplementPurchasePage.css';

const SupplementPurchasePage = () => {
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

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterSuppId, setFilterSuppId] = useState('');
  const [searchVendor, setSearchVendor] = useState('');

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

  // Auto-calculated total cost
  const qty = parseInt(formData.quantity, 10) || 0;
  const price = parseFloat(formData.purchase_price_per_unit) || 0;
  const totalCost = (qty * price).toFixed(2);

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
                  <select
                    value={formData.supplement_id}
                    onChange={(e) => {
                      const suppId = e.target.value;
                      const supp = activeSupplements.find(s => String(s.id) === String(suppId));
                      setFormData(prev => ({
                        ...prev,
                        supplement_id: suppId,
                        // auto fill typical price if empty
                        purchase_price_per_unit: prev.purchase_price_per_unit || (supp?.default_purchase_price ? String(supp.default_purchase_price) : '')
                      }));
                    }}
                    required
                  >
                    <option value="">-- Choose Supplement Item --</option>
                    {activeSupplements.map(s => (
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
                      <th>Date</th>
                      <th>Supplement Item</th>
                      <th>Vendor Name</th>
                      <th>Quantity</th>
                      <th>Cost / Unit</th>
                      <th>Total Cost</th>
                      <th>Invoice Ref</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map(p => (
                      <tr key={p.id}>
                        <td>{p.purchase_date}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>

        </div>
      </main>
    </div>
  );
};

export default SupplementPurchasePage;
