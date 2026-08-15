import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getClients, deleteClient, restoreData, fetchTransactions, getTrainers, addClientPayment, getClientBills, getSettings, renewExpiredClient, getGeneralBookings, getPtAdvanceBookings, getPtAssignmentsByClient, getOtherServiceSalesByClient } from '../api';
import { utils, writeFile, read } from 'xlsx';
import ExpiredPlansModal from '../components/ExpiredPlansModal';
import InvoicePreviewModal from '../components/InvoicePreviewModal';

import './ManageClientsPage.css';

import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import { parseUploadedExcel } from '../utils/excelParser';

const getDurationDays = (planName) => {
  if (planName === 'Quarterly') return 90;
  if (planName === 'Half-Yearly' || planName === 'Semi-Annual') return 180;
  if (planName === 'Annual') return 365;
  return 30; // Monthly or default
};

const calcExpiryDateStr = (startDate, durationDays) => {
  if (!startDate) return '';
  const d = new Date(startDate);
  d.setDate(d.getDate() + parseInt(durationDays, 10));
  return d.toISOString().split('T')[0];
};

const calcClientDueDetails = (client) => {
  const actualTotal = Number(client.amount || 0);
  const isPaidStatus = (client.paymentStatus || '').toLowerCase() === 'paid' || client.dueAmount === 0 || client.dueAmount === '0';
  
  let effectiveDue = 0;
  if (!isPaidStatus) {
    if (client.dueAmount !== undefined && client.dueAmount !== null) {
      effectiveDue = Math.max(0, Number(client.dueAmount));
    } else {
      const pd = client.paidAmount !== undefined && client.paidAmount !== null ? Number(client.paidAmount) : actualTotal;
      effectiveDue = Math.max(0, actualTotal - pd);
    }
  }

  const actualPaid = Math.max(0, actualTotal - effectiveDue);
  return { actualTotal, actualPaid, effectiveDue };
};

const ManageClientsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  // Removed isPTAlertOpen state

  const [combinedExpiredList, setCombinedExpiredList] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [trainers, setTrainers] = useState([]);
  const [trainerFilter, setTrainerFilter] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '', clientId: '' });
  const [viewClientModal, setViewClientModal] = useState({ isOpen: false, client: null, ptAssignments: [], otherServices: [], loadingDetails: false });
  const [invoicePreviewClient, setInvoicePreviewClient] = useState(null);
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, client: null, amount: '', method: 'CASH', date: new Date().toISOString().split('T')[0] });
  const fileInputRef = useRef(null);

  const handleViewClient = async (client) => {
    setViewClientModal({ isOpen: true, client, ptAssignments: [], otherServices: [], loadingDetails: true });
    try {
      const [ptRes, svcRes] = await Promise.all([
        getPtAssignmentsByClient(client.id),
        getOtherServiceSalesByClient(client.id)
      ]);
      let ptData = Array.isArray(ptRes) ? ptRes : [];
      let svcData = Array.isArray(svcRes) ? svcRes : [];

      if (ptData.length === 0 && client.clientId) {
        try {
          const altPt = await getPtAssignmentsByClient(client.clientId);
          if (Array.isArray(altPt) && altPt.length > 0) ptData = altPt;
        } catch (e) {}
      }

      if (svcData.length === 0 && client.clientId) {
        try {
          const altSvc = await getOtherServiceSalesByClient(client.clientId);
          if (Array.isArray(altSvc) && altSvc.length > 0) svcData = altSvc;
        } catch (e) {}
      }

      setViewClientModal({
        isOpen: true,
        client,
        ptAssignments: ptData,
        otherServices: svcData,
        loadingDetails: false
      });
    } catch (err) {
      console.error('Failed to load client details:', err);
      setViewClientModal(prev => ({ ...prev, loadingDetails: false }));
    }
  };

  const [settings, setSettings] = useState({});
  const [renewModal, setRenewModal] = useState({
    isOpen: false,
    client: null,
    plan: '',
    price: '',
    paidAmount: '',
    paymentMethod: 'CASH',
    startDate: new Date().toISOString().split('T')[0],
    durationDays: 30,
    hasGst: false,
    gstin: ''
  });
  const [isRenewing, setIsRenewing] = useState(false);

  useEffect(() => {
    fetchClients();
    fetchTrainers();
    fetchSettings();

    const params = new URLSearchParams(location.search);
    const statusParam = params.get('status');
    if (statusParam === 'Active') {
      setActiveFilter('Active');
    } else if (statusParam === 'Inactive' || statusParam === 'Expired') {
      setActiveFilter('Inactive');
    } else if (statusParam === 'Reminder') {
      setActiveFilter('Reminder');
    }
  }, [location.search]);

  const fetchSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to fetch settings');
    }
  };

  const handleOpenRenewModal = (client) => {
    const initialPlan = client.plan || 'Monthly';
    const initialDuration = getDurationDays(initialPlan);
    const initialPrice = settings[`${initialPlan}_Strengthening`] || client.amount || 0;
    setRenewModal({
      isOpen: true,
      client: client,
      plan: initialPlan,
      price: initialPrice,
      paidAmount: initialPrice,
      paymentMethod: 'CASH',
      startDate: new Date().toISOString().split('T')[0],
      durationDays: initialDuration,
      hasGst: !!client.gstin,
      gstin: client.gstin || ''
    });
  };

  const handleRenewPlanChange = (newPlan) => {
    const duration = getDurationDays(newPlan);
    const price = settings[`${newPlan}_Strengthening`] || 0;
    setRenewModal(prev => ({
      ...prev,
      plan: newPlan,
      durationDays: duration,
      price: price,
      paidAmount: price
    }));
  };

  const handleRenewSubmit = async (e) => {
    e.preventDefault();
    if (!renewModal.plan) {
      alert('Please select a membership plan.');
      return;
    }
    setIsRenewing(true);
    try {
      const payload = {
        planName: renewModal.plan,
        price: parseFloat(renewModal.price) || 0,
        durationDays: renewModal.durationDays,
        hasGst: renewModal.hasGst,
        gstin: renewModal.gstin,
        paidAmount: renewModal.paidAmount !== '' ? parseFloat(renewModal.paidAmount) : parseFloat(renewModal.price),
        paymentMethod: renewModal.paymentMethod,
        startDate: renewModal.startDate
      };

      const response = await renewExpiredClient(renewModal.client.id, payload);

      setRenewModal({ isOpen: false, client: null, plan: '', price: '', paidAmount: '', paymentMethod: 'CASH', startDate: '', durationDays: 30, hasGst: false, gstin: '' });
      await fetchClients();

      if (response.bill) {
        setInvoicePreviewClient(response.bill);
      } else if (response.client) {
        setInvoicePreviewClient(response.client);
      }
    } catch (err) {
      console.error('Renew failed:', err);
      alert('Failed to renew client: ' + (err.message || 'Unknown error'));
    } finally {
      setIsRenewing(false);
    }
  };


  const fetchTrainers = async () => {
    try {
      const data = await getTrainers();
      setTrainers(data);
    } catch (error) {
      console.error('Failed to fetch trainers');
    }
  };

  useEffect(() => {
    const handleOpenExpired = () => setIsAlertOpen(true);
    // Removed handleOpenPT
    window.addEventListener('open-expired-plans', handleOpenExpired);

    return () => {
      window.removeEventListener('open-expired-plans', handleOpenExpired);
      // Removed window.removeEventListener
    };

  }, []);

  useEffect(() => {
    if (isAlertOpen || viewClientModal.isOpen || paymentModal.isOpen || deleteConfirm.isOpen || invoicePreviewClient || renewModal.isOpen) {
      document.body.setAttribute('data-alert-open', 'true');
    } else {
      document.body.removeAttribute('data-alert-open');
    }
    return () => document.body.removeAttribute('data-alert-open');
  }, [isAlertOpen, viewClientModal.isOpen, paymentModal.isOpen, deleteConfirm.isOpen, invoicePreviewClient, renewModal.isOpen]);

  const [advanceBookings, setAdvanceBookings] = useState({ general: [], pt: [] });

  const fetchClients = async () => {
    try {
      const [data, genBookings, ptBookings] = await Promise.all([
        getClients(),
        getGeneralBookings().catch(() => []),
        getPtAdvanceBookings().catch(() => [])
      ]);
      setClients(data);
      setAdvanceBookings({
        general: Array.isArray(genBookings) ? genBookings : [],
        pt: Array.isArray(ptBookings) ? ptBookings : []
      });

      // Unified Expiry Check
      const todayISO = new Date().toISOString().split('T')[0];
      const expiredMembership = data.filter(c => new Date(c.expiryDate).toISOString().split('T')[0] < todayISO).map(c => ({
        ...c,
        type: 'Membership',
        expiryDate: c.expiryDate
      }));

      const combined = [...expiredMembership]; // Removed expiredPT from combined
      setCombinedExpiredList(combined);

      const hasSeenPTAlert = sessionStorage.getItem('hasSeenPTAlert');
      const hasSnoozed = sessionStorage.getItem('hasSnoozedAlert');
      const userRole = localStorage.getItem('userRole');

      if (combined.length > 0 && !hasSeenPTAlert && !hasSnoozed && userRole !== 'superadmin') {
        setIsAlertOpen(true);
        sessionStorage.setItem('hasSeenPTAlert', 'true');
      }

      // Show alert if admin and there are genuinely new unread expired plans
      const lastSeen = parseInt(localStorage.getItem('lastSeenExpiredCount') || '0', 10);
      if (userRole === 'admin' && combined.length > lastSeen) {
        setTimeout(() => setIsAlertOpen(true), 1000);
      }

      // Update last seen to match the current count
      localStorage.setItem('lastSeenExpiredCount', combined.length.toString());

    } catch (error) {
      console.error('Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (client) => {
    setDeleteConfirm({
      isOpen: true,
      id: client.id,
      name: client.name,
      clientId: client.clientId
    });
  };

  const confirmDelete = async () => {
    const { id } = deleteConfirm;
    try {
      console.log('Attempting to delete client with ID:', id);
      await deleteClient(id);
      setClients(clients.filter(client => client.id !== id));
      setDeleteConfirm({ isOpen: false, id: null, name: '', clientId: '' });
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete client: ' + (error.message || 'Unknown error'));
    }
  };

  const handleAddPaymentSubmit = async (e) => {
    e.preventDefault();
    const clientForInvoice = paymentModal.client;
    const amountPaid = parseFloat(paymentModal.amount);
    const methodUsed = paymentModal.method;
    const datePaid = paymentModal.date;
    try {
      const result = await addClientPayment(clientForInvoice.id, {
        paidAmount: amountPaid,
        paymentDate: datePaid,
        paymentMethod: methodUsed
      });

      // Close payment modal & view modal
      setPaymentModal({ isOpen: false, client: null, amount: '', method: 'CASH', date: new Date().toISOString().split('T')[0] });
      setViewClientModal({ isOpen: false, client: null });

      // Refresh clients list
      await fetchClients();

      // Use the bill returned by the API to build the invoice
      const newBill = result?.bill;
      if (newBill) {
        const invoiceData = {
          ...clientForInvoice,
          billNo: newBill.billNo,
          // Amount paid in THIS transaction
          amount: newBill.planAmount,
          paidAmount: newBill.paidAmount,
          dueAmount: newBill.dueAmount,
          paymentStatus: newBill.paymentStatus,
          paymentMethod: methodUsed,
          invoiceDate: datePaid,
          // Extra fields for the due payment invoice
          dueNumber: newBill.dueNumber,
          totalPlanAmount: newBill.totalPlanAmount,
          remainingBalance: newBill.remainingBalance,
        };
        setInvoicePreviewClient(invoiceData);
      } else {
        // Fallback: fetch latest bill if API didn't return it
        try {
          const bills = await getClientBills(clientForInvoice.id);
          if (bills && bills.length > 0) {
            const latestBill = bills[0];
            setInvoicePreviewClient({
              ...clientForInvoice,
              billNo: latestBill.billNo,
              amount: latestBill.planAmount,
              paidAmount: latestBill.paidAmount,
              dueAmount: latestBill.dueAmount,
              paymentStatus: latestBill.paymentStatus,
              paymentMethod: methodUsed,
              invoiceDate: datePaid,
              dueNumber: latestBill.dueNumber,
              totalPlanAmount: latestBill.totalPlanAmount,
              remainingBalance: latestBill.remainingBalance,
            });
          }
        } catch (billErr) {
          console.error('Could not fetch new bill:', billErr);
        }
      }
    } catch (error) {
      console.error('Add payment failed:', error);
      alert('Failed to add payment: ' + (error.message || 'Unknown error'));
    }
  };





  const getValidityDisplay = (expiryDate) => {
    if (!expiryDate) return { text: 'N/A', subtext: '', isExpired: false, isWarning: false, days: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry - today;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        text: `Inactive`,
        subtext: `Inactive ${Math.abs(diffDays)} days ago`,
        isExpired: true,
        isWarning: false,
        days: diffDays
      };
    }
    return {
      text: `${diffDays} days left`,
      subtext: `Expires ${formatDateDDMMYYYY(expiryDate)}`,
      isExpired: false,
      isWarning: diffDays <= 5,
      days: diffDays
    };
  };

  const getAdvanceBookingDaysDisplay = (startDate, endDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);

    if (start && start > today) {
      const diffDays = Math.round((start - today) / (1000 * 60 * 60 * 24));
      return { text: `Starts in ${diffDays} day${diffDays > 1 ? 's' : ''}`, isFuture: true, isExpired: false };
    }
    if (endDate) {
      return getValidityDisplay(endDate);
    }
    return null;
  };

  const filteredClients = clients.filter(client => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = client.name.toLowerCase().includes(searchLower) ||
      client.phone.includes(searchTerm) ||
      client.clientId?.toLowerCase().includes(searchLower) ||
      client.id?.toLowerCase().includes(searchLower) ||
      client.trainerName?.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // Trainer Filter
    if (trainerFilter !== 'All' && client.trainerId !== trainerFilter) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today
    const expiry = new Date(client.expiryDate);
    expiry.setHours(0, 0, 0, 0); // Normalize expiry

    const isExpired = client.status === 'inactive' || client.status === 'Inactive' || client.status === 'Expired' || (client.expiryDate ? expiry < today : false);

    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isExpiringSoon = diffDays >= 0 && diffDays <= 5;

    const { actualTotal, actualPaid, effectiveDue } = calcClientDueDetails(client);

    if (activeFilter === 'Active') return !isExpired;
    if (activeFilter === 'Inactive') return isExpired;
    if (activeFilter === 'Reminder') return isExpiringSoon;
    if (activeFilter === 'Due Payment') return effectiveDue > 0;

    return true;

  });



  const stats = {
    total: clients.length,
    expired: clients.filter(c => new Date(c.expiryDate) < new Date()).length
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const allClients = await getClients();
      const allTxns = await fetchTransactions();

      const wb = utils.book_new();

      // Remove profileImage (base64 string) to prevent Excel 32767 character limit error
      const exportClients = allClients.map(({ profileImage, ...rest }) => rest);

      const clientsSheet = utils.json_to_sheet(exportClients);
      utils.book_append_sheet(wb, clientsSheet, "Clients");

      const txnsSheet = utils.json_to_sheet(allTxns);
      utils.book_append_sheet(wb, txnsSheet, "Transactions");

      writeFile(wb, `Fitness_Data_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm("Warning: Importing data will overwrite all existing clients and transactions. Are you sure you want to proceed?")) {
      e.target.value = null;
      return;
    }

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = read(data);

      const { clientsData, txnsData } = parseUploadedExcel(wb);

      if (clientsData.length === 0 && txnsData.length === 0) {
        alert("No valid data found in the uploaded Excel file. Please check that your sheet contains member columns like Name, Phone, and Plan.");
        return;
      }

      await restoreData({ clients: clientsData, transactions: txnsData });
      alert(`Import & restore successful! Mapped ${clientsData.length} Clients and ${txnsData.length} Transactions.`);
      await fetchClients();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import data: ' + (error.message || 'Please check file format.'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  return (
    <div className="manage-clients-container">
      <header className="manage-header-section reveal">
        <div className="title-group">
          <h1><span>CLIENT</span> LIST</h1>
          <p>System initialized. Monitoring active membership records.</p>
        </div>

        <div className="stats-bar">
          <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => setActiveFilter('All')}>
            <span className="stat-label">Total Strength</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => setActiveFilter('Due Payment')}>
            <span className="stat-label">Clients With Due</span>
            <span className="stat-value" style={{ color: '#ea580c' }}>
              {clients.filter(c => calcClientDueDetails(c).effectiveDue > 0).length}
            </span>
          </div>
          <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => setActiveFilter('Inactive')}>
            <span className="stat-label">Inactive Plans</span>
            <span className="stat-value red">{stats.expired}</span>
          </div>
        </div>
      </header>

      <div className="controls-row reveal">
        <div className="search-controls">
          <div className="search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary-neon)' }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              type="text"
              placeholder="INITIALIZE SEARCH..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>


          <input
            type="file"
            accept=".xlsx, .xls"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleImport}
          />
          <button
            className="btn-export"
            onClick={handleExport}
            disabled={isExporting || isImporting}
            style={{ padding: '0.4rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '100px', cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', height: '38px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {isExporting ? '...' : 'EXP'}
          </button>

          <button
            className="btn-import"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExporting || isImporting}
            style={{ padding: '0.4rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '100px', cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', height: '38px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            {isImporting ? '...' : 'IMP'}
          </button>
        </div>

        <div className="filter-group">
          <div className="filter-pills">
            {['All', 'Active', 'Due Payment', 'Inactive', 'Reminder'].map(filter => {
              const dueCount = clients.filter(c => calcClientDueDetails(c).effectiveDue > 0).length;
              const label = filter === 'Due Payment' ? `Due Payment (${dueCount})` : filter;
              return (
                <button
                  key={filter}
                  className={`filter-pill ${activeFilter === filter ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFilter(filter);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-responsive">
          <table className="clients-table">
            <thead>
              <tr>
                <th style={{ width: '6%' }}>ID ↑↓</th>
                <th style={{ width: '20%' }}>Client Name</th>
                <th style={{ width: '12%' }}>Phone Number</th>
                <th style={{ width: '10%' }}>Program</th>
                <th style={{ width: '18%' }}>Payment / Due Status</th>
                <th style={{ width: '14%' }}>Validity</th>
                <th style={{ textAlign: 'right', width: '20%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>Loading clients...</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>No clients found.</td></tr>
              ) : filteredClients.map(client => {
                const validity = getValidityDisplay(client.expiryDate);
                return (
                  <tr key={client.id}>
                    <td className="id-cell">{formatShortId(client.clientId || client.id)}</td>
                    <td className="name-cell">
                      <div className="name-avatar-group">
                        <div className="client-avatar-mini">
                          {client.profileImage ? (
                            <img src={client.profileImage} alt={client.name} />
                          ) : (
                            <span className="avatar-fallback">{client.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="name-renew-stack">
                          <span className="client-name">{client.name}</span>
                          {validity.isExpired && (
                            <button
                              type="button"
                              className="btn-renew-badge"
                              onClick={() => handleOpenRenewModal(client)}
                              title="Renew Membership Plan"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '3px' }}>
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                              </svg>
                              Renew
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="phone-cell">{client.phone}</td>
                    <td>
                      <div className="plan-display-group">
                        <span className="plan-pill">{client.plan}</span>
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const { actualTotal, actualPaid, effectiveDue } = calcClientDueDetails(client);

                        if (effectiveDue > 0) {
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                              <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                ⚠️ Due: ₹{effectiveDue.toLocaleString()}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                Paid ₹{actualPaid.toLocaleString()} of ₹{actualTotal.toLocaleString()}
                              </span>
                              <button
                                className="btn-pay-due-action"
                                onClick={() => setPaymentModal({
                                  isOpen: true,
                                  client: client,
                                  amount: effectiveDue,
                                  method: 'CASH',
                                  date: new Date().toISOString().split('T')[0]
                                })}
                                title={`Collect & Close Due Amount for ${client.name} (₹${effectiveDue.toLocaleString()})`}
                                style={{
                                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                                  color: '#ffffff',
                                  border: '1px solid #ea580c',
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '100px',
                                  fontWeight: '800',
                                  fontSize: '0.75rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
                                  whiteSpace: 'nowrap',
                                  marginTop: '2px'
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                Pay Due (₹{effectiveDue.toLocaleString()})
                              </button>
                            </div>
                          );
                        } else {
                          return (
                            <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #dcfce7', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', display: 'inline-block' }}>
                              ✓ Fully Paid (₹{actualTotal.toLocaleString()})
                            </span>
                          );
                        }
                      })()}
                    </td>
                    <td className="validity-cell">
                      <div className="validity-wrapper">
                        <span className={`days-left ${validity.isExpired ? 'expired' : ''} ${validity.isWarning ? 'warning' : ''}`}>
                          {validity.text}
                        </span>
                        <span className="expiry-date" style={{ fontSize: '0.75rem' }}>
                          Start: <strong>{formatDateDDMMYYYY(client.fromDate)}</strong> • Exp: <strong>{formatDateDDMMYYYY(client.expiryDate)}</strong>
                        </span>
                      </div>
                    </td>
                    <td className="actions-cell">
                      <div className="actions-cell-wrapper">
                        <button
                          className="btn-action-view"
                          onClick={() => handleViewClient(client)}
                          title="View Full Client Details"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>

                        {localStorage.getItem('userRole') === 'superadmin' && (
                          <button
                            className="btn-action-edit"
                            onClick={() => navigate(`/edit-client/${client.id}`)}
                            title="Edit Profile"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                          </button>
                        )}

                        <button
                          className="btn-action-edit"
                          style={{ background: 'rgba(234, 88, 12, 0.1)', color: '#f97316', borderColor: 'rgba(234, 88, 12, 0.3)' }}
                          onClick={() => navigate(`/pt-assignments?clientId=${client.id}`)}
                          title="Assign PT Package"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 18h12M6 6h12M9 12h6" />
                          </svg>
                        </button>

                        <button
                          className="btn-action-edit"
                          style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.3)' }}
                          onClick={() => navigate(`/advance-bookings?clientId=${client.id}`)}
                          title="Create Advance Booking"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                            <line x1="12" y1="14" x2="12" y2="18" />
                            <line x1="10" y1="16" x2="14" y2="16" />
                          </svg>
                        </button>

                        {localStorage.getItem('userRole') === 'superadmin' && (
                          <button
                            className="btn-action-delete"
                            onClick={() => handleDelete(client)}
                            title="Delete Client"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
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
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="alert-modal-overlay">
          <div className="alert-modal-card">
            <div className="alert-icon-circle warning">
              🗑
            </div>
            <h3>Delete Client?</h3>
            <p>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong> ({deleteConfirm.clientId})?<br />
              This action cannot be undone and all associated records will be lost.
            </p>
            <div className="alert-modal-actions">
              <button
                className="btn-alert-secondary"
                onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '', clientId: '' })}
              >
                Cancel
              </button>
              <button
                className="btn-alert-primary error"
                onClick={confirmDelete}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Client Modal */}
      {viewClientModal.isOpen && viewClientModal.client && (() => {
        const c = viewClientModal.client;
        const validity = getValidityDisplay(c.expiryDate);
        const vmTotal = Number(c.amount || 0);
        const vmPaid = c.paidAmount !== undefined && c.paidAmount !== null ? Number(c.paidAmount) : vmTotal;
        const vmDue = Math.max(0, vmTotal - vmPaid);
        const vmStatus = vmDue <= 0 ? 'Paid' : (vmPaid > 0 ? 'Partial' : 'Due');
        
        // Find active PT package
        const ptAssignments = viewClientModal.ptAssignments || [];
        const activePt = ptAssignments.find(pt => pt.status === 'Active') || ptAssignments[0];

        // Bookings and Services
        const clientGenBookings = (advanceBookings.general || []).filter(b => 
          (b.client_id === c.id || b.clientId === c.id || b.clientCode === c.clientId) && b.status !== 'Cancelled'
        );
        const clientPtBookings = (advanceBookings.pt || []).filter(b => 
          (b.client_id === c.id || b.clientId === c.id || b.clientCode === c.clientId) && b.status !== 'Cancelled'
        );
        const otherServices = viewClientModal.otherServices || [];

        return (
          <div className="alert-modal-overlay">
            <div className="alert-modal-card view-modal-card-landscape reveal">
              <button className="btn-close-modal" onClick={() => setViewClientModal({ isOpen: false, client: null })} title="Close / Exit">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>

              <div className="landscape-modal-content-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '75vh', overflow: 'hidden' }}>
                <div className="landscape-modal-content">
                  {/* Column 1: Profile Info */}
                  <div className="landscape-col profile-col">
                    <div className="landscape-avatar-container">
                      <div className="view-modal-avatar-lg">
                        {c.profileImage ? (
                          <img src={c.profileImage} alt={c.name} />
                        ) : (
                          <span>{c.name.charAt(0)}</span>
                        )}
                      </div>
                    </div>
                    <div className="profile-main-info">
                      <h2>{c.name}</h2>
                      <div className="view-modal-badges" style={{ justifyContent: 'center' }}>
                        <span className="badge-id">ID: {c.clientId}</span>
                        <span className={`badge-status ${c.status === 'Active' ? 'active' : 'inactive'}`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                    <div className="profile-details">
                      <div className="detail-row"><span>Mobile:</span> <strong>{c.phone}</strong></div>
                      <div className="detail-row"><span>Gender:</span> <strong>{c.gender || 'N/A'}</strong></div>
                      <div className="detail-row"><span>Join Date:</span> <strong>{formatDateDDMMYYYY(c.fromDate)}</strong></div>
                    </div>
                  </div>

                  {/* Column 2: General Membership */}
                  <div className="landscape-col general-col">
                    <div className="col-header">
                      <span className="col-icon">📋</span>
                      <h3>General Membership</h3>
                    </div>
                    <div className="plan-highlight">
                      <span className="plan-pill">{c.plan}</span>
                      <span className={`badge-status ${validity.isExpired ? 'inactive' : (vmStatus === 'Paid' ? 'active' : 'warning')}`}>
                        {validity.isExpired ? 'Inactive' : vmStatus}
                      </span>
                    </div>
                    <div className="landscape-date-box">
                      <div className="date-item">
                        <span className="date-label">From Date</span>
                        <strong className="date-value">{formatDateDDMMYYYY(c.fromDate)}</strong>
                      </div>
                      <div className="date-divider">→</div>
                      <div className="date-item">
                        <span className="date-label">To Date</span>
                        <strong className="date-value">{formatDateDDMMYYYY(c.expiryDate)}</strong>
                      </div>
                    </div>
                    <div className="landscape-validity-status" style={{
                      background: validity.isExpired ? '#fef2f2' : (validity.isWarning ? '#fff7ed' : '#f0fdf4'),
                      color: validity.isExpired ? '#dc2626' : (validity.isWarning ? '#ea580c' : '#16a34a'),
                      border: `1px solid ${validity.isExpired ? '#fecaca' : (validity.isWarning ? '#fed7aa' : '#bbf7d0')}`,
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: '800',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      margin: '0.6rem 0'
                    }}>
                      <span>⏳ Remaining Days:</span>
                      <strong>{validity.text}</strong>
                    </div>
                    <div className="landscape-payment-summary">
                      <div className="pay-row"><span>Total:</span> <strong>₹{vmTotal.toLocaleString()}</strong></div>
                      <div className="pay-row"><span>Paid:</span> <strong className="text-green">₹{vmPaid.toLocaleString()}</strong></div>
                      {vmDue > 0 && <div className="pay-row"><span>Due:</span> <strong style={{color:'#ea580c'}}>₹{vmDue.toLocaleString()}</strong></div>}
                    </div>
                  </div>

                  {/* Column 3: PT Package Info */}
                  <div className="landscape-col pt-col">
                    <div className="col-header">
                      <span className="col-icon">🏋️</span>
                      <h3>Personal Training</h3>
                    </div>
                    {activePt ? (() => {
                      const ptValidity = (activePt.expiry_date || activePt.expiryDate) ? getValidityDisplay(activePt.expiry_date || activePt.expiryDate) : null;
                      return (
                        <>
                          <div className="plan-highlight pt-highlight">
                            <strong className="pt-plan-name">{activePt.packageName}</strong>
                            <span className={`badge-status ${activePt.status === 'Active' ? 'active' : 'inactive'}`}>
                              {activePt.status}
                            </span>
                          </div>
                          <div className="landscape-date-box pt-dates">
                            <div className="date-item">
                              <span className="date-label">From Date</span>
                              <strong className="date-value">{formatDateDDMMYYYY(activePt.assigned_date)}</strong>
                            </div>
                            <div className="date-divider">→</div>
                            <div className="date-item">
                              <span className="date-label">To Date</span>
                              <strong className="date-value">{formatDateDDMMYYYY(activePt.expiry_date || activePt.expiryDate)}</strong>
                            </div>
                          </div>
                          {ptValidity && (
                            <div className="landscape-validity-status" style={{
                              background: ptValidity.isExpired ? '#fef2f2' : (ptValidity.isWarning ? '#fff7ed' : '#f0fdf4'),
                              color: ptValidity.isExpired ? '#dc2626' : (ptValidity.isWarning ? '#ea580c' : '#16a34a'),
                              border: `1px solid ${ptValidity.isExpired ? '#fecaca' : (ptValidity.isWarning ? '#fed7aa' : '#bbf7d0')}`,
                              padding: '0.45rem 0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                              fontWeight: '800',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              margin: '0.6rem 0'
                            }}>
                              <span>⏳ Remaining Days:</span>
                              <strong>{ptValidity.text}</strong>
                            </div>
                          )}
                          <div className="landscape-pt-details">
                            <div className="detail-row"><span>Trainer:</span> <strong>{activePt.trainerName || 'Assigned'}</strong></div>
                            <div className="detail-row"><span>Classes:</span> <strong>{activePt.classes_completed} / {activePt.total_classes_snapshot}</strong></div>
                          </div>
                        </>
                      );
                    })() : (
                      <div className="empty-pt-state">
                        <span className="empty-icon">🏃</span>
                        <p>No Active PT Package</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Additional Data */}
                <div className="landscape-bottom-row">
                  {/* Adv General */}
                  <div className="landscape-bottom-col">
                    <div className="col-header-small">
                      <span>🏷️ Adv General ({clientGenBookings.length})</span>
                    </div>
                    <div className="scrollable-list">
                      {clientGenBookings.length > 0 ? clientGenBookings.map(b => {
                        const genBVal = getAdvanceBookingDaysDisplay(b.booking_start_date, b.booking_end_date);
                        return (
                          <div key={`gen-${b.id}`} className="mini-card adv-gen-card">
                            <div className="mc-head">
                              <strong>{b.plan_type}</strong>
                              <span className="mc-status">{b.status}</span>
                            </div>
                            <div className="mc-dates">{formatDateDDMMYYYY(b.booking_start_date)} → {formatDateDDMMYYYY(b.booking_end_date)}</div>
                            {genBVal && (
                              <div style={{
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                marginTop: '4px',
                                color: genBVal.isExpired ? '#dc2626' : (genBVal.isFuture ? '#6366f1' : '#16a34a')
                              }}>
                                ⏳ {genBVal.isFuture ? genBVal.text : `Remaining: ${genBVal.text}`}
                              </div>
                            )}
                          </div>
                        );
                      }) : <div className="mini-empty">No Adv General</div>}
                    </div>
                  </div>

                  {/* Adv PT */}
                  <div className="landscape-bottom-col">
                    <div className="col-header-small" style={{ color: '#0d9488' }}>
                      <span>🏋️ Adv PT ({clientPtBookings.length})</span>
                    </div>
                    <div className="scrollable-list">
                      {clientPtBookings.length > 0 ? clientPtBookings.map(b => {
                        const ptBVal = getAdvanceBookingDaysDisplay(b.booking_start_date, b.expiry_date || b.booking_end_date);
                        return (
                          <div key={`pt-${b.id}`} className="mini-card adv-pt-card">
                            <div className="mc-head">
                              <strong style={{color:'#0f766e'}}>{b.packageName}</strong>
                              <span className="mc-status" style={{background:'#0d9488'}}>{b.status}</span>
                            </div>
                            <div className="mc-dates">{b.trainerName || 'Assigned'} • {formatDateDDMMYYYY(b.booking_start_date)}</div>
                            {ptBVal && (
                              <div style={{
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                marginTop: '4px',
                                color: ptBVal.isExpired ? '#dc2626' : (ptBVal.isFuture ? '#0d9488' : '#16a34a')
                              }}>
                                ⏳ {ptBVal.isFuture ? ptBVal.text : `Remaining: ${ptBVal.text}`}
                              </div>
                            )}
                          </div>
                        );
                      }) : <div className="mini-empty">No Adv PT</div>}
                    </div>
                  </div>

                  {/* Other Services */}
                  <div className="landscape-bottom-col">
                    <div className="col-header-small" style={{ color: '#4f46e5' }}>
                      <span>🧩 Other Services ({otherServices.length})</span>
                    </div>
                    <div className="scrollable-list">
                      {otherServices.length > 0 ? otherServices.map(svc => (
                        <div key={svc.id} className="mini-card os-card">
                          <div className="mc-head">
                            <strong style={{color:'#3730a3'}}>{svc.serviceName}</strong>
                            <span className="mc-status" style={{background:'#4f46e5'}}>{svc.paymentStatus || 'Paid'}</span>
                          </div>
                          <div className="mc-dates">Sold: {formatDateDDMMYYYY(svc.sale_date)} • ₹{(svc.price_snapshot || 0).toLocaleString()}</div>
                        </div>
                      )) : <div className="mini-empty">No Other Services</div>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="view-modal-footer">
                <button
                  className="btn-cancel-gray"
                  onClick={() => {
                    setInvoicePreviewClient(c);
                    setViewClientModal({ isOpen: false, client: null });
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  View Bill PDF
                </button>
                {vmDue > 0 && (
                  <button
                    className="btn-save-green"
                    style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
                    onClick={() => setPaymentModal({ isOpen: true, client: c, amount: vmDue, method: 'CASH', date: new Date().toISOString().split('T')[0] })}
                  >
                    Add Payment (₹{vmDue.toLocaleString()})
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Payment Modal */}
      {paymentModal.isOpen && paymentModal.client && (() => {
        const pmTotal = Number(paymentModal.client.amount || 0);
        const pmPaid = paymentModal.client.paidAmount !== undefined && paymentModal.client.paidAmount !== null ? Number(paymentModal.client.paidAmount) : pmTotal;
        const pmDue = Math.max(0, pmTotal - pmPaid);

        return (
          <div className="alert-modal-overlay">
            <div className="payment-modal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0 }}>Close Due Payment</h3>
                <button
                  style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#64748b' }}
                  onClick={() => setPaymentModal({ isOpen: false, client: null, amount: '', method: 'CASH', date: '' })}
                >
                  ✕
                </button>
              </div>

              <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', padding: '0.85rem 1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748b' }}>Client Name:</span>
                  <strong style={{ color: '#0f172a' }}>{paymentModal.client.name} ({paymentModal.client.clientId || 'No ID'})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748b' }}>Total Plan Amount:</span>
                  <strong style={{ color: '#0f172a' }}>₹ {pmTotal.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748b' }}>Amount Paid:</span>
                  <strong style={{ color: '#16a34a' }}>₹ {pmPaid.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #fdba74', paddingTop: '0.4rem', marginTop: '0.4rem' }}>
                  <span style={{ color: '#ea580c', fontWeight: '800' }}>Pending Due Balance:</span>
                  <strong style={{ color: '#ea580c', fontWeight: '800', fontSize: '0.95rem' }}>₹ {pmDue.toLocaleString()}</strong>
                </div>
              </div>

              <form onSubmit={handleAddPaymentSubmit}>
                <div className="payment-form-group">
                  <label className="payment-form-label">Amount to Pay (Max Due: ₹{pmDue.toLocaleString()})</label>
                  <input
                    type="number"
                    max={pmDue}
                    className="payment-form-input"
                    value={paymentModal.amount}
                    onChange={e => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="payment-form-group">
                  <label className="payment-form-label">Payment Method</label>
                  <select
                    className="payment-form-input"
                    value={paymentModal.method}
                    onChange={e => setPaymentModal({ ...paymentModal, method: e.target.value })}
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">CARD</option>
                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                  </select>
                </div>
                <div className="payment-form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="payment-form-label">Date</label>
                  <input
                    type="date"
                    className="payment-form-input"
                    value={paymentModal.date}
                    onChange={e => setPaymentModal({ ...paymentModal, date: e.target.value })}
                    required
                  />
                </div>
                <div className="payment-modal-actions">
                  <button type="button" className="btn-payment-cancel" onClick={() => setPaymentModal({ isOpen: false, client: null, amount: '', method: 'CASH', date: '' })}>Cancel</button>
                  <button type="submit" className="btn-payment-submit">Submit Payment</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Expired Plans Alert Modal */}
      <ExpiredPlansModal
        isOpen={isAlertOpen}
        onClose={() => {
          setIsAlertOpen(false);
          sessionStorage.setItem('hasSnoozedAlert', 'true');
        }}
        onGoToManage={() => {
          setIsAlertOpen(false);
          setActiveFilter('Inactive');
        }}
        expiredClients={combinedExpiredList.map(c => {
          const v = getValidityDisplay(c.expiryDate);
          return {
            ...c,
            daysAgo: v.isExpired ? Math.abs(Math.round((new Date(c.expiryDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))) : 0
          };
        })}
      />

      <InvoicePreviewModal
        isOpen={!!invoicePreviewClient}
        onClose={() => setInvoicePreviewClient(null)}
        client={invoicePreviewClient}
        title="Membership Renewal Completed"
      />

      {/* Renew Plan Modal */}
      {renewModal.isOpen && renewModal.client && (
        <div className="alert-modal-overlay">
          <div className="renew-modal-card reveal">
            <div className="renew-modal-header">
              <div className="renew-header-title">
                <h3>Renew Membership Plan</h3>
                <p className="renew-subtitle">Select a plan to reactivate <strong>{renewModal.client.name}</strong> ({renewModal.client.clientId})</p>
              </div>
              <button className="btn-close-modal" onClick={() => setRenewModal({ isOpen: false, client: null, plan: '', price: '', paidAmount: '', paymentMethod: 'CASH', startDate: '', durationDays: 30, hasGst: false, gstin: '' })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleRenewSubmit} className="renew-modal-form">
              <div className="renew-form-grid">
                {/* Plan Selection */}
                <div className="renew-form-group full-width">
                  <label className="renew-form-label">Choose Plan *</label>
                  <select
                    className="renew-form-input"
                    value={renewModal.plan}
                    onChange={(e) => handleRenewPlanChange(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Membership Plan --</option>
                    {['Monthly', 'Quarterly', 'Half-Yearly', 'Annual'].map(planBase => (
                      <option key={planBase} value={planBase}>
                        {planBase === 'Half-Yearly' ? 'Semi-Annual (6 Months)' : `${planBase} ${planBase === 'Monthly' ? '(1 Month)' : planBase === 'Quarterly' ? '(3 Months)' : '(1 Year)'}`} - ₹{(settings[`${planBase}_Strengthening`] || 0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div className="renew-form-group">
                  <label className="renew-form-label">Start Date *</label>
                  <input
                    type="date"
                    className="renew-form-input"
                    value={renewModal.startDate}
                    onChange={(e) => setRenewModal({ ...renewModal, startDate: e.target.value })}
                    required
                  />
                </div>

                {/* New Expiry Date (calculated) */}
                <div className="renew-form-group">
                  <label className="renew-form-label">New Expiry Date</label>
                  <input
                    type="text"
                    className="renew-form-input readonly"
                    value={formatDateDDMMYYYY(calcExpiryDateStr(renewModal.startDate, renewModal.durationDays))}
                    readOnly
                  />
                </div>

                {/* Total Plan Price */}
                <div className="renew-form-group">
                  <label className="renew-form-label">Plan Price (₹) *</label>
                  <input
                    type="number"
                    className="renew-form-input"
                    value={renewModal.price}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRenewModal(prev => ({ ...prev, price: val, paidAmount: val }));
                    }}
                    required
                  />
                </div>

                {/* Amount Paid */}
                <div className="renew-form-group">
                  <label className="renew-form-label">Paid Amount (₹) *</label>
                  <input
                    type="number"
                    className="renew-form-input"
                    value={renewModal.paidAmount}
                    onChange={(e) => setRenewModal({ ...renewModal, paidAmount: e.target.value })}
                    required
                  />
                </div>

                {/* Payment Method */}
                <div className="renew-form-group">
                  <label className="renew-form-label">Payment Method</label>
                  <select
                    className="renew-form-input"
                    value={renewModal.paymentMethod}
                    onChange={(e) => setRenewModal({ ...renewModal, paymentMethod: e.target.value })}
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">CARD</option>
                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                  </select>
                </div>

                {/* Remaining Due */}
                <div className="renew-form-group">
                  <label className="renew-form-label">Due Amount (₹)</label>
                  <input
                    type="text"
                    className="renew-form-input readonly"
                    style={{ color: (parseFloat(renewModal.price || 0) - parseFloat(renewModal.paidAmount || 0)) > 0 ? '#ea580c' : '#16a34a', fontWeight: '700' }}
                    value={`₹ ${Math.max(0, (parseFloat(renewModal.price || 0) - parseFloat(renewModal.paidAmount || 0))).toLocaleString()}`}
                    readOnly
                  />
                </div>

                {/* GST Section */}
                <div className="renew-form-group full-width gst-section">
                  <label className="renew-form-label">B2B GST Invoice?</label>
                  <div className="gst-toggle-group">
                    <label className="gst-radio-label">
                      <input
                        type="radio"
                        name="renewHasGst"
                        checked={renewModal.hasGst}
                        onChange={() => setRenewModal(prev => ({ ...prev, hasGst: true }))}
                      />
                      Yes (GSTIN)
                    </label>
                    <label className="gst-radio-label">
                      <input
                        type="radio"
                        name="renewHasGst"
                        checked={!renewModal.hasGst}
                        onChange={() => setRenewModal(prev => ({ ...prev, hasGst: false }))}
                      />
                      No
                    </label>
                  </div>
                  {renewModal.hasGst && (
                    <input
                      type="text"
                      className="renew-form-input gstin-input"
                      placeholder="Enter 15-Digit GSTIN"
                      maxLength={15}
                      value={renewModal.gstin}
                      onChange={(e) => setRenewModal({ ...renewModal, gstin: e.target.value.toUpperCase() })}
                    />
                  )}
                </div>
              </div>

              <div className="renew-modal-actions">
                <button
                  type="button"
                  className="btn-renew-cancel"
                  onClick={() => setRenewModal({ isOpen: false, client: null, plan: '', price: '', paidAmount: '', paymentMethod: 'CASH', startDate: '', durationDays: 30, hasGst: false, gstin: '' })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-renew-submit"
                  disabled={isRenewing}
                >
                  {isRenewing ? 'Processing Renewal...' : 'Proceed & Renew'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageClientsPage;
