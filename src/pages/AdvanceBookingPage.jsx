import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  getClients,
  getSettings,
  getPtPackages,
  getTrainers,
  getPtAssignments,
  getGeneralBookings,
  addGeneralBooking,
  cancelGeneralBooking,
  getPtAdvanceBookings,
  addPtAdvanceBooking,
  cancelPtAdvanceBooking,
  activatePtAdvanceBooking,
  addClient,
  getNextClientId
} from '../api';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import './AdvanceBookingPage.css';

const AdvanceBookingPage = () => {
  const navigate = useNavigate();
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [isDirty, setIsDirty] = useState(false);
  const [blockedTargetUrl, setBlockedTargetUrl] = useState('');
  const [isConfirmExitOpen, setIsConfirmExitOpen] = useState(false);
  const [customPopup, setCustomPopup] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert', // 'alert' | 'confirm'
    onConfirm: null
  });

  const showCustomAlert = (title, message, onOk = null) => {
    setCustomPopup({
      isOpen: true,
      title,
      message,
      type: 'alert',
      onConfirm: () => {
        setCustomPopup(prev => ({ ...prev, isOpen: false }));
        if (onOk) onOk();
      }
    });
  };

  const showCustomConfirm = (title, message, onYes) => {
    setCustomPopup({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm: () => {
        setCustomPopup(prev => ({ ...prev, isOpen: false }));
        onYes();
      }
    });
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'pt' ? 'pt' : 'general';
  const preselectedClientId = searchParams.get('clientId') || '';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [filterStatus, setFilterStatus] = useState('All');
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState({});
  const [ptPackages, setPtPackages] = useState([]);
  const [trainers, setTrainers] = useState([]);
  
  const [generalBookings, setGeneralBookings] = useState([]);
  const [ptBookings, setPtBookings] = useState([]);
  const [ptAssignments, setPtAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'pt') setActiveTab('pt');
    else if (tabParam === 'general') setActiveTab('general');
  }, [searchParams]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [invoiceClient, setInvoiceClient] = useState(null);

  // Client Selection Mode: 'existing' | 'new'
  const [clientMode, setClientMode] = useState('existing');
  const [newClient, setNewClient] = useState({
    name: '',
    phone: '',
    gender: 'Male',
    clientId: ''
  });

  // General Booking Form
  const [genForm, setGenForm] = useState({
    client_id: preselectedClientId,
    plan_type: '',
    price: '',
    discount_amount: '',
    booking_start_date: new Date().toISOString().split('T')[0],
    booking_end_date: '',
    payment_method: 'CASH'
  });

  // PT Booking Form
  const [ptForm, setPtForm] = useState({
    client_id: preselectedClientId,
    pt_package_id: '',
    trainer_id: '',
    discount_amount: '',
    booking_start_date: new Date().toISOString().split('T')[0],
    payment_method: 'CASH'
  });

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleLinkClick = (e) => {
      if (!isDirty) return;

      const target = e.target.closest('a, button, [role="button"]');
      if (!target) return;

      if (target.closest('.alert-modal-card') || target.closest('.adv-modal-card')) {
        return; // Ignore inside modals
      }

      const href = target.getAttribute('href');
      
      if (href && !href.startsWith('#/advance-bookings') && href !== '#') {
        e.preventDefault();
        e.stopPropagation();
        setBlockedTargetUrl(href);
        setIsConfirmExitOpen(true);
      }
    };

    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, [isDirty]);

  useEffect(() => {
    const pClient = searchParams.get('clientId');
    const pTrainer = searchParams.get('trainerId');
    const pPackage = searchParams.get('packageId');
    const pStart = searchParams.get('startDate');
    const tabParam = searchParams.get('tab');

    if (tabParam === 'pt' || pTrainer || pPackage || pStart) {
      setActiveTab('pt');
    }

    if (pClient || pTrainer || pPackage || pStart) {
      const selClient = clients.find(c => c.id === pClient);
      let calculatedStart = pStart;
      const todayStr = new Date().toISOString().split('T')[0];
      if (!calculatedStart && selClient && selClient.expiryDate && selClient.expiryDate >= todayStr) {
        calculatedStart = calculateNextDayDate(selClient.expiryDate);
      }

      setGenForm(prev => ({
        ...prev,
        client_id: pClient || prev.client_id,
        booking_start_date: calculatedStart || prev.booking_start_date
      }));
      setPtForm(prev => ({
        ...prev,
        client_id: pClient || prev.client_id,
        trainer_id: pTrainer || prev.trainer_id,
        pt_package_id: pPackage || prev.pt_package_id,
        booking_start_date: calculatedStart || prev.booking_start_date
      }));
      setIsModalOpen(true);
    }
  }, [searchParams, clients]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsRes, settingsRes, pkgRes, trainerRes, genRes, ptRes, assignRes] = await Promise.all([
        getClients(),
        getSettings(),
        getPtPackages(),
        getTrainers(),
        getGeneralBookings(),
        getPtAdvanceBookings(),
        getPtAssignments().catch(() => [])
      ]);
      setClients(clientsRes);
      setSettings(settingsRes);
      setPtPackages(pkgRes.filter(p => p.active));
      setTrainers(trainerRes.filter(t => t.status === 'Active'));
      setGeneralBookings(genRes);
      setPtBookings(ptRes);
      setPtAssignments(assignRes || []);
    } catch (err) {
      console.error('Failed to load advance booking data:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasRunningPtPlan = (clientId) => {
    if (!clientId || !ptAssignments || ptAssignments.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    
    return ptAssignments.find(a => 
      (String(a.client_id) === String(clientId) || String(a.clientCode) === String(clientId)) &&
      a.status === 'Active' &&
      a.expiry_date >= today &&
      (a.classes_completed < a.total_classes_snapshot)
    ) || null;
  };

  const calculateNextDayDate = (dateStr) => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  };

  const handleGenClientChange = (cId) => {
    setIsDirty(true);
    const selClient = clients.find(c => c.id === cId);
    let defaultStart = new Date().toISOString().split('T')[0];
    const todayStr = defaultStart;

    if (selClient && selClient.expiryDate && selClient.expiryDate >= todayStr) {
      defaultStart = calculateNextDayDate(selClient.expiryDate);
    }

    let endDateStr = genForm.booking_end_date;
    if (genForm.plan_type) {
      const durDays = settings[`${genForm.plan_type}_duration`] || (genForm.plan_type === 'Quarterly' ? 90 : (genForm.plan_type === 'Half-Yearly' ? 180 : (genForm.plan_type === 'Annual' ? 365 : 30)));
      const startDateObj = new Date(defaultStart);
      startDateObj.setDate(startDateObj.getDate() + parseInt(durDays, 10));
      endDateStr = startDateObj.toISOString().split('T')[0];
    }

    setGenForm(prev => ({
      ...prev,
      client_id: cId,
      booking_start_date: defaultStart,
      booking_end_date: endDateStr
    }));
  };

  const handlePtClientChange = (cId) => {
    setIsDirty(true);
    const todayStr = new Date().toISOString().split('T')[0];

    setPtForm(prev => ({
      ...prev,
      client_id: cId,
      booking_start_date: todayStr
    }));
  };

  const handleOpenModal = () => {
    setActionError('');
    setActionSuccess('');
    setClientMode('existing');
    setClientSearch('');
    setIsModalOpen(true);
  };

  const selectedGenClient = clients.find(c => c.id === genForm.client_id);
  const selectedPtClient = clients.find(c => c.id === ptForm.client_id);

  // Available Tariff Keys from settings (guarantees options exist even if DB uses standard keys)
  const availableTariffs = Array.from(new Set([
    ...Object.keys(settings).filter(k => k.endsWith('_Strengthening') && !k.startsWith('PT_') && !k.startsWith('Diet')).map(k => k.replace('_Strengthening', '')),
    'Monthly', 'Quarterly', 'Half-Yearly', 'Annual'
  ])).filter(planBase => !(settings[`${planBase}_hidden`] === 1 || settings[`${planBase}_hidden`] === '1'));

  const handleGenPlanChange = (plan) => {
    setIsDirty(true);
    const price = settings[`${plan}_Strengthening`] !== undefined && settings[`${plan}_Strengthening`] !== 0
      ? settings[`${plan}_Strengthening`]
      : (settings[plan] !== undefined ? settings[plan] : 0);
      
    const durDays = settings[`${plan}_duration`] || (plan === 'Quarterly' ? 90 : (plan === 'Half-Yearly' ? 180 : (plan === 'Annual' ? 365 : 30)));
    
    // Auto compute end date
    const startStr = genForm.booking_start_date || new Date().toISOString().split('T')[0];
    const startDateObj = new Date(startStr);
    startDateObj.setDate(startDateObj.getDate() + parseInt(durDays, 10));
    const endDateStr = startDateObj.toISOString().split('T')[0];

    setGenForm(prev => ({
      ...prev,
      plan_type: plan,
      price: price,
      booking_end_date: endDateStr
    }));
  };

  const handleGenStartDateChange = (startDateStr) => {
    setIsDirty(true);
    let endDateStr = genForm.booking_end_date;
    if (genForm.plan_type) {
      const durDays = settings[`${genForm.plan_type}_duration`] || (genForm.plan_type === 'Quarterly' ? 90 : (genForm.plan_type === 'Half-Yearly' ? 180 : (genForm.plan_type === 'Annual' ? 365 : 30)));
      const startDateObj = new Date(startDateStr);
      startDateObj.setDate(startDateObj.getDate() + parseInt(durDays, 10));
      endDateStr = startDateObj.toISOString().split('T')[0];
    }
    setGenForm(prev => ({ ...prev, booking_start_date: startDateStr, booking_end_date: endDateStr }));
  };

  const getOrCreateClientId = async (clientType) => {
    const selectedId = clientType === 'gen' ? genForm.client_id : ptForm.client_id;
    if (!selectedId) throw new Error('Please select an existing client.');
    return selectedId;
  };

  const handleGenerateGeneralInvoice = (booking) => {
    const finalPrice = parseFloat(booking.price || 0) - parseFloat(booking.discount_amount || 0);
    setInvoiceClient({
      name: booking.clientName,
      phone: booking.clientPhone,
      clientId: booking.clientCode,
      plan: `Advance Booking — ${booking.plan_type}`,
      amount: finalPrice,
      paidAmount: finalPrice,
      dueAmount: 0,
      paymentStatus: 'Paid (Advance Scheduled)',
      paymentMethod: 'CASH',
      fromDate: booking.booking_start_date,
      expiryDate: booking.booking_end_date,
      billNo: `ADV-GEN-${booking.id}`,
      discount_amount: booking.discount_amount
    });
  };

  const handleGeneratePtInvoice = (booking) => {
    const finalPrice = parseFloat(booking.price_snapshot || 0) - parseFloat(booking.discount_amount || 0);
    setInvoiceClient({
      name: booking.clientName,
      phone: booking.clientPhone,
      clientId: booking.clientCode,
      plan: `Advance PT Booking — ${booking.packageName} (${booking.trainerName})`,
      amount: finalPrice,
      paidAmount: finalPrice,
      dueAmount: 0,
      paymentStatus: 'Paid (Advance Scheduled)',
      paymentMethod: 'CASH',
      fromDate: booking.booking_start_date,
      expiryDate: booking.booking_start_date,
      billNo: `ADV-PT-${booking.id}`,
      discount_amount: booking.discount_amount
    });
  };

  const handleSaveGeneralBooking = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');

    if (!genForm.plan_type) { setActionError('Please select a membership plan.'); return; }
    if (!genForm.booking_start_date) { setActionError('Please select a start date.'); return; }

    try {
      const targetClientId = await getOrCreateClientId('gen');
      const client = clients.find(c => c.id === targetClientId);
      const today = new Date().toISOString().split('T')[0];



      const createdBooking = await addGeneralBooking({
        client_id: targetClientId,
        plan_type: genForm.plan_type,
        price: parseFloat(genForm.price || 0),
        discount_amount: parseFloat(genForm.discount_amount || 0),
        payment_method: genForm.payment_method,
        booking_start_date: genForm.booking_start_date,
        booking_end_date: genForm.booking_end_date
      });
      setIsDirty(false);
      setActionSuccess('General Package Advance Booking created successfully!');
      setTimeout(() => {
        setIsModalOpen(false);
        if (createdBooking) {
          handleGenerateGeneralInvoice(createdBooking);
        }
      }, 1000);
      loadData();
    } catch (err) {
      setActionError(err.message || 'Failed to save General Package Advance Booking.');
    }
  };

  const handleSavePtBooking = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');

    if (!ptForm.pt_package_id) { setActionError('Please select a PT Package.'); return; }
    if (!ptForm.trainer_id) { setActionError('Please select a Trainer.'); return; }
    if (!ptForm.booking_start_date) { setActionError('Please select a start date.'); return; }

    try {
      const targetClientId = await getOrCreateClientId('pt');

      const createdBooking = await addPtAdvanceBooking({
        client_id: targetClientId,
        pt_package_id: ptForm.pt_package_id,
        trainer_id: ptForm.trainer_id,
        discount_amount: parseFloat(ptForm.discount_amount || 0),
        payment_method: ptForm.payment_method,
        booking_start_date: ptForm.booking_start_date
      });
      setIsDirty(false);
      setActionSuccess('PT Package Advance Booking created successfully!');
      setTimeout(() => {
        setIsModalOpen(false);
        if (createdBooking) {
          handleGeneratePtInvoice(createdBooking);
        }
      }, 1000);
      loadData();
    } catch (err) {
      setActionError(err.message || 'Failed to save PT Package Advance Booking.');
    }
  };

  const handleProceedExit = () => {
    setIsDirty(false);
    setIsConfirmExitOpen(false);
    const url = blockedTargetUrl.startsWith('#') ? blockedTargetUrl.substring(1) : blockedTargetUrl;
    navigate(url);
  };

  const handleCancelGenBooking = async (id) => {
    showCustomConfirm(
      'Cancel Advance Booking',
      'Are you sure you want to cancel this general membership advance booking?',
      async () => {
        try {
          await cancelGeneralBooking(id);
          showCustomAlert('Booking Cancelled', 'The general membership booking has been cancelled successfully.', () => {
            window.location.reload();
          });
        } catch (err) {
          showCustomAlert('Error', err.message || 'Failed to cancel booking.');
        }
      }
    );
  };

  const handleCancelPtBooking = async (id) => {
    showCustomConfirm(
      'Cancel PT Booking',
      'Are you sure you want to cancel this PT package advance booking?',
      async () => {
        try {
          await cancelPtAdvanceBooking(id);
          showCustomAlert('Booking Cancelled', 'The PT advance booking has been cancelled successfully.', () => {
            window.location.reload();
          });
        } catch (err) {
          showCustomAlert('Error', err.message || 'Failed to cancel booking.');
        }
      }
    );
  };

  const handleActivatePtBooking = async (id) => {
    showCustomConfirm(
      'Activate PT Package',
      'Activate this PT Package Advance Booking now? This will create an active PT assignment and generate the invoice.',
      async () => {
        try {
          const res = await activatePtAdvanceBooking(id);
          showCustomAlert(
            'Activation Successful',
            `PT Advance Booking activated successfully!\nGenerated Invoice: ${res.billNo || 'INV'}`,
            () => {
              window.location.reload();
            }
          );
        } catch (err) {
          showCustomAlert('Activation Error', err.message || 'Failed to activate PT booking.');
        }
      }
    );
  };

  const filteredClientsForSelect = clients.filter(c =>
    (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.clientId || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone || '').includes(clientSearch)
  );

  const formatCurrency = (val) => `₹${(parseFloat(val) || 0).toLocaleString('en-IN')}`;

  return (
    <div className="adv-booking-container">
      <header className="adv-booking-header">
        <div className="title-group">
          <h1><span>ADVANCE BOOKING</span> PORTAL</h1>
          <p>Schedule & manage future package renewals and upcoming registrations.</p>
        </div>

        <button className="btn-create-booking" onClick={handleOpenModal}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New Advance Booking
        </button>
      </header>

      {/* Tabs Control */}
      <div className="adv-tabs-bar">
        <button
          className={`adv-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => { setActiveTab('general'); setSearchParams({ tab: 'general' }); }}
        >
          🏷 General Membership Bookings ({generalBookings.filter(b => b.status === 'Scheduled').length})
        </button>

        <button
          className={`adv-tab-btn ${activeTab === 'pt' ? 'active' : ''}`}
          onClick={() => { setActiveTab('pt'); setSearchParams({ tab: 'pt' }); }}
        >
          🏋️ PT Package Bookings ({ptBookings.filter(b => ['Scheduled', 'ReadyToActivate'].includes(b.status)).length})
        </button>
      </div>

      {/* Main Content Area */}
      <div className="adv-content-card">
        {/* Status Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', padding: '1.25rem 1.5rem 0.75rem 1.5rem', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
          {['All', 'Scheduled', 'ReadyToActivate', 'Active', 'Cancelled'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: '100px',
                border: filterStatus === st ? '2px solid #4338ca' : '1px solid #cbd5e1',
                background: filterStatus === st ? '#e0e7ff' : '#ffffff',
                color: filterStatus === st ? '#3730a3' : '#475569',
                fontWeight: '800',
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              {st === 'All' ? 'All Statuses' : st === 'ReadyToActivate' ? '⚡ Ready To Activate' : st}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading advance bookings...</div>
        ) : activeTab === 'general' ? (
          /* General Bookings Table */
          generalBookings.filter(b => filterStatus === 'All' ? true : b.status === filterStatus).length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No General Package advance bookings found for status '{filterStatus}'.</p>
              <button className="btn-create-booking" style={{ margin: '1rem auto 0 auto' }} onClick={handleOpenModal}>
                + Create First Advance Booking
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="adv-table">
                <thead>
                  <tr>
                    <th style={{ width: '24%' }}>Client Info</th>
                    <th style={{ width: '16%' }}>Current Plan Expiry</th>
                    <th style={{ width: '18%' }}>Booked Tariff</th>
                    <th style={{ width: '14%' }}>Price</th>
                    <th style={{ width: '14%' }}>Booked Validity</th>
                    <th style={{ width: '14%' }}>Status</th>
                    <th style={{ textAlign: 'right', width: '12%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {generalBookings.filter(b => filterStatus === 'All' ? true : b.status === filterStatus).map(b => (
                    <tr key={b.id}>
                      <td>
                        <div className="name-avatar-group">
                          <div className="client-avatar-mini">
                            {b.clientName ? b.clientName.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="client-name">{b.clientName}</div>
                            <div className="client-code">{formatShortId(b.clientCode || b.client_id)} • {b.clientPhone}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="expiry-date-pill">{b.currentPlanExpiry ? formatDateDDMMYYYY(b.currentPlanExpiry) : 'No Active Plan'}</span>
                      </td>
                      <td><span className="plan-badge">{b.plan_type}</span></td>
                      <td className="price-val">{formatCurrency((parseFloat(b.price || 0) - parseFloat(b.discount_amount || 0)))}</td>
                      <td>
                        <div className="validity-dates">
                          <span>{formatDateDDMMYYYY(b.booking_start_date)}</span>
                          <span className="date-arrow">➔</span>
                          <span>{formatDateDDMMYYYY(b.booking_end_date)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${b.status.toLowerCase()}`}>
                          {b.status === 'Scheduled' && <>⏳ Scheduled</>}
                          {b.status === 'Active' && <>✓ Active</>}
                          {b.status === 'Cancelled' && <>✕ Cancelled</>}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="action-buttons-group">
                          <button className="btn-invoice-booking" onClick={() => handleGenerateGeneralInvoice(b)} title="View Invoice">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Invoice
                          </button>
                          {isSuperAdmin && b.status === 'Scheduled' && (
                            <button className="btn-cancel-booking" onClick={() => handleCancelGenBooking(b.id)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* PT Bookings Table */
          ptBookings.filter(b => filterStatus === 'All' ? true : b.status === filterStatus).length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No PT Package advance bookings found for status '{filterStatus}'.</p>
              <button className="btn-create-booking" style={{ margin: '1rem auto 0 auto' }} onClick={handleOpenModal}>
                + Create First PT Advance Booking
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="adv-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Client Info</th>
                    <th style={{ width: '20%' }}>Booked PT Package</th>
                    <th style={{ width: '16%' }}>Assigned Trainer</th>
                    <th style={{ width: '16%' }}>Price / Classes</th>
                    <th style={{ width: '12%' }}>Start Date</th>
                    <th style={{ width: '14%' }}>Status</th>
                    <th style={{ textAlign: 'right', width: '20%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ptBookings.filter(b => filterStatus === 'All' ? true : b.status === filterStatus).map(b => (
                    <tr key={b.id}>
                      <td>
                        <div className="name-avatar-group">
                          <div className="client-avatar-mini pt-avatar">
                            {b.clientName ? b.clientName.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="client-name">{b.clientName}</div>
                            <div className="client-code">{formatShortId(b.clientCode || b.client_id)} • {b.clientPhone}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="pkg-badge">{b.packageName}</span></td>
                      <td>
                        <div className="trainer-info-cell">
                          <span className="trainer-name">{b.trainerName}</span>
                          {b.trainerGrade && <span className="trainer-grade">({b.trainerGrade})</span>}
                        </div>
                      </td>
                      <td>
                        <div className="price-val">{formatCurrency((parseFloat(b.price_snapshot || 0) - parseFloat(b.discount_amount || 0)))}</div>
                        <div className="classes-count">{b.total_classes_snapshot} Classes</div>
                      </td>
                      <td className="start-date-cell">{formatDateDDMMYYYY(b.booking_start_date)}</td>
                      <td>
                        <span className={`status-pill ${b.status.toLowerCase()}`}>
                          {b.status === 'Scheduled' && <>⏳ Scheduled</>}
                          {b.status === 'ReadyToActivate' && <>⚡ Ready To Activate</>}
                          {b.status === 'Active' && <>✓ Active</>}
                          {b.status === 'Cancelled' && <>✕ Cancelled</>}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="action-buttons-group">
                          <button className="btn-invoice-booking" onClick={() => handleGeneratePtInvoice(b)} title="View Invoice">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Invoice
                          </button>
                          {['Scheduled', 'ReadyToActivate'].includes(b.status) && (() => {
                            const runningPt = hasRunningPtPlan(b.client_id || b.clientCode);
                            const isDisabled = !!runningPt;

                            return (
                              <button 
                                className={`btn-activate-now ${isDisabled ? 'disabled' : ''}`}
                                onClick={() => {
                                  if (isDisabled) {
                                    showCustomAlert(
                                      'Cannot Activate Yet',
                                      `Client ${b.clientName} currently has an active running PT plan (${runningPt.packageName}) with ${runningPt.classes_completed}/${runningPt.total_classes_snapshot} classes conducted, expiring on ${formatDateDDMMYYYY(runningPt.expiry_date)}.\n\nAdvance bookings can only be activated once the current PT plan expires or all classes are completed.`
                                    );
                                  } else {
                                    handleActivatePtBooking(b.id);
                                  }
                                }}
                                disabled={isDisabled}
                                style={{
                                  opacity: isDisabled ? 0.5 : 1,
                                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                                  filter: isDisabled ? 'grayscale(80%)' : 'none',
                                  background: isDisabled ? '#cbd5e1' : undefined,
                                  color: isDisabled ? '#64748b' : undefined,
                                  borderColor: isDisabled ? '#94a3b8' : undefined
                                }}
                                title={
                                  isDisabled 
                                    ? `Current PT plan active (${runningPt.classes_completed}/${runningPt.total_classes_snapshot} classes, exp ${formatDateDDMMYYYY(runningPt.expiry_date)})` 
                                    : 'Activate PT Package Booking Now'
                                }
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h7v8l10-12h-7z"/></svg>
                                {isDisabled ? 'Locked (Plan Running)' : 'Activate Now'}
                              </button>
                            );
                          })()}
                          {isSuperAdmin && ['Scheduled', 'ReadyToActivate'].includes(b.status) && (
                            <button className="btn-cancel-booking" onClick={() => handleCancelPtBooking(b.id)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Modal for Creating Advance Booking */}
      {isModalOpen && (
        <div className="adv-modal-overlay">
          <div className="adv-modal-card">
            <div className="adv-modal-header">
              <h3>Create Advance Booking</h3>
              <button className="btn-close-x" onClick={() => { setIsModalOpen(false); setIsDirty(false); }}>✕</button>
            </div>

            {actionError && <div className="modal-alert error">⚠️ {actionError}</div>}
            {actionSuccess && <div className="modal-alert success">✓ {actionSuccess}</div>}

            {/* Category Toggle: General vs PT */}
            <div className="modal-tab-toggle">
              <button
                className={`sub-tab ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                🏷 General Membership
              </button>
              <button
                className={`sub-tab ${activeTab === 'pt' ? 'active' : ''}`}
                onClick={() => setActiveTab('pt')}
              >
                🏋️ PT Package
              </button>
            </div>

            {activeTab === 'general' ? (
              <form onSubmit={handleSaveGeneralBooking} className="adv-form">

                <div className="form-group">
                  <label>Select Existing Client *</label>
                  <input
                    type="text"
                    placeholder="🔍 Search client by name, code or phone..."
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setIsDirty(true); }}
                    style={{ marginBottom: '0.35rem', padding: '0.5rem 0.8rem', fontSize: '0.85rem' }}
                  />
                  <select
                    value={genForm.client_id}
                    onChange={e => handleGenClientChange(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Existing Client ({filteredClientsForSelect.length}) --</option>
                    {filteredClientsForSelect.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatShortId(c.clientId || c.id)}) • Current Plan Expiry: {c.expiryDate ? formatDateDDMMYYYY(c.expiryDate) : 'None'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedGenClient && (
                  <div className="client-summary-banner">
                    <span>Active Plan: <strong>{selectedGenClient.plan || 'None'}</strong></span>
                    <span>Current Expiry: <strong>{selectedGenClient.expiryDate ? formatDateDDMMYYYY(selectedGenClient.expiryDate) : 'N/A'}</strong></span>
                  </div>
                )}

                <div className="form-group">
                  <label>Select Membership Tariff</label>
                  <select
                    value={genForm.plan_type}
                    onChange={e => handleGenPlanChange(e.target.value)}
                    required
                  >
                    <option value="">-- Select Tariff --</option>
                    {availableTariffs.map(t => {
                      const p = settings[`${t}_Strengthening`] !== undefined && settings[`${t}_Strengthening`] !== 0
                        ? settings[`${t}_Strengthening`]
                        : (settings[t] !== undefined ? settings[t] : 0);
                      return (
                        <option key={t} value={t}>{t === 'Half-Yearly' ? 'Semi-Annual' : t} (₹{p})</option>
                      );
                    })}
                  </select>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Booking Start Date</label>
                    <input
                      type="date"
                      value={genForm.booking_start_date}
                      onChange={e => handleGenStartDateChange(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Computed End Date (DD-MM-YYYY)</label>
                    <input
                      type="text"
                      value={genForm.booking_end_date ? formatDateDDMMYYYY(genForm.booking_end_date) : ''}
                      placeholder="DD-MM-YYYY"
                      readOnly
                      style={{ background: '#f1f5f9', fontWeight: '800', color: '#1e1b4b' }}
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Plan Price (₹)</label>
                    <input
                      type="number"
                      value={genForm.price}
                      onChange={e => { setGenForm({ ...genForm, price: e.target.value }); setIsDirty(true); }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Discount Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="Optional discount (₹)"
                      value={genForm.discount_amount}
                      onChange={e => { setGenForm({ ...genForm, discount_amount: e.target.value }); setIsDirty(true); }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Payment Mode</label>
                  <select
                    value={genForm.payment_method}
                    onChange={e => { setGenForm({ ...genForm, payment_method: e.target.value }); setIsDirty(true); }}
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK">BANK / CARD</option>
                  </select>
                </div>

                {parseFloat(genForm.discount_amount || 0) > 0 && (
                  <div style={{ background: '#f0fdf4', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '0.82rem', marginBottom: '1rem' }}>
                    <span>Original Price: <strong>₹{(parseFloat(genForm.price) || 0).toLocaleString()}</strong></span>
                    <span style={{ margin: '0 8px', color: '#16a34a' }}>-</span>
                    <span>Discount: <strong>₹{(parseFloat(genForm.discount_amount) || 0).toLocaleString()}</strong></span>
                    <span style={{ margin: '0 8px' }}>=</span>
                    <span style={{ color: '#16a34a', fontWeight: '800' }}>Final Payable: ₹{Math.max(0, (parseFloat(genForm.price) || 0) - (parseFloat(genForm.discount_amount) || 0)).toLocaleString()}</span>
                  </div>
                )}

                <div className="adv-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={() => { setIsModalOpen(false); setIsDirty(false); }}>Cancel</button>
                  <button type="submit" className="btn-modal-submit">Save General Booking</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSavePtBooking} className="adv-form">

                <div className="form-group">
                  <label>Select Existing Client *</label>
                  <input
                    type="text"
                    placeholder="🔍 Search client by name, code or phone..."
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setIsDirty(true); }}
                    style={{ marginBottom: '0.35rem', padding: '0.5rem 0.8rem', fontSize: '0.85rem' }}
                  />
                  <select
                    value={ptForm.client_id}
                    onChange={e => handlePtClientChange(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Existing Client ({filteredClientsForSelect.length}) --</option>
                    {filteredClientsForSelect.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatShortId(c.clientId || c.id)}) • Phone: {c.phone || 'N/A'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Select PT Package</label>
                  <select
                    value={ptForm.pt_package_id}
                    onChange={e => { setPtForm({ ...ptForm, pt_package_id: e.target.value }); setIsDirty(true); }}
                    required
                  >
                    <option value="">-- Choose Catalog PT Package --</option>
                    {ptPackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} — ₹{pkg.price} ({pkg.total_classes} classes, {pkg.duration_days} days)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Assign Trainer</label>
                  <select
                    value={ptForm.trainer_id}
                    onChange={e => { setPtForm({ ...ptForm, trainer_id: e.target.value }); setIsDirty(true); }}
                    required
                  >
                    <option value="">-- Select Trainer --</option>
                    {trainers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.grade || 'No Grade'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Discount Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="Optional discount (₹)"
                    value={ptForm.discount_amount}
                    onChange={e => { setPtForm({ ...ptForm, discount_amount: e.target.value }); setIsDirty(true); }}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Mode</label>
                  <select
                    value={ptForm.payment_method}
                    onChange={e => { setPtForm({ ...ptForm, payment_method: e.target.value }); setIsDirty(true); }}
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK">BANK / CARD</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Booking Start Date</label>
                  <input
                    type="date"
                    value={ptForm.booking_start_date}
                    onChange={e => { setPtForm({ ...ptForm, booking_start_date: e.target.value }); setIsDirty(true); }}
                    required
                  />
                  <small style={{ color: '#64748b' }}>Scheduled start date for this advance PT package</small>
                </div>

                <div className="adv-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={() => { setIsModalOpen(false); setIsDirty(false); }}>Cancel</button>
                  <button type="submit" className="btn-modal-submit">Save PT Advance Booking</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Navigation Blocker Modal */}
      {isConfirmExitOpen && (
        <div className="alert-modal-overlay" style={{ zIndex: 11000 }}>
          <div className="alert-modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="alert-icon-circle warning" style={{ backgroundColor: '#eab308' }}>⚠</div>
            <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800' }}>Unsaved Changes</h3>
            <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
              You have unsaved changes in the booking form. Are you sure you want to exit? Your changes will be lost.
            </p>
            <div className="alert-modal-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-cancel-gray"
                onClick={() => setIsConfirmExitOpen(false)}
                style={{ flex: 1, padding: '0.75rem 1.25rem', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
              >
                Stay Here
              </button>
              <button
                type="button"
                className="btn-alert-primary error"
                onClick={handleProceedExit}
                style={{ flex: 1, padding: '0.75rem 1.25rem', backgroundColor: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
              >
                Yes, Exit
              </button>
            </div>
          </div>
        </div>
      )}

      <InvoicePreviewModal
        isOpen={!!invoiceClient}
        onClose={() => {
          setInvoiceClient(null);
          window.location.reload();
        }}
        client={invoiceClient}
        title="Advance Booking Logged"
      />

      {/* Custom Popup Modal (Alert / Confirm) */}
      {customPopup.isOpen && (
        <div className="alert-modal-overlay" style={{ zIndex: 12000 }}>
          <div className="alert-modal-card" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="alert-icon-circle warning" style={{ backgroundColor: customPopup.type === 'confirm' ? '#3b82f6' : '#22c55e', color: '#ffffff' }}>
              {customPopup.type === 'confirm' ? '❓' : '✓'}
            </div>
            <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800' }}>{customPopup.title}</h3>
            <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: '1.5', margin: '0 0 1.5rem 0', whiteSpace: 'pre-line' }}>
              {customPopup.message}
            </p>
            <div className="alert-modal-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              {customPopup.type === 'confirm' ? (
                <>
                  <button
                    type="button"
                    className="btn-cancel-gray"
                    onClick={() => setCustomPopup(prev => ({ ...prev, isOpen: false }))}
                    style={{ flex: 1, padding: '0.75rem 1.25rem', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    No, Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-alert-primary"
                    onClick={customPopup.onConfirm}
                    style={{ flex: 1, padding: '0.75rem 1.25rem', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Yes, Proceed
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-alert-primary"
                  onClick={customPopup.onConfirm}
                  style={{ minWidth: '120px', padding: '0.75rem 1.5rem', backgroundColor: '#22c55e', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvanceBookingPage;
