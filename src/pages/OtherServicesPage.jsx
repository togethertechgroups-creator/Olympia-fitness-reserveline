import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { getOtherServicesSales, getOtherServices, sellOtherService, getClients, deleteOtherServiceSale, updateOtherServiceSale } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import './OtherServicesPage.css';

const OtherServicesPage = () => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');
  const isSuperAdmin = userRole === 'superadmin';

  const [salesList, setSalesList] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Sell / Renew Modal State
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [clientSearchText, setClientSearchText] = useState('');
  const [sellFormData, setSellFormData] = useState({
    client_id: '',
    service_id: '',
    sale_date: new Date().toISOString().split('T')[0],
    paid_amount: 0,
    discount_amount: 0,
    payment_method: 'UPI'
  });
  const [isSubmittingSell, setIsSubmittingSell] = useState(false);

  // Edit Sale Modal State
  const [editSaleModal, setEditSaleModal] = useState({
    isOpen: false,
    sale: null,
    service_id: '',
    price: '',
    discount_amount: '',
    paid_amount: '',
    due_amount: '',
    sale_date: '',
    payment_method: 'UPI',
    isSubmitting: false
  });

  const [invoiceModal, setInvoiceModal] = useState({ isOpen: false, data: null });
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [salesData, servicesData, clientsData] = await Promise.all([
        getOtherServicesSales(),
        getOtherServices(),
        getClients()
      ]);
      const salesArr = Array.isArray(salesData) ? salesData : [];
      const servicesArr = Array.isArray(servicesData) ? servicesData : [];
      const clientsArr = Array.isArray(clientsData) ? clientsData : [];
      setSalesList(salesArr);
      setServices(servicesArr);
      setClients(clientsArr);
    } catch (err) {
      console.error("Failed to load other services data:", err);
      setSalesList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSellModal = async (svc = null) => {
    setClientSearchText('');
    try {
      const [freshServices, freshClients] = await Promise.all([
        getOtherServices(),
        getClients()
      ]);
      const currentServices = freshServices || [];
      const currentClients = freshClients || [];
      setServices(currentServices);
      setClients(currentClients);

      const selectedSvc = svc || (currentServices.length > 0 ? currentServices[0] : null);
      setSellFormData({
        client_id: currentClients.length > 0 ? currentClients[0].id : '',
        service_id: selectedSvc ? selectedSvc.id : '',
        sale_date: new Date().toISOString().split('T')[0],
        paid_amount: selectedSvc ? selectedSvc.price : 0,
        discount_amount: 0,
        payment_method: 'UPI'
      });
      setIsSellModalOpen(true);
    } catch (err) {
      console.error("Error loading modal data:", err);
      setIsSellModalOpen(true);
    }
  };

  const handleOpenRenewModal = async (item) => {
    setClientSearchText('');
    try {
      const [freshServices, freshClients] = await Promise.all([
        getOtherServices(),
        getClients()
      ]);
      const currentServices = freshServices || [];
      const currentClients = freshClients || [];
      setServices(currentServices);
      setClients(currentClients);

      const matchedClient = currentClients.find(c => String(c.id) === String(item.client_id) || c.name === item.clientName);
      const matchedService = currentServices.find(s => String(s.id) === String(item.service_id) || s.name === item.serviceName) || (currentServices.length > 0 ? currentServices[0] : null);

      setSellFormData({
        client_id: matchedClient ? matchedClient.id : (item.client_id || ''),
        service_id: matchedService ? matchedService.id : '',
        sale_date: new Date().toISOString().split('T')[0],
        paid_amount: matchedService ? matchedService.price : (item.price_snapshot || 0),
        discount_amount: 0,
        payment_method: 'UPI'
      });
      setIsSellModalOpen(true);
    } catch (err) {
      console.error("Error loading renew modal data:", err);
      setIsSellModalOpen(true);
    }
  };

  const handleOpenEditSaleModal = (item) => {
    const matchedService = services.find(s => String(s.id) === String(item.service_id)) || (services.length > 0 ? services[0] : null);
    const disc = parseFloat(item.discount_amount) || 0;
    const price = item.price_snapshot !== undefined ? (parseFloat(item.price_snapshot) + disc) : (matchedService ? matchedService.price : 0);
    const paid = item.paidAmount !== undefined ? item.paidAmount : (item.price_snapshot || 0);
    const due = item.dueAmount !== undefined ? item.dueAmount : 0;

    setEditSaleModal({
      isOpen: true,
      sale: item,
      service_id: item.service_id || (matchedService ? matchedService.id : ''),
      price: price,
      discount_amount: disc,
      paid_amount: paid,
      due_amount: due,
      sale_date: item.sale_date || new Date().toISOString().split('T')[0],
      payment_method: 'UPI',
      isSubmitting: false
    });
  };

  const handleSaveEditSale = async (e) => {
    e.preventDefault();
    if (!editSaleModal.sale) return;
    setEditSaleModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      await updateOtherServiceSale(editSaleModal.sale.id, {
        service_id: editSaleModal.service_id,
        price_snapshot: parseFloat(editSaleModal.price) || 0,
        discount_amount: parseFloat(editSaleModal.discount_amount) || 0,
        paid_amount: parseFloat(editSaleModal.paid_amount) || 0,
        due_amount: parseFloat(editSaleModal.due_amount) || 0,
        payment_method: editSaleModal.payment_method,
        sale_date: editSaleModal.sale_date
      });
      setToastMessage('Service subscription updated successfully.');
      setEditSaleModal({ isOpen: false, sale: null, isSubmitting: false });
      await fetchData();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      alert(err.message || 'Failed to update service subscription');
      setEditSaleModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleDeleteSale = async (item) => {
    if (!window.confirm(`Are you sure you want to delete the service subscription "${item.serviceName}" for ${item.clientName}? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteOtherServiceSale(item.id);
      setToastMessage(`Service subscription record deleted successfully.`);
      await fetchData();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      alert(err.message || "Failed to delete service subscription.");
    }
  };

  const handleServiceSelectionChange = (serviceId) => {
    const foundSvc = services.find(s => String(s.id) === String(serviceId));
    const price = foundSvc ? foundSvc.price : 0;
    const disc = parseFloat(sellFormData.discount_amount) || 0;
    const net = Math.max(0, price - disc);
    setSellFormData(prev => ({
      ...prev,
      service_id: serviceId,
      paid_amount: net
    }));
  };

  const handleSellDiscountChange = (discVal) => {
    const disc = parseFloat(discVal) || 0;
    const foundSvc = services.find(s => String(s.id) === String(sellFormData.service_id));
    const price = foundSvc ? foundSvc.price : 0;
    const net = Math.max(0, price - disc);
    setSellFormData(prev => ({
      ...prev,
      discount_amount: discVal,
      paid_amount: net
    }));
  };

  const handleConfirmSell = async (e) => {
    e.preventDefault();
    if (!sellFormData.client_id || !sellFormData.service_id) {
      alert("Please select a client and a service tariff.");
      return;
    }
    setIsSubmittingSell(true);
    try {
      const resp = await sellOtherService(sellFormData);
      setToastMessage(`Invoice ${resp.billNo} generated! Service sold successfully.`);
      setIsSellModalOpen(false);
      await fetchData();

      if (resp.bill) {
        setInvoiceModal({ isOpen: true, data: resp.bill });
      }

      setTimeout(() => setToastMessage(null), 5000);
    } catch (err) {
      alert(err.message || "Failed to complete service sale");
    } finally {
      setIsSubmittingSell(false);
    }
  };

  // Helper calculation for validity days remaining
  const calculateDaysLeft = (expiryDateStr) => {
    if (!expiryDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDateStr);
    exp.setHours(0, 0, 0, 0);
    const diffTime = exp - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Filtering sales list
  const filteredSales = salesList.filter(item => {
    const daysLeft = calculateDaysLeft(item.expiryDate);
    const isExpired = daysLeft !== null && daysLeft < 0;

    let matchesStatus = true;
    if (statusFilter === 'Active') matchesStatus = !isExpired && item.paymentStatus !== 'Due';
    if (statusFilter === 'Expired') matchesStatus = isExpired;
    if (statusFilter === 'Due') matchesStatus = item.paymentStatus === 'Due';

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (item.clientName || '').toLowerCase().includes(searchLower) ||
      (item.clientCode || '').toLowerCase().includes(searchLower) ||
      (item.clientPhone || item.clientMobile || '').toLowerCase().includes(searchLower) ||
      (item.serviceName || '').toLowerCase().includes(searchLower) ||
      (item.billNo || '').toLowerCase().includes(searchLower);

    return matchesStatus && matchesSearch;
  });

  // Summary Metrics
  const totalSalesCount = salesList.length;
  const totalRevenue = salesList.reduce((sum, item) => {
    const paid = parseFloat(item.paidAmount);
    const snap = parseFloat(item.price_snapshot) || 0;
    return sum + (!isNaN(paid) ? paid : snap);
  }, 0);
  const activeCount = salesList.filter(item => {
    const days = calculateDaysLeft(item.expiryDate);
    return days === null || days >= 0;
  }).length;
  const expiredCount = totalSalesCount - activeCount;

  const formatCurrency = (val) => `₹${(parseFloat(val) || 0).toLocaleString('en-IN')}`;

  return (
    <div className="other-services-page">
      {/* Top Header Bar */}
      <header className="os-header-bar">
        <div className="os-title-group">
          <h1 className="os-page-title">
            <span className="gradient-text">OTHER SERVICES</span> CLIENT LIST
          </h1>
          <p className="os-page-subtitle">Client service subscriptions, active status & sale invoices.</p>
        </div>

        <div className="os-header-actions">
          <button className="btn-sell-service-primary" onClick={() => handleOpenSellModal()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Sell Service to Client
          </button>

          {isSuperAdmin && (
            <button className="btn-manage-tariffs-secondary" onClick={() => navigate('/settings?tab=other')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Manage Service Tariffs
            </button>
          )}
        </div>
      </header>

      {toastMessage && (
        <div className="os-toast-alert">
          ✓ {toastMessage}
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="os-stats-grid">
        <div className="os-stat-card">
          <span className="os-stat-label">TOTAL SERVICES SOLD</span>
          <div className="os-stat-value">{totalSalesCount} <span className="os-stat-unit">Sales</span></div>
          <span className="os-stat-sub">Recorded subscriptions</span>
        </div>

        <div className="os-stat-card">
          <span className="os-stat-label">ACTIVE SUBSCRIPTIONS</span>
          <div className="os-stat-value text-green">{activeCount} <span className="os-stat-unit">Active</span></div>
          <span className="os-stat-sub">Valid service periods</span>
        </div>

        <div className="os-stat-card">
          <span className="os-stat-label">EXPIRED / COMPLETED</span>
          <div className="os-stat-value text-red">{expiredCount} <span className="os-stat-unit">Expired</span></div>
          <span className="os-stat-sub">Pass validity date</span>
        </div>

        <div className="os-stat-card">
          <span className="os-stat-label">TOTAL SERVICE REVENUE</span>
          <div className="os-stat-value text-purple">{formatCurrency(totalRevenue)}</div>
          <span className="os-stat-sub">Revenue generated</span>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="os-toolbar-card">
        <div className="os-search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by Client Name, Phone, ID, Service or Invoice #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="os-filter-pills">
          {['All', 'Active', 'Expired', 'Due'].map(status => (
            <button
              key={status}
              className={`os-pill-btn ${statusFilter === status ? 'active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Main Client Sales Table */}
      <div className="os-table-container">
        {loading ? (
          <div className="os-table-loading">Loading Other Services client subscriptions...</div>
        ) : filteredSales.length === 0 ? (
          <div className="os-table-empty">
            <h3>No Service Sales Found</h3>
            <p>Click <strong>"Sell Service to Client"</strong> above to record a new client service.</p>
          </div>
        ) : (
          <table className="os-clients-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Client Name</th>
                <th>Service Taken</th>
                <th>Sale Date</th>
                <th>Validity</th>
                <th>Price / Status</th>
                <th>Invoice #</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((item) => {
                const daysLeft = calculateDaysLeft(item.expiryDate);
                const isExpired = daysLeft !== null && daysLeft < 0;
                const clientInitial = (item.clientName || 'C').charAt(0).toUpperCase();

                // Format invoice bill object for InvoicePreviewModal
                const billObj = {
                  id: item.invoice_id,
                  billNo: item.billNo || 'INV-0000',
                  clientId: item.clientCode || item.client_id,
                  clientName: item.clientName,
                  mobile: item.clientPhone || item.clientMobile || '',
                  invoiceDate: item.sale_date,
                  joinDate: item.sale_date,
                  expiryDate: item.expiryDate || '',
                  planName: `Service: ${item.serviceName}`,
                  packageName: `Service: ${item.serviceName}`,
                  planAmount: item.price_snapshot,
                  totalPlanAmount: item.price_snapshot,
                  paidAmount: item.paidAmount !== undefined ? item.paidAmount : item.price_snapshot,
                  dueAmount: item.dueAmount || 0,
                  remainingBalance: item.dueAmount || 0,
                  paymentStatus: item.paymentStatus || 'Paid',
                  discount_amount: item.discount_amount || 0
                };

                return (
                  <tr key={item.id}>
                    <td className="col-id">{formatShortId(item.clientCode || item.client_id)}</td>
                    <td className="col-client">
                      <div className="client-cell-box">
                        <div className="client-avatar-circle">{clientInitial}</div>
                        <div>
                          <div className="client-name-text">{item.clientName}</div>
                          <div className="client-phone-sub">{item.clientPhone || item.clientMobile || 'No Phone'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="col-service">
                      <span className="service-name-badge">{item.serviceName}</span>
                    </td>
                    <td className="col-date">{formatDateDDMMYYYY(item.sale_date)}</td>
                    <td className="col-validity">
                      {daysLeft === null ? (
                        <span className="validity-label-sub">N/A</span>
                      ) : isExpired ? (
                        <div>
                          <span className="badge-validity expired">Expired</span>
                          <div className="validity-date-sub">Expired {formatDateDDMMYYYY(item.expiryDate)}</div>
                        </div>
                      ) : (
                        <div>
                          <span className="badge-validity active">{daysLeft} days left</span>
                          <div className="validity-date-sub">Expires {formatDateDDMMYYYY(item.expiryDate)}</div>
                        </div>
                      )}
                    </td>
                    <td className="col-price">
                      <div className="price-val">{formatCurrency(item.price_snapshot)}</div>
                      {parseFloat(item.discount_amount || 0) > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: '700', marginTop: '1px' }}>
                          (₹{(Number(item.original_price || item.price_snapshot || 0) + Number(item.discount_amount || 0)).toLocaleString()} - ₹{Number(item.discount_amount).toLocaleString()} disc)
                        </div>
                      )}
                      <span className={`status-pill ${item.paymentStatus === 'Due' ? 'due' : 'paid'}`}>
                        {item.paymentStatus || 'Paid'}
                      </span>
                    </td>
                    <td className="col-invoice">{item.billNo || 'INV-0000'}</td>
                    <td className="col-actions">
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {isExpired && (
                          <button
                            className="btn-action-renew-service"
                            onClick={() => handleOpenRenewModal(item)}
                            title="Renew Service Subscription"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="23 4 23 10 17 10"></polyline>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                            </svg>
                            Renew
                          </button>
                        )}

                        <button
                          className="btn-action-edit-service"
                          onClick={() => handleOpenEditSaleModal(item)}
                          title="Edit Service Subscription"
                          style={{
                            background: '#fef3c7',
                            color: '#b45309',
                            border: '1px solid #fde68a',
                            padding: '6px 11px',
                            borderRadius: '8px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                          </svg>
                          Edit
                        </button>

                        <button
                          className="btn-action-view-invoice"
                          onClick={() => setInvoiceModal({ isOpen: true, data: billObj })}
                          title="View / Print Invoice"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                          Invoice
                        </button>

                        <button
                          className="btn-action-delete-service"
                          onClick={() => handleDeleteSale(item)}
                          title="Delete Subscription Record"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sell Service Modal */}
      {isSellModalOpen && (
        <div className="os-modal-overlay">
          <div className="os-modal-card">
            <div className="os-modal-header">
              <h3>Sell Service to Client</h3>
              <button onClick={() => setIsSellModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleConfirmSell} className="os-modal-body">
              <div className="form-group">
                <label>Select Client *</label>
                <input
                  type="text"
                  placeholder="Type client name, ID, or phone to search..."
                  value={clientSearchText}
                  onChange={(e) => setClientSearchText(e.target.value)}
                  style={{
                    marginBottom: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    outline: 'none',
                    width: '100%'
                  }}
                />
                <select
                  value={sellFormData.client_id}
                  onChange={(e) => setSellFormData({ ...sellFormData, client_id: e.target.value })}
                  required
                >
                  <option value="">
                    -- Choose Client ({clients.filter(c => {
                      if (!clientSearchText.trim()) return true;
                      const q = clientSearchText.toLowerCase().trim();
                      return (c.name || '').toLowerCase().includes(q) ||
                             (c.clientId || c.id || '').toLowerCase().includes(q) ||
                             (c.phone || '').includes(q);
                    }).length} found) --
                  </option>
                  {clients.filter(c => {
                    if (!clientSearchText.trim()) return true;
                    const q = clientSearchText.toLowerCase().trim();
                    return (c.name || '').toLowerCase().includes(q) ||
                           (c.clientId || c.id || '').toLowerCase().includes(q) ||
                           (c.phone || '').includes(q);
                  }).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''} [{formatShortId(c.clientId || c.id)}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Select Service Tariff *</label>
                <select
                  value={sellFormData.service_id}
                  onChange={(e) => handleServiceSelectionChange(e.target.value)}
                  required
                >
                  <option value="">-- Choose Service --</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ₹{s.price} ({s.duration_days} Days)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Paid Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    value={sellFormData.paid_amount}
                    onChange={(e) => setSellFormData({ ...sellFormData, paid_amount: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Discount Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={sellFormData.discount_amount}
                    onChange={(e) => handleSellDiscountChange(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Payment Method *</label>
                <select
                  value={sellFormData.payment_method}
                  onChange={(e) => setSellFormData({ ...sellFormData, payment_method: e.target.value })}
                  required
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Net Banking">Net Banking</option>
                </select>
              </div>

              <div className="form-group">
                <label>Sale Date *</label>
                <input
                  type="date"
                  value={sellFormData.sale_date}
                  onChange={(e) => setSellFormData({ ...sellFormData, sale_date: e.target.value })}
                  required
                />
              </div>

              <div className="os-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsSellModalOpen(false)} disabled={isSubmittingSell}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-confirm" disabled={isSubmittingSell}>
                  {isSubmittingSell ? 'Processing Sale...' : 'Process Sale & Generate Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Service Sale Modal */}
      {editSaleModal.isOpen && editSaleModal.sale && (
        <div className="os-modal-overlay">
          <div className="os-modal-card">
            <div className="os-modal-header">
              <h3>Edit Service Subscription — {editSaleModal.sale.clientName}</h3>
              <button onClick={() => setEditSaleModal({ isOpen: false, sale: null })} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleSaveEditSale} className="os-modal-body">
              <div className="form-group">
                <label>Select Service Tariff *</label>
                <select
                  value={editSaleModal.service_id}
                  onChange={(e) => {
                    const svcId = e.target.value;
                    const foundSvc = services.find(s => String(s.id) === String(svcId));
                    const price = foundSvc ? foundSvc.price : editSaleModal.price;
                    const disc = parseFloat(editSaleModal.discount_amount) || 0;
                    const net = Math.max(0, price - disc);
                    setEditSaleModal({
                      ...editSaleModal,
                      service_id: svcId,
                      price: price,
                      paid_amount: net,
                      due_amount: 0
                    });
                  }}
                  required
                >
                  <option value="">-- Choose Service --</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ₹{s.price} ({s.duration_days} Days)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Tariff Price (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    value={editSaleModal.price}
                    onChange={(e) => {
                      const p = parseFloat(e.target.value) || 0;
                      const disc = parseFloat(editSaleModal.discount_amount) || 0;
                      const net = Math.max(0, p - disc);
                      setEditSaleModal({
                        ...editSaleModal,
                        price: e.target.value,
                        paid_amount: net,
                        due_amount: 0
                      });
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Discount Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={editSaleModal.discount_amount}
                    onChange={(e) => {
                      const disc = parseFloat(e.target.value) || 0;
                      const p = parseFloat(editSaleModal.price) || 0;
                      const net = Math.max(0, p - disc);
                      setEditSaleModal({
                        ...editSaleModal,
                        discount_amount: e.target.value,
                        paid_amount: net,
                        due_amount: 0
                      });
                    }}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Paid Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    value={editSaleModal.paid_amount}
                    onChange={(e) => {
                      const paid = parseFloat(e.target.value) || 0;
                      const p = parseFloat(editSaleModal.price) || 0;
                      const disc = parseFloat(editSaleModal.discount_amount) || 0;
                      const net = Math.max(0, p - disc);
                      setEditSaleModal({
                        ...editSaleModal,
                        paid_amount: e.target.value,
                        due_amount: Math.max(0, net - paid)
                      });
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Due Balance (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={editSaleModal.due_amount}
                    onChange={(e) => setEditSaleModal({ ...editSaleModal, due_amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    value={editSaleModal.payment_method}
                    onChange={(e) => setEditSaleModal({ ...editSaleModal, payment_method: e.target.value })}
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Net Banking">Net Banking</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Sale Date *</label>
                  <input
                    type="date"
                    value={editSaleModal.sale_date}
                    onChange={(e) => setEditSaleModal({ ...editSaleModal, sale_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="os-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setEditSaleModal({ isOpen: false, sale: null })} disabled={editSaleModal.isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-confirm" disabled={editSaleModal.isSubmitting}>
                  {editSaleModal.isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Preview Modal */}
      <InvoicePreviewModal
        isOpen={invoiceModal.isOpen}
        onClose={() => setInvoiceModal({ isOpen: false, data: null })}
        client={invoiceModal.data}
        title="Other Service Sale Completed"
      />
    </div>
  );
};

export default OtherServicesPage;
