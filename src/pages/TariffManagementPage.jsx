import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PricingSettingsPage from './PricingSettingsPage';
import PTPackageManagementPage from './PTPackageManagementPage';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { getOtherServices, addOtherService, updateOtherService, deleteOtherService, toggleOtherServiceHide, toggleOtherServiceActive, sellOtherService, getOtherServiceSales, getClients, getTrainers } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import { isValidGSTIN } from '../utils/gstValidator';
import './PricingSettingsPage.css';
import './TariffManagementPage.css';

const TariffManagementPage = ({ defaultTab }) => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole');
  const isAdmin = userRole === 'admin';
  const isSuperAdmin = userRole === 'superadmin';
  const [activeTab, setActiveTab] = useState(defaultTab || (isAdmin ? 'other' : 'general'));
  const [otherServices, setOtherServices] = useState([]);
  const [serviceSales, setServiceSales] = useState([]);
  const [clients, setClients] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSales, setLoadingSales] = useState(false);

  // Add/Edit Service Modal State
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceFormData, setServiceFormData] = useState({ name: '', price: '', duration_days: 30 });

  // Sell Service Modal State
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [sellFormData, setSellFormData] = useState({ 
    client_id: '', 
    service_id: '', 
    sale_date: new Date().toISOString().split('T')[0], 
    paid_amount: 0, 
    discount_amount: 0,
    payment_method: 'UPI',
    hasGst: false,
    gstin: '',
    custom_days: 30,
    custom_price: '',
    trainer_id: ''
  });
  const [gstError, setGstError] = useState('');
  const [isSubmittingSell, setIsSubmittingSell] = useState(false);

  // Active General Plan Warning Modal State
  const [planWarningModal, setPlanWarningModal] = useState({
    isOpen: false,
    client: null
  });

  const isClientPlanActive = (c) => {
    if (!c) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const st = (c.status || '').toLowerCase();
    if (st === 'inactive' || st === 'expired') {
      return false;
    }
    if (c.expiryDate) {
      const exp = new Date(c.expiryDate);
      exp.setHours(0, 0, 0, 0);
      if (!isNaN(exp.getTime()) && exp < today) {
        return false;
      }
    } else {
      if (!c.plan && !c.currentPlan) {
        return false;
      }
    }
    return true;
  };
  const [invoiceModal, setInvoiceModal] = useState({ isOpen: false, data: null });

  const [toastMessage, setToastMessage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  useEffect(() => {
    if (activeTab === 'other') {
      fetchOtherServices();
      fetchServiceSales();
      fetchClientsList();
      fetchTrainersList();
    }
  }, [activeTab]);

  const fetchOtherServices = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const data = await getOtherServices(forceRefresh);
      setOtherServices(data || []);
    } catch (err) {
      console.error("Failed to fetch other services:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceSales = async () => {
    setLoadingSales(true);
    try {
      const data = await getOtherServiceSales();
      setServiceSales(data || []);
    } catch (err) {
      console.error("Failed to fetch service sales:", err);
    } finally {
      setLoadingSales(false);
    }
  };

  const fetchClientsList = async () => {
    try {
      const data = await getClients();
      setClients(data || []);
    } catch (err) {
      console.error("Failed to fetch clients:", err);
    }
  };

  const fetchTrainersList = async () => {
    try {
      const data = await getTrainers();
      setTrainers(data || []);
    } catch (err) {
      console.error("Failed to fetch trainers:", err);
    }
  };

  const handleOpenServiceModal = (svc = null) => {
    if (svc) {
      setEditingService(svc);
      setServiceFormData({ name: svc.name, price: svc.price, duration_days: svc.duration_days });
    } else {
      setEditingService(null);
      setServiceFormData({ name: '', price: '', duration_days: 30 });
    }
    setIsServiceModalOpen(true);
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    try {
      if (editingService) {
        await updateOtherService(editingService.id, serviceFormData);
      } else {
        await addOtherService(serviceFormData);
      }
      setIsServiceModalOpen(false);
      fetchOtherServices(true);
    } catch (err) {
      alert(err.message || "Failed to save service tariff");
    }
  };

  const handleToggleHide = async (id, is_hidden) => {
    try {
      await toggleOtherServiceHide(id, !is_hidden);
      fetchOtherServices(true);
    } catch (err) {
      alert("Failed to toggle hide state");
    }
  };

  const handleToggleActive = async (id, active) => {
    try {
      await toggleOtherServiceActive(id, !active);
      fetchOtherServices(true);
    } catch (err) {
      alert("Failed to toggle active status");
    }
  };

  const handleDeleteService = (id, name) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id, name } = deleteConfirm;
    if (!id) return;
    try {
      await deleteOtherService(id);
      setToastMessage(`Service tariff "${name}" deleted successfully.`);
      setOtherServices(prev => prev.filter(s => String(s.id) !== String(id)));
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchOtherServices(true);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      alert(err.message || "Failed to delete service tariff");
    }
  };

  const handleOpenSellModal = async (service = null) => {
    try {
      const [freshServices, freshClients, freshTrainers] = await Promise.all([
        getOtherServices(),
        getClients(),
        getTrainers().catch(() => [])
      ]);
      const currentServices = freshServices || [];
      const currentClients = freshClients || [];
      const currentTrainers = freshTrainers || [];
      setOtherServices(currentServices);
      setClients(currentClients);
      setTrainers(currentTrainers);

      const selectedSvc = service || (currentServices.length > 0 ? currentServices[0] : null);
      const isCustom = selectedSvc && (selectedSvc.name || '').toLowerCase().includes('custom pt');
      const defaultDays = isCustom ? 1 : (selectedSvc?.duration_days || 30);
      const defaultPrice = isCustom && selectedSvc && selectedSvc.price > 0 ? selectedSvc.price : '';
      setSellFormData({
        client_id: currentClients.length > 0 ? currentClients[0].id : '',
        service_id: selectedSvc ? selectedSvc.id : '',
        sale_date: new Date().toISOString().split('T')[0],
        paid_amount: defaultPrice || (selectedSvc ? selectedSvc.price : 0),
        discount_amount: 0,
        payment_method: 'UPI',
        hasGst: false,
        gstin: '',
        custom_days: defaultDays,
        custom_price: defaultPrice,
        trainer_id: ''
      });
      setIsSellModalOpen(true);
    } catch (err) {
      setIsSellModalOpen(true);
    }
  };

  const handleClientSelectionChange = (clientId) => {
    const selectedClient = clients.find(c => String(c.id) === String(clientId) || String(c.clientId) === String(clientId));
    setSellFormData(prev => ({
      ...prev,
      client_id: clientId,
      hasGst: !!selectedClient?.gstin,
      gstin: selectedClient?.gstin || ''
    }));
    setGstError('');
  };

  const handleServiceSelectionChange = (serviceId) => {
    const foundSvc = otherServices.find(s => String(s.id) === String(serviceId));
    const isCustom = foundSvc && (foundSvc.name || '').toLowerCase().includes('custom pt');
    const defaultDays = isCustom ? 1 : (foundSvc?.duration_days || 30);
    const unitPrice = isCustom
      ? (foundSvc && foundSvc.price > 0 ? foundSvc.price : (sellFormData.custom_price !== '' && sellFormData.custom_price !== undefined ? parseFloat(sellFormData.custom_price) : ''))
      : (foundSvc ? parseFloat(foundSvc.price || 0) : 0);
    const disc = parseFloat(sellFormData.discount_amount) || 0;
    const net = Math.max(0, (parseFloat(unitPrice) || 0) - disc);
    setSellFormData(prev => ({
      ...prev,
      service_id: serviceId,
      custom_days: isCustom ? 1 : defaultDays,
      custom_price: isCustom ? unitPrice : '',
      paid_amount: isCustom ? (unitPrice !== '' ? net : 0) : net
    }));
  };

  const handleSellDiscountChange = (discVal) => {
    const disc = parseFloat(discVal) || 0;
    const foundSvc = otherServices.find(s => String(s.id) === String(sellFormData.service_id));
    const isCustom = foundSvc && (foundSvc.name || '').toLowerCase().includes('custom pt');
    const grossPrice = isCustom && sellFormData.custom_price !== '' && sellFormData.custom_price !== undefined
      ? parseFloat(sellFormData.custom_price) || 0
      : (foundSvc ? foundSvc.price : 0);
    const net = Math.max(0, grossPrice - disc);
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

    const selectedSvc = otherServices.find(s => String(s.id) === String(sellFormData.service_id));
    const isPt = selectedSvc && ((selectedSvc.name || '').toLowerCase().includes('pt') || (selectedSvc.name || '').toLowerCase().includes('personal training') || Boolean(selectedSvc.is_custom_pt));
    const isCustom = selectedSvc && (selectedSvc.name || '').toLowerCase().includes('custom pt');

    // Check if client has active general membership plan for PT
    if (isPt) {
      const selectedClient = clients.find(c => String(c.id) === String(sellFormData.client_id) || String(c.clientId) === String(sellFormData.client_id));
      if (!selectedClient || !isClientPlanActive(selectedClient)) {
        setPlanWarningModal({
          isOpen: true,
          client: selectedClient || { name: 'Selected Client', status: 'Inactive', expiryDate: null }
        });
        return;
      }
    }

    if (isCustom) {
      if (!sellFormData.trainer_id) {
        alert("Please select a trainer for Custom PT.");
        return;
      }
      if (!sellFormData.custom_days || parseInt(sellFormData.custom_days, 10) <= 0) {
        alert("Please enter a valid number of PT classes.");
        return;
      }
    }

    if (sellFormData.hasGst) {
      if (!sellFormData.gstin || !isValidGSTIN(sellFormData.gstin)) {
        setGstError('Please enter a valid 15-character GSTIN (e.g. 33ABCDE1234F1Z5)');
        return;
      }
    }
    setGstError('');

    setIsSubmittingSell(true);
    try {
      const resp = await sellOtherService({
        ...sellFormData,
        custom_days: isCustom ? parseInt(sellFormData.custom_days, 10) : undefined,
        trainer_id: isCustom ? sellFormData.trainer_id : undefined,
        custom_price: isCustom && sellFormData.custom_price !== '' ? parseFloat(sellFormData.custom_price) : undefined,
        gstin: sellFormData.hasGst ? sellFormData.gstin.trim().toUpperCase() : null
      });
      setToastMessage(`Invoice ${resp.billNo} generated! ${isCustom ? 'Custom PT assigned and sold' : 'Service sold'} successfully.`);
      setIsSellModalOpen(false);

      if (resp.bill) {
        setInvoiceModal({ isOpen: true, data: resp.bill });
      }

      await fetchServiceSales();

      setTimeout(() => setToastMessage(null), 5000);
    } catch (err) {
      alert(err.message || "Failed to complete service sale");
    } finally {
      setIsSubmittingSell(false);
    }
  };

  const handleViewInvoice = (sale) => {
    setInvoiceModal({
      isOpen: true,
      data: {
        id: sale.invoice_id,
        billNo: sale.billNo || `INV-SVC-${sale.id}`,
        clientId: sale.clientCode || sale.client_id,
        name: sale.clientName,
        phone: sale.clientPhone || '',
        invoiceDate: sale.sale_date || new Date().toLocaleDateString('en-GB'),
        fromDate: sale.sale_date,
        expiryDate: sale.expiryDate || 'N/A',
        plan: `Service: ${sale.serviceName}`,
        amount: sale.price_snapshot || 0,
        totalPlanAmount: sale.price_snapshot || 0,
        paidAmount: sale.paidAmount !== undefined ? sale.paidAmount : (sale.price_snapshot || 0),
        dueAmount: sale.dueAmount || 0,
        paymentStatus: sale.paymentStatus || 'Paid',
        paymentMethod: 'CASH'
      }
    });
  };

  return (
    <div className="tariff-parent-page">
      {/* Top Header Bar with Segmented Tabs */}
      <div className="tariff-page-header-wrapper">
        <div className="tariff-nav-tabs">
          <button
            className={`tariff-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            General Plans
          </button>
          <button
            className={`tariff-tab-btn ${activeTab === 'pt' ? 'active' : ''}`}
            onClick={() => setActiveTab('pt')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/></svg>
            PT Plans
          </button>
          <button
            className={`tariff-tab-btn ${activeTab === 'other' ? 'active' : ''}`}
            onClick={() => setActiveTab('other')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Other Services
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="tariff-content-area">
        {activeTab === 'general' && (
          <PricingSettingsPage />
        )}

        {activeTab === 'pt' && (
          <PTPackageManagementPage />
        )}

      {activeTab === 'other' && (
        <div className="premium-dashboard">
          <main className="dashboard-main tariff-mgmt-container">
            {toastMessage && (
              <div style={{
                position: 'fixed', top: '20px', right: '20px', background: '#059669', color: '#fff',
                padding: '1rem 1.5rem', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                fontWeight: '800', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                {toastMessage}
              </div>
            )}

            <div className="other-services-header">
              <div>
                <h1 style={{ fontSize: '2.2rem', fontWeight: '900', color: '#1e1b4b', margin: 0 }}>Other Services Catalog</h1>
                <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: '0.25rem' }}>
                  Manage non-membership tariffs (diet consulting, lockers, merchandise) and process client service sales.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn-sell-service-action" onClick={() => handleOpenSellModal()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  Sell Service to Client
                </button>
                {isSuperAdmin && (
                  <button className="btn-add-service-action" onClick={() => handleOpenServiceModal()}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                    Add Service Tariff
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading Other Services...</div>
            ) : otherServices.length === 0 ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                <h3>No Other Services Configured</h3>
                <p>Click "Add Service Tariff" above to add your first service (e.g. Locker Rental, Diet Consultation).</p>
              </div>
            ) : (
              <div className="pricing-cards-container">
                {otherServices.map((svc, index) => {
                  const gradientClasses = ['bg-gradient-pink', 'bg-gradient-orange', 'bg-gradient-teal'];
                  const bgClass = gradientClasses[index % 3];
                  return (
                    <div key={svc.id} className={`pricing-card ${bgClass} ${svc.is_hidden ? 'card-hidden-state' : ''}`}>
                      {/* Header Box */}
                      <div className="pricing-card-header">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <h3>{svc.name}</h3>
                          {svc.is_hidden && (
                            <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#334155', color: '#f8fafc', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                              Hidden
                            </span>
                          )}
                        </div>

                        <div className="pricing-header-subrow">
                          <span className="pricing-read-more">SERVICE TARIFF</span>
                          {isSuperAdmin && (
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="pricing-header-delete-link"
                                onClick={() => handleToggleHide(svc.id, svc.is_hidden)}
                                style={{ color: svc.is_hidden ? '#10b981' : '#f59e0b' }}
                              >
                                {svc.is_hidden ? '👁 Unhide' : '🙈 Hide'}
                              </button>
                              <button
                                type="button"
                                className="pricing-header-delete-link"
                                onClick={() => handleToggleActive(svc.id, svc.active)}
                                style={{ color: svc.active ? '#ef4444' : '#10b981' }}
                              >
                                {svc.active ? 'Disable' : 'Enable'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Feature Details */}
                      <div className="pricing-features">
                        <div className="pricing-feature-item">
                          <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          <div className="pricing-feature-content">
                            <span>SERVICE PRICE</span>
                            <span className="pricing-feature-value">
                              {(svc.name || '').toLowerCase().includes('custom pt') && svc.price === 0
                                ? 'Custom on Sell'
                                : `₹${svc.price}`}
                            </span>
                          </div>
                        </div>

                        <div className="pricing-feature-item">
                          <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          <div className="pricing-feature-content">
                            <span>DURATION</span>
                            <span className="pricing-feature-value">
                              {(svc.name || '').toLowerCase().includes('custom pt')
                                ? `${svc.duration_days} DAYS (Custom)`
                                : `${svc.duration_days} DAYS`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Price Banner */}
                      <div className="pricing-price-box">
                        <div className="pricing-price-amount">
                          {(svc.name || '').toLowerCase().includes('custom pt') && svc.price === 0
                            ? 'Flexible'
                            : `₹${svc.price}`}
                        </div>
                        <div className="pricing-price-sub">
                          {(svc.name || '').toLowerCase().includes('custom pt') && svc.price === 0
                            ? 'SPECIFY ON SELL'
                            : 'TARIFF PRICE'}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pricing-action-btn-container" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="pricing-action-btn"
                          onClick={() => handleOpenSellModal(svc)}
                          style={{ flex: isSuperAdmin ? '1.2' : '1' }}
                        >
                          SELL SERVICE
                        </button>
                        {isSuperAdmin && (
                          <>
                            <button
                              type="button"
                              className="pricing-action-btn"
                              onClick={() => handleOpenServiceModal(svc)}
                              style={{ flex: '0.8', background: 'rgba(255, 255, 255, 0.85)' }}
                            >
                              EDIT
                            </button>
                            <button
                              type="button"
                              className="pricing-card-delete-btn"
                              title={`Delete ${svc.name}`}
                              onClick={() => handleDeleteService(svc.id, svc.name)}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add / Edit Service Modal */}
            {isServiceModalOpen && (
              <div className="renew-modal-overlay">
                <div className="renew-modal-card">
                  <div className="renew-modal-header">
                    <h3 className="renew-modal-title">{editingService ? 'Edit Service Tariff' : 'Add New Service Tariff'}</h3>
                    <button onClick={() => setIsServiceModalOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                  </div>
                  <form onSubmit={handleSaveService} className="renew-modal-body">
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Service Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Diet Consultation, Locker Rental"
                        value={serviceFormData.name}
                        onChange={(e) => setServiceFormData({ ...serviceFormData, name: e.target.value })}
                        required
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Price (₹) *</label>
                        <input
                          type="number"
                          placeholder="e.g. 1500"
                          value={serviceFormData.price}
                          onChange={(e) => setServiceFormData({ ...serviceFormData, price: e.target.value })}
                          required
                          min="0"
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Duration (Days) *</label>
                        <input
                          type="number"
                          placeholder="e.g. 30"
                          value={serviceFormData.duration_days}
                          onChange={(e) => setServiceFormData({ ...serviceFormData, duration_days: e.target.value })}
                          required
                          min="1"
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                        />
                      </div>
                    </div>

                    <div className="renew-actions-row">
                      <button type="button" className="btn-cancel-renew" onClick={() => setIsServiceModalOpen(false)}>Cancel</button>
                      <button type="submit" className="btn-confirm-renew">{editingService ? 'Save Changes' : 'Create Tariff'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Sell Service Modal */}
            {isSellModalOpen && (
              <div className="renew-modal-overlay">
                <div className="renew-modal-card">
                  <div className="renew-modal-header">
                    <h3 className="renew-modal-title">Sell Service to Client</h3>
                    <button onClick={() => setIsSellModalOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                  </div>
                  <form onSubmit={handleConfirmSell} className="renew-modal-body">
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Select Client *</label>
                      <select
                        value={sellFormData.client_id}
                        onChange={(e) => handleClientSelectionChange(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                      >
                        <option value="">-- Choose Client --</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({formatShortId(c.clientId || c.id)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Select Service Tariff *</label>
                      <select
                        value={sellFormData.service_id}
                        onChange={(e) => handleServiceSelectionChange(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                      >
                        <option value="">-- Choose Service --</option>
                        {otherServices.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} — ₹{s.price} ({s.duration_days} Days)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Extra fields for Custom PT */}
                    {(() => {
                      const foundSvc = otherServices.find(s => String(s.id) === String(sellFormData.service_id));
                      const isCustom = foundSvc && (foundSvc.name || '').toLowerCase().includes('custom pt');
                      if (!isCustom) return null;
                      return (
                        <div style={{
                          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                          border: '1.5px solid #86efac',
                          borderRadius: '14px',
                          padding: '0.9rem 1.1rem',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.06)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <div style={{ fontWeight: '800', color: '#15803d', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>⭐</span> Custom Personal Training Configuration
                            </div>
                            <span style={{
                              background: '#dcfce7',
                              color: '#166534',
                              fontSize: '0.72rem',
                              fontWeight: '800',
                              padding: '2px 8px',
                              borderRadius: '100px',
                              border: '1px solid #bbf7d0'
                            }}>
                              30-Day Plan Validity
                            </span>
                          </div>

                          {/* Row 1: Classes & Package Price Side-by-Side */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.65rem' }}>
                            <div>
                              <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'block' }}>No. of PT Classes / Sessions *</label>
                              <input
                                type="number"
                                min="1"
                                value={sellFormData.custom_days}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const days = parseInt(val, 10) || 0;
                                  const foundSvc = otherServices.find(s => String(s.id) === String(sellFormData.service_id));
                                  const prevDays = parseInt(sellFormData.custom_days, 10) || 1;
                                  const currentPrice = parseFloat(sellFormData.custom_price);
                                  const unitRate = (!isNaN(currentPrice) && currentPrice > 0 && prevDays > 0)
                                    ? (currentPrice / prevDays)
                                    : (parseFloat(foundSvc?.price) || 0);

                                  const calculatedPrice = (unitRate > 0 && days > 0)
                                    ? Math.round(unitRate * days)
                                    : (sellFormData.custom_price !== undefined ? sellFormData.custom_price : '');
                                  const disc = parseFloat(sellFormData.discount_amount) || 0;
                                  const net = Math.max(0, (parseFloat(calculatedPrice) || 0) - disc);

                                  setSellFormData(prev => ({
                                    ...prev,
                                    custom_days: val,
                                    custom_price: calculatedPrice,
                                    paid_amount: calculatedPrice !== '' ? net : prev.paid_amount
                                  }));
                                }}
                                placeholder="e.g. 2 Classes"
                                required
                                style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                              />
                              <div style={{ fontSize: '0.72rem', color: '#166534', marginTop: '3px', fontWeight: '600' }}>
                                ℹ️ Stays active until all classes are completed (Valid for 30 days)
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'block' }}>PT Package Price (₹) *</label>
                              <input
                                type="number"
                                min="0"
                                value={sellFormData.custom_price !== undefined ? sellFormData.custom_price : ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const p = parseFloat(val) || 0;
                                  const disc = parseFloat(sellFormData.discount_amount) || 0;
                                  setSellFormData(prev => ({
                                    ...prev,
                                    custom_price: val,
                                    paid_amount: Math.max(0, p - disc)
                                  }));
                                }}
                                placeholder="e.g. 1000"
                                required
                                style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                              />
                            </div>
                          </div>

                          {/* Row 2: Select Trainer Full-Width */}
                          <div>
                            <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'block' }}>Select Assigned Trainer *</label>
                            <select
                              value={sellFormData.trainer_id}
                              onChange={(e) => setSellFormData(prev => ({ ...prev, trainer_id: e.target.value }))}
                              required
                              style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                            >
                              <option value="">-- Choose Trainer --</option>
                              {trainers.map(tr => (
                                <option key={tr.id} value={tr.id}>
                                  {tr.name} ({tr.grade || 'Trainer'})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })()}

                    {/* GST Number Capture */}
                    <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#1e1b4b', display: 'block', marginBottom: '0.4rem' }}>
                        Does this client have a GST number?
                      </label>
                      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: sellFormData.hasGst ? '0.6rem' : '0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="radio"
                            name="sellHasGst"
                            checked={sellFormData.hasGst}
                            onChange={() => setSellFormData(prev => ({ ...prev, hasGst: true }))}
                          />
                          Yes (B2B)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="radio"
                            name="sellHasGst"
                            checked={!sellFormData.hasGst}
                            onChange={() => setSellFormData(prev => ({ ...prev, hasGst: false }))}
                          />
                          No (B2C)
                        </label>
                      </div>

                      {sellFormData.hasGst && (
                        <div>
                          <input
                            type="text"
                            placeholder="Enter 15-Digit GSTIN (e.g. 33ABCDE1234F1Z5)"
                            value={sellFormData.gstin}
                            maxLength={15}
                            onChange={(e) => { setSellFormData(prev => ({ ...prev, gstin: e.target.value.toUpperCase() })); setGstError(''); }}
                            style={{
                              width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: gstError ? '2px solid #ef4444' : '1px solid #cbd5e1',
                              fontWeight: '700', fontSize: '0.85rem', outline: 'none', background: '#ffffff'
                            }}
                          />
                          {gstError && (
                            <div style={{ color: '#dc2626', fontSize: '0.78rem', fontWeight: '700', marginTop: '4px' }}>
                              ⚠️ {gstError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Paid Amount (₹) *</label>
                        <input
                          type="number"
                          min="0"
                          value={sellFormData.paid_amount}
                          onChange={(e) => setSellFormData({ ...sellFormData, paid_amount: e.target.value })}
                          required
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Discount Amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          value={sellFormData.discount_amount}
                          onChange={(e) => handleSellDiscountChange(e.target.value)}
                          placeholder="0"
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Payment Method *</label>
                        <select
                          value={sellFormData.payment_method}
                          onChange={(e) => setSellFormData({ ...sellFormData, payment_method: e.target.value })}
                          required
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                        >
                          <option value="UPI">UPI</option>
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>Sale Date *</label>
                        <input
                          type="date"
                          value={sellFormData.sale_date}
                          onChange={(e) => setSellFormData({ ...sellFormData, sale_date: e.target.value })}
                          required
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: '700' }}
                        />
                      </div>
                    </div>

                    <div className="renew-actions-row">
                      <button type="button" className="btn-cancel-renew" onClick={() => setIsSellModalOpen(false)} disabled={isSubmittingSell}>Cancel</button>
                      <button type="submit" className="btn-confirm-renew" disabled={isSubmittingSell}>
                        {isSubmittingSell ? 'Processing Sale...' : 'Process Sale & Create Invoice'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
      </div>

      <InvoicePreviewModal
        isOpen={invoiceModal.isOpen}
        onClose={() => setInvoiceModal({ isOpen: false, data: null })}
        client={invoiceModal.data}
        title="Other Service Sale Completed"
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="renew-modal-overlay">
          <div className="renew-modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="renew-modal-header" style={{ backgroundColor: '#ef4444', justifyContent: 'center' }}>
              <h3 className="renew-modal-title" style={{ margin: 0 }}>⚠️ Confirm Deletion</h3>
            </div>
            <div className="renew-modal-body" style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <p style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1e293b', margin: 0, lineHeight: '1.4' }}>
                Are you sure you want to permanently delete the service tariff <span style={{ color: '#ef4444' }}>"{deleteConfirm.name}"</span>?
              </p>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, fontWeight: '600' }}>
                This action cannot be undone.
              </p>
              <div className="renew-actions-row" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  className="btn-cancel-renew" 
                  onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
                  style={{ flex: 1, padding: '0.75rem 1.25rem', fontWeight: '700' }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn-confirm-renew" 
                  onClick={handleConfirmDelete}
                  style={{ flex: 1, padding: '0.75rem 1.25rem', backgroundColor: '#ef4444', color: '#ffffff', fontWeight: '700' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Warning Modal (Active General Plan Required) */}
      {planWarningModal.isOpen && (
        <div className="renew-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="renew-modal-card" style={{ maxWidth: '480px', textAlign: 'center', padding: '2rem 1.75rem', borderRadius: '18px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#fef2f2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              margin: '0 auto 1.25rem',
              border: '2px solid #fecaca'
            }}>
              🛑
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#1e1b4b', marginBottom: '0.75rem' }}>
              Cannot Assign PT — Active General Plan Required
            </h3>

            <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: '1.6', marginBottom: '1.25rem' }}>
              Client <strong>{planWarningModal.client?.name || 'Selected Client'}</strong> {planWarningModal.client?.clientId ? `(#${formatShortId(planWarningModal.client.clientId)})` : ''} does not have an active general membership plan.
              <br />
              <span style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: '700', marginTop: '4px', display: 'inline-block' }}>
                {planWarningModal.client?.expiryDate ? `Expired on: ${formatDateDDMMYYYY(planWarningModal.client.expiryDate)}` : 'No active general plan'} 
                {' '}(Status: {planWarningModal.client?.status || 'Inactive'})
              </span>
            </p>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.85rem', color: '#991b1b', lineHeight: '1.5' }}>
              ⚠️ <strong>General Membership Required:</strong> Personal Training (PT) packages can only be assigned to clients with an active General Plan. Please add or renew a General Plan first to proceed.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setPlanWarningModal({ isOpen: false, client: null });
                  setIsSellModalOpen(false);
                  navigate('/clients?filter=Inactive');
                }}
                style={{ flex: 1.4, padding: '0.75rem 1rem', background: '#dc2626', color: '#ffffff', fontWeight: '800', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Renew / Add General Plan
              </button>

              <button
                type="button"
                onClick={() => setPlanWarningModal({ isOpen: false, client: null })}
                style={{ flex: 0.8, padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TariffManagementPage;
