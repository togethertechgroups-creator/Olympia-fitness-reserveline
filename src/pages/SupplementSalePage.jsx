import React, { useState, useEffect } from 'react';
import { getSupplements, getClients, getStaff, getTrainers, getSupplementSales, addSupplementSale, deleteSupplementSale } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import './SupplementSalePage.css';

// Professional Vector SVG Icons
const IconClient = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconWalkin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2"/>
    <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
    <path d="M9 12h6"/>
    <path d="M12 6v6"/>
  </svg>
);

const IconStaff = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);

const IconTrainer = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12"/>
  </svg>
);

const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const SupplementSalePage = () => {
  const userRole = localStorage.getItem('userRole');
  const canManageSales = userRole === 'superadmin';
  const [activeSupplements, setActiveSupplements] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [trainersList, setTrainersList] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    supplement_id: '',
    buyer_type: 'client', // 'client' | 'walkin' | 'staff' | 'trainer'
    client_id: '',
    walkin_name: '',
    walkin_phone: '',
    staff_id: '',
    trainer_id: '',
    inhouse_name: '',
    inhouse_role: '',
    quantity: 1,
    sale_price_per_unit: '',
    payment_mode: 'UPI',
    sale_date: new Date().toISOString().substring(0, 10)
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [clientSearchText, setClientSearchText] = useState('');
  const [staffSearchText, setStaffSearchText] = useState('');
  const [trainerSearchText, setTrainerSearchText] = useState('');
  const [suppSearchText, setSuppSearchText] = useState('');

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
  const [filterBuyerType, setFilterBuyerType] = useState('all');

  const loadData = async () => {
    try {
      setLoading(true);
      const [suppsData, clientsData, staffData, trainersData, salesData] = await Promise.all([
        getSupplements(true), // active items only
        getClients(),
        getStaff().catch(() => []),
        getTrainers().catch(() => []),
        getSupplementSales({ startDate, endDate, supplementId: filterSuppId, buyerType: filterBuyerType })
      ]);
      setActiveSupplements(suppsData || []);
      setClientsList(clientsData || []);
      setStaffList(staffData || []);
      setTrainersList(trainersData || []);
      setSales(salesData || []);
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

  const filteredStaff = staffList.filter(s =>
    (s.name || '').toLowerCase().includes(staffSearchText.toLowerCase()) ||
    (s.contactNumber || '').includes(staffSearchText)
  );

  const filteredTrainers = trainersList.filter(t =>
    (t.name || '').toLowerCase().includes(trainerSearchText.toLowerCase()) ||
    (t.phone || '').includes(trainerSearchText) ||
    (t.grade || '').toLowerCase().includes(trainerSearchText.toLowerCase())
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
      setFormError('Please select a supplement item');
      return;
    }

    if (formData.buyer_type === 'client' && !formData.client_id) {
      setFormError('Please select a registered client');
      return;
    }

    if (formData.buyer_type === 'walkin' && !formData.walkin_name.trim()) {
      setFormError('Walk-in buyer name is required');
      return;
    }

    if (formData.buyer_type === 'staff' && !formData.staff_id && !formData.inhouse_name.trim()) {
      setFormError('Please select an in-house staff member');
      return;
    }

    if (formData.buyer_type === 'trainer' && !formData.trainer_id && !formData.inhouse_name.trim()) {
      setFormError('Please select a trainer');
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
      setFormError('Selling price per unit must be greater than 0');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        supplement_id: formData.supplement_id,
        buyer_type: formData.buyer_type,
        client_id: formData.buyer_type === 'client' ? formData.client_id : null,
        walkin_name: formData.buyer_type === 'walkin' ? formData.walkin_name.trim() : null,
        walkin_phone: formData.buyer_type === 'walkin' && formData.walkin_phone ? formData.walkin_phone.trim() : null,
        staff_id: formData.buyer_type === 'staff' ? formData.staff_id : null,
        trainer_id: formData.buyer_type === 'trainer' ? formData.trainer_id : null,
        inhouse_name: formData.inhouse_name ? formData.inhouse_name.trim() : null,
        inhouse_role: formData.buyer_type === 'staff' ? 'Staff' : (formData.buyer_type === 'trainer' ? 'Trainer' : null),
        quantity: qty,
        sale_price_per_unit: salePrice,
        payment_mode: formData.payment_mode,
        sale_date: formData.sale_date
      };

      await addSupplementSale(payload);
      setSuccessMsg('Sale recorded successfully. Inventory stock deducted and profit snapshot saved.');

      // Reset form
      setFormData({
        supplement_id: '',
        buyer_type: 'client',
        client_id: '',
        walkin_name: '',
        walkin_phone: '',
        staff_id: '',
        trainer_id: '',
        inhouse_name: '',
        inhouse_role: '',
        quantity: 1,
        sale_price_per_unit: '',
        payment_mode: 'UPI',
        sale_date: new Date().toISOString().substring(0, 10)
      });
      setClientSearchText('');
      setStaffSearchText('');
      setTrainerSearchText('');

      await loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to record sale');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSale = async (sale) => {
    if (!window.confirm(`Are you sure you want to delete this sale entry for ${sale.quantity} x '${sale.supplement_name}' (₹${sale.total_amount})?\n\nThis will restore ${sale.quantity} ${sale.supplement_unit || 'unit'}(s) back to inventory stock.`)) {
      return;
    }
    try {
      await deleteSupplementSale(sale.id);
      setSuccessMsg(`Sale entry deleted and ${sale.quantity} ${sale.supplement_unit || 'unit'}(s) restored to stock.`);
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
            <h1 className="page-title">Supplement Point of Sale</h1>
            <p className="page-subtitle">Fulfill supplement sales for registered clients, walk-ins, and in-house staff or trainers.</p>
          </div>

          {/* New Sale Form Card */}
          <div className="sale-card">
            <div className="card-header">
              <h2>Record New Sale Entry</h2>
            </div>

            {formError && <div className="alert-box error-alert">{formError}</div>}
            {successMsg && <div className="alert-box success-alert">{successMsg}</div>}

            <form onSubmit={handleSubmit} className="sale-form">
              
              {/* SECTION 1: Buyer Channel & Identification */}
              <div className="sale-form-section buyer-section">
                <div className="section-subheading">1. Select Buyer Category & Details</div>
                <div className="buyer-grid">
                  
                  {/* Buyer Channel Buttons */}
                  <div className="form-group channel-group">
                    <label>Buyer Channel <span className="req">*</span></label>
                    <div className="buyer-type-toggle">
                      <button
                        type="button"
                        className={`toggle-btn ${formData.buyer_type === 'client' ? 'active' : ''}`}
                        onClick={() => setFormData({
                          ...formData,
                          buyer_type: 'client',
                          walkin_name: '', walkin_phone: '',
                          staff_id: '', trainer_id: '', inhouse_name: '', inhouse_role: ''
                        })}
                      >
                        <IconClient /> Client
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${formData.buyer_type === 'walkin' ? 'active' : ''}`}
                        onClick={() => setFormData({
                          ...formData,
                          buyer_type: 'walkin',
                          client_id: '', staff_id: '', trainer_id: '', inhouse_name: '', inhouse_role: ''
                        })}
                      >
                        <IconWalkin /> Walk-in
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${formData.buyer_type === 'staff' ? 'active' : ''}`}
                        onClick={() => setFormData({
                          ...formData,
                          buyer_type: 'staff',
                          client_id: '', walkin_name: '', walkin_phone: '', trainer_id: '', inhouse_role: 'Staff'
                        })}
                      >
                        <IconStaff /> Staff
                      </button>
                      <button
                        type="button"
                        className={`toggle-btn ${formData.buyer_type === 'trainer' ? 'active' : ''}`}
                        onClick={() => setFormData({
                          ...formData,
                          buyer_type: 'trainer',
                          client_id: '', walkin_name: '', walkin_phone: '', staff_id: '', inhouse_role: 'Trainer'
                        })}
                      >
                        <IconTrainer /> Trainer
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Buyer Input */}
                  {formData.buyer_type === 'client' && (
                    <div className="form-group buyer-input-group">
                      <label>Select Registered Client <span className="req">*</span></label>
                      <div className="search-select-pair">
                        <input
                          type="text"
                          placeholder="Search client name or phone..."
                          value={clientSearchText}
                          onChange={(e) => setClientSearchText(e.target.value)}
                          className="search-input-top"
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
                    </div>
                  )}

                  {formData.buyer_type === 'walkin' && (
                    <div className="walkin-input-dual buyer-input-group">
                      <div className="form-group">
                        <label>Walk-in Customer Name <span className="req">*</span></label>
                        <input
                          type="text"
                          name="walkin_name"
                          required
                          placeholder="e.g. Rahul Sharma"
                          value={formData.walkin_name}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>Contact Number (Optional)</label>
                        <input
                          type="text"
                          name="walkin_phone"
                          placeholder="e.g. 9876543210"
                          value={formData.walkin_phone}
                          onChange={handleInputChange}
                        />
                      </div>
                    </div>
                  )}

                  {formData.buyer_type === 'staff' && (
                    <div className="form-group buyer-input-group">
                      <label>Select In-House Staff Member <span className="req">*</span></label>
                      <div className="search-select-pair">
                        <input
                          type="text"
                          placeholder="Search staff name or phone..."
                          value={staffSearchText}
                          onChange={(e) => setStaffSearchText(e.target.value)}
                          className="search-input-top"
                        />
                        <select
                          name="staff_id"
                          value={formData.staff_id}
                          onChange={(e) => {
                            const sId = e.target.value;
                            const member = staffList.find(s => String(s.id) === String(sId));
                            setFormData(prev => ({
                              ...prev,
                              staff_id: sId,
                              inhouse_name: member ? member.name : '',
                              inhouse_role: 'Staff'
                            }));
                          }}
                          required
                        >
                          <option value="">-- Select Staff Member ({filteredStaff.length} found) --</option>
                          {filteredStaff.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} {s.contactNumber ? `(${s.contactNumber})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {formData.buyer_type === 'trainer' && (
                    <div className="form-group buyer-input-group">
                      <label>Select Personal Trainer <span className="req">*</span></label>
                      <div className="search-select-pair">
                        <input
                          type="text"
                          placeholder="Search trainer name or phone..."
                          value={trainerSearchText}
                          onChange={(e) => setTrainerSearchText(e.target.value)}
                          className="search-input-top"
                        />
                        <select
                          name="trainer_id"
                          value={formData.trainer_id}
                          onChange={(e) => {
                            const tId = e.target.value;
                            const trainer = trainersList.find(t => String(t.id) === String(tId));
                            setFormData(prev => ({
                              ...prev,
                              trainer_id: tId,
                              inhouse_name: trainer ? trainer.name : '',
                              inhouse_role: 'Trainer'
                            }));
                          }}
                          required
                        >
                          <option value="">-- Select Trainer ({filteredTrainers.length} found) --</option>
                          {filteredTrainers.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.grade ? `[Grade ${t.grade}]` : ''} {t.phone ? `(${t.phone})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* SECTION 2: Supplement Item & Pricing Grid */}
              <div className="sale-form-section">
                <div className="section-subheading">2. Supplement Item & Quantity</div>
                <div className="pricing-grid">
                  
                  {/* Supplement Selection */}
                  <div className="form-group supp-select-group">
                    <label>Select Supplement <span className="req">*</span></label>
                    <div className="search-select-pair">
                      <input
                        type="text"
                        placeholder="Search supplement name or brand..."
                        value={suppSearchText}
                        onChange={(e) => setSuppSearchText(e.target.value)}
                        className="search-input-top"
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
                        <option value="">-- Choose Supplement ({filteredSupplements.length} available) --</option>
                        {filteredSupplements.map(s => (
                          <option key={s.id} value={s.id} disabled={s.current_stock <= 0}>
                            {s.name} ({s.brand || 'No brand'}) — Stock: {s.current_stock} {s.unit}s {s.current_stock === 0 ? '[OUT OF STOCK]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedSupplement && (
                      <div className="stock-info-box">
                        <span>Stock Available: <strong className={selectedSupplement.current_stock <= selectedSupplement.low_stock_threshold ? 'text-red' : 'text-green'}>{selectedSupplement.current_stock} {selectedSupplement.unit}s</strong></span>
                        {selectedSupplement.default_purchase_price && (
                          <span>Cost Snapshot: ₹{selectedSupplement.default_purchase_price}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quantity Sold */}
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
                      <span className="stock-warning">Insufficient Stock — Only {selectedSupplement.current_stock} units left.</span>
                    )}
                  </div>

                  {/* Selling Price */}
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

                  {/* Total Amount */}
                  <div className="form-group">
                    <label>Total Amount (₹)</label>
                    <input
                      type="text"
                      readOnly
                      className="read-only-input total-amount-input"
                      value={`₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                    />
                  </div>

                </div>
              </div>

              {/* SECTION 3: Payment, Date & Confirmation */}
              <div className="sale-form-section settlement-section">
                <div className="section-subheading">3. Payment & Settlement</div>
                <div className="settlement-grid">
                  
                  {/* Payment Mode */}
                  <div className="form-group">
                    <label>Payment Method <span className="req">*</span></label>
                    <select
                      name="payment_mode"
                      value={formData.payment_mode}
                      onChange={handleInputChange}
                    >
                      <option value="UPI">UPI / Digital Payment</option>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Salary Deduction">Salary Deduction</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Sale Date */}
                  <div className="form-group">
                    <label>Transaction Date <span className="req">*</span></label>
                    <input
                      type="date"
                      name="sale_date"
                      required
                      value={formData.sale_date}
                      onChange={handleInputChange}
                    />
                  </div>

                  {/* Submit Button aligned in grid */}
                  <div className="form-group action-group">
                    <label className="action-label">&nbsp;</label>
                    <button
                      type="submit"
                      className="btn-submit-sale-grid"
                      disabled={saving || isStockInsufficient}
                    >
                      {saving ? 'Processing...' : 'Confirm & Save Sale'}
                    </button>
                  </div>

                </div>
              </div>

              {/* Zero purchase price warning */}
              {isZeroCostWarning && (
                <div className="warning-banner">
                  <IconAlert /> <strong>Notice:</strong> This supplement item does not have a logged purchase cost yet. Cost snapshot will default to ₹0 until a procurement batch is recorded.
                </div>
              )}

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
                <label>From:</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="filter-item">
                <label>To:</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="filter-item">
                <label>Supplement:</label>
                <select value={filterSuppId} onChange={(e) => setFilterSuppId(e.target.value)}>
                  <option value="">All Supplements</option>
                  {activeSupplements.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="filter-item">
                <label>Channel:</label>
                <select value={filterBuyerType} onChange={(e) => setFilterBuyerType(e.target.value)}>
                  <option value="all">All Channels / Buyers</option>
                  <option value="client">Registered Clients</option>
                  <option value="walkin">Walk-in Customers</option>
                  <option value="staff">In-House Staff</option>
                  <option value="trainer">Personal Trainers</option>
                  <option value="inhouse">All In-House Personnel</option>
                </select>
              </div>
            </div>

            <div className="table-container">
              {loading ? (
                <div className="loading-state">Loading sales history...</div>
              ) : sales.length === 0 ? (
                <div className="empty-state">No sales transactions found for the selected filter parameters.</div>
              ) : (
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th className="th-center" style={{ width: '45px' }}>#</th>
                      <th style={{ width: '95px' }}>Date</th>
                      <th>Supplement</th>
                      <th>Buyer Details</th>
                      <th className="th-center" style={{ width: '80px' }}>Qty</th>
                      <th className="th-right" style={{ width: '95px' }}>Unit Price</th>
                      <th className="th-right" style={{ width: '105px' }}>Total Sale</th>
                      <th className="th-right" style={{ width: '95px' }}>Cost Price</th>
                      <th className="th-right" style={{ width: '110px' }}>Gross Profit</th>
                      <th className="th-center" style={{ width: '90px' }}>Payment</th>
                      {canManageSales && <th className="th-center" style={{ width: '50px' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s, idx) => {
                      const cogs = s.quantity * (s.cost_price_snapshot || 0);
                      const margin = s.total_amount - cogs;
                      const isProfit = margin >= 0;
                      return (
                        <tr key={s.id}>
                          <td className="td-center td-index">{idx + 1}</td>
                          <td className="td-date">{formatDateDDMMYYYY(s.sale_date)}</td>
                          <td className="td-supp">
                            <div className="supp-name-cell">
                              <strong>{s.supplement_name}</strong>
                              {s.supplement_brand && <span className="supp-brand-sub">{s.supplement_brand}</span>}
                            </div>
                          </td>
                          <td className="td-buyer">
                            {s.buyer_type === 'staff' || s.staff_id || s.inhouse_role === 'Staff' ? (
                              <div className="buyer-pill-box pill-staff">
                                <span className="pill-role"><IconStaff /> Staff</span>
                                <span className="pill-name">{s.staff_name || s.inhouse_name || 'Staff Member'}</span>
                                {s.staff_phone && <span className="pill-phone">{s.staff_phone}</span>}
                              </div>
                            ) : s.buyer_type === 'trainer' || s.trainer_id || s.inhouse_role === 'Trainer' ? (
                              <div className="buyer-pill-box pill-trainer">
                                <span className="pill-role"><IconTrainer /> Trainer {s.trainer_grade ? `[${s.trainer_grade}]` : ''}</span>
                                <span className="pill-name">{s.trainer_name || s.inhouse_name || 'Trainer'}</span>
                                {s.trainer_phone && <span className="pill-phone">{s.trainer_phone}</span>}
                              </div>
                            ) : s.client_name ? (
                              <div className="buyer-pill-box pill-client">
                                <span className="pill-role"><IconClient /> Client</span>
                                <span className="pill-name">{s.client_name}</span>
                              </div>
                            ) : (
                              <div className="buyer-pill-box pill-walkin">
                                <span className="pill-role"><IconWalkin /> Walk-in</span>
                                <span className="pill-name">{s.walkin_name || 'Walk-in Customer'}</span>
                                {s.walkin_phone && <span className="pill-phone">{s.walkin_phone}</span>}
                              </div>
                            )}
                          </td>
                          <td className="td-center">
                            <span className="qty-badge">{s.quantity} {s.supplement_unit || 'unit'}</span>
                          </td>
                          <td className="td-right">{formatCurrency(s.sale_price_per_unit)}</td>
                          <td className="td-right total-amount-cell">{formatCurrency(s.total_amount)}</td>
                          <td className="td-right text-muted">{formatCurrency(s.cost_price_snapshot)}</td>
                          <td className="td-right">
                            <span className={`margin-badge ${isProfit ? 'profit' : 'loss'}`}>
                              {isProfit ? '+' : ''}{formatCurrency(margin)}
                            </span>
                          </td>
                          <td className="td-center">
                            <span className="mode-badge">{s.payment_mode}</span>
                          </td>
                          {canManageSales && (
                            <td className="td-center">
                              <button
                                className="btn-delete-sale"
                                onClick={() => handleDeleteSale(s)}
                                title="Delete sale entry & restore inventory stock"
                              >
                                <IconTrash />
                              </button>
                            </td>
                          )}
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
