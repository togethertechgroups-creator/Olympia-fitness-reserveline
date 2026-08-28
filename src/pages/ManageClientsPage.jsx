import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getClients, deleteClient, restoreData, fetchTransactions, getTrainers, addClientPayment, getClientBills, getSettings, renewExpiredClient, getGeneralBookings, getPtAdvanceBookings, getPtAssignmentsByClient, getOtherServiceSalesByClient, updateBill, deleteBill, deleteOtherServiceSale, sendWhatsAppText, updateGeneralBooking, deleteGeneralBooking, updatePtAdvanceBooking, deletePtAdvanceBooking, updatePtAssignment, deletePtAssignment, updateClient, getClientById } from '../api';
import { utils, writeFile, read } from 'xlsx';
import ExpiredPlansModal from '../components/ExpiredPlansModal';
import InvoicePreviewModal from '../components/InvoicePreviewModal';

import './ManageClientsPage.css';

import { formatDateDDMMYYYY, calculatePlanExpiryDate } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import { parseUploadedExcel } from '../utils/excelParser';

const getDurationDays = (planName) => {
  if (planName === 'Quarterly') return 90;
  if (planName === 'Half-Yearly' || planName === 'Semi-Annual') return 180;
  if (planName === 'Annual') return 365;
  return 30; // Monthly or default
};

const calcExpiryDateStr = (startDate, durationDays, planName = '') => {
  return calculatePlanExpiryDate(startDate, planName, durationDays);
};

const calcClientDueDetails = (client) => {
  const baseTotal = Number(client.amount || 0);
  let effectiveDue = 0;

  if (client.dueAmount !== undefined && client.dueAmount !== null) {
    effectiveDue = Math.max(0, Number(client.dueAmount));
  } else if ((client.paymentStatus || '').toLowerCase() !== 'paid') {
    const pd = client.paidAmount !== undefined && client.paidAmount !== null ? Number(client.paidAmount) : baseTotal;
    effectiveDue = Math.max(0, baseTotal - pd);
  }

  const actualTotal = Math.max(baseTotal, (Number(client.paidAmount || 0) + effectiveDue));
  const actualPaid = Math.max(0, actualTotal - effectiveDue);
  return { actualTotal, actualPaid, effectiveDue };
};

const ManageClientsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('Inactive');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [idSortOrder, setIdSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [genderFilter, setGenderFilter] = useState('All'); // 'All' | 'Male' | 'Female'
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  // Removed isPTAlertOpen state

  const [combinedExpiredList, setCombinedExpiredList] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importOptionsModal, setImportOptionsModal] = useState({ isOpen: false, clientsData: [], txnsData: [] });
  const [trainers, setTrainers] = useState([]);
  const [trainerFilter, setTrainerFilter] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '', clientId: '' });
  const [viewClientModal, setViewClientModal] = useState({ isOpen: false, client: null, ptAssignments: [], otherServices: [], bills: [], loadingDetails: false, activeTab: 'overview' });
  const [invoicePreviewClient, setInvoicePreviewClient] = useState(null);
  const [viewImageModal, setViewImageModal] = useState({ isOpen: false, imageUrl: '', title: '', subtitle: '', url: '', name: '' });
  const [paymentModal, setPaymentModal] = useState({ isOpen: false, client: null, amount: '', method: 'CASH', date: new Date().toISOString().split('T')[0] });
  const [editBillModal, setEditBillModal] = useState({
    isOpen: false,
    bill: null,
    planName: '',
    totalPlanAmount: '',
    paidAmount: '',
    dueAmount: '',
    invoiceDate: '',
    joinDate: '',
    expiryDate: '',
    discount_amount: '',
    isSaving: false
  });
  const [toast, setToast] = useState(null); // { message: '', type: 'success' | 'error' | 'info' }
  const fileInputRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const handleViewClient = async (client) => {
    setViewClientModal({ isOpen: true, client, ptAssignments: [], otherServices: [], bills: [], loadingDetails: true, activeTab: 'overview' });
    try {
      const [ptRes, svcRes, billsRes] = await Promise.all([
        getPtAssignmentsByClient(client.id).catch(() => []),
        getOtherServiceSalesByClient(client.id).catch(() => []),
        getClientBills(client.id).catch(() => [])
      ]);
      let ptData = Array.isArray(ptRes) ? ptRes : [];
      let svcData = Array.isArray(svcRes) ? svcRes : [];
      let billsData = Array.isArray(billsRes) ? billsRes : [];

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

      if (billsData.length === 0 && client.clientId) {
        try {
          const altBills = await getClientBills(client.clientId);
          if (Array.isArray(altBills) && altBills.length > 0) billsData = altBills;
        } catch (e) {}
      }

      setViewClientModal({
        isOpen: true,
        client,
        ptAssignments: ptData,
        otherServices: svcData,
        bills: billsData,
        loadingDetails: false,
        activeTab: 'overview'
      });
    } catch (err) {
      console.error('Failed to load client details:', err);
      setViewClientModal(prev => ({ ...prev, loadingDetails: false }));
    }
  };

  const handleOpenEditBill = (bill) => {
    setEditBillModal({
      isOpen: true,
      itemType: 'bill',
      rawId: bill.id,
      bill,
      planName: bill.planName || viewClientModal.client?.plan || 'General Plan',
      totalPlanAmount: bill.totalPlanAmount !== undefined ? bill.totalPlanAmount : (bill.planAmount || 0),
      paidAmount: bill.paidAmount !== undefined ? bill.paidAmount : 0,
      dueAmount: bill.dueAmount !== undefined ? bill.dueAmount : 0,
      invoiceDate: bill.invoiceDate || new Date().toISOString().split('T')[0],
      joinDate: bill.joinDate || viewClientModal.client?.fromDate || '',
      expiryDate: bill.expiryDate || viewClientModal.client?.expiryDate || '',
      discount_amount: bill.discount_amount || 0,
      isSaving: false
    });
  };

  const handleEditHistoryItem = (item) => {
    if (!item) return;
    if (item.billObj) {
      handleOpenEditBill(item.billObj);
      return;
    }
    if (item.id && String(item.id).startsWith('bill-')) {
      handleOpenEditBill(item);
      return;
    }

    if (item.id && String(item.id).startsWith('gen-adv-')) {
      const bookingId = String(item.id).replace('gen-adv-', '');
      const booking = (advanceBookings.general || []).find(b => String(b.id) === String(bookingId)) || item;
      setEditBillModal({
        isOpen: true,
        itemType: 'gen-adv',
        rawId: bookingId,
        bill: { id: bookingId, billNo: item.billNo || 'ADV-GEN' },
        planName: item.planName || 'General Plan',
        totalPlanAmount: item.amount !== undefined ? item.amount : (booking.price || 0),
        paidAmount: item.paidAmount !== undefined ? item.paidAmount : item.amount,
        dueAmount: item.dueAmount !== undefined ? item.dueAmount : 0,
        invoiceDate: item.date || item.startDate || new Date().toISOString().split('T')[0],
        joinDate: item.startDate || '',
        expiryDate: item.expiryDate || '',
        discount_amount: booking.discount_amount || 0,
        isSaving: false
      });
      return;
    }

    if (item.id && String(item.id).startsWith('pt-adv-')) {
      const bookingId = String(item.id).replace('pt-adv-', '');
      const booking = (advanceBookings.pt || []).find(b => String(b.id) === String(bookingId)) || item;
      setEditBillModal({
        isOpen: true,
        itemType: 'pt-adv',
        rawId: bookingId,
        bill: { id: bookingId, billNo: item.billNo || 'ADV-PT' },
        planName: item.planName || 'PT Package',
        totalPlanAmount: item.amount !== undefined ? item.amount : (booking.price_snapshot || 0),
        paidAmount: item.paidAmount !== undefined ? item.paidAmount : item.amount,
        dueAmount: item.dueAmount !== undefined ? item.dueAmount : 0,
        invoiceDate: item.date || item.startDate || new Date().toISOString().split('T')[0],
        joinDate: item.startDate || '',
        expiryDate: item.expiryDate || '',
        discount_amount: booking.discount_amount || 0,
        isSaving: false
      });
      return;
    }

    if (item.ptObj || (item.id && String(item.id).startsWith('pt-'))) {
      const ptId = item.ptObj?.id || String(item.id).replace('pt-', '');
      const ptItem = item.ptObj || (viewClientModal.ptAssignments || []).find(p => String(p.id) === String(ptId));
      setEditBillModal({
        isOpen: true,
        itemType: 'pt-assign',
        rawId: ptId,
        bill: { id: ptId, billNo: item.billNo || 'PT-ASSIGN' },
        planName: item.planName || 'PT Package',
        totalPlanAmount: item.amount !== undefined ? item.amount : (ptItem?.package_price_snapshot || 0),
        paidAmount: item.paidAmount !== undefined ? item.paidAmount : item.amount,
        dueAmount: item.dueAmount !== undefined ? item.dueAmount : 0,
        invoiceDate: item.date || item.startDate || new Date().toISOString().split('T')[0],
        joinDate: item.startDate || '',
        expiryDate: item.expiryDate || '',
        discount_amount: ptItem?.discount_amount || 0,
        isSaving: false
      });
      return;
    }

    const currClient = viewClientModal.client;
    setEditBillModal({
      isOpen: true,
      itemType: 'client-membership',
      rawId: currClient?.id,
      bill: { id: currClient?.id, billNo: 'MEMBERSHIP' },
      planName: item.planName || currClient?.plan || 'General Plan',
      totalPlanAmount: item.amount !== undefined ? item.amount : (currClient?.amount || 0),
      paidAmount: item.paidAmount !== undefined ? item.paidAmount : (currClient?.paidAmount || 0),
      dueAmount: item.dueAmount !== undefined ? item.dueAmount : (currClient?.dueAmount || 0),
      invoiceDate: item.date || item.startDate || currClient?.fromDate || new Date().toISOString().split('T')[0],
      joinDate: item.startDate || currClient?.fromDate || '',
      expiryDate: item.expiryDate || currClient?.expiryDate || '',
      discount_amount: 0,
      isSaving: false
    });
  };

  const handleSaveEditBill = async (e) => {
    e.preventDefault();
    if (!editBillModal.bill) return;
    setEditBillModal(prev => ({ ...prev, isSaving: true }));
    try {
      const itemType = editBillModal.itemType || 'bill';
      const total = parseFloat(editBillModal.totalPlanAmount) || 0;
      const paid = parseFloat(editBillModal.paidAmount) || 0;
      const due = parseFloat(editBillModal.dueAmount) || 0;
      const disc = parseFloat(editBillModal.discount_amount) || 0;
      const status = due <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Due');

      if (itemType === 'gen-adv') {
        await updateGeneralBooking(editBillModal.rawId, {
          plan_type: editBillModal.planName,
          price: total,
          discount_amount: disc,
          paid_amount: paid,
          due_amount: due,
          payment_status: status,
          booking_start_date: editBillModal.joinDate || editBillModal.invoiceDate,
          booking_end_date: editBillModal.expiryDate
        });
      } else if (itemType === 'pt-adv') {
        await updatePtAdvanceBooking(editBillModal.rawId, {
          price_snapshot: total,
          discount_amount: disc,
          paid_amount: paid,
          due_amount: due,
          payment_status: status,
          booking_start_date: editBillModal.joinDate || editBillModal.invoiceDate,
          expiry_date: editBillModal.expiryDate
        });
      } else if (itemType === 'pt-assign') {
        await updatePtAssignment(editBillModal.rawId, {
          package_price_snapshot: total,
          discount_amount: disc,
          assigned_date: editBillModal.joinDate || editBillModal.invoiceDate,
          expiry_date: editBillModal.expiryDate
        });
      } else if (itemType === 'client-membership') {
        await updateClient(editBillModal.rawId, {
          plan: editBillModal.planName,
          amount: total,
          paidAmount: paid,
          dueAmount: due,
          paymentStatus: status,
          fromDate: editBillModal.joinDate || editBillModal.invoiceDate,
          expiryDate: editBillModal.expiryDate
        });
      } else {
        await updateBill(editBillModal.bill.id, {
          planName: editBillModal.planName,
          totalPlanAmount: total,
          planAmount: total,
          paidAmount: paid,
          dueAmount: due,
          invoiceDate: editBillModal.invoiceDate,
          joinDate: editBillModal.joinDate,
          expiryDate: editBillModal.expiryDate,
          discount_amount: disc,
          syncClient: true
        });
      }

      alert('Plan / Invoice updated successfully.');
      const currClient = viewClientModal.client;
      setEditBillModal({ isOpen: false, bill: null, isSaving: false });
      await fetchClients();
      if (currClient) {
        try {
          const refreshedClient = await getClientById(currClient.id);
          await handleViewClient(refreshedClient || currClient);
        } catch (_) {
          await handleViewClient(currClient);
        }
      }
    } catch (err) {
      alert(err.message || 'Failed to update plan / invoice');
      setEditBillModal(prev => ({ ...prev, isSaving: false }));
    }
  };

  const handleDeleteBill = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this invoice? This will remove the invoice record.')) return;
    try {
      await deleteBill(billId);
      alert('Invoice deleted successfully.');
      const currClient = viewClientModal.client;
      await fetchClients();
      if (currClient) {
        try {
          const refreshedClient = await getClientById(currClient.id);
          await handleViewClient(refreshedClient || currClient);
        } catch (_) {
          await handleViewClient(currClient);
        }
      }
    } catch (err) {
      alert(err.message || 'Failed to delete invoice');
    }
  };

  const handleDeleteHistoryItem = async (item) => {
    if (!item) return;
    const label = item.planName || item.type || 'this record';
    if (!window.confirm(`Are you sure you want to delete ${label}?`)) return;

    try {
      if (item.billObj) {
        await deleteBill(item.billObj.id);
      } else if (item.id && String(item.id).startsWith('bill-')) {
        const billId = String(item.id).replace('bill-', '');
        await deleteBill(billId);
      } else if (item.id && String(item.id).startsWith('gen-adv-')) {
        const bookingId = String(item.id).replace('gen-adv-', '');
        await deleteGeneralBooking(bookingId);
      } else if (item.id && String(item.id).startsWith('pt-adv-')) {
        const bookingId = String(item.id).replace('pt-adv-', '');
        await deletePtAdvanceBooking(bookingId);
      } else if (item.ptObj || (item.id && String(item.id).startsWith('pt-'))) {
        const ptId = item.ptObj?.id || String(item.id).replace('pt-', '');
        await deletePtAssignment(ptId);
      } else if (item.id && String(item.id).startsWith('svc-')) {
        const svcId = String(item.id).replace('svc-', '');
        await deleteOtherServiceSale(svcId);
      } else if (item.id && String(item.id).startsWith('current-')) {
        const currClient = viewClientModal.client;
        if (currClient) {
          await updateClient(currClient.id, {
            plan: '',
            amount: 0,
            paidAmount: 0,
            dueAmount: 0,
            fromDate: null,
            expiryDate: null,
            status: 'Inactive'
          });
        }
      }

      alert('Deleted successfully.');
      const currClient = viewClientModal.client;
      await fetchClients();
      if (currClient) {
        try {
          const refreshedClient = await getClientById(currClient.id);
          await handleViewClient(refreshedClient || currClient);
        } catch (_) {
          await handleViewClient(currClient);
        }
      }
    } catch (err) {
      alert(err.message || 'Failed to delete record');
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
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && viewImageModal.isOpen) {
        setViewImageModal({ isOpen: false, imageUrl: '', title: '', subtitle: '', url: '', name: '' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewImageModal.isOpen]);

  useEffect(() => {
    Promise.all([
      fetchClients(),
      fetchTrainers(),
      fetchSettings()
    ]);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusParam = params.get('status');
    if (statusParam === 'Active') {
      setActiveFilter('Active');
    } else if (statusParam === 'Inactive' || statusParam === 'Expired') {
      setActiveFilter('Inactive');
    } else if (statusParam === 'Reminder') {
      setActiveFilter('Reminder');
    } else if (statusParam === 'Due Payment' || statusParam === 'Due') {
      setActiveFilter('Due Payment');
    } else if (statusParam === 'All') {
      setActiveFilter('All');
    } else if (!statusParam) {
      setActiveFilter('Inactive');
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

  const getTariffKeys = () => {
    return Array.from(new Set([
      ...Object.keys(settings).filter(k => k.endsWith('_Strengthening') && !k.startsWith('PT_') && !k.startsWith('Diet')).map(k => k.replace('_Strengthening', '')),
      'MONTHLY', 'QUARTERLY', 'HALF YEAR', '1 YEAR', '2 YEARS', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annual'
    ])).filter(planBase => !(settings[`${planBase}_hidden`] === 1 || settings[`${planBase}_hidden`] === '1'));
  };

  const getTariffPrice = (plan) => {
    if (!plan) return 0;
    const candidates = [
      `${plan}_Strengthening`,
      `${plan.toUpperCase()}_Strengthening`,
      `${plan.replace('-', ' ').toUpperCase()}_Strengthening`,
      plan,
      plan.toUpperCase()
    ];
    for (const key of candidates) {
      if (settings[key] !== undefined && parseFloat(settings[key]) > 0) {
        return parseFloat(settings[key]);
      }
    }
    return 0;
  };

  const getTariffDuration = (plan) => {
    if (!plan) return 30;
    const candidates = [
      `${plan}_duration`,
      `${plan.toUpperCase()}_duration`,
      `${plan.replace('-', ' ').toUpperCase()}_duration`
    ];
    for (const key of candidates) {
      if (settings[key] !== undefined && parseInt(settings[key], 10) > 0) {
        return parseInt(settings[key], 10);
      }
    }
    const pUpper = plan.toUpperCase();
    if (pUpper.includes('QUARTER')) return 91;
    if (pUpper.includes('HALF') || pUpper.includes('6 MONTH') || pUpper.includes('SEMI')) return 183;
    if (pUpper.includes('1 YEAR') || pUpper.includes('ANNUAL') || pUpper.includes('12 MONTH')) return 364;
    if (pUpper.includes('2 YEAR')) return 730;
    return 30;
  };

  const handleOpenRenewModal = (client) => {
    const today = new Date().toISOString().split('T')[0];
    let startDate = today;
    if (client.expiryDate) {
      const expStr = client.expiryDate.split('T')[0];
      if (expStr >= today) {
        const d = new Date(expStr);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + 1);
          startDate = d.toISOString().split('T')[0];
        }
      }
    }

    const initialPlan = client.plan || 'MONTHLY';
    const initialPrice = getTariffPrice(initialPlan) || parseFloat(client.amount) || 0;
    const initialDuration = getTariffDuration(initialPlan);

    const sDate = new Date(startDate);
    sDate.setDate(sDate.getDate() + parseInt(initialDuration, 10));
    const computedEndDate = sDate.toISOString().split('T')[0];

    setRenewModal({
      isOpen: true,
      client: client,
      plan: initialPlan,
      price: initialPrice,
      discount_amount: '',
      paidAmount: initialPrice,
      paymentMethod: 'CASH',
      startDate: startDate,
      endDate: computedEndDate,
      durationDays: initialDuration,
      hasGst: !!client.gstin,
      gstin: client.gstin || ''
    });
  };

  const handleRenewPlanChange = (newPlan) => {
    const duration = getTariffDuration(newPlan);
    const price = getTariffPrice(newPlan);
    const startStr = renewModal.startDate || new Date().toISOString().split('T')[0];
    const sDate = new Date(startStr);
    sDate.setDate(sDate.getDate() + parseInt(duration, 10));
    const endDateStr = sDate.toISOString().split('T')[0];

    const disc = parseFloat(renewModal.discount_amount) || 0;
    const net = Math.max(0, price - disc);

    setRenewModal(prev => ({
      ...prev,
      plan: newPlan,
      durationDays: duration,
      price: price,
      endDate: endDateStr,
      paidAmount: net
    }));
  };

  const handleRenewStartDateChange = (startDateStr) => {
    let endDateStr = renewModal.endDate;
    if (renewModal.plan) {
      const duration = getTariffDuration(renewModal.plan);
      const sDate = new Date(startDateStr);
      sDate.setDate(sDate.getDate() + parseInt(duration, 10));
      endDateStr = sDate.toISOString().split('T')[0];
    }
    setRenewModal(prev => ({
      ...prev,
      startDate: startDateStr,
      endDate: endDateStr
    }));
  };

  const handleRenewPriceOrDiscountChange = (field, value) => {
    setRenewModal(prev => {
      const updated = { ...prev, [field]: value };
      const gross = parseFloat(updated.price) || 0;
      const disc = parseFloat(updated.discount_amount) || 0;
      const net = Math.max(0, gross - disc);
      if (field === 'price' || field === 'discount_amount') {
        updated.paidAmount = net;
      }
      return updated;
    });
  };

  const handleRenewSubmit = async (e) => {
    e.preventDefault();
    if (!renewModal.plan) {
      alert('Please select a membership plan.');
      return;
    }
    setIsRenewing(true);
    try {
      const grossPrice = parseFloat(renewModal.price) || 0;
      const disc = parseFloat(renewModal.discount_amount || 0);
      const net = Math.max(0, grossPrice - disc);
      const payload = {
        planName: renewModal.plan,
        price: grossPrice,
        discount_amount: disc,
        durationDays: renewModal.durationDays,
        hasGst: renewModal.hasGst,
        gstin: renewModal.gstin,
        paidAmount: renewModal.paidAmount !== '' ? parseFloat(renewModal.paidAmount) : net,
        paymentMethod: renewModal.paymentMethod,
        startDate: renewModal.startDate
      };

      const response = await renewExpiredClient(renewModal.client.id, payload);

      setRenewModal({ isOpen: false, client: null, plan: '', price: '', discount_amount: '', paidAmount: '', paymentMethod: 'CASH', startDate: '', endDate: '', durationDays: 30, hasGst: false, gstin: '' });
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
      const data = await getClients(true);
      setClients(data);
      setLoading(false);

      // Unified Expiry Check
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Clients with <= 7 days remaining (0 to 7 days left)
      const expiringSoon = data.filter(c => {
        if (!c.expiryDate) return false;
        const exp = new Date(c.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const diffDays = Math.round((exp - today) / (1000 * 60 * 60 * 24));
        const isNotExpired = diffDays >= 0 && (c.status === 'Active' || c.status === 'active' || !c.status);
        return isNotExpired && diffDays <= 7;
      }).map(c => {
        const exp = new Date(c.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const diffDays = Math.round((exp - today) / (1000 * 60 * 60 * 24));
        return {
          ...c,
          type: 'ExpiringSoon',
          daysLeft: diffDays,
          daysAgo: 0,
          isExpiringSoon: true,
          isExpired: false
        };
      }).sort((a, b) => a.daysLeft - b.daysLeft);

      // Expired clients
      const expiredMembership = data.filter(c => {
        if (!c.expiryDate) return false;
        const exp = new Date(c.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const diffDays = Math.round((exp - today) / (1000 * 60 * 60 * 24));
        return diffDays < 0 || c.status === 'inactive' || c.status === 'Inactive' || c.status === 'Expired';
      }).map(c => {
        const exp = new Date(c.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const diffDays = Math.round((exp - today) / (1000 * 60 * 60 * 24));
        return {
          ...c,
          type: 'Expired',
          daysLeft: 0,
          daysAgo: Math.abs(diffDays),
          isExpiringSoon: false,
          isExpired: true
        };
      }).sort((a, b) => a.daysAgo - b.daysAgo);

      // Combined list: 7 days remaining on TOP, followed by expired below
      const combined = [...expiringSoon, ...expiredMembership];
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

      // Non-blocking background fetch for advance bookings details
      Promise.all([
        getGeneralBookings().catch(() => []),
        getPtAdvanceBookings().catch(() => [])
      ]).then(([genBookings, ptBookings]) => {
        setAdvanceBookings({
          general: Array.isArray(genBookings) ? genBookings : [],
          pt: Array.isArray(ptBookings) ? ptBookings : []
        });
      });

    } catch (error) {
      console.error('Failed to fetch clients');
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





  const handleSendWhatsAppReminder = async (client) => {
    const rawPhone = String(client.phone || '').replace(/\D/g, '');
    if (!rawPhone) {
      showToast(`No phone number recorded for ${client.name}`, 'error');
      return;
    }
    const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const validity = getValidityDisplay(client.expiryDate);
    const { effectiveDue } = calcClientDueDetails(client);

    let text = `Hello ${client.name},\n\n`;
    if (effectiveDue > 0) {
      text += `This is a friendly reminder from Olympia Fitness regarding your pending due amount of ₹${effectiveDue.toLocaleString()}.\n`;
    } else if (validity.isExpired) {
      text += `Your gym membership plan (${client.plan || 'Plan'}) has expired. Please renew your membership to continue your workout sessions uninterrupted.\n`;
    } else {
      text += `Your gym membership plan (${client.plan || 'Plan'}) is valid until ${formatDateDDMMYYYY(client.expiryDate)} (${validity.text}).\n`;
    }
    text += `\nThank you, Olympia Fitness! 💪🏋️‍♂️`;

    showToast(`Sending WhatsApp reminder to ${client.name}...`, 'info');
    try {
      await sendWhatsAppText(phone, text, client.name, client.id || client.clientId, effectiveDue > 0 ? 'payment_reminder' : (validity.isExpired ? 'expired' : 'reminder'));
      showToast(`✅ WhatsApp reminder sent successfully to ${client.name} (${phone})!`, 'success');
    } catch (err) {
      console.error('Failed to send WhatsApp reminder:', err);
      showToast(`❌ ${err.message || 'Failed to send WhatsApp message'}`, 'error');
    }
  };

  const parseClientDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
    let str = String(dateStr).trim();
    if (!str) return null;
    if (str.includes('T')) str = str.split('T')[0];
    if (str.includes(' ')) str = str.split(' ')[0];

    // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      const d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getValidityDisplay = (expiryDate) => {
    if (!expiryDate) return { text: 'N/A', subtext: '', isExpired: true, isWarning: false, days: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = parseClientDate(expiryDate);
    if (!expiry) return { text: 'N/A', subtext: '', isExpired: true, isWarning: false, days: 0 };

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
    const start = startDate ? parseClientDate(startDate) : null;

    if (start && start > today) {
      const diffDays = Math.round((start - today) / (1000 * 60 * 60 * 24));
      return { text: `Starts in ${diffDays} day${diffDays > 1 ? 's' : ''}`, isFuture: true, isExpired: false };
    }
    if (endDate) {
      return getValidityDisplay(endDate);
    }
    return null;
  };

  const baseFilteredClients = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return clients.filter(client => {
      if (searchLower) {
        const matchesSearch =
          (client.name && client.name.toLowerCase().includes(searchLower)) ||
          (client.phone && client.phone.includes(searchLower)) ||
          (client.clientId && client.clientId.toLowerCase().includes(searchLower)) ||
          (client.id && client.id.toLowerCase().includes(searchLower)) ||
          (client.trainerName && client.trainerName.toLowerCase().includes(searchLower));

        if (!matchesSearch) return false;
      }

      if (trainerFilter !== 'All' && client.trainerId !== trainerFilter) return false;

      const st = (client.status || '').toLowerCase().trim();
      const expiry = parseClientDate(client.expiryDate);
      const isExplicitInactive = st === 'inactive' || st === 'expired';
      const isDateExpired = expiry ? (expiry < today) : false;
      const isExpired = isExplicitInactive || isDateExpired;

      const diffDays = expiry ? Math.ceil((expiry - today) / (1000 * 60 * 60 * 24)) : -1;
      const isExpiringSoon = !isExpired && diffDays >= 0 && diffDays <= 5;

      const { effectiveDue } = calcClientDueDetails(client);

      if (activeFilter === 'Active') return !isExpired;
      if (activeFilter === 'Inactive') return isExpired || effectiveDue > 0 || isExpiringSoon;
      if (activeFilter === 'Reminder') return isExpiringSoon;
      if (activeFilter === 'Due Payment') return effectiveDue > 0;

      return true;
    });
  }, [clients, searchTerm, trainerFilter, activeFilter]);

  const dynamicGenderCounts = useMemo(() => {
    let male = 0;
    let female = 0;
    for (let i = 0; i < baseFilteredClients.length; i++) {
      const g = (baseFilteredClients[i].gender || '').toLowerCase().trim();
      if (g === 'female' || g === 'f') {
        female++;
      } else {
        male++;
      }
    }
    return { male, female, total: baseFilteredClients.length };
  }, [baseFilteredClients]);

  const filteredClients = useMemo(() => {
    const list = baseFilteredClients.filter(client => {
      // Gender Filter
      const g = (client.gender || '').toLowerCase().trim();
      const isFemale = g === 'female' || g === 'f';
      if (genderFilter === 'Male' && isFemale) return false;
      if (genderFilter === 'Female' && !isFemale) return false;
      return true;
    });

    // ID Sorting (Ascending / Descending)
    list.sort((a, b) => {
      const idAStr = String(a.clientId || a.id || '');
      const idBStr = String(b.clientId || b.id || '');
      const numA = parseInt(idAStr.replace(/\D/g, ''), 10);
      const numB = parseInt(idBStr.replace(/\D/g, ''), 10);

      let cmp = 0;
      if (!isNaN(numA) && !isNaN(numB)) {
        cmp = numA - numB;
      } else {
        cmp = idAStr.localeCompare(idBStr, undefined, { numeric: true });
      }

      return idSortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [baseFilteredClients, genderFilter, idSortOrder]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let expiredCount = 0;
    let activeCount = 0;

    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const st = (c.status || '').toLowerCase().trim();
      const expiry = parseClientDate(c.expiryDate);
      const isExplicitInactive = st === 'inactive' || st === 'expired';
      const isDateExpired = expiry ? (expiry < today) : false;

      if (isExplicitInactive || isDateExpired) {
        expiredCount++;
      } else {
        activeCount++;
      }
    }

    return {
      total: clients.length,
      active: activeCount,
      expired: expiredCount
    };
  }, [clients]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilter, trainerFilter, genderFilter, idSortOrder, itemsPerPage]);

  const totalItems = filteredClients.length;
  const totalPages = itemsPerPage > 0 ? Math.max(1, Math.ceil(totalItems / itemsPerPage)) : 1;

  const paginatedClients = useMemo(() => {
    if (itemsPerPage <= 0) return filteredClients;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredClients, currentPage, itemsPerPage]);

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

  const executeImport = async (clientsData, txnsData, importMode) => {
    setIsImporting(true);
    setImportOptionsModal({ isOpen: false, clientsData: [], txnsData: [] });

    try {
      const BATCH_SIZE = 300;
      const totalClients = clientsData.length;
      let importedCount = 0;

      for (let i = 0; i < Math.max(1, totalClients); i += BATCH_SIZE) {
        const clientBatch = clientsData.slice(i, i + BATCH_SIZE);
        const txnBatch = (i === 0) ? txnsData : [];
        const mode = (i === 0) ? importMode : 'append';

        await restoreData({
          clients: clientBatch,
          transactions: txnBatch,
          mode: mode
        });

        importedCount += clientBatch.length;
      }

      alert(`Import successful! ${importMode === 'append' ? 'Added / Merged' : 'Restored'} ${importedCount} Clients and ${txnsData.length} Transactions.`);
      await fetchClients();
    } catch (error) {
      console.error('Import execution failed:', error);
      alert('Failed to import data: ' + (error.message || 'Error occurred during restore.'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = read(data);
      const { clientsData, txnsData } = parseUploadedExcel(wb, file.name);

      if (clientsData.length === 0 && txnsData.length === 0) {
        alert("No valid data found in the uploaded Excel file. Please check that your sheet contains member columns like Name, Phone, and Plan.");
        if (fileInputRef.current) fileInputRef.current.value = null;
        return;
      }

      // If existing client records exist in DB, show Import Options Modal (Add On vs Replace)
      if (clients.length > 0) {
        setImportOptionsModal({
          isOpen: true,
          clientsData,
          txnsData
        });
      } else {
        // Direct import if DB is empty
        await executeImport(clientsData, txnsData, 'overwrite');
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import data: ' + (error.message || 'Please check file format.'));
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  return (
    <div className="manage-clients-container">
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 99999,
          background: toast.type === 'error' ? 'linear-gradient(135deg, #dc2626, #ef4444)' : (toast.type === 'info' ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'linear-gradient(135deg, #059669, #10b981)'),
          color: '#ffffff',
          padding: '0.85rem 1.4rem',
          borderRadius: '12px',
          fontWeight: '700',
          fontSize: '0.95rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold', marginLeft: '0.5rem' }}>✕</button>
        </div>
      )}
      <header className="manage-header-section reveal">
        <div className="title-group">
          <h1><span>CLIENT</span> LIST</h1>
          <p>System initialized. Monitoring inactive, pending, and relevant client records.</p>
        </div>

        <div className="stats-bar">
          <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => { setActiveFilter('All'); setGenderFilter('All'); }}>
            <span className="stat-label">Total Strength</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="stat-item" style={{ cursor: 'pointer' }} onClick={() => setActiveFilter('Active')}>
            <span className="stat-label">🟢 Active Plans</span>
            <span className="stat-value green" style={{ color: '#16a34a' }}>{stats.active}</span>
          </div>
          <div
            className={`stat-item ${genderFilter === 'Male' ? 'active-gender-filter' : ''}`}
            style={{
              cursor: 'pointer',
              border: genderFilter === 'Male' ? '2px solid #2563eb' : '1px solid transparent',
              background: genderFilter === 'Male' ? '#eff6ff' : 'transparent',
              borderRadius: '10px',
              padding: '4px 8px',
              transition: 'all 0.2s'
            }}
            onClick={() => setGenderFilter(prev => prev === 'Male' ? 'All' : 'Male')}
            title="Click to filter by Male clients"
          >
            <span className="stat-label">♂️ Male {genderFilter === 'Male' && '(Filtered)'}</span>
            <span className="stat-value" style={{ color: '#2563eb' }}>{dynamicGenderCounts.male}</span>
          </div>
          <div
            className={`stat-item ${genderFilter === 'Female' ? 'active-gender-filter' : ''}`}
            style={{
              cursor: 'pointer',
              border: genderFilter === 'Female' ? '2px solid #db2777' : '1px solid transparent',
              background: genderFilter === 'Female' ? '#fdf2f8' : 'transparent',
              borderRadius: '10px',
              padding: '4px 8px',
              transition: 'all 0.2s'
            }}
            onClick={() => setGenderFilter(prev => prev === 'Female' ? 'All' : 'Female')}
            title="Click to filter by Female clients"
          >
            <span className="stat-label">♀️ Female {genderFilter === 'Female' && '(Filtered)'}</span>
            <span className="stat-value" style={{ color: '#db2777' }}>{dynamicGenderCounts.female}</span>
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
            {['Inactive', 'Due Payment', 'Reminder', 'Active', 'All'].map(filter => {
              const dueCount = clients.filter(c => calcClientDueDetails(c).effectiveDue > 0).length;
              const label = filter === 'Due Payment' ? `Due Payment (${dueCount})` : (filter === 'Inactive' ? 'Inactive / Pending' : filter);
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
            {genderFilter !== 'All' && (
              <button
                className="filter-pill active"
                onClick={() => setGenderFilter('All')}
                style={{ background: '#f43f5e', borderColor: '#f43f5e' }}
                title="Clear Gender Filter"
              >
                Clear Gender ({genderFilter}) ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-responsive">
          <table className="clients-table">
            <thead>
              <tr>
                <th
                  style={{ width: '6%', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setIdSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  title={`Click to sort by ID (${idSortOrder === 'asc' ? 'Ascending: 1 → 9. Click for Descending' : 'Descending: 9 → 1. Click for Ascending'})`}
                >
                  ID {idSortOrder === 'asc' ? '↑' : '↓'}
                </th>
                <th style={{ width: '20%' }}>Client Name</th>
                <th style={{ width: '14%' }}>Phone Number</th>
                <th style={{ width: '9%' }}>Program</th>
                <th style={{ width: '16%' }}>Payment / Due Status</th>
                <th style={{ width: '16%' }}>Validity</th>
                <th style={{ textAlign: 'right', width: '20%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>Loading clients...</td></tr>
              ) : paginatedClients.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>No clients found.</td></tr>
              ) : paginatedClients.map(client => {
                const validity = getValidityDisplay(client.expiryDate);
                const g = (client.gender || '').toLowerCase().trim();
                const isFemale = g === 'female' || g === 'f';
                return (
                  <tr key={client.id}>
                    <td className="id-cell">{formatShortId(client.clientId || client.id)}</td>
                    <td className="name-cell">
                      <div className="name-avatar-group">
                        <div 
                          className={`client-avatar-mini ${client.profileImage ? 'has-image' : ''}`}
                          onClick={() => client.profileImage && setViewImageModal({
                            isOpen: true,
                            imageUrl: client.profileImage,
                            url: client.profileImage,
                            title: client.name,
                            name: client.name,
                            subtitle: `ID: ${formatShortId(client.clientId || client.id)} • ${client.plan || 'General Membership'}`
                          })}
                          title={client.profileImage ? "Click to view full photo" : client.name}
                          style={{ position: 'relative' }}
                        >
                          {client.profileImage ? (
                            <>
                              <img src={client.profileImage} alt={client.name} />
                              <div className="avatar-hover-overlay">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                              </div>
                            </>
                          ) : (
                            <span className="avatar-fallback">{client.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="name-renew-stack">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="client-name">{client.name}</span>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.68rem',
                                fontWeight: '800',
                                padding: '1px 5px',
                                borderRadius: '100px',
                                background: isFemale ? '#fdf2f8' : '#eff6ff',
                                color: isFemale ? '#db2777' : '#2563eb',
                                border: `1px solid ${isFemale ? '#fbcfe8' : '#bfdbfe'}`,
                                lineHeight: 1
                              }}
                              title={`Gender: ${isFemale ? 'Female' : 'Male'}`}
                            >
                              {isFemale ? '♀' : '♂'}
                            </span>
                          </div>
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
                    <td className="phone-cell">
                      {(() => {
                        const raw = String(client.phone || '').trim();
                        if (!raw || raw === '+91' || raw === '+91 ') return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>-</span>;
                        return raw;
                      })()}
                    </td>
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
                          const discAmt = Number(client.discount || client.discount_amount || 0);
                          return (
                            <div>
                              <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #dcfce7', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', display: 'inline-block' }}>
                                ✓ Fully Paid (₹{actualTotal.toLocaleString()})
                              </span>
                              {discAmt > 0 && (
                                <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: '700', marginTop: '2px' }}>
                                  (₹{(actualTotal + discAmt).toLocaleString()} - ₹{discAmt.toLocaleString()} disc)
                                </div>
                              )}
                            </div>
                          );
                        }
                      })()}
                    </td>
                    <td className="validity-cell">
                      <div className="validity-wrapper">
                        <span className={`days-left ${validity.isExpired ? 'expired' : ''} ${validity.isWarning ? 'warning' : ''}`}>
                          {validity.text}
                        </span>
                        <div className="validity-dates-stack">
                          <span className="expiry-date-line">
                            Start: <strong>{formatDateDDMMYYYY(client.fromDate)}</strong>
                          </span>
                          <span className="expiry-date-line">
                            Exp: <strong>{formatDateDDMMYYYY(client.expiryDate)}</strong>
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="actions-cell">
                      <div className="actions-cell-wrapper">
                        <button
                          className="btn-action-whatsapp"
                          onClick={() => handleSendWhatsAppReminder(client)}
                          title={`Send WhatsApp Reminder to ${client.name}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.012 2c-5.506 0-9.989 4.478-9.989 9.984 0 1.758.459 3.474 1.33 4.982l-1.413 5.163 5.285-1.385c1.455.793 3.096 1.224 4.787 1.224 5.507 0 9.989-4.478 9.989-9.984s-4.482-9.984-9.989-9.984zm5.79 14.161c-.242.684-1.206 1.256-1.97 1.423-.526.113-1.21.204-3.518-.752-2.956-1.226-4.856-4.238-5.004-4.436-.146-.198-1.206-1.606-1.206-3.063 0-1.457.764-2.176 1.036-2.47.272-.294.594-.368.792-.368.198 0 .396.002.569.01.184.009.431-.07.674.513.242.583.83 2.023.903 2.171.073.149.122.322.024.516-.098.194-.147.316-.292.488-.146.172-.307.385-.438.516-.146.146-.298.305-.128.596.17.291.756 1.246 1.621 2.017 1.114.992 2.054 1.3 2.346 1.446.292.146.463.122.634-.073.171-.194.731-.852.927-1.144.195-.292.392-.243.659-.146.267.098 1.683.793 1.975.939.292.146.486.219.559.342.073.123.073.712-.169 1.396z"/>
                          </svg>
                        </button>

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

        {/* Pagination Footer */}
        {filteredClients.length > 0 && (
          <div className="pagination-footer">
            <div className="pagination-info">
              Showing {itemsPerPage > 0 ? Math.min((currentPage - 1) * itemsPerPage + 1, totalItems) : 1} to {itemsPerPage > 0 ? Math.min(currentPage * itemsPerPage, totalItems) : totalItems} of {totalItems} entries
            </div>

            <div className="pagination-controls">
              <div className="per-page-selector">
                <label>Show: </label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="per-page-select"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={0}>All</option>
                </select>
              </div>

              {itemsPerPage > 0 && totalPages > 1 && (
                <div className="pagination-pages">
                  <button
                    className="page-btn nav-btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    ‹ Prev
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
                    .reduce((acc, page, idx, src) => {
                      if (idx > 0 && page - src[idx - 1] > 1) {
                        acc.push('...');
                      }
                      acc.push(page);
                      return acc;
                    }, [])
                    .map((p, idx) => p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="page-ellipsis">...</span>
                    ) : (
                      <button
                        key={p}
                        className={`page-btn ${currentPage === p ? 'active' : ''}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    ))}

                  <button
                    className="page-btn nav-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  >
                    Next ›
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong> ({formatShortId(deleteConfirm.clientId)})?<br />
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
          (b.client_id === c.id || b.clientId === c.id || b.clientCode === c.clientId) && b.status !== 'Cancelled' && b.status !== 'Active'
        );
        const clientPtBookings = (advanceBookings.pt || []).filter(b => 
          (b.client_id === c.id || b.clientId === c.id || b.clientCode === c.clientId) && b.status !== 'Cancelled' && b.status !== 'Active'
        );
        const otherServices = viewClientModal.otherServices || [];

        // Historic Plans Timeline & Records
        const historicPlans = (() => {
          const history = [];
          const bills = viewClientModal.bills || [];
          const ptAssignments = viewClientModal.ptAssignments || [];
          const processedBillIds = new Set();
          const processedPtIds = new Set();

          // 1. Process PT assignments, merging with linked bills
          ptAssignments.forEach(pt => {
            const grossPrice = Number(pt.package_price_snapshot || 0);
            const discAmt = Number(pt.discount_amount || 0);
            const netPrice = Math.max(0, grossPrice - discAmt);

            // Match with bill
            const linkedBill = bills.find(b =>
              (pt.invoice_id && (String(b.id) === String(pt.invoice_id) || String(b.billNo) === String(pt.invoice_id))) ||
              (b.invoice_category === 'PT' && (
                (b.joinDate === pt.assigned_date || b.expiryDate === pt.expiry_date) ||
                (pt.packageName && (b.planName || '').toLowerCase().includes(pt.packageName.toLowerCase()))
              ))
            );

            if (linkedBill) {
              processedBillIds.add(linkedBill.id);
            }
            processedPtIds.add(pt.id);

            const finalAmount = linkedBill ? Number(linkedBill.totalPlanAmount || linkedBill.planAmount || netPrice) : netPrice;
            const finalPaid = linkedBill ? Number(linkedBill.paidAmount || finalAmount) : finalAmount;
            const finalDue = linkedBill ? Number(linkedBill.dueAmount || 0) : 0;
            const finalStatus = pt.status === 'Active' ? 'Active' : (linkedBill?.paymentStatus || pt.status || 'Paid');

            history.push({
              id: `pt-${pt.id}`,
              type: 'Personal Training',
              planName: pt.packageName || linkedBill?.planName || 'PT Package',
              billNo: linkedBill?.billNo || (pt.invoice_id ? `INV-${pt.invoice_id}` : null),
              trainerName: pt.trainerName || 'Assigned',
              classesCompleted: pt.classes_completed || 0,
              totalClasses: pt.total_classes_snapshot || 0,
              startDate: pt.assigned_date || linkedBill?.joinDate || linkedBill?.invoiceDate,
              expiryDate: pt.expiry_date || linkedBill?.expiryDate,
              amount: finalAmount,
              paidAmount: finalPaid,
              dueAmount: finalDue,
              paymentStatus: finalStatus,
              date: pt.assigned_date || linkedBill?.invoiceDate || linkedBill?.joinDate,
              billObj: linkedBill || null,
              ptObj: pt
            });
          });

          // 2. Process remaining bills (General membership, other services, or unmatched PT bills)
          bills.forEach(b => {
            if (processedBillIds.has(b.id)) return;

            const isPt = b.invoice_category === 'PT' || (b.planName && b.planName.toLowerCase().includes('pt package'));
            if (isPt) {
              const alreadyHandled = history.some(item =>
                item.type === 'Personal Training' &&
                (item.billNo === b.billNo || (item.startDate === (b.joinDate || b.invoiceDate) && item.expiryDate === b.expiryDate))
              );
              if (alreadyHandled) return;
            }

            history.push({
              id: `bill-${b.id}`,
              type: b.invoice_category === 'PT' ? 'Personal Training' : (b.invoice_category === 'OtherService' ? 'Other Service' : 'General Membership'),
              planName: b.planName || b.packageName || 'Membership Plan',
              billNo: b.billNo || 'INVOICE',
              startDate: b.joinDate || b.invoiceDate,
              expiryDate: b.expiryDate,
              amount: Number(b.totalPlanAmount || b.planAmount || 0),
              paidAmount: Number(b.paidAmount || 0),
              dueAmount: Number(b.dueAmount || 0),
              paymentStatus: b.paymentStatus || (Number(b.dueAmount) <= 0 ? 'Paid' : 'Due'),
              date: b.invoiceDate || b.joinDate || b.timestamp,
              billObj: b
            });
          });

          clientGenBookings.forEach(b => {
            const exists = history.some(item => item.planName === b.plan_type && item.startDate === b.booking_start_date);
            if (!exists) {
              const net = Math.max(0, Number(b.price || 0) - Number(b.discount_amount || 0));
              history.push({
                id: `gen-adv-${b.id}`,
                type: 'Advance General',
                planName: b.plan_type || 'General Plan',
                startDate: b.booking_start_date,
                expiryDate: b.booking_end_date,
                amount: net,
                paidAmount: net,
                dueAmount: 0,
                paymentStatus: b.status || 'Scheduled',
                date: b.created_at || b.booking_start_date
              });
            }
          });

          clientPtBookings.forEach(b => {
            const exists = history.some(item => item.planName === b.packageName && item.startDate === b.booking_start_date);
            if (!exists) {
              const net = Math.max(0, Number(b.price_snapshot || 0) - Number(b.discount_amount || 0));
              history.push({
                id: `pt-adv-${b.id}`,
                type: 'Advance PT',
                planName: b.packageName || 'PT Package',
                trainerName: b.trainerName || 'Assigned',
                startDate: b.booking_start_date,
                expiryDate: b.expiry_date || b.booking_end_date,
                amount: net,
                paidAmount: net,
                dueAmount: 0,
                paymentStatus: b.status || 'Scheduled',
                date: b.created_at || b.booking_start_date
              });
            }
          });

          otherServices.forEach(s => {
            const exists = history.some(item => item.id === `bill-${s.invoice_id}`);
            if (!exists) {
              history.push({
                id: `svc-${s.id}`,
                type: 'Other Service',
                planName: s.serviceName || 'Service',
                startDate: s.sale_date,
                expiryDate: s.sale_date,
                amount: Number(s.price_snapshot || 0),
                paidAmount: Number(s.price_snapshot || 0),
                dueAmount: 0,
                paymentStatus: s.paymentStatus || 'Paid',
                date: s.sale_date
              });
            }
          });

          if (c.plan && c.fromDate && history.length === 0) {
            const tot = Number(c.amount || 0);
            const pd = c.paidAmount !== undefined && c.paidAmount !== null ? Number(c.paidAmount) : tot;
            const due = Math.max(0, tot - pd);
            history.push({
              id: `current-${c.id}`,
              type: 'General Membership',
              planName: c.plan,
              startDate: c.fromDate,
              expiryDate: c.expiryDate,
              amount: tot,
              paidAmount: pd,
              dueAmount: due,
              paymentStatus: due <= 0 ? 'Paid' : 'Due',
              date: c.fromDate
            });
          }

          history.sort((a, b) => {
            const timeA = new Date(a.startDate || a.date || 0).getTime();
            const timeB = new Date(b.startDate || b.date || 0).getTime();
            return timeB - timeA;
          });

          return history;
        })();

        const activeTab = viewClientModal.activeTab || 'overview';

        const handleOpenPdf = (item) => {
          if (item && item.billObj) {
            setInvoicePreviewClient(item.billObj);
          } else if (item) {
            setInvoicePreviewClient({
              id: c.id,
              clientId: c.clientId,
              name: c.name,
              phone: c.phone,
              gender: c.gender,
              plan: item.planName || c.plan,
              planName: item.planName || c.plan,
              fromDate: item.startDate || c.fromDate,
              expiryDate: item.expiryDate || c.expiryDate,
              amount: item.amount !== undefined ? item.amount : c.amount,
              paidAmount: item.paidAmount !== undefined ? item.paidAmount : c.paidAmount,
              dueAmount: item.dueAmount !== undefined ? item.dueAmount : 0,
              paymentStatus: item.paymentStatus || 'Paid',
              invoiceDate: item.startDate || c.fromDate,
              joinDate: item.startDate || c.fromDate
            });
          }
          setViewClientModal({ isOpen: false, client: null });
        };

        return (
          <div className="alert-modal-overlay">
            <div className="alert-modal-card view-modal-card-landscape reveal" style={{ maxWidth: activeTab === 'history' ? '1000px' : '920px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <button
                className="btn-close-modal"
                onClick={() => setViewClientModal({ isOpen: false, client: null })}
                title="Close / Exit (Esc)"
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 1000,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>

              <div className="landscape-modal-content-wrapper" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                
                {/* Header Segmented Tab Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingRight: '3.5rem', flexShrink: 0 }}>
                  <div style={{ display: 'inline-flex', background: '#e2e8f0', padding: '3px', borderRadius: '10px', gap: '3px' }}>
                    <button
                      type="button"
                      onClick={() => setViewClientModal(prev => ({ ...prev, activeTab: 'overview' }))}
                      style={{
                        padding: '0.45rem 1.1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeTab === 'overview' ? '#ffffff' : 'transparent',
                        color: activeTab === 'overview' ? '#ea580c' : '#64748b',
                        fontWeight: '800',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: activeTab === 'overview' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span>📊 Active Overview</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewClientModal(prev => ({ ...prev, activeTab: 'history' }))}
                      style={{
                        padding: '0.45rem 1.1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeTab === 'history' ? 'linear-gradient(135deg, #4f46e5, #4338ca)' : 'transparent',
                        color: activeTab === 'history' ? '#ffffff' : '#64748b',
                        fontWeight: '800',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: activeTab === 'history' ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span>📜 Historic Plan Details ({historicPlans.length})</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>
                      Client:
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', background: '#ffffff', border: '1px solid #cbd5e1', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
                      {c.name} ({formatShortId(c.clientId)})
                    </span>
                  </div>
                </div>

                {activeTab === 'history' ? (
                  /* Historic Plan Details Full Timeline & Table View */
                  <div className="historic-plans-section" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                    
                    {/* Header Gradient Card */}
                    <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: '#ffffff', padding: '1.1rem 1.5rem', borderRadius: '14px', marginBottom: '1.25rem', boxShadow: '0 8px 20px rgba(30, 27, 75, 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#ffffff', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>📜</span> Complete Client Historic Plan Details
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#c7d2fe', opacity: 0.9 }}>
                          Timeline of all historic general memberships, PT packages, advance bookings, and service invoices
                        </p>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: '900', background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.25)', padding: '0.4rem 0.9rem', borderRadius: '100px', backdropFilter: 'blur(4px)' }}>
                        {historicPlans.length} {historicPlans.length === 1 ? 'Record' : 'Records'} Total
                      </span>
                    </div>

                    {historicPlans.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3rem', background: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                        No historic plan details found for this client.
                      </div>
                    ) : (
                      <div className="table-responsive" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                        <table className="txn-full-table" style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#0f172a', color: '#f8fafc', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              <th style={{ padding: '12px 16px', textAlign: 'center', width: '45px' }}>#</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left' }}>Category</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left' }}>Plan Name & Invoice</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left' }}>Validity Period</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left' }}>Trainer / Details</th>
                              <th style={{ padding: '12px 16px', textAlign: 'left' }}>Amount & Status</th>
                              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historicPlans.map((item, idx) => (
                              <tr key={`${item.id}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#94a3b8' }}>
                                  {idx + 1}
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span className="category-badge" style={{
                                    background: item.type.includes('PT') ? '#f3e8ff' : (item.type.includes('Service') ? '#e0e7ff' : (item.type.includes('Advance') ? '#fff7ed' : '#e0f2fe')),
                                    color: item.type.includes('PT') ? '#7e22ce' : (item.type.includes('Service') ? '#4338ca' : (item.type.includes('Advance') ? '#c2410c' : '#0369a1')),
                                    border: `1px solid ${item.type.includes('PT') ? '#d8b4fe' : (item.type.includes('Service') ? '#c7d2fe' : (item.type.includes('Advance') ? '#ffedd5' : '#bae6fd'))}`,
                                    padding: '4px 9px',
                                    borderRadius: '6px',
                                    fontWeight: '800',
                                    fontSize: '0.75rem',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {item.type}
                                  </span>
                                </td>

                                <td style={{ padding: '12px 16px' }}>
                                  <strong style={{ color: '#0f172a', display: 'block', fontSize: '0.9rem' }}>{item.planName}</strong>
                                  {item.billNo && (
                                    <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: '600' }}>
                                      Invoice #{item.billNo}
                                    </span>
                                  )}
                                </td>

                                <td style={{ padding: '12px 16px', fontWeight: '700', color: '#334155', whiteSpace: 'nowrap' }}>
                                  {formatDateDDMMYYYY(item.startDate)} → {formatDateDDMMYYYY(item.expiryDate)}
                                </td>

                                <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: '#475569' }}>
                                  {item.trainerName ? (
                                    <div>
                                      <strong>Trainer:</strong> {item.trainerName}
                                      {item.totalClasses ? ` (${item.classesCompleted || 0}/${item.totalClasses} classes)` : ''}
                                    </div>
                                  ) : item.totalClasses ? (
                                    <div><strong>Classes:</strong> {item.classesCompleted || 0}/{item.totalClasses}</div>
                                  ) : (
                                    <div>—</div>
                                  )}
                                </td>

                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ fontWeight: '900', color: '#0f172a', fontSize: '0.92rem' }}>₹{item.amount.toLocaleString()}</div>
                                  <span className="mc-status" style={{
                                    background: item.dueAmount > 0 ? '#fff7ed' : '#dcfce7',
                                    color: item.dueAmount > 0 ? '#c2410c' : '#15803d',
                                    border: `1px solid ${item.dueAmount > 0 ? '#ffedd5' : '#bbf7d0'}`,
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    display: 'inline-block',
                                    marginTop: '2px'
                                  }}>
                                    {item.dueAmount > 0 ? `Due ₹${item.dueAmount.toLocaleString()}` : (item.paymentStatus || 'Paid')}
                                  </span>
                                </td>

                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                    <button
                                      type="button"
                                      style={{
                                        padding: '0.35rem 0.7rem',
                                        fontSize: '0.76rem',
                                        background: '#e0f2fe',
                                        color: '#0284c7',
                                        border: '1px solid #bae6fd',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                      }}
                                      onClick={() => handleOpenPdf(item)}
                                      title="View Invoice PDF"
                                    >
                                      📄 PDF
                                    </button>
                                    <button
                                      type="button"
                                      style={{
                                        padding: '0.35rem 0.7rem',
                                        fontSize: '0.76rem',
                                        background: '#fef3c7',
                                        color: '#d97706',
                                        border: '1px solid #fde68a',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                      onClick={() => handleEditHistoryItem(item)}
                                      title="Edit Plan Details"
                                    >
                                      ✏️ Edit
                                    </button>
                                    <button
                                      type="button"
                                      style={{
                                        padding: '0.35rem 0.7rem',
                                        fontSize: '0.76rem',
                                        background: '#fee2e2',
                                        color: '#dc2626',
                                        border: '1px solid #fecaca',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}
                                      onClick={() => handleDeleteHistoryItem(item)}
                                      title="Delete Plan Record"
                                    >
                                      🗑️ Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Standard Landscape Overview View */
                  <div className="landscape-modal-scroll-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div className="landscape-modal-content" style={{ padding: '0.85rem 1rem' }}>
                    {/* Column 1: Profile Info */}
                    <div className="landscape-col profile-col">
                      <div className="landscape-avatar-container">
                        <div 
                          className={`view-modal-avatar-lg ${c.profileImage ? 'has-image' : ''}`}
                          onClick={() => c.profileImage && setViewImageModal({
                            isOpen: true,
                            imageUrl: c.profileImage,
                            url: c.profileImage,
                            title: c.name,
                            name: c.name,
                            subtitle: `ID: ${formatShortId(c.clientId || c.id)} • ${c.plan || 'General Membership'}`
                          })}
                          style={{ cursor: c.profileImage ? 'pointer' : 'default', position: 'relative' }}
                          title={c.profileImage ? "Click to view full photo" : ""}
                        >
                          {c.profileImage ? (
                            <>
                              <img src={c.profileImage} alt={c.name} />
                              <div className="avatar-hover-overlay">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                              </div>
                            </>
                          ) : (
                            <span>{c.name.charAt(0)}</span>
                          )}
                        </div>
                      </div>
                      <div className="profile-main-info">
                        <h2>{c.name}</h2>
                        <div className="view-modal-badges" style={{ justifyContent: 'center' }}>
                          <span className="badge-id">ID: {formatShortId(c.clientId)}</span>
                          <span className={`badge-status ${c.status === 'Active' ? 'active' : 'inactive'}`}>
                            {c.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          {c.profileImage && (
                            <button
                              type="button"
                              className="btn-view-full-image"
                              onClick={() => setViewImageModal({
                                isOpen: true,
                                imageUrl: c.profileImage,
                                url: c.profileImage,
                                title: c.name,
                                name: c.name,
                                subtitle: `ID: ${formatShortId(c.clientId || c.id)} • ${c.plan || 'General Membership'}`
                              })}
                              style={{
                                marginTop: '8px',
                                fontSize: '0.78rem',
                                color: '#ea580c',
                                background: 'rgba(234, 88, 12, 0.08)',
                                border: '1px solid rgba(234, 88, 12, 0.3)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                padding: '4px 10px',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                              View Full Photo
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-whatsapp-reminder-lg"
                            onClick={() => handleSendWhatsAppReminder(c)}
                            style={{
                              marginTop: '8px',
                              fontSize: '0.78rem',
                              color: '#15803d',
                              background: '#dcfce7',
                              border: '1px solid #86efac',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              padding: '4px 10px',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title={`Send WhatsApp Reminder to ${c.name}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12.012 2c-5.506 0-9.989 4.478-9.989 9.984 0 1.758.459 3.474 1.33 4.982l-1.413 5.163 5.285-1.385c1.455.793 3.096 1.224 4.787 1.224 5.507 0 9.989-4.478 9.989-9.984s-4.482-9.984-9.989-9.984zm5.79 14.161c-.242.684-1.206 1.256-1.97 1.423-.526.113-1.21.204-3.518-.752-2.956-1.226-4.856-4.238-5.004-4.436-.146-.198-1.206-1.606-1.206-3.063 0-1.457.764-2.176 1.036-2.47.272-.294.594-.368.792-.368.198 0 .396.002.569.01.184.009.431-.07.674.513.242.583.83 2.023.903 2.171.073.149.122.322.024.516-.098.194-.147.316-.292.488-.146.172-.307.385-.438.516-.146.146-.298.305-.128.596.17.291.756 1.246 1.621 2.017 1.114.992 2.054 1.3 2.346 1.446.292.146.463.122.634-.073.171-.194.731-.852.927-1.144.195-.292.392-.243.659-.146.267.098 1.683.793 1.975.939.292.146.486.219.559.342.073.123.073.712-.169 1.396z"/>
                            </svg>
                            WhatsApp Reminder
                          </button>
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

                  {/* Bottom Row: Additional Data Cards (Overview mode) */}
                  <div className="landscape-bottom-row" style={{ flexShrink: 0, padding: '0 1.25rem 1.25rem 1.25rem' }}>
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
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                              <button
                                type="button"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}
                                onClick={async () => {
                                  if (!window.confirm(`Delete service "${svc.serviceName}"?`)) return;
                                  try {
                                    await deleteOtherServiceSale(svc.id);
                                    setOtherServices(prev => prev.filter(s => s.id !== svc.id));
                                    alert('Service deleted successfully.');
                                  } catch (e) {
                                    alert(e.message || 'Failed to delete service');
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )) : <div className="mini-empty">No Other Services</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

              <div className="view-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', padding: '0.85rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                <button
                  type="button"
                  style={{ padding: '0.55rem 1.25rem', background: '#ffffff', color: '#0284c7', border: '1.5px solid #bae6fd', borderRadius: '10px', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}
                  onClick={() => {
                    setInvoicePreviewClient(c);
                    setViewClientModal({ isOpen: false, client: null });
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  View Bill PDF
                </button>
                {vmDue > 0 && (
                  <button
                    type="button"
                    style={{ padding: '0.55rem 1.25rem', background: 'linear-gradient(135deg, #ea580c, #c2410c)', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)' }}
                    onClick={() => setPaymentModal({ isOpen: true, client: c, amount: vmDue, method: 'CASH', date: new Date().toISOString().split('T')[0] })}
                  >
                    Add Payment (₹{vmDue.toLocaleString()})
                  </button>
                )}
                <button
                  type="button"
                  style={{ padding: '0.55rem 1.25rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onClick={() => setViewClientModal({ isOpen: false, client: null })}
                >
                  Close
                </button>
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
                  <strong style={{ color: '#0f172a' }}>{paymentModal.client.name} ({formatShortId(paymentModal.client.clientId) || 'No ID'})</strong>
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

      {/* Edit Invoice Modal */}
      {editBillModal.isOpen && editBillModal.bill && (
        <div className="alert-modal-overlay" style={{ zIndex: 100005 }}>
          <div className="payment-modal-card reveal" style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>Edit Invoice — {editBillModal.bill.billNo || 'Invoice'}</h3>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#64748b' }}
                onClick={() => setEditBillModal({ isOpen: false, bill: null })}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditBill}>
              <div className="payment-form-group">
                <label className="payment-form-label">Plan / Description</label>
                <input
                  type="text"
                  className="payment-form-input"
                  value={editBillModal.planName}
                  onChange={e => setEditBillModal({ ...editBillModal, planName: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="payment-form-group">
                  <label className="payment-form-label">Total Plan Amount (₹)</label>
                  <input
                    type="number"
                    className="payment-form-input"
                    value={editBillModal.totalPlanAmount}
                    onChange={e => {
                      const total = parseFloat(e.target.value) || 0;
                      const paid = parseFloat(editBillModal.paidAmount) || 0;
                      setEditBillModal({ ...editBillModal, totalPlanAmount: e.target.value, dueAmount: Math.max(0, total - paid) });
                    }}
                    required
                  />
                </div>
                <div className="payment-form-group">
                  <label className="payment-form-label">Paid Amount (₹)</label>
                  <input
                    type="number"
                    className="payment-form-input"
                    value={editBillModal.paidAmount}
                    onChange={e => {
                      const paid = parseFloat(e.target.value) || 0;
                      const total = parseFloat(editBillModal.totalPlanAmount) || 0;
                      setEditBillModal({ ...editBillModal, paidAmount: e.target.value, dueAmount: Math.max(0, total - paid) });
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="payment-form-group">
                  <label className="payment-form-label">Due Balance (₹)</label>
                  <input
                    type="number"
                    className="payment-form-input"
                    value={editBillModal.dueAmount}
                    onChange={e => setEditBillModal({ ...editBillModal, dueAmount: e.target.value })}
                  />
                </div>
                <div className="payment-form-group">
                  <label className="payment-form-label">Discount Amount (₹)</label>
                  <input
                    type="number"
                    className="payment-form-input"
                    value={editBillModal.discount_amount}
                    onChange={e => setEditBillModal({ ...editBillModal, discount_amount: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="payment-form-group">
                  <label className="payment-form-label">From Date / Join Date</label>
                  <input
                    type="date"
                    className="payment-form-input"
                    value={editBillModal.joinDate}
                    onChange={e => setEditBillModal({ ...editBillModal, joinDate: e.target.value })}
                  />
                </div>
                <div className="payment-form-group">
                  <label className="payment-form-label">Expiry Date / To Date</label>
                  <input
                    type="date"
                    className="payment-form-input"
                    value={editBillModal.expiryDate}
                    onChange={e => setEditBillModal({ ...editBillModal, expiryDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="payment-form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="payment-form-label">Invoice Date</label>
                <input
                  type="date"
                  className="payment-form-input"
                  value={editBillModal.invoiceDate}
                  onChange={e => setEditBillModal({ ...editBillModal, invoiceDate: e.target.value })}
                  required
                />
              </div>

              <div className="payment-modal-actions">
                <button type="button" className="btn-payment-cancel" onClick={() => setEditBillModal({ isOpen: false, bill: null })}>Cancel</button>
                <button type="submit" className="btn-payment-submit" disabled={editBillModal.isSaving}>
                  {editBillModal.isSaving ? 'Saving...' : 'Save Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          <div className="renew-modal-card reveal" style={{ maxWidth: '540px' }}>
            <div className="renew-modal-header">
              <div className="renew-header-title">
                <h3>Renew Membership Plan</h3>
                <p className="renew-subtitle">Select a plan to reactivate <strong>{renewModal.client.name}</strong> ({formatShortId(renewModal.client.clientId)})</p>
              </div>
              <button className="btn-close-modal" onClick={() => setRenewModal({ isOpen: false, client: null, plan: '', price: '', discount_amount: '', paidAmount: '', paymentMethod: 'CASH', startDate: '', endDate: '', durationDays: 30, hasGst: false, gstin: '' })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleRenewSubmit} className="renew-modal-form">
              <div className="renew-form-grid">
                {/* SELECT MEMBERSHIP TARIFF */}
                <div className="renew-form-group full-width">
                  <label className="renew-form-label">SELECT MEMBERSHIP TARIFF *</label>
                  <select
                    className="renew-form-input"
                    value={renewModal.plan}
                    onChange={(e) => handleRenewPlanChange(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Membership Plan --</option>
                    {getTariffKeys().map(planBase => {
                      const p = getTariffPrice(planBase);
                      return (
                        <option key={planBase} value={planBase}>
                          {planBase.toUpperCase()} (₹{p.toLocaleString('en-IN')})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* BOOKING START DATE */}
                <div className="renew-form-group">
                  <label className="renew-form-label">BOOKING START DATE *</label>
                  <input
                    type="date"
                    className="renew-form-input"
                    value={renewModal.startDate}
                    onChange={(e) => handleRenewStartDateChange(e.target.value)}
                    required
                  />
                </div>

                {/* COMPUTED END DATE */}
                <div className="renew-form-group">
                  <label className="renew-form-label">COMPUTED END DATE (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    className="renew-form-input readonly"
                    value={renewModal.endDate ? formatDateDDMMYYYY(renewModal.endDate) : ''}
                    readOnly
                    style={{ background: '#f8fafc', fontWeight: '700', color: '#0f172a' }}
                  />
                </div>

                {/* PLAN PRICE */}
                <div className="renew-form-group">
                  <label className="renew-form-label">PLAN PRICE (₹) *</label>
                  <input
                    type="number"
                    className="renew-form-input"
                    value={renewModal.price}
                    onChange={(e) => handleRenewPriceOrDiscountChange('price', e.target.value)}
                    required
                  />
                </div>

                {/* DISCOUNT AMOUNT */}
                <div className="renew-form-group">
                  <label className="renew-form-label">DISCOUNT AMOUNT (₹)</label>
                  <input
                    type="number"
                    className="renew-form-input"
                    placeholder="Optional discount (₹)"
                    value={renewModal.discount_amount}
                    onChange={(e) => handleRenewPriceOrDiscountChange('discount_amount', e.target.value)}
                  />
                </div>

                {/* PAID AMOUNT */}
                <div className="renew-form-group">
                  <label className="renew-form-label">PAID AMOUNT (₹) *</label>
                  <input
                    type="number"
                    className="renew-form-input"
                    value={renewModal.paidAmount}
                    onChange={(e) => setRenewModal(prev => ({ ...prev, paidAmount: e.target.value }))}
                    required
                  />
                </div>

                {/* PAYMENT MODE */}
                <div className="renew-form-group">
                  <label className="renew-form-label">PAYMENT MODE</label>
                  <select
                    className="renew-form-input"
                    value={renewModal.paymentMethod}
                    onChange={(e) => setRenewModal(prev => ({ ...prev, paymentMethod: e.target.value }))}
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">CARD</option>
                    <option value="BANK TRANSFER">BANK TRANSFER</option>
                  </select>
                </div>

                {/* Due Amount Summary Breakdown Card */}
                <div className="renew-form-group full-width">
                  {(() => {
                    const gross = parseFloat(renewModal.price) || 0;
                    const disc = parseFloat(renewModal.discount_amount) || 0;
                    const net = Math.max(0, gross - disc);
                    const paid = renewModal.paidAmount !== '' ? (parseFloat(renewModal.paidAmount) || 0) : net;
                    const due = Math.max(0, net - paid);
                    return (
                      <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.88rem' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>TOTAL PAYABLE:</span>
                          <strong style={{ color: '#0f172a' }}>₹{net.toLocaleString('en-IN')}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.88rem' }}>
                          <span style={{ color: '#64748b', fontWeight: '600' }}>PAID NOW:</span>
                          <strong style={{ color: '#16a34a' }}>₹{paid.toLocaleString('en-IN')}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '0.95rem' }}>
                          <span style={{ color: '#0f172a', fontWeight: '700' }}>DUE BALANCE:</span>
                          <strong style={{ color: due > 0 ? '#ea580c' : '#16a34a' }}>
                            ₹{due.toLocaleString('en-IN')} {due > 0 ? '(Due)' : '(Full Paid)'}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* GST Section */}
                <div className="renew-form-group full-width gst-section">
                  <label className="renew-form-label">B2B GST INVOICE?</label>
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
                      onChange={(e) => setRenewModal(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                    />
                  )}
                </div>
              </div>

              <div className="renew-modal-actions">
                <button
                  type="button"
                  className="btn-renew-cancel"
                  onClick={() => setRenewModal({ isOpen: false, client: null, plan: '', price: '', discount_amount: '', paidAmount: '', paymentMethod: 'CASH', startDate: '', endDate: '', durationDays: 30, hasGst: false, gstin: '' })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-renew-submit"
                  disabled={isRenewing}
                >
                  {isRenewing ? 'Processing Renewal...' : 'PROCEED & RENEW'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Options Modal */}
      {importOptionsModal.isOpen && (
        <div className="alert-overlay" onClick={() => setImportOptionsModal({ isOpen: false, clientsData: [], txnsData: [] })}>
          <div className="alert-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="alert-header">
              <h3>📥 Import Options</h3>
              <button className="btn-close-alert" onClick={() => setImportOptionsModal({ isOpen: false, clientsData: [], txnsData: [] })}>×</button>
            </div>
            <div className="alert-body" style={{ textAlign: 'left', padding: '20px' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#475569', lineHeight: '1.5' }}>
                You are importing <strong>{importOptionsModal.clientsData.length} clients</strong>. You currently have <strong>{clients.length} existing clients</strong> in your database.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  type="button"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                  }}
                  onClick={() => executeImport(importOptionsModal.clientsData, importOptionsModal.txnsData, 'append')}
                >
                  <span>➕ Add On / Append to Existing Data</span>
                  <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '6px' }}>Keep {clients.length} Clients</span>
                </button>

                <button
                  type="button"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)'
                  }}
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to OVERWRITE and DELETE all ${clients.length} existing client records?`)) {
                      executeImport(importOptionsModal.clientsData, importOptionsModal.txnsData, 'overwrite');
                    }
                  }}
                >
                  <span>🔄 Replace All Existing Data</span>
                  <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '6px' }}>Overwrite DB</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Profile Photo Modal */}
      {viewImageModal.isOpen && (
        <div 
          className="image-lightbox-overlay"
          onClick={() => setViewImageModal({ isOpen: false, imageUrl: '', title: '', subtitle: '', url: '', name: '' })}
        >
          <div 
            className="image-lightbox-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="image-lightbox-header">
              <div>
                <h3>{viewImageModal.title || viewImageModal.name || 'Client Profile Photo'}</h3>
                {viewImageModal.subtitle && <p>{viewImageModal.subtitle}</p>}
              </div>
              <button
                type="button"
                className="image-lightbox-close"
                onClick={() => setViewImageModal({ isOpen: false, imageUrl: '', title: '', subtitle: '', url: '', name: '' })}
                title="Close (Esc)"
              >
                &times;
              </button>
            </div>
            <div className="image-lightbox-body">
              <img 
                src={viewImageModal.imageUrl || viewImageModal.url} 
                alt={viewImageModal.title || viewImageModal.name || 'Full Profile Photo'} 
                className="image-lightbox-img"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageClientsPage;
