import React, { useState, useEffect } from 'react';
import { getSupplements, getClients, getSupplementSales, addSupplementSale, deleteSupplementSale } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import './SupplementSalePage.css';

const SupplementSalePage = () => {
  const [activeSupplements, setActiveSupplements] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    supplement_id: '',
    buyer_type: 'client', // 'client' | 'walkin'
    client_id: '',
    walkin_name: '',
    walkin_phone: '',
    quantity: 1,
    sale_price_per_unit: '',
    payment_mode: 'UPI',
    sale_date: new Date().toISOString().substring(0, 10)
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [clientSearchText, setClientSearchText] = useState('');
  const [suppSearchText, setSuppSearchText] = useState('');

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterSuppId, setFilterSuppId] = useState('');
  const [filterBuyerType, setFilterBuyerType] = useState('all');

  const loadData = async () => {
    try {
      setLoading(true);
      const [suppsData, clientsData, salesData] = await Promise.all([
        getSupplements(true), // active items only
        getClients(),
        getSupplementSales({ startDate, endDate, supplementId: filterSuppId, buyerType: filterBuyerType })
      ]);
      setActiveSupplements(suppsData);
      setClientsList(clientsData);
      setSales(salesData);
    } catch (err) {
      console.error('Failed to load sale data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, filterSuppId, filterBuyerType]);

  const selectedSupplement = activeSupplements.find(s => String(s.id) === String(formData.supplement_id));
  
  const filteredSupplements = activeSupplements.filter(s =>
    (s.name || '').toLowerCase().includes(suppSearchText.toLowerCase()) ||
    (s.brand || '').toLowerCase().includes(suppSearchText.toLowerCase()) ||
    (s.category || '').toLowerCase().includes(suppSearchText.toLowerCase())
  );

  const qty = parseInt(formData.quantity, 10) || 0;
  const salePrice = parseFloat(formData.sale_price_per_unit) || 0;
  const totalAmount = (qty * salePrice).toFixed(2);

  const isStockInsufficient = selectedSupplement ? qty > selectedSupplement.current_stock : false;
  const isZeroCostWarning = selectedSupplement ? (selectedSupplement.default_purchase_price === null || selectedSupplement.default_purchase_price === undefined || selectedSupplement.default_purchase_price === 0) : false;

  const filteredClients = clientsList.filter(c => 
    (c.name || '').toLowerCase().includes(clientSearchText.toLowerCase()) ||
    (c.phone || '').includes(clientSearchText) ||
    (c.clientId || '').toLowerCase().includes(clientSearchText.toLowerCase())
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!formData.supplement_id) {
      setFormError('Please select a supplement');
      return;
    }

    if (formData.buyer_type === 'client' && !formData.client_id) {
      setFormError('Please select a client');
      return;
    }

    if (formData.buyer_type === 'walkin' && !formData.walkin_name.trim()) {
      setFormError('Walk-in buyer name is required');
      return;
    }

    if (qty <= 0) {
      setFormError('Quantity must be greater than 0');
      return;
    }

    if (selectedSupplement && qty > selectedSupplement.current_stock) {
      setFormError(`Insufficient stock — only ${selectedSupplement.current_stock} units available`);
      return;
    }

    if (salePrice <= 0) {
      setFormError('Sale price per unit must be greater than 0');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        supplement_id: formData.supplement_id,
        client_id: formData.buyer_type === 'client' ? formData.client_id : null,
        walkin_name: formData.buyer_type === 'walkin' ? formData.walkin_name.trim() : null,
        walkin_phone: formData.buyer_type === 'walkin' && formData.walkin_phone ? formData.walkin_phone.trim() : null,
        quantity: qty,
        sale_price_per_unit: salePrice,
        payment_mode: formData.payment_mode,
        sale_date: formData.sale_date
      };

      await addSupplementSale(payload);
      setSuccessMsg('Sale logged successfully! Stock deducted and profit snapshot recorded.');

      // Reset form
      setFormData({
        supplement_id: '',
        buyer_type: 'client',
        client_id: '',
        walkin_name: '',
        walkin_phone: '',
        quantity: 1,
        sale_price_per_unit: '',
        payment_mode: 'UPI',
        sale_date: new Date().toISOString().substring(0, 10)
      });
      setClientSearchText('');

      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to log sale');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSale = async (sale) => {
    if (!window.confirm(`Are you sure you want to delete this sale entry for ${sale.quantity} x '${sale.supplement_name}' (₹${sale.total_amount})?\n\nThis will also restore ${sale.quantity} ${sale.supplement_unit || 'unit'}(s) back to inventory stock.`)) {
      return;
    }
    try {
      await deleteSupplementSale(sale.id);
      setSuccessMsg(`Sale deleted and ${sale.quantity} ${sale.supplement_unit || 'unit'}(s) restored to stock.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err) {
      alert('Failed to delete sale: ' + (err.response?.data?.error || err.message));
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined) return '₹0';
    return `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">
        <div className="supplement-sales-page">

          <div className="sale-page-header">
            <h1 className="page-title">Log Supplement Sale</h1>
            <p className="page-subtitle">Record sales to existing clients or walk-in buyers. Stock and profit margins update in real-time.</p>
          </div>

          {/* New Sale Form Card */}
          <div className="sale-card">
            <div className="card-header">
              <h2>+ Log New Supplement Sale</h2>
            </div>

            {formError && <div className="alert-box error-alert">{formError}</div>}
            {successMsg && <div className="alert-box success-alert">{successMsg}</div>}

            <form onSubmit={handleSubmit} className="sale-form">
              
              {/* Supplement & Buyer Type Row */}
              <div className="form-grid">
                
                {/* Supplement Select */}
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
                    name="supplement_id"
                    value={formData.supplement_id}
                    onChange={(e) => {
                      const suppId = e.target.value;
                      const supp = activeSupplements.find(s => String(s.id) === String(suppId));
                      setFormData(prev => ({
                        ...prev,
                        supplement_id: suppId,
                        sale_price_per_unit: supp?.default_sale_price ? String(supp.default_sale_price) : ''
                      }));
                    }}
                    required
                  >
                    <option value="">-- Choose Supplement Item ({filteredSupplements.length} found) --</option>
                    {filteredSupplements.map(s => (
                      <option key={s.id} value={s.id} disabled={s.current_stock <= 0}>
                        {s.name} ({s.brand || 'No brand'}) — Stock: {s.current_stock} {s.unit}s {s.current_stock === 0 ? '[OUT OF STOCK]' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedSupplement && (
                    <div className="stock-info-box">
                      <span>Available Stock: <strong className={selectedSupplement.current_stock <= selectedSupplement.low_stock_threshold ? 'text-red' : 'text-green'}>{selectedSupplement.current_stock} {selectedSupplement.unit}s</strong></span>
                      {selectedSupplement.default_purchase_price && (
                        <span>Ref Cost: ₹{selectedSupplement.default_purchase_price}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Buyer Type Toggle */}
                <div className="form-group">
                  <label>Buyer Type <span className="req">*</span></label>
                  <div className="buyer-type-toggle">
                    <button
                      type="button"
                      className={`toggle-btn ${formData.buyer_type === 'client' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, buyer_type: 'client', walkin_name: '', walkin_phone: '' })}
                    >
                      Existing Client
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${formData.buyer_type === 'walkin' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, buyer_type: 'walkin', client_id: '' })}
                    >
                      Walk-in Customer
                    </button>
                  </div>
                </div>

                {/* Buyer Input depending on type */}
                {formData.buyer_type === 'client' ? (
                  <div className="form-group">
                    <label>Select Client <span className="req">*</span></label>
                    <input
                      type="text"
                      placeholder="Type to filter client name/phone..."
                      value={clientSearchText}
                      onChange={(e) => setClientSearchText(e.target.value)}
                      className="client-search-field"
                    />
                    <select
                      name="client_id"
                      value={formData.client_id}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">-- Select Client ({filteredClients.length} found) --</option>
                      {filteredClients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''} [{formatShortId(c.clientId || c.id)}]
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Walk-in Buyer Name <span className="req">*</span></label>
                      <input
                        type="text"
                        name="walkin_name"
                        required
                        placeholder="e.g. Rahul Sharma"
                        value={formData.walkin_name}
                        onChange={handleInputChange}
                      />
                    </div>
                  </>
                )}

                {formData.buyer_type === 'walkin' && (
                  <div className="form-group">
                    <label>Walk-in Phone Number (Optional)</label>
                    <input
                      type="text"
                      name="walkin_phone"
                      placeholder="e.g. 9876543210"
                      value={formData.walkin_phone}
                      onChange={handleInputChange}
                    />
                  </div>
                )}

                {/* Quantity */}
                <div className="form-group">
                  <label>Quantity Sold <span className="req">*</span></label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={handleInputChange}
                  />
                  {isStockInsufficient && (
                    <span className="stock-warning">⚠️ Stock Insufficient! Max available is {selectedSupplement.current_stock}.</span>
                  )}
                </div>

                {/* Sale Price per Unit */}
                <div className="form-group">
                  <label>Selling Price / Unit (₹) <span className="req">*</span></label>
                  <input
                    type="number"
                    name="sale_price_per_unit"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 3500"
                    value={formData.sale_price_per_unit}
                    onChange={handleInputChange}
                  />
                </div>

                {/* Total Amount (Read only) */}
                <div className="form-group">
                  <label>Total Amount (Calculated)</label>
                  <input
                    type="text"
                    readOnly
                    className="read-only-input"
                    value={`₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  />
                </div>

                {/* Payment Mode */}
                <div className="form-group">
                  <label>Payment Mode <span className="req">*</span></label>
                  <select
                    name="payment_mode"
                    value={formData.payment_mode}
                    onChange={handleInputChange}
                  >
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Sale Date */}
                <div className="form-group">
                  <label>Sale Date <span className="req">*</span></label>
                  <input
                    type="date"
                    name="sale_date"
                    required
                    value={formData.sale_date}
                    onChange={handleInputChange}
                  />
                </div>

              </div>

              {/* Zero purchase price warning */}
              {isZeroCostWarning && (
                <div className="warning-banner">
                  ⚠️ <strong>Notice:</strong> This supplement has no purchase cost history recorded yet. The cost snapshot for profit calculation will default to ₹0 until a purchase entry is logged.
                </div>
              )}

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-submit-sale"
                  disabled={saving || isStockInsufficient}
                >
                  {saving ? 'Logging Sale...' : 'Save Sale Entry'}
                </button>
              </div>

            </form>
          </div>

          {/* Running Sale Log Table */}
          <div className="recent-sales-section">
            <div className="section-header">
              <h2>Recent Sales History</h2>
            </div>

            {/* Filter Bar */}
            <div className="sale-filter-bar">
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
                <label>Buyer Type:</label>
                <select value={filterBuyerType} onChange={(e) => setFilterBuyerType(e.target.value)}>
                  <option value="all">All Buyers</option>
                  <option value="client">Client Only</option>
                  <option value="walkin">Walk-in Only</option>
                </select>
              </div>
            </div>

            <div className="table-container">
              {loading ? (
                <div className="loading-state">Loading sales history...</div>
              ) : sales.length === 0 ? (
                <div className="empty-state">No sale logs found for selected filters.</div>
              ) : (
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Supplement Item</th>
                      <th>Buyer</th>
                      <th>Quantity</th>
                      <th>Sale Price / Unit</th>
                      <th>Total Amount</th>
                      <th>Cost Snapshot</th>
                      <th>Profit Margin</th>
                      <th>Mode</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s => {
                      const cogs = s.quantity * (s.cost_price_snapshot || 0);
                      const margin = s.total_amount - cogs;
                      const isProfit = margin >= 0;
                      return (
                        <tr key={s.id}>
                          <td>{formatDateDDMMYYYY(s.sale_date)}</td>
                          <td>
                            <strong>{s.supplement_name}</strong>
                          </td>
                          <td>
                            {s.client_name ? (
                              <span className="client-buyer">👤 Client: <strong>{s.client_name}</strong></span>
                            ) : (
                              <span className="walkin-buyer">🚶 Walk-in: <strong>{s.walkin_name}</strong> {s.walkin_phone ? `(${s.walkin_phone})` : ''}</span>
                            )}
                          </td>
                          <td><strong>{s.quantity}</strong> {s.supplement_unit}s</td>
                          <td>{formatCurrency(s.sale_price_per_unit)}</td>
                          <td className="total-amount-cell">{formatCurrency(s.total_amount)}</td>
                          <td>{formatCurrency(s.cost_price_snapshot)}</td>
                          <td>
                            <span className={`margin-badge ${isProfit ? 'profit' : 'loss'}`}>
                              {isProfit ? '+' : ''}{formatCurrency(margin)}
                            </span>
                          </td>
                          <td>
                            <span className="mode-badge">{s.payment_mode}</span>
                          </td>
                          <td>
                            <button
                              className="btn-delete-sale"
                              onClick={() => handleDeleteSale(s)}
                              title="Delete sale & restore inventory stock"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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

export default SupplementSalePage;
