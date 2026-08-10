import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getClients,
  getSettings,
  getPtPackages,
  getTrainers,
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
import './AdvanceBookingPage.css';

const AdvanceBookingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'pt' ? 'pt' : 'general';
  const preselectedClientId = searchParams.get('clientId') || '';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState({});
  const [ptPackages, setPtPackages] = useState([]);
  const [trainers, setTrainers] = useState([]);
  
  const [generalBookings, setGeneralBookings] = useState([]);
  const [ptBookings, setPtBookings] = useState([]);
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
    booking_start_date: new Date().toISOString().split('T')[0],
    booking_end_date: ''
  });

  // PT Booking Form
  const [ptForm, setPtForm] = useState({
    client_id: preselectedClientId,
    pt_package_id: '',
    trainer_id: '',
    booking_start_date: new Date().toISOString().split('T')[0]
  });

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

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
      const [clientsRes, settingsRes, pkgRes, trainerRes, genRes, ptRes] = await Promise.all([
        getClients(),
        getSettings(),
        getPtPackages(),
        getTrainers(),
        getGeneralBookings(),
        getPtAdvanceBookings()
      ]);
      setClients(clientsRes);
      setSettings(settingsRes);
      setPtPackages(pkgRes.filter(p => p.active));
      setTrainers(trainerRes.filter(t => t.status === 'Active'));
      setGeneralBookings(genRes);
      setPtBookings(ptRes);
    } catch (err) {
      console.error('Failed to load advance booking data:', err);
    } finally {
      setLoading(false);
    }
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
    const selClient = clients.find(c => c.id === cId);
    let defaultStart = new Date().toISOString().split('T')[0];
    const todayStr = defaultStart;

    if (selClient && selClient.expiryDate && selClient.expiryDate >= todayStr) {
      defaultStart = calculateNextDayDate(selClient.expiryDate);
    }

    setPtForm(prev => ({
      ...prev,
      client_id: cId,
      booking_start_date: defaultStart
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
    if (clientMode === 'existing') {
      const selectedId = clientType === 'gen' ? genForm.client_id : ptForm.client_id;
      if (!selectedId) throw new Error('Please select an existing client.');
      return selectedId;
    } else {
      if (!newClient.name || newClient.name.trim().length < 2) {
        throw new Error('Please enter a valid client name.');
      }
      if (!newClient.phone || !/^\d{10}$/.test(newClient.phone.replace(/\D/g, ''))) {
        throw new Error('Please enter a valid 10-digit mobile number.');
      }

      let code = newClient.clientId;
      if (!code) {
        try {
          const res = await getNextClientId();
          code = res.nextClientId;
        } catch (e) {
          code = `GYM${Date.now().toString().slice(-6)}`;
        }
      }

      const created = await addClient({
        clientId: code,
        name: newClient.name.trim(),
        phone: newClient.phone.trim(),
        gender: newClient.gender,
        plan: clientType === 'gen' ? (genForm.plan_type || 'Monthly') : 'Monthly',
        fromDate: clientType === 'gen' ? genForm.booking_start_date : ptForm.booking_start_date,
        expiryDate: clientType === 'gen' ? (genForm.booking_end_date || genForm.booking_start_date) : ptForm.booking_start_date,
        amount: clientType === 'gen' ? parseFloat(genForm.price || 0) : 0,
        paidAmount: 0,
        status: 'Active'
      });
      return created.id;
    }
  };

  const handleGenerateGeneralInvoice = (booking) => {
    setInvoiceClient({
      name: booking.clientName,
      phone: booking.clientPhone,
      clientId: booking.clientCode,
      plan: `Advance Booking — ${booking.plan_type}`,
      amount: booking.price,
      paidAmount: booking.price,
      dueAmount: 0,
      paymentStatus: 'Paid (Advance Scheduled)',
      paymentMethod: 'CASH',
      fromDate: booking.booking_start_date,
      expiryDate: booking.booking_end_date,
      billNo: `ADV-GEN-${booking.id}`
    });
  };

  const handleGeneratePtInvoice = (booking) => {
    setInvoiceClient({
      name: booking.clientName,
      phone: booking.clientPhone,
      clientId: booking.clientCode,
      plan: `Advance PT Booking — ${booking.packageName} (${booking.trainerName})`,
      amount: booking.price_snapshot,
      paidAmount: booking.price_snapshot,
      dueAmount: 0,
      paymentStatus: 'Paid (Advance Scheduled)',
      paymentMethod: 'CASH',
      fromDate: booking.booking_start_date,
      expiryDate: booking.booking_start_date,
      billNo: `ADV-PT-${booking.id}`
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

      if (client && client.expiryDate && client.expiryDate >= today) {
        if (genForm.booking_start_date <= client.expiryDate) {
          setActionError(`Booking start date (${formatDateDDMMYYYY(genForm.booking_start_date)}) must be strictly after the client's current plan expiry date (${formatDateDDMMYYYY(client.expiryDate)}).`);
          return;
        }
      }

      const createdBooking = await addGeneralBooking({
        client_id: targetClientId,
        plan_type: genForm.plan_type,
        price: parseFloat(genForm.price || 0),
        booking_start_date: genForm.booking_start_date,
        booking_end_date: genForm.booking_end_date
      });
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
        booking_start_date: ptForm.booking_start_date
      });
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

  const handleCancelGenBooking = async (id) => {
    if (window.confirm('Are you sure you want to cancel this advance booking?')) {
      try {
        await cancelGeneralBooking(id);
        loadData();
      } catch (err) {
        alert(err.message || 'Failed to cancel booking.');
      }
    }
  };

  const handleCancelPtBooking = async (id) => {
    if (window.confirm('Are you sure you want to cancel this PT advance booking?')) {
      try {
        await cancelPtAdvanceBooking(id);
        loadData();
      } catch (err) {
        alert(err.message || 'Failed to cancel booking.');
      }
    }
  };

  const handleActivatePtBooking = async (id) => {
    if (window.confirm('Activate this PT Package Advance Booking now? This will create an active PT assignment and generate the invoice.')) {
      try {
        const res = await activatePtAdvanceBooking(id);
        alert(`PT Advance Booking activated successfully!\nGenerated Invoice: ${res.billNo || 'INV'}`);
        loadData();
      } catch (err) {
        alert(err.message || 'Failed to activate PT booking.');
      }
    }
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
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Loading advance bookings...</div>
        ) : activeTab === 'general' ? (
          /* General Bookings Table */
          generalBookings.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No General Package advance bookings found.</p>
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
                  {generalBookings.map(b => (
                    <tr key={b.id}>
                      <td>
                        <div className="name-avatar-group">
                          <div className="client-avatar-mini">
                            {b.clientName ? b.clientName.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="client-name">{b.clientName}</div>
                            <div className="client-code">{b.clientCode || 'No Code'} • {b.clientPhone}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="expiry-date-pill">{b.currentPlanExpiry ? formatDateDDMMYYYY(b.currentPlanExpiry) : 'No Active Plan'}</span>
                      </td>
                      <td><span className="plan-badge">{b.plan_type}</span></td>
                      <td className="price-val">{formatCurrency(b.price)}</td>
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
                          {b.status === 'Scheduled' && (
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
          ptBookings.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No PT Package advance bookings found.</p>
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
                  {ptBookings.map(b => (
                    <tr key={b.id}>
                      <td>
                        <div className="name-avatar-group">
                          <div className="client-avatar-mini pt-avatar">
                            {b.clientName ? b.clientName.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div>
                            <div className="client-name">{b.clientName}</div>
                            <div className="client-code">{b.clientCode || 'No Code'} • {b.clientPhone}</div>
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
                        <div className="price-val">{formatCurrency(b.price_snapshot)}</div>
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
                          {['Scheduled', 'ReadyToActivate'].includes(b.status) && (
                            <button className="btn-activate-now" onClick={() => handleActivatePtBooking(b.id)}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h7v8l10-12h-7z"/></svg>
                              Activate Now
                            </button>
                          )}
                          {['Scheduled', 'ReadyToActivate'].includes(b.status) && (
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
              <button className="btn-close-x" onClick={() => setIsModalOpen(false)}>✕</button>
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

            {/* Client Mode Switcher: Existing Client vs New Client */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', background: '#f8fafc', padding: '6px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '0.82rem',
                  background: clientMode === 'existing' ? '#1e1b4b' : 'transparent',
                  color: clientMode === 'existing' ? '#ffffff' : '#64748b'
                }}
                onClick={() => setClientMode('existing')}
              >
                👤 Existing Client
              </button>
              <button
                type="button"
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '0.82rem',
                  background: clientMode === 'new' ? '#1e1b4b' : 'transparent',
                  color: clientMode === 'new' ? '#ffffff' : '#64748b'
                }}
                onClick={() => setClientMode('new')}
              >
                ✨ New Client
              </button>
            </div>

            {activeTab === 'general' ? (
              <form onSubmit={handleSaveGeneralBooking} className="adv-form">

                {clientMode === 'existing' ? (
                  <div className="form-group">
                    <label>Select Existing Client</label>
                    <input
                      type="text"
                      placeholder="🔍 Search client by name, code or phone..."
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
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
                          {c.name} ({c.clientId || 'No Code'}) • Current Plan Expiry: {c.expiryDate ? formatDateDDMMYYYY(c.expiryDate) : 'None'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label>Client Full Name *</label>
                      <input
                        type="text"
                        placeholder="Enter full name"
                        value={newClient.name}
                        onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Mobile Number *</label>
                        <input
                          type="tel"
                          placeholder="10-digit mobile"
                          value={newClient.phone}
                          onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Gender</label>
                        <select
                          value={newClient.gender}
                          onChange={e => setNewClient({ ...newClient, gender: e.target.value })}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {clientMode === 'existing' && selectedGenClient && (
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

                <div className="form-group">
                  <label>Plan Price (₹)</label>
                  <input
                    type="number"
                    value={genForm.price}
                    onChange={e => setGenForm({ ...genForm, price: e.target.value })}
                    required
                  />
                </div>

                <div className="adv-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-modal-submit">Save General Booking</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSavePtBooking} className="adv-form">

                {clientMode === 'existing' ? (
                  <div className="form-group">
                    <label>Select Existing Client</label>
                    <input
                      type="text"
                      placeholder="🔍 Search client by name, code or phone..."
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
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
                          {c.name} ({c.clientId || 'No Code'}) • Phone: {c.phone || 'N/A'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label>Client Full Name *</label>
                      <input
                        type="text"
                        placeholder="Enter full name"
                        value={newClient.name}
                        onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Mobile Number *</label>
                        <input
                          type="tel"
                          placeholder="10-digit mobile"
                          value={newClient.phone}
                          onChange={e => setNewClient({ ...newClient, phone: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Gender</label>
                        <select
                          value={newClient.gender}
                          onChange={e => setNewClient({ ...newClient, gender: e.target.value })}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Select PT Package</label>
                  <select
                    value={ptForm.pt_package_id}
                    onChange={e => setPtForm({ ...ptForm, pt_package_id: e.target.value })}
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
                    onChange={e => setPtForm({ ...ptForm, trainer_id: e.target.value })}
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
                  <label>Booking Start Date</label>
                  <input
                    type="date"
                    value={ptForm.booking_start_date}
                    onChange={e => setPtForm({ ...ptForm, booking_start_date: e.target.value })}
                    required
                  />
                  <small style={{ color: '#64748b' }}>Scheduled start date for this advance PT package</small>
                </div>

                <div className="adv-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn-modal-submit">Save PT Advance Booking</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <InvoicePreviewModal
        isOpen={!!invoiceClient}
        onClose={() => setInvoiceClient(null)}
        client={invoiceClient}
      />
    </div>
  );
};

export default AdvanceBookingPage;
