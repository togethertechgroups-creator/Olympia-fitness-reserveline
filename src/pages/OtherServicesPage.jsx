import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { getOtherServicesSales, getOtherServices, sellOtherService, getClients, deleteOtherServiceSale, updateOtherServiceSale, payOtherServiceDue } from '../api';
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

  // Section Tabs: 'member' | 'walkin' | 'all'
  const [activeSection, setActiveSection] = useState('member');

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

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate] = useState(initialDates.firstDay);
  const [toDate, setToDate] = useState(initialDates.lastDay);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleClearDates = () => {
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  // Member Sell / Renew Modal State
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

  // Walk-in Sell Modal State
  const [isWalkinModalOpen, setIsWalkinModalOpen] = useState(false);
  const [walkinFormData, setWalkinFormData] = useState({
    walkin_name: '',
    walkin_phone: '',
    service_id: '',
    sale_date: new Date().toISOString().split('T')[0],
    paid_amount: 0,
    discount_amount: 0,
    payment_method: 'UPI'
  });

  const [isSubmittingSell, setIsSubmittingSell] = useState(false);

  // Pay Due Modal State
  const [payDueModal, setPayDueModal] = useState({
    isOpen: false,
    sale: null,
    amount: '',
    payment_method: 'UPI',
    payment_date: new Date().toISOString().split('T')[0],
    submitting: false
  });

  const handleOpenPayDueModal = (item) => {
    const due = parseFloat(item.dueAmount || 0);
    setPayDueModal({
      isOpen: true,
      sale: item,
      amount: due,
      payment_method: 'UPI',
      payment_date: new Date().toISOString().split('T')[0],
      submitting: false
    });
  };

  const handleConfirmPayDue = async (e) => {
    e.preventDefault();
    if (!payDueModal.sale) return;
    const amountVal = parseFloat(payDueModal.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    setPayDueModal(prev => ({ ...prev, submitting: true }));
    try {
      const res = await payOtherServiceDue(payDueModal.sale.id, {
        paidAmount: amountVal,
        paymentMethod: payDueModal.payment_method,
        paymentDate: payDueModal.payment_date
      });

      setPayDueModal({ isOpen: false, sale: null, amount: '', payment_method: 'UPI', payment_date: '', submitting: false });
      await fetchData();

      if (res?.sale) {
        const item = res.sale;
        const finalPrice = parseFloat(item.price_snapshot || 0);
        const billObj = {
          name: item.clientName,
          phone: item.clientPhone,
          clientId: item.clientCode,
          plan: item.serviceName,
          amount: finalPrice,
          totalPlanAmount: finalPrice,
          paidAmount: item.paidAmount,
          dueAmount: item.dueAmount,
          remainingBalance: item.dueAmount,
          paymentStatus: item.paymentStatus,
          paymentMethod: payDueModal.payment_method,
          fromDate: item.sale_date,
          expiryDate: item.expiryDate,
          billNo: item.billNo || 'INV-0000',
          invoice_category: 'OtherService',
          discount_amount: item.discount_amount || 0
        };
        setInvoiceModal({ isOpen: true, data: billObj });
      }
    } catch (err) {
      alert('Failed to record payment: ' + (err.message || 'Unknown error'));
      setPayDueModal(prev => ({ ...prev, submitting: false }));
    }
  };

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

  const handleOpenSellWalkinModal = async (svc = null) => {
    try {
      const freshServices = await getOtherServices();
      const currentServices = freshServices || [];
      setServices(currentServices);

      const selectedSvc = svc || (currentServices.length > 0 ? currentServices[0] : null);
      setWalkinFormData({
        walkin_name: '',
        walkin_phone: '',
        service_id: selectedSvc ? selectedSvc.id : '',
        sale_date: new Date().toISOString().split('T')[0],
        paid_amount: selectedSvc ? selectedSvc.price : 0,
        discount_amount: 0,
        payment_method: 'UPI'
      });
      setIsWalkinModalOpen(true);
    } catch (err) {
      console.error("Error loading walk-in modal data:", err);
      setIsWalkinModalOpen(true);
    }
  };

  const handleOpenRenewModal = async (item) => {
    if (item.is_walkin || item.walkin_name) {
      handleOpenSellWalkinModal();
      return;
    }
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

  const handleWalkinServiceSelectionChange = (serviceId) => {
    const foundSvc = services.find(s => String(s.id) === String(serviceId));
    const price = foundSvc ? foundSvc.price : 0;
    const disc = parseFloat(walkinFormData.discount_amount) || 0;
    const net = Math.max(0, price - disc);
    setWalkinFormData(prev => ({
      ...prev,
      service_id: serviceId,
      paid_amount: net
    }));
  };

  const handleWalkinDiscountChange = (discVal) => {
    const disc = parseFloat(discVal) || 0;
    const foundSvc = services.find(s => String(s.id) === String(walkinFormData.service_id));
    const price = foundSvc ? foundSvc.price : 0;
    const net = Math.max(0, price - disc);
    setWalkinFormData(prev => ({
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

  const handleConfirmSellWalkin = async (e) => {
    e.preventDefault();
    if (!walkinFormData.walkin_name.trim()) {
      alert("Please enter the Walk-in Client Name.");
      return;
    }
    if (!walkinFormData.service_id) {
      alert("Please select a service tariff.");
      return;
    }
    setIsSubmittingSell(true);
    try {
      const resp = await sellOtherService({
        is_walkin: true,
        walkin_name: walkinFormData.walkin_name.trim(),
        walkin_phone: walkinFormData.walkin_phone.trim(),
        service_id: walkinFormData.service_id,
        sale_date: walkinFormData.sale_date,
        paid_amount: walkinFormData.paid_amount,
        discount_amount: walkinFormData.discount_amount,
        payment_method: walkinFormData.payment_method
      });
      setToastMessage(`Invoice ${resp.billNo} generated! Walk-in client sale completed.`);
      setIsWalkinModalOpen(false);
      await fetchData();

      if (resp.bill) {
        setInvoiceModal({ isOpen: true, data: resp.bill });
      }

      setTimeout(() => setToastMessage(null), 5000);
    } catch (err) {
      alert(err.message || "Failed to complete walk-in client service sale");
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

  const isItemWalkin = (item) => Boolean(item.is_walkin || item.walkin_name || item.clientCode === 'WALKIN');

  // Scoped sales list for current active section tab
  const sectionSalesList = salesList.filter(item => {
    const walkin = isItemWalkin(item);
    if (activeSection === 'walkin') return walkin;
    if (activeSection === 'member') return !walkin;
    return true;
  });

  // Filtering sales list by search, status & date range
  const filteredSales = sectionSalesList.filter(item => {
    const daysLeft = calculateDaysLeft(item.expiryDate);
    const isExpired = daysLeft !== null && daysLeft < 0;

    let matchesStatus = true;
    if (statusFilter === 'Active') matchesStatus = !isExpired && item.paymentStatus !== 'Due';
    if (statusFilter === 'Expired') matchesStatus = isExpired;
    if (statusFilter === 'Due') matchesStatus = item.paymentStatus === 'Due';

    // Date range filter based on sale_date or created_at
    let matchesDate = true;
    const saleDateStr = (item.sale_date || item.created_at || '').split('T')[0];
    if (fromDate && saleDateStr) {
      matchesDate = matchesDate && (saleDateStr >= fromDate);
    }
    if (toDate && saleDateStr) {
      matchesDate = matchesDate && (saleDateStr <= toDate);
    }

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (item.clientName || '').toLowerCase().includes(searchLower) ||
      (item.walkin_name || '').toLowerCase().includes(searchLower) ||
      (item.clientCode || '').toLowerCase().includes(searchLower) ||
      (item.clientPhone || item.walkin_phone || item.clientMobile || '').toLowerCase().includes(searchLower) ||
      (item.serviceName || '').toLowerCase().includes(searchLower) ||
      (item.billNo || '').toLowerCase().includes(searchLower);

    return matchesStatus && matchesDate && matchesSearch;
  });

  // Pagination calculations
  const totalItems = filteredSales.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedSales = filteredSales.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  // Summary Metrics scoped to active tab
  const totalSalesCount = sectionSalesList.length;
  const totalRevenue = sectionSalesList.reduce((sum, item) => {
    const paid = parseFloat(item.paidAmount);
    const snap = parseFloat(item.price_snapshot) || 0;
    return sum + (!isNaN(paid) ? paid : snap);
  }, 0);
  const activeCount = sectionSalesList.filter(item => {
    const days = calculateDaysLeft(item.expiryDate);
    return days === null || days >= 0;
  }).length;
  const expiredCount = totalSalesCount - activeCount;

  const walkinSalesCount = salesList.filter(isItemWalkin).length;
  const memberSalesCount = salesList.filter(s => !isItemWalkin(s)).length;

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
            Sell to Member Client
          </button>

          <button className="btn-sell-walkin-primary" onClick={() => handleOpenSellWalkinModal()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="17" y1="11" x2="23" y2="11"></line>
            </svg>
            Sell to Walk-in Client
          </button>

          {isSuperAdmin && (
            <button className="btn-manage-tariffs-secondary" onClick={() => navigate('/settings?tab=other')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Manage Tariffs
            </button>
          )}
        </div>
      </header>

      {toastMessage && (
        <div className="os-toast-alert">
          ✓ {toastMessage}
        </div>
      )}

      {/* Main Section Navigation Tabs */}
      <div className="os-section-tabs-bar">
        <button
          className={`os-section-tab-btn ${activeSection === 'member' ? 'active' : ''}`}
          onClick={() => setActiveSection('member')}
        >
          <span className="tab-icon">👥</span>
          <span>Member Clients</span>
          <span className="tab-count-pill">{memberSalesCount}</span>
        </button>

        <button
          className={`os-section-tab-btn ${activeSection === 'walkin' ? 'active' : ''}`}
          onClick={() => setActiveSection('walkin')}
        >
          <span className="tab-icon">🚶</span>
          <span>Walk-in Clients</span>
          <span className="tab-count-pill">{walkinSalesCount}</span>
        </button>

        <button
          className={`os-section-tab-btn ${activeSection === 'all' ? 'active' : ''}`}
          onClick={() => setActiveSection('all')}
        >
          <span className="tab-icon">📋</span>
          <span>All Service Sales</span>
          <span className="tab-count-pill">{salesList.length}</span>
        </button>
      </div>

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
        <div className="os-toolbar-left">
          <div className="os-search-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search by Client Name, Phone, ID, Service or Invoice #..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="os-date-filters">
            <div className="os-date-input-group">
              <label className="os-date-label">From:</label>
              <input
                type="date"
                className="os-date-input"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setCurrentPage(1);
                }}
                title="From Date"
              />
            </div>
            <div className="os-date-input-group">
              <label className="os-date-label">To:</label>
              <input
                type="date"
                className="os-date-input"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setCurrentPage(1);
                }}
                title="To Date"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                type="button"
                className="btn-clear-date"
                onClick={handleClearDates}
                title="Clear Date Filter"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        <div className="os-filter-pills">
          {['All', 'Active', 'Expired', 'Due'].map(status => (
            <button
              key={status}
              className={`os-pill-btn ${statusFilter === status ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter(status);
                setCurrentPage(1);
              }}
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
                <th style={{ width: '8%' }}>ID</th>
                <th style={{ width: '20%' }}>Client Name</th>
                <th style={{ width: '14%' }}>Service Taken</th>
                <th style={{ width: '11%' }}>Sale Date</th>
                <th style={{ width: '13%' }}>Validity</th>
                <th style={{ width: '15%' }}>Price / Status</th>
                <th style={{ width: '9%' }}>Invoice #</th>
                <th style={{ textAlign: 'right', width: '10%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.map((item) => {
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
                        <div className="client-avatar-circle" style={isItemWalkin(item) ? { background: 'linear-gradient(135deg, #059669, #10b981)', boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)' } : {}}>
                          {clientInitial}
                        </div>
                        <div>
                          <div className="client-name-text">{item.clientName}</div>
                          <div className="client-phone-sub">{item.clientPhone || item.walkin_phone || item.clientMobile || 'No Phone'}</div>
                          {isItemWalkin(item) && (
                            <span className="walkin-badge">🚶 Walk-in</span>
                          )}
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
                      {parseFloat(item.dueAmount || 0) > 0 ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff7ed', border: '1px solid #fed7aa', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', color: '#c2410c', fontWeight: '800', marginTop: '3px', whiteSpace: 'nowrap' }}>
                          <span>Due: {formatCurrency(item.dueAmount)}</span>
                          <span style={{ color: '#fdba74' }}>•</span>
                          <span style={{ color: '#15803d' }}>Paid: {formatCurrency(item.paidAmount)}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', color: '#15803d', fontWeight: '800', marginTop: '3px', whiteSpace: 'nowrap' }}>
                          ✓ Paid in Full {parseFloat(item.discount_amount || 0) > 0 ? `(₹${Number(item.discount_amount).toLocaleString()} off)` : ''}
                        </div>
                      )}
                    </td>
                    <td className="col-invoice">{item.billNo || 'INV-0000'}</td>
                    <td className="col-actions">
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', whiteSpace: 'nowrap' }}>
                        {parseFloat(item.dueAmount || 0) > 0 && (
                          <button
                            className="btn-pay-due-other-service"
                            onClick={() => handleOpenPayDueModal(item)}
                            title={`Clear Due (₹${parseFloat(item.dueAmount).toLocaleString()})`}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                              <line x1="1" y1="10" x2="23" y2="10"></line>
                            </svg>
                            Pay Due
                          </button>
                        )}

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

                        {isSuperAdmin && (
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
                        )}

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

                        {isSuperAdmin && (
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
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination Bar */}
        {!loading && filteredSales.length > 0 && (
          <div className="os-pagination-bar">
            <div className="os-pagination-info">
              Showing <span>{totalItems > 0 ? startIndex + 1 : 0}</span> to <span>{endIndex}</span> of <span>{totalItems}</span> subscriptions
            </div>
            <div className="os-pagination-controls">
              <div className="os-rows-per-page">
                <label>Rows per page:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="os-pagination-pages">
                <button
                  className="btn-os-page-nav"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  title="Previous Page"
                >
                  ‹ Prev
                </button>

                <div className="os-page-number-buttons">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                    .reduce((acc, page, idx, arr) => {
                      if (idx > 0 && page - arr[idx - 1] > 1) {
                        acc.push(-1 * page);
                      }
                      acc.push(page);
                      return acc;
                    }, [])
                    .map((pageNum, idx) => {
                      if (pageNum < 0) {
                        return <span key={`ellipsis-${idx}`} className="os-page-ellipsis">...</span>;
                      }
                      return (
                        <button
                          key={pageNum}
                          className={`btn-os-page-num ${currentPage === pageNum ? 'active' : ''}`}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      );
                    })
                  }
                </div>

                <button
                  className="btn-os-page-nav"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  title="Next Page"
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
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

              <div className="form-grid-2">
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
              </div>

              {/* Due Amount Summary Breakdown */}
              {(() => {
                const foundSvc = services.find(s => String(s.id) === String(sellFormData.service_id));
                const gross = foundSvc ? parseFloat(foundSvc.price || 0) : 0;
                const disc = parseFloat(sellFormData.discount_amount) || 0;
                const net = Math.max(0, gross - disc);
                const paid = sellFormData.paid_amount !== '' && sellFormData.paid_amount !== undefined ? parseFloat(sellFormData.paid_amount) || 0 : net;
                const due = Math.max(0, net - paid);
                return (
                  <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                      <span style={{ color: '#64748b' }}>TOTAL PAYABLE:</span>
                      <strong style={{ color: '#0f172a' }}>₹{net.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                      <span style={{ color: '#64748b' }}>PAID NOW:</span>
                      <strong style={{ color: '#16a34a' }}>₹{paid.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #cbd5e1', fontSize: '0.95rem' }}>
                      <span style={{ fontWeight: '700', color: due > 0 ? '#ea580c' : '#64748b' }}>DUE BALANCE:</span>
                      <strong style={{ color: due > 0 ? '#ea580c' : '#10b981', fontSize: '1.05rem' }}>
                        ₹{due.toLocaleString('en-IN')} {due > 0 ? '(Partial Payment)' : '(Full Paid)'}
                      </strong>
                    </div>
                  </div>
                );
              })()}

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

      {/* Pay Due Modal for Other Services */}
      {payDueModal.isOpen && (
        <div className="os-modal-overlay" style={{ zIndex: 10500 }}>
          <div className="os-modal-card" style={{ maxWidth: '440px' }}>
            <div className="os-modal-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
              <div>
                <h3 style={{ color: '#c2410c', margin: 0, fontSize: '1.15rem' }}>
                  💳 Collect Due Payment
                </h3>
                <p style={{ color: '#ea580c', margin: '3px 0 0 0', fontSize: '0.82rem', fontWeight: 600 }}>
                  {payDueModal.sale?.clientName} • {payDueModal.sale?.serviceName}
                </p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setPayDueModal({ ...payDueModal, isOpen: false })}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmPayDue} className="os-modal-form" style={{ padding: '1.25rem' }}>
              <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Current Pending Due:</span>
                <strong style={{ fontSize: '1.1rem', color: '#ea580c' }}>₹{parseFloat(payDueModal.sale?.dueAmount || 0).toLocaleString()}</strong>
              </div>

              <div className="form-group">
                <label>Amount Paying Now (₹) *</label>
                <input
                  type="number"
                  min="1"
                  max={parseFloat(payDueModal.sale?.dueAmount || 0)}
                  value={payDueModal.amount}
                  onChange={e => setPayDueModal({ ...payDueModal, amount: e.target.value })}
                  required
                  style={{ fontSize: '1.05rem', fontWeight: '800' }}
                />
              </div>

              <div className="form-group">
                <label>Payment Method *</label>
                <select
                  value={payDueModal.payment_method}
                  onChange={e => setPayDueModal({ ...payDueModal, payment_method: e.target.value })}
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Net Banking">Net Banking</option>
                </select>
              </div>

              <div className="form-group">
                <label>Payment Date *</label>
                <input
                  type="date"
                  value={payDueModal.payment_date}
                  onChange={e => setPayDueModal({ ...payDueModal, payment_date: e.target.value })}
                  required
                />
              </div>

              {(() => {
                const curDue = parseFloat(payDueModal.sale?.dueAmount || 0);
                const payAmt = parseFloat(payDueModal.amount) || 0;
                const remDue = Math.max(0, curDue - payAmt);
                return (
                  <div style={{ background: remDue <= 0 ? '#f0fdf4' : '#fff7ed', padding: '0.65rem 0.85rem', borderRadius: '8px', border: `1px solid ${remDue <= 0 ? '#bbf7d0' : '#fed7aa'}`, fontSize: '0.82rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Remaining Due After Payment:</span>
                      <strong style={{ color: remDue <= 0 ? '#16a34a' : '#ea580c' }}>
                        ₹{remDue.toLocaleString()} {remDue <= 0 ? '(Fully Cleared ✓)' : '(Partial Balance)'}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <div className="os-modal-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setPayDueModal({ ...payDueModal, isOpen: false })}
                  disabled={payDueModal.submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-modal-confirm"
                  disabled={payDueModal.submitting}
                  style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' }}
                >
                  {payDueModal.submitting ? 'Recording...' : 'Record Payment & Generate Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sell Service to Walk-in Client Modal */}
      {isWalkinModalOpen && (
        <div className="os-modal-overlay">
          <div className="os-modal-card">
            <div className="os-modal-header" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
              <h3>Sell Service to Walk-in Client</h3>
              <button onClick={() => setIsWalkinModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleConfirmSellWalkin} className="os-modal-body">
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Walk-in Client Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar"
                    value={walkinFormData.walkin_name}
                    onChange={(e) => setWalkinFormData({ ...walkinFormData, walkin_name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Phone / Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={walkinFormData.walkin_phone}
                    onChange={(e) => setWalkinFormData({ ...walkinFormData, walkin_phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Select Service Tariff *</label>
                <select
                  value={walkinFormData.service_id}
                  onChange={(e) => handleWalkinServiceSelectionChange(e.target.value)}
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
                    value={walkinFormData.paid_amount}
                    onChange={(e) => setWalkinFormData({ ...walkinFormData, paid_amount: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Discount Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={walkinFormData.discount_amount}
                    onChange={(e) => handleWalkinDiscountChange(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Payment Method *</label>
                  <select
                    value={walkinFormData.payment_method}
                    onChange={(e) => setWalkinFormData({ ...walkinFormData, payment_method: e.target.value })}
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
                    value={walkinFormData.sale_date}
                    onChange={(e) => setWalkinFormData({ ...walkinFormData, sale_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Due Amount Summary Breakdown */}
              {(() => {
                const foundSvc = services.find(s => String(s.id) === String(walkinFormData.service_id));
                const gross = foundSvc ? parseFloat(foundSvc.price || 0) : 0;
                const disc = parseFloat(walkinFormData.discount_amount) || 0;
                const net = Math.max(0, gross - disc);
                const paid = walkinFormData.paid_amount !== '' && walkinFormData.paid_amount !== undefined ? parseFloat(walkinFormData.paid_amount) || 0 : net;
                const due = Math.max(0, net - paid);
                return (
                  <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                      <span style={{ color: '#64748b' }}>TOTAL PAYABLE:</span>
                      <strong style={{ color: '#0f172a' }}>₹{net.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                      <span style={{ color: '#64748b' }}>PAID NOW:</span>
                      <strong style={{ color: '#16a34a' }}>₹{paid.toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #cbd5e1', fontSize: '0.95rem' }}>
                      <span style={{ fontWeight: '700', color: due > 0 ? '#ea580c' : '#64748b' }}>DUE BALANCE:</span>
                      <strong style={{ color: due > 0 ? '#ea580c' : '#10b981', fontSize: '1.05rem' }}>
                        ₹{due.toLocaleString('en-IN')} {due > 0 ? '(Partial Payment)' : '(Full Paid)'}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <div className="os-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsWalkinModalOpen(false)} disabled={isSubmittingSell}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-confirm" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }} disabled={isSubmittingSell}>
                  {isSubmittingSell ? 'Processing Sale...' : 'Process Walk-in Sale & Generate Invoice'}
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
