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
  payGeneralBookingDue,
  getPtAdvanceBookings,
  addPtAdvanceBooking,
  cancelPtAdvanceBooking,
  activatePtAdvanceBooking,
  payPtAdvanceBookingDue,
  addClient,
  getNextClientId
} from '../api';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { formatDateDDMMYYYY, calculatePlanExpiryDate } from '../utils/formatDate';
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
  const [filterStatus, setFilterStatus] = useState('Scheduled');
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

  const getTomorrowDateStr = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  // General Booking Form
  const [genForm, setGenForm] = useState({
    client_id: preselectedClientId,
    plan_type: '',
    price: '',
    discount_amount: '',
    paid_amount: '',
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
    paid_amount: '',
    booking_start_date: new Date().toISOString().split('T')[0],
    payment_method: 'CASH'
  });

  // Pay Due Modal State for Advance Bookings
  const [payDueModal, setPayDueModal] = useState({
    isOpen: false,
    type: 'gen', // 'gen' | 'pt'
    booking: null,
    amount: '',
    payment_method: 'CASH',
    payment_date: new Date().toISOString().split('T')[0],
    submitting: false
  });

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const handleOpenPayDueModal = (booking, type = 'gen') => {
    const due = parseFloat(booking.due_amount || 0);
    setPayDueModal({
      isOpen: true,
      type,
      booking,
      amount: due,
      payment_method: 'CASH',
      payment_date: new Date().toISOString().split('T')[0],
      submitting: false
    });
  };

  const handleConfirmPayDue = async (e) => {
    e.preventDefault();
    if (!payDueModal.booking) return;
    const amountVal = parseFloat(payDueModal.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setActionError('Please enter a valid payment amount.');
      return;
    }

    setPayDueModal(prev => ({ ...prev, submitting: true }));
    setActionError('');
    setActionSuccess('');

    try {
      let res;
      if (payDueModal.type === 'gen') {
        res = await payGeneralBookingDue(payDueModal.booking.id, {
          paidAmount: amountVal,
          paymentMethod: payDueModal.payment_method,
          paymentDate: payDueModal.payment_date
        });
      } else {
        res = await payPtAdvanceBookingDue(payDueModal.booking.id, {
          paidAmount: amountVal,
          paymentMethod: payDueModal.payment_method,
          paymentDate: payDueModal.payment_date
        });
      }

      setPayDueModal({ isOpen: false, type: 'gen', booking: null, amount: '', payment_method: 'CASH', payment_date: '', submitting: false });
      setActionSuccess('Due payment recorded successfully!');
      await loadData();

      if (res?.booking) {
        if (payDueModal.type === 'gen') handleGenerateGeneralInvoice(res.booking);
        else handleGeneratePtInvoice(res.booking);
      }
    } catch (err) {
      setActionError(err.message || 'Failed to record due payment.');
      setPayDueModal(prev => ({ ...prev, submitting: false }));
    }
  };

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

  const handledParamsRef = React.useRef(null);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsDirty(false);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('clientId');
      next.delete('trainerId');
      next.delete('packageId');
      next.delete('startDate');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    const pClient = searchParams.get('clientId');
    const pTrainer = searchParams.get('trainerId');
    const pPackage = searchParams.get('packageId');
    const pStart = searchParams.get('startDate');
    const tabParam = searchParams.get('tab');

    if (tabParam === 'pt' || pTrainer || pPackage || pStart) {
      setActiveTab('pt');
    }

    const key = `${pClient || ''}_${pTrainer || ''}_${pPackage || ''}_${pStart || ''}`;
    if ((pClient || pTrainer || pPackage || pStart) && handledParamsRef.current !== key) {
      handledParamsRef.current = key;
      const selClient = clients.find(c => String(c.id) === String(pClient) || String(c.clientId) === String(pClient));
      let calculatedStart = pStart;
      if (!calculatedStart && selClient) {
        calculatedStart = getNextMembershipStartDate(selClient);
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
  }, [searchParams, clients, generalBookings]);

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

  const parseClientExpiryDate = (dateVal) => {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
    if (typeof dateVal === 'number') {
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? null : d;
    }
    let str = String(dateVal).trim();
    if (!str) return null;

    if (!isNaN(str) && str.length >= 10 && !str.includes('-') && !str.includes('/') && !str.includes('.')) {
      const num = Number(str);
      if (!isNaN(num)) {
        const d = new Date(num);
        if (!isNaN(d.getTime())) return d;
      }
    }

    if (str.includes('T')) str = str.split('T')[0];
    if (str.includes(' ')) str = str.split(' ')[0];

    // YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const calculateNextDayDate = (dateVal) => {
    if (!dateVal) return new Date().toISOString().split('T')[0];
    const parsed = parseClientExpiryDate(dateVal);
    if (parsed) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parsedClean = new Date(parsed);
      parsedClean.setHours(0, 0, 0, 0);

      if (parsedClean >= today) {
        parsedClean.setDate(parsedClean.getDate() + 1);
        const yyyy = parsedClean.getFullYear();
        const mm = String(parsedClean.getMonth() + 1).padStart(2, '0');
        const dd = String(parsedClean.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    return new Date().toISOString().split('T')[0];
  };

  const getNextMembershipStartDate = (client) => {
    if (!client) return new Date().toISOString().split('T')[0];

    const rawExpiry = client.expiryDate || client.expiry_date || client.currentPlanExpiry;
    let latestExpiryDate = rawExpiry ? parseClientExpiryDate(rawExpiry) : null;

    // Check if client has scheduled general package advance bookings
    const clientBookings = (generalBookings || []).filter(b =>
      (String(b.client_id) === String(client.id) || String(b.clientId) === String(client.id) || String(b.clientCode) === String(client.clientId)) &&
      ['Scheduled', 'ReadyToActivate', 'Active'].includes(b.status)
    );

    clientBookings.forEach(b => {
      if (b.booking_end_date) {
        const bEnd = parseClientExpiryDate(b.booking_end_date);
        if (bEnd && (!latestExpiryDate || bEnd > latestExpiryDate)) {
          latestExpiryDate = bEnd;
        }
      }
    });

    if (latestExpiryDate) {
      return calculateNextDayDate(latestExpiryDate);
    }

    return new Date().toISOString().split('T')[0];
  };

  const getNextPtStartDate = (client) => {
    if (!client) return new Date().toISOString().split('T')[0];

    let latestExpiry = null;

    const runningPt = hasRunningPtPlan(client.id || client.clientId);
    if (runningPt && (runningPt.expiry_date || runningPt.expiryDate)) {
      const p = parseClientExpiryDate(runningPt.expiry_date || runningPt.expiryDate);
      if (p) latestExpiry = p;
    }

    (ptBookings || []).forEach(b => {
      if ((String(b.client_id) === String(client.id) || String(b.clientCode) === String(client.clientId)) && ['Scheduled', 'ReadyToActivate', 'Active'].includes(b.status)) {
        if (b.booking_start_date) {
          const selPkg = ptPackages.find(pkg => String(pkg.id) === String(b.pt_package_id));
          const dur = selPkg ? (selPkg.duration_days || 30) : 30;
          const bEnd = calculatePlanExpiryDate(b.booking_start_date, 'PT', dur);
          const pEnd = parseClientExpiryDate(bEnd);
          if (pEnd && (!latestExpiry || pEnd > latestExpiry)) {
            latestExpiry = pEnd;
          }
        }
      }
    });

    const genExp = client.expiryDate || client.expiry_date || client.currentPlanExpiry;
    if (!latestExpiry && genExp) {
      const pGen = parseClientExpiryDate(genExp);
      if (pGen) latestExpiry = pGen;
    }

    if (latestExpiry) {
      return calculateNextDayDate(latestExpiry);
    }

    return new Date().toISOString().split('T')[0];
  };

  const handleGenClientChange = (cId) => {
    setIsDirty(true);
    const selClient = clients.find(c => String(c.id) === String(cId) || String(c.clientId) === String(cId));
    const defaultStart = getNextMembershipStartDate(selClient);

    let endDateStr = genForm.booking_end_date;
    if (genForm.plan_type) {
      endDateStr = calculatePlanExpiryDate(defaultStart, genForm.plan_type, settings[`${genForm.plan_type}_duration`]);
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

    if (genForm.client_id && clients.length > 0) {
      const selClient = clients.find(c => String(c.id) === String(genForm.client_id) || String(c.clientId) === String(genForm.client_id));
      if (selClient) {
        const nextStart = getNextMembershipStartDate(selClient);
        setGenForm(prev => {
          let endDateStr = prev.booking_end_date;
          if (prev.plan_type) {
            endDateStr = calculatePlanExpiryDate(nextStart, prev.plan_type, settings[`${prev.plan_type}_duration`]);
          }
          return {
            ...prev,
            booking_start_date: nextStart,
            booking_end_date: endDateStr
          };
        });
      }
    }

    if (ptForm.client_id && clients.length > 0) {
      setPtForm(prev => ({
        ...prev,
        booking_start_date: prev.booking_start_date || new Date().toISOString().split('T')[0]
      }));
    }

    setIsModalOpen(true);
  };

  const selectedGenClient = clients.find(c => String(c.id) === String(genForm.client_id) || String(c.clientId) === String(genForm.client_id));
  const selectedPtClient = clients.find(c => String(c.id) === String(ptForm.client_id) || String(c.clientId) === String(ptForm.client_id));

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

    const startStr = genForm.booking_start_date || getTomorrowDateStr();
    const endDateStr = calculatePlanExpiryDate(startStr, plan, settings[`${plan}_duration`]);

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
      endDateStr = calculatePlanExpiryDate(startDateStr, genForm.plan_type, settings[`${genForm.plan_type}_duration`]);
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
    const paid = booking.paid_amount !== undefined && booking.paid_amount !== null && booking.paid_amount !== ''
      ? parseFloat(booking.paid_amount)
      : finalPrice;
    const due = Math.max(0, finalPrice - paid);
    const payStatus = due <= 0 ? 'Paid (Advance Scheduled)' : (paid > 0 ? 'Partial (Advance Scheduled)' : 'Due (Advance Scheduled)');

    setInvoiceClient({
      name: booking.clientName,
      phone: booking.clientPhone,
      clientId: booking.clientCode,
      plan: `Advance Booking — ${booking.plan_type}`,
      amount: finalPrice,
      totalPlanAmount: finalPrice,
      paidAmount: paid,
      dueAmount: due,
      remainingBalance: due,
      paymentStatus: payStatus,
      paymentMethod: booking.payment_method || 'CASH',
      fromDate: booking.booking_start_date,
      expiryDate: booking.booking_end_date,
      billNo: booking.billNo || `ADV-GEN-${booking.id}`,
      discount_amount: booking.discount_amount
    });
  };

  const handleGeneratePtInvoice = (booking) => {
    const finalPrice = parseFloat(booking.price_snapshot || 0) - parseFloat(booking.discount_amount || 0);
    const paid = booking.paid_amount !== undefined && booking.paid_amount !== null && booking.paid_amount !== ''
      ? parseFloat(booking.paid_amount)
      : finalPrice;
    const due = Math.max(0, finalPrice - paid);
    const payStatus = due <= 0 ? 'Paid (Advance Scheduled)' : (paid > 0 ? 'Partial (Advance Scheduled)' : 'Due (Advance Scheduled)');

    setInvoiceClient({
      name: booking.clientName,
      phone: booking.clientPhone,
      clientId: booking.clientCode,
      plan: `Advance PT Booking — ${booking.packageName} (${booking.trainerName})`,
      amount: finalPrice,
      totalPlanAmount: finalPrice,
      paidAmount: paid,
      dueAmount: due,
      remainingBalance: due,
      paymentStatus: payStatus,
      paymentMethod: booking.payment_method || 'CASH',
      fromDate: booking.booking_start_date,
      expiryDate: booking.booking_start_date,
      billNo: booking.billNo || `ADV-PT-${booking.id}`,
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
      const rawPrice = parseFloat(genForm.price || 0);
      const rawDisc = parseFloat(genForm.discount_amount || 0);
      const netTotal = Math.max(0, rawPrice - rawDisc);
      const finalPaid = genForm.paid_amount !== '' ? parseFloat(genForm.paid_amount) : netTotal;

      const createdBooking = await addGeneralBooking({
        client_id: targetClientId,
        plan_type: genForm.plan_type,
        price: rawPrice,
        discount_amount: rawDisc,
        paid_amount: finalPaid,
        payment_method: genForm.payment_method,
        booking_start_date: genForm.booking_start_date,
        booking_end_date: genForm.booking_end_date
      });
      setIsDirty(false);
      setActionSuccess('General Package Advance Booking created successfully!');
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('clientId');
        next.delete('trainerId');
        next.delete('packageId');
        next.delete('startDate');
        return next;
      }, { replace: true });
      setIsModalOpen(false);
      if (createdBooking) {
        handleGenerateGeneralInvoice(createdBooking);
      }
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
      const selPkg = ptPackages.find(p => String(p.id) === String(ptForm.pt_package_id));
      const rawPrice = selPkg ? parseFloat(selPkg.price || 0) : 0;
      const rawDisc = parseFloat(ptForm.discount_amount || 0);
      const netTotal = Math.max(0, rawPrice - rawDisc);
      const finalPaid = ptForm.paid_amount !== '' ? parseFloat(ptForm.paid_amount) : netTotal;

      const createdBooking = await addPtAdvanceBooking({
        client_id: targetClientId,
        pt_package_id: ptForm.pt_package_id,
        trainer_id: ptForm.trainer_id,
        discount_amount: rawDisc,
        paid_amount: finalPaid,
        payment_method: ptForm.payment_method,
        booking_start_date: ptForm.booking_start_date
      });
      setIsDirty(false);
      setActionSuccess('PT Package Advance Booking created successfully!');
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('clientId');
        next.delete('trainerId');
        next.delete('packageId');
        next.delete('startDate');
        return next;
      }, { replace: true });
      setIsModalOpen(false);
      if (createdBooking) {
        handleGeneratePtInvoice(createdBooking);
      }
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
          {['Scheduled', 'ReadyToActivate', 'Active', 'Cancelled', 'All'].map(st => (
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
              {st === 'All' ? 'All Statuses' : st === 'ReadyToActivate' ? '⚡ Ready To Activate' : st === 'Scheduled' ? '⏳ Scheduled' : st}
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
                    <th style={{ width: '22%' }}>Client Info</th>
                    <th style={{ width: '13%' }}>Current Plan Expiry</th>
                    <th style={{ width: '12%' }}>Booked Tariff</th>
                    <th style={{ width: '15%' }}>Price</th>
                    <th style={{ width: '14%' }}>Booked Validity</th>
                    <th style={{ width: '10%' }}>Status</th>
                    <th style={{ textAlign: 'right', width: '14%' }}>Actions</th>
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
                      <td>
                        <div className="price-val">{formatCurrency((parseFloat(b.price || 0) - parseFloat(b.discount_amount || 0)))}</div>
                        {parseFloat(b.due_amount || 0) > 0 ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff7ed', border: '1px solid #fed7aa', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', color: '#c2410c', fontWeight: '800', marginTop: '3px', whiteSpace: 'nowrap' }}>
                            <span>Due: {formatCurrency(b.due_amount)}</span>
                            <span style={{ color: '#fdba74' }}>•</span>
                            <span style={{ color: '#15803d' }}>Paid: {formatCurrency(b.paid_amount)}</span>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', color: '#15803d', fontWeight: '800', marginTop: '3px', whiteSpace: 'nowrap' }}>
                            ✓ Paid in Full
                          </div>
                        )}
                      </td>
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
                          {parseFloat(b.due_amount || 0) > 0 && (
                            <button
                              className="btn-pay-due-booking"
                              onClick={() => handleOpenPayDueModal(b, 'gen')}
                              title={`Clear Due (₹${parseFloat(b.due_amount).toLocaleString()})`}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                                <line x1="1" y1="10" x2="23" y2="10"></line>
                              </svg>
                              Pay Due
                            </button>
                          )}
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
                    <th style={{ width: '15%' }}>Booked PT Package</th>
                    <th style={{ width: '13%' }}>Assigned Trainer</th>
                    <th style={{ width: '15%' }}>Price / Classes</th>
                    <th style={{ width: '11%' }}>Start Date</th>
                    <th style={{ width: '10%' }}>Status</th>
                    <th style={{ textAlign: 'right', width: '14%' }}>Actions</th>
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
                        {parseFloat(b.due_amount || 0) > 0 ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff7ed', border: '1px solid #fed7aa', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', color: '#c2410c', fontWeight: '800', marginTop: '3px', whiteSpace: 'nowrap' }}>
                            <span>Due: {formatCurrency(b.due_amount)}</span>
                            <span style={{ color: '#fdba74' }}>•</span>
                            <span style={{ color: '#15803d' }}>Paid: {formatCurrency(b.paid_amount)}</span>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '6px', fontSize: '0.73rem', color: '#15803d', fontWeight: '800', marginTop: '3px', whiteSpace: 'nowrap' }}>
                            ✓ Paid in Full
                          </div>
                        )}
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
                          {parseFloat(b.due_amount || 0) > 0 && (
                            <button
                              className="btn-pay-due-booking"
                              onClick={() => handleOpenPayDueModal(b, 'pt')}
                              title={`Clear Due (₹${parseFloat(b.due_amount).toLocaleString()})`}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                                <line x1="1" y1="10" x2="23" y2="10"></line>
                              </svg>
                              Pay Due
                            </button>
                          )}
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
                                {isDisabled ? 'Locked' : 'Activate'}
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
              <button className="btn-close-x" onClick={handleCloseModal}>✕</button>
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

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Paid Amount (₹)</label>
                    <input
                      type="number"
                      placeholder={Math.max(0, (parseFloat(genForm.price) || 0) - (parseFloat(genForm.discount_amount) || 0))}
                      value={genForm.paid_amount}
                      onChange={e => { setGenForm({ ...genForm, paid_amount: e.target.value }); setIsDirty(true); }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select
                      value={genForm.payment_method}
                      onChange={e => { setGenForm({ ...genForm, payment_method: e.target.value }); setIsDirty(true); }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">CARD</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
                    </select>
                  </div>
                </div>

                {/* Due Amount Summary Breakdown */}
                {(() => {
                  const gross = parseFloat(genForm.price) || 0;
                  const disc = parseFloat(genForm.discount_amount) || 0;
                  const net = Math.max(0, gross - disc);
                  const paid = genForm.paid_amount !== '' ? parseFloat(genForm.paid_amount) || 0 : net;
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

                <div className="adv-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={handleCloseModal}>Cancel</button>
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

                <div className="form-row-2">
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
                    <label>Paid Amount (₹)</label>
                    <input
                      type="number"
                      placeholder={(() => {
                        const sel = ptPackages.find(p => String(p.id) === String(ptForm.pt_package_id));
                        const gross = sel ? parseFloat(sel.price || 0) : 0;
                        const disc = parseFloat(ptForm.discount_amount) || 0;
                        return Math.max(0, gross - disc);
                      })()}
                      value={ptForm.paid_amount}
                      onChange={e => { setPtForm({ ...ptForm, paid_amount: e.target.value }); setIsDirty(true); }}
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select
                      value={ptForm.payment_method}
                      onChange={e => { setPtForm({ ...ptForm, payment_method: e.target.value }); setIsDirty(true); }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">CARD</option>
                      <option value="BANK TRANSFER">BANK TRANSFER</option>
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
                  </div>
                </div>

                {/* Due Amount Summary Breakdown */}
                {(() => {
                  const sel = ptPackages.find(p => String(p.id) === String(ptForm.pt_package_id));
                  const gross = sel ? parseFloat(sel.price || 0) : 0;
                  const disc = parseFloat(ptForm.discount_amount) || 0;
                  const net = Math.max(0, gross - disc);
                  const paid = ptForm.paid_amount !== '' ? parseFloat(ptForm.paid_amount) || 0 : net;
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

                <div className="adv-modal-footer">
                  <button type="button" className="btn-modal-cancel" onClick={handleCloseModal}>Cancel</button>
                  <button type="submit" className="btn-modal-submit">Save PT Advance Booking</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Pay Due Modal for Advance Bookings */}
      {payDueModal.isOpen && (
        <div className="adv-modal-overlay" style={{ zIndex: 10500 }}>
          <div className="adv-modal-card" style={{ maxWidth: '440px' }}>
            <div className="adv-modal-header" style={{ borderBottom: '1px solid #fed7aa', background: '#fff7ed' }}>
              <div>
                <h3 style={{ color: '#c2410c', margin: 0, fontSize: '1.15rem' }}>
                  💳 Collect Due Payment
                </h3>
                <p style={{ color: '#ea580c', margin: '3px 0 0 0', fontSize: '0.82rem', fontWeight: 600 }}>
                  {payDueModal.booking?.clientName} • {payDueModal.type === 'gen' ? payDueModal.booking?.plan_type : payDueModal.booking?.packageName}
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

            <form onSubmit={handleConfirmPayDue} className="adv-form" style={{ padding: '1.25rem' }}>
              <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Current Pending Due:</span>
                <strong style={{ fontSize: '1.1rem', color: '#ea580c' }}>₹{parseFloat(payDueModal.booking?.due_amount || 0).toLocaleString()}</strong>
              </div>

              <div className="form-group">
                <label>Amount Paying Now (₹) *</label>
                <input
                  type="number"
                  min="1"
                  max={parseFloat(payDueModal.booking?.due_amount || 0)}
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
                  <option value="CASH">CASH</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">CARD</option>
                  <option value="BANK TRANSFER">BANK TRANSFER</option>
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
                const curDue = parseFloat(payDueModal.booking?.due_amount || 0);
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

              <div className="adv-modal-footer" style={{ marginTop: '1rem' }}>
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
                  className="btn-modal-submit"
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
