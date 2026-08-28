import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPtAssignments, getClients, getTrainers, getPtPackages, addPtAssignment, updatePtAssignment, deletePtAssignment, getPtClassHistory } from '../api';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import { formatShortId } from '../utils/formatShortId';
import './PTAssignmentPage.css';

const SingleTimePickerInput = ({ label, value, onChange, placeholder, autoFocus, alignRight }) => {
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = React.useRef(null);

  const parse12Hour = (str) => {
    if (!str) return { hour: '10', minute: '00', ampm: 'AM' };
    const match = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      if (h < 1) h = 12;
      if (h > 12) h = h % 12 || 12;
      const hStr = String(h).padStart(2, '0');
      const mStr = match[2];
      const ap = (match[3] || 'AM').toUpperCase();
      return { hour: hStr, minute: mStr, ampm: ap };
    }
    return { hour: '10', minute: '00', ampm: 'AM' };
  };

  const currentParsed = parse12Hour(value);
  const [selHour, setSelHour] = useState(currentParsed.hour);
  const [selMin, setSelMin] = useState(currentParsed.minute);
  const [selAmPm, setSelAmPm] = useState(currentParsed.ampm);

  const handleOpenPicker = () => {
    const parsed = parse12Hour(value);
    setSelHour(parsed.hour);
    setSelMin(parsed.minute);
    setSelAmPm(parsed.ampm);
    setShowPicker(prev => !prev);
  };

  const handleApply = (h = selHour, m = selMin, ap = selAmPm) => {
    const formatted = `${h}:${m} ${ap}`;
    onChange(formatted);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hoursList = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutesList = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  return (
    <div className="single-time-picker-container" ref={containerRef} style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
      {label && (
        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
        <input
          type="text"
          placeholder={placeholder || "e.g. 10:00 AM"}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.6rem 4.4rem 0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.88rem',
            fontWeight: '600',
            boxSizing: 'border-box',
            outline: 'none',
            background: '#ffffff'
          }}
          autoFocus={autoFocus}
        />
        
        <button
          type="button"
          onClick={handleOpenPicker}
          title="Open 12-Hour AM/PM Time Picker"
          style={{
            position: 'absolute',
            right: '4px',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '4px 7px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            fontSize: '0.75rem',
            fontWeight: '800',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Picker</span>
        </button>
      </div>

      {showPicker && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          ...(alignRight ? { right: 0 } : { left: 0 }),
          zIndex: 1000,
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '12px',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
          padding: '0.85rem',
          width: '265px',
          maxWidth: '85vw',
          boxSizing: 'border-box'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{label || 'SELECT TIME'}</span>
            <span style={{ color: '#ea580c', fontWeight: '900', fontSize: '0.85rem' }}>{selHour}:{selMin} {selAmPm}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '0.4rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>HOUR</label>
              <select
                value={selHour}
                onChange={e => {
                  const h = e.target.value;
                  setSelHour(h);
                  handleApply(h, selMin, selAmPm);
                }}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.2rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  background: '#f8fafc',
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
              >
                {hoursList.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>MINUTE</label>
              <select
                value={selMin}
                onChange={e => {
                  const m = e.target.value;
                  setSelMin(m);
                  handleApply(selHour, m, selAmPm);
                }}
                style={{
                  width: '100%',
                  padding: '0.4rem 0.2rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  background: '#f8fafc',
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
              >
                {minutesList.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>AM / PM</label>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '6px', height: '33px', boxSizing: 'border-box' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelAmPm('AM');
                    handleApply(selHour, selMin, 'AM');
                  }}
                  style={{
                    flex: 1,
                    borderRadius: '4px',
                    border: 'none',
                    background: selAmPm === 'AM' ? '#ea580c' : 'transparent',
                    color: selAmPm === 'AM' ? '#ffffff' : '#64748b',
                    fontWeight: '800',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelAmPm('PM');
                    handleApply(selHour, selMin, 'PM');
                  }}
                  style={{
                    flex: 1,
                    borderRadius: '4px',
                    border: 'none',
                    background: selAmPm === 'PM' ? '#ea580c' : 'transparent',
                    color: selAmPm === 'PM' ? '#ffffff' : '#64748b',
                    fontWeight: '800',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPicker(false)}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

const TimingPickerInput = ({ value, onChange, style, autoFocus }) => {
  const parseRange = (val) => {
    if (!val) return { from: '', to: '' };
    const str = String(val).trim();
    if (!str) return { from: '', to: '' };
    const parts = str.split(/\s*(?:[-–—]|(?:\bto\b))\s*/i).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { from: parts[0], to: parts[1] };
    } else if (parts.length === 1) {
      return { from: parts[0], to: '' };
    }
    return { from: '', to: '' };
  };

  const parsed = parseRange(value);
  const [fromTime, setFromTime] = useState(parsed.from);
  const [toTime, setToTime] = useState(parsed.to);

  useEffect(() => {
    const p = parseRange(value);
    setFromTime(p.from);
    setToTime(p.to);
  }, [value]);

  const updateRange = (newFrom, newTo) => {
    setFromTime(newFrom);
    setToTime(newTo);
    const cleanFrom = newFrom ? newFrom.trim() : '';
    const cleanTo = newTo ? newTo.trim() : '';
    if (cleanFrom && cleanTo) {
      onChange(`${cleanFrom} - ${cleanTo}`);
    } else if (cleanFrom) {
      onChange(cleanFrom);
    } else if (cleanTo) {
      onChange(cleanTo);
    } else {
      onChange('');
    }
  };

  return (
    <div className="time-range-picker-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%', boxSizing: 'border-box', ...style }}>
      <div style={{ display: 'flex', gap: '0.75rem', width: '100%', flexWrap: 'wrap', boxSizing: 'border-box' }}>
        <div style={{ flex: '1 1 180px', minWidth: '0', boxSizing: 'border-box' }}>
          <SingleTimePickerInput
            label="From Time"
            value={fromTime}
            onChange={val => updateRange(val, toTime)}
            placeholder="e.g. 10:00 AM"
            autoFocus={autoFocus}
            alignRight={false}
          />
        </div>
        <div style={{ flex: '1 1 180px', minWidth: '0', boxSizing: 'border-box' }}>
          <SingleTimePickerInput
            label="To Time"
            value={toTime}
            onChange={val => updateRange(fromTime, val)}
            placeholder="e.g. 11:00 AM"
            alignRight={true}
          />
        </div>
      </div>
      {(fromTime || toTime) && (
        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', background: '#f8fafc', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', boxSizing: 'border-box' }}>
          <span style={{ color: '#ea580c', fontWeight: '800' }}>Slot Range:</span>
          <span>{fromTime || '—'} to {toTime || '—'}</span>
        </div>
      )}
    </div>
  );
};

const PTAssignmentPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId');
  const handledPreselectedRef = React.useRef(null);

  const [isDirty, setIsDirty] = useState(false);
  const [blockedTargetUrl, setBlockedTargetUrl] = useState('');
  const [isConfirmExitOpen, setIsConfirmExitOpen] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientModalSearch, setClientModalSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrainer, setFilterTrainer] = useState('');
  const [filterStatus, setFilterStatus] = useState('Active');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [invoiceClient, setInvoiceClient] = useState(null);
  const [gstError, setGstError] = useState('');

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

  const isValidGSTIN = (gstin) => {
    if (!gstin) return false;
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(gstin.trim().toUpperCase());
  };

  const isClientActive = (c) => {
    if (!c) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (c.status === 'inactive' || c.status === 'Inactive' || c.status === 'Expired') {
      return false;
    }
    if (c.expiryDate) {
      const exp = new Date(c.expiryDate);
      exp.setHours(0, 0, 0, 0);
      if (exp < today) return false;
    }
    return true;
  };

  const [inactiveWarningModal, setInactiveWarningModal] = useState({
    isOpen: false,
    client: null
  });

  const calculateNextDayDate = (dateStr) => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch (e) {
      return dateStr;
    }
  };

  // Duplicate PT Warning Modal
  const [duplicateModal, setDuplicateModal] = useState({
    isOpen: false,
    endDate: '',
    nextStartDate: '',
    clientId: '',
    clientName: '',
    trainerName: '',
    trainerId: '',
    packageId: ''
  });

  // History Modal State
  const [historyModal, setHistoryModal] = useState({
    isOpen: false,
    assignment: null,
    logs: [],
    loading: false
  });

  const [formData, setFormData] = useState({
    client_id: preselectedClientId || '',
    trainer_id: '',
    pt_package_id: '',
    is_custom: false,
    custom_name: 'Custom Package',
    custom_price: '',
    custom_total_classes: '',
    custom_duration_days: 30,
    discount_amount: '',
    assigned_date: new Date().toISOString().split('T')[0],
    timing: ''
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editFormData, setEditFormData] = useState({
    trainer_id: '',
    pt_package_id: '',
    assigned_date: '',
    discount_amount: '',
    timing: ''
  });

  const [timingModal, setTimingModal] = useState({
    isOpen: false,
    assignment: null,
    timing: ''
  });

  const handleOpenTimingModal = (item) => {
    setTimingModal({
      isOpen: true,
      assignment: item,
      timing: item.timing || ''
    });
  };

  const handleSaveTiming = async (e) => {
    e.preventDefault();
    if (!timingModal.assignment) return;
    try {
      await updatePtAssignment(timingModal.assignment.id, {
        timing: timingModal.timing ? timingModal.timing.trim() : ''
      });
      setTimingModal({ isOpen: false, assignment: null, timing: '' });
      showCustomAlert('Timing Updated', 'The workout timing has been updated successfully.');
      loadAllData();
    } catch (err) {
      showCustomAlert('Update Error', err.message || 'Failed to update workout timing.');
    }
  };

  const handleOpenEditModal = (item) => {
    setEditingAssignment(item);
    setEditFormData({
      trainer_id: item.trainer_id || '',
      pt_package_id: item.pt_package_id || '',
      assigned_date: item.assigned_date || new Date().toISOString().split('T')[0],
      discount_amount: item.discount_amount || '',
      timing: item.timing || ''
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingAssignment) return;
    try {
      const classesStarted = parseInt(editingAssignment.classes_completed || 0, 10) > 0;
      const payload = classesStarted
        ? { timing: editFormData.timing ? editFormData.timing.trim() : '' }
        : editFormData;

      await updatePtAssignment(editingAssignment.id, payload);
      setIsEditModalOpen(false);
      setEditingAssignment(null);
      showCustomAlert('Assignment Updated', 'The PT assignment details have been updated successfully.');
      loadAllData();
    } catch (err) {
      showCustomAlert('Update Error', err.message || 'Failed to update PT assignment.');
    }
  };

  const handleDeleteAssignment = (item) => {
    if (parseInt(item.classes_completed || 0, 10) > 0) {
      showCustomAlert(
        'Cannot Delete Assignment',
        `PT classes for ${item.clientName} have already started (${item.classes_completed} classes conducted).\n\nDeletion is only allowed before any classes have been conducted.`
      );
      return;
    }
    showCustomConfirm(
      'Delete PT Assignment',
      `Are you sure you want to delete the PT assignment for client ${item.clientName}? This action cannot be undone.`,
      async () => {
        try {
          await deletePtAssignment(item.id);
          showCustomAlert('Assignment Deleted', 'The PT assignment has been deleted successfully.');
          loadAllData();
        } catch (err) {
          showCustomAlert('Delete Error', err.message || 'Failed to delete PT assignment.');
        }
      }
    );
  };

  useEffect(() => {
    loadAllData();
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

      if (target.closest('.alert-modal-card') || target.closest('.trainer-modal-content')) {
        return; // Ignore inside modals
      }

      const href = target.getAttribute('href');
      
      if (href && !href.startsWith('#/pt-assignment') && href !== '#') {
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
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setFilterStatus(statusParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (preselectedClientId && clients.length > 0 && handledPreselectedRef.current !== preselectedClientId) {
      handledPreselectedRef.current = preselectedClientId;
      const selClient = clients.find(c => String(c.id) === String(preselectedClientId));
      if (selClient) {
        if (!isClientActive(selClient)) {
          setInactiveWarningModal({
            isOpen: true,
            client: selClient
          });
          setFormData(prev => ({
            ...prev,
            client_id: '',
            hasGst: false,
            gstin: ''
          }));
        } else {
          setFormData(prev => ({ 
            ...prev, 
            client_id: preselectedClientId,
            hasGst: !!selClient?.gstin,
            gstin: selClient?.gstin || '' 
          }));
        }
        setIsModalOpen(true);
      }
    }
  }, [preselectedClientId, clients]);

  const loadAllData = async () => {
    try {
      const [assignRes, clientRes, trainerRes, pkgRes] = await Promise.all([
        getPtAssignments(),
        getClients(),
        getTrainers(),
        getPtPackages()
      ]);
      setAssignments(assignRes);
      setClients(clientRes);
      setTrainers(trainerRes);
      setPackages(pkgRes);
    } catch (error) {
      console.error('Failed to load assignment data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    const selClient = clients.find(c => c.id === (preselectedClientId || ''));
    const isAct = isClientActive(selClient);
    setFormData({
      client_id: isAct ? (preselectedClientId || '') : '',
      trainer_id: '',
      pt_package_id: '',
      is_custom: false,
      custom_name: 'Custom Package',
      custom_price: '',
      custom_total_classes: '',
      custom_duration_days: 30,
      assigned_date: new Date().toISOString().split('T')[0],
      timing: '',
      hasGst: isAct ? !!selClient?.gstin : false,
      gstin: isAct ? (selClient?.gstin || '') : ''
    });
    setGstError('');
    setIsModalOpen(true);
  };

  const selectedTrainer = trainers.find(t => t.id === formData.trainer_id);

  // Filter catalog packages where selected trainer's grade is eligible
  const eligibleCatalogPackages = packages.filter(pkg => {
    if (!pkg.active || pkg.is_custom) return false;
    if (!selectedTrainer || !selectedTrainer.grade) return false;
    if (pkg.category === 'Kid') return true;
    return (pkg.eligible_grades || []).includes(selectedTrainer.grade);
  });

  const handleTrainerChange = (e) => {
    setIsDirty(true);
    const tId = e.target.value;
    setFormData(prev => ({
      ...prev,
      trainer_id: tId,
      pt_package_id: '',
      is_custom: false
    }));
  };

  const handlePackageChange = (e) => {
    setIsDirty(true);
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setFormData(prev => ({
        ...prev,
        pt_package_id: '',
        is_custom: true
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        pt_package_id: val,
        is_custom: false
      }));
    }
  };

  const handleProceedExit = () => {
    setIsDirty(false);
    setIsConfirmExitOpen(false);
    const url = blockedTargetUrl.startsWith('#') ? blockedTargetUrl.substring(1) : blockedTargetUrl;
    navigate(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.client_id || !formData.trainer_id) {
      alert('Please select a Client and a Trainer.');
      return;
    }

    const selClient = clients.find(c => String(c.id) === String(formData.client_id));
    if (selClient && !isClientActive(selClient)) {
      setInactiveWarningModal({
        isOpen: true,
        client: selClient
      });
      return;
    }

    if (!selectedTrainer || !selectedTrainer.grade) {
      alert('Selected trainer has no assigned Grade. Please assign a Grade on Trainer Management first.');
      return;
    }

    if (formData.is_custom) {
      if (!formData.custom_price || parseFloat(formData.custom_price) <= 0) {
        alert('Custom package price must be greater than 0.');
        return;
      }
      if (!formData.custom_total_classes || parseInt(formData.custom_total_classes, 10) <= 0) {
        alert('Custom package total classes must be greater than 0.');
        return;
      }
    } else if (!formData.pt_package_id) {
      alert('Please select a PT Package or choose Custom Package.');
      return;
    }

    // Check for existing active PT package for this client
    const today = new Date().toISOString().split('T')[0];
    const activeAssign = assignments.find(a => a.client_id === formData.client_id && a.status === 'Active' && a.expiry_date >= today);
    if (activeAssign) {
      const nextStart = calculateNextDayDate(activeAssign.expiry_date);
      setDuplicateModal({
        isOpen: true,
        endDate: activeAssign.expiry_date,
        nextStartDate: nextStart,
        clientId: formData.client_id,
        clientName: selClient?.name || 'Client',
        trainerName: selectedTrainer?.name || 'Assigned Trainer',
        trainerId: formData.trainer_id,
        packageId: formData.pt_package_id
      });
      return;
    }

    if (formData.hasGst) {
      if (!formData.gstin || !isValidGSTIN(formData.gstin)) {
        setGstError('Please enter a valid 15-character GSTIN (e.g. 33ABCDE1234F1Z5)');
        return;
      }
    }
    setGstError('');

    try {
      const payload = {
        client_id: formData.client_id,
        trainer_id: formData.trainer_id,
        assigned_date: formData.assigned_date,
        discount_amount: parseFloat(formData.discount_amount || 0),
        hasGst: formData.hasGst,
        gstin: formData.hasGst ? formData.gstin.trim().toUpperCase() : null,
        timing: formData.timing ? formData.timing.trim() : null,
        ...(formData.is_custom
          ? {
              custom_package: {
                name: formData.custom_name || 'Custom Package',
                price: parseFloat(formData.custom_price),
                total_classes: parseInt(formData.custom_total_classes, 10),
                duration_days: parseInt(formData.custom_duration_days || 30, 10),
                category: 'Adult',
                eligible_grade: selectedTrainer.grade
              }
            }
          : { pt_package_id: formData.pt_package_id })
      };

      const result = await addPtAssignment(payload);
      setIsDirty(false);
      setIsModalOpen(false);

      // Clear ?clientId= from URL query params so reloading data or rerenders won't reopen the modal
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('clientId');
        return next;
      }, { replace: true });
      
      const selPackage = packages.find(p => p.id === formData.pt_package_id);
      
      handleGeneratePtInvoice({
        id: result?.id || Date.now(),
        clientName: result?.clientName || selClient?.name || 'Client',
        clientPhone: result?.clientPhone || selClient?.phone || '',
        clientCode: result?.clientCode || selClient?.clientId || '',
        packageName: result?.packageName || (formData.is_custom ? formData.custom_name : selPackage?.name) || 'PT Package',
        trainerName: result?.trainerName || selectedTrainer?.name || '',
        package_price_snapshot: result?.package_price_snapshot || (formData.is_custom ? parseFloat(formData.custom_price) : selPackage?.price) || 0,
        discount_amount: result?.discount_amount !== undefined ? parseFloat(result.discount_amount) : parseFloat(formData.discount_amount || 0),
        assigned_date: formData.assigned_date,
        expiry_date: result?.expiry_date || '',
        billNo: result?.billNo || `INV-PT-${result?.id || Date.now()}`,
        gstin: formData.hasGst ? formData.gstin.trim().toUpperCase() : null
      });

      loadAllData();
    } catch (error) {
      if (error.message && error.message.includes('already has an active PT package')) {
        const match = error.message.match(/until\s+([0-9\-]+)/);
        const endDateStr = match ? match[1] : today;
        const nextStart = calculateNextDayDate(endDateStr);
        setDuplicateModal({
          isOpen: true,
          endDate: endDateStr,
          nextStartDate: nextStart,
          clientId: formData.client_id,
          clientName: selClient?.name || 'Client',
          trainerName: selectedTrainer?.name || 'Assigned Trainer',
          trainerId: formData.trainer_id,
          packageId: formData.pt_package_id
        });
      } else {
        alert(error.message || 'Failed to assign PT package.');
      }
    }
  };

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'Active') {
      setFilterStatus('Active');
    } else if (statusParam === 'Inactive') {
      setFilterStatus('Inactive');
    }
  }, [searchParams]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const normalizeDateToISO = (dStr) => {
    if (!dStr) return '';
    const str = String(dStr).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.substring(0, 10);
    }
    const match = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
    return '';
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [filterTrainer, filterStatus, searchQuery, fromDate, toDate]);

  const filteredAssignments = assignments.filter(a => {
    // 1. Filter Trainer
    if (filterTrainer && String(a.trainer_id) !== String(filterTrainer)) return false;

    // 2. Filter Status (Active, Inactive, Completed)
    if (filterStatus) {
      const today = new Date().toISOString().split('T')[0];
      const st = (a.status || '').trim().toLowerCase();
      const isDateExpired = a.expiry_date && a.expiry_date < today;
      const isClassesCompleted = a.total_classes_snapshot > 0 && a.classes_completed >= a.total_classes_snapshot;

      if (filterStatus === 'Active') {
        if (st !== 'active' || isDateExpired || isClassesCompleted) return false;
      } else if (filterStatus === 'Inactive') {
        const isInactive = st === 'inactive' || st === 'expired' || st === 'cancelled' || isDateExpired;
        if (!isInactive) return false;
      } else if (filterStatus === 'Completed') {
        if (st !== 'completed' && !isClassesCompleted) return false;
      }
    }

    // 3. Date Range Filter (From Date and To Date based on Assigned Date)
    if (fromDate || toDate) {
      const assignDateISO = normalizeDateToISO(a.assigned_date || a.created_at);
      if (assignDateISO) {
        if (fromDate && assignDateISO < fromDate) return false;
        if (toDate && assignDateISO > toDate) return false;
      }
    }

    // 4. Search Query
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const cName = (a.clientName || '').toLowerCase();
      const cCode = (a.clientCode || a.client_id || '').toLowerCase();
      const cPhone = (a.clientPhone || '').toLowerCase();
      const tName = (a.trainerName || '').toLowerCase();
      const pName = (a.packageName || '').toLowerCase();
      const timingStr = (a.timing || '').toLowerCase();
      const matches = cName.includes(q) || cCode.includes(q) || cPhone.includes(q) || tName.includes(q) || pName.includes(q) || timingStr.includes(q);
      if (!matches) return false;
    }

    return true;
  });


  const totalItems = filteredAssignments.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentAssignments = filteredAssignments.slice(startIndex, endIndex);

  const openHistoryModal = async (assignment) => {
    setHistoryModal({ isOpen: true, assignment, logs: [], loading: true });
    try {
      const logs = await getPtClassHistory({ pt_assignment_id: assignment.id });
      setHistoryModal({ isOpen: true, assignment, logs, loading: false });
    } catch (err) {
      console.error('Failed to fetch assignment history:', err);
      setHistoryModal({ isOpen: true, assignment, logs: [], loading: false });
    }
  };

  const handleGeneratePtInvoice = (item) => {
    const grossPrice = parseFloat(item.package_price_snapshot || item.price || 0);
    const disc = parseFloat(item.discount_amount || item.billDiscount || item.advDiscount || 0);
    const netPrice = Math.max(0, grossPrice - disc);

    setInvoiceClient({
      name: item.clientName,
      phone: item.clientPhone || item.mobile || '',
      clientId: item.clientCode || item.client_id || '',
      plan: `PT Package — ${item.packageName} (${item.trainerName || 'Assigned Trainer'})`,
      amount: netPrice,
      paidAmount: netPrice,
      totalPlanAmount: netPrice,
      dueAmount: 0,
      paymentStatus: 'Paid',
      paymentMethod: item.paymentMethod || 'CASH',
      fromDate: item.assigned_date,
      expiryDate: item.expiry_date || 'N/A',
      billNo: item.billNo || `INV-PT-${item.id}`,
      discount_amount: disc,
      client_gstin_snapshot: item.gstin || item.client_gstin_snapshot || null
    });
  };

  const formatCurrency = (val) => `₹${(val || 0).toLocaleString('en-IN')}`;

  const getGradeLabel = (grade) => {
    if (!grade) return 'NO GRADE';
    if (grade === 'A_PRO_PT') return 'A PRO PT';
    if (grade === 'A') return 'GRADE A';
    if (grade === 'B') return 'GRADE B';
    return grade;
  };

  return (
    <div className="pt-assign-container">
      <header className="pt-assign-header">
        <div className="title-group">
          <h1><span>PT ASSIGNMENT</span> PORTAL</h1>
          <p>Assign PT Packages to clients & track completed class progress.</p>
        </div>
        <button className="btn-assign-new" onClick={handleOpenModal}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Assign PT Package
        </button>
      </header>

      {/* Filter Bar */}
      <div className="assign-filters-bar">
        <div className="assign-filter-group" style={{ flex: '1 1 240px', minWidth: '220px' }}>
          <label>Search Client / Trainer / Package</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '42px' }}>
            <svg
              style={{ position: 'absolute', left: '10px', color: '#94a3b8', pointerEvents: 'none' }}
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search by client name, code, phone, trainer..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.1rem', width: '100%', boxSizing: 'border-box', height: '100%' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  padding: '2px 6px'
                }}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="assign-filter-group" style={{ minWidth: '170px' }}>
          <label>Filter Trainer</label>
          <select value={filterTrainer} onChange={e => setFilterTrainer(e.target.value)}>
            <option value="">All Trainers</option>
            {trainers.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.grade || 'No Grade'})</option>
            ))}
          </select>
        </div>

        <div className="assign-filter-group" style={{ minWidth: '150px' }}>
          <label>Filter Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <div className="assign-filter-group" style={{ minWidth: '140px' }}>
          <label>From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
          />
        </div>

        <div className="assign-filter-group" style={{ minWidth: '140px' }}>
          <label>To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
          />
        </div>

        {(fromDate || toDate || filterStatus !== 'Active' || filterTrainer || searchQuery) && (
          <button
            type="button"
            className="btn-clear-filters"
            onClick={() => {
              setFromDate('');
              setToDate('');
              setFilterStatus('Active');
              setFilterTrainer('');
              setSearchQuery('');
            }}
            title="Reset all filters"
          >
            ✕ Reset
          </button>
        )}
      </div>

      <div className="assign-table-card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading assignments...</div>
        ) : filteredAssignments.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>No PT assignments found.</div>
        ) : (
          <>
            <div className="assign-table-wrapper">
              <table className="assign-table">
                <thead>
                  <tr>
                    <th>Client Name</th>
                    <th>Trainer & Grade</th>
                    <th>Timing</th>
                    <th>Package</th>
                    {isSuperAdmin && <th>Package Price</th>}
                    <th>Class Progress</th>
                    <th>Assigned Date</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentAssignments.map(item => {
                    const pct = item.total_classes_snapshot > 0
                      ? Math.min(100, Math.round((item.classes_completed / item.total_classes_snapshot) * 100))
                      : 0;

                    const todayStr = new Date().toISOString().split('T')[0];
                    const isExpired = (item.status || '').toLowerCase() === 'expired' || (item.expiry_date && item.expiry_date < todayStr);
                    const isCompleted = (item.status || '').toLowerCase() === 'completed' || (item.total_classes_snapshot > 0 && item.classes_completed >= item.total_classes_snapshot);
                    const isCancelled = (item.status || '').toLowerCase() === 'cancelled';

                    let displayStatus = 'ACTIVE';
                    let statusClass = 'active-status';

                    if (isCancelled) {
                      displayStatus = 'CANCELLED';
                      statusClass = 'cancelled-status';
                    } else if (isCompleted) {
                      displayStatus = 'COMPLETED';
                      statusClass = 'completed-status';
                    } else if (isExpired) {
                      displayStatus = 'EXPIRED';
                      statusClass = 'expired-status';
                    }

                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.95rem' }}>{item.clientName}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '500' }}>{formatShortId(item.clientCode || item.client_id)}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{item.trainerName}</div>
                          <span className={`grade-badge ${(item.trainerGrade || 'unassigned').toLowerCase()}`}>
                            {getGradeLabel(item.trainerGrade)}
                          </span>
                        </td>
                        <td
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleOpenTimingModal(item)}
                          title="Click to edit workout timing"
                        >
                          {item.timing ? (
                            <span className="timing-pill">
                              ⏱️ {item.timing}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              — Not set — <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>✏️</span>
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{item.packageName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.packageCategory} ({item.duration_days || 30} days)</div>
                        </td>
                        {isSuperAdmin && (() => {
                          const priceSnap = parseFloat(item.package_price_snapshot || 0);
                          const catalogPrice = parseFloat(item.catalogPrice || item.original_price || 0);
                          let disc = parseFloat(item.discount_amount || item.billDiscount || item.advDiscount || 0);

                          if (disc <= 0 && catalogPrice > priceSnap) {
                            disc = catalogPrice - priceSnap;
                          }

                          let gross = priceSnap;
                          let net = priceSnap;

                          if (disc > 0) {
                            if (catalogPrice > 0 && Math.abs(catalogPrice - priceSnap) < 1) {
                              gross = catalogPrice;
                              net = Math.max(0, catalogPrice - disc);
                            } else if (catalogPrice > 0 && catalogPrice > priceSnap) {
                              gross = catalogPrice;
                              net = priceSnap;
                            } else {
                              gross = priceSnap + disc;
                              net = priceSnap;
                            }
                          }

                          return (
                            <td style={{ fontWeight: '800', color: '#059669', fontSize: '0.95rem' }}>
                              <div>{formatCurrency(net)}</div>
                              {disc > 0 && (
                                <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: '700', marginTop: '2px' }}>
                                  (₹{gross.toLocaleString('en-IN')} - ₹{disc.toLocaleString('en-IN')} disc)
                                </div>
                              )}
                            </td>
                          );
                        })()}
                        <td className="progress-cell">
                          <div className="progress-bar-wrapper">
                            <div className="progress-text">
                              {item.classes_completed} / {item.total_classes_snapshot} Classes ({pct}%)
                            </div>
                            <div className="progress-bar-bg">
                              <div className="progress-bar-fill" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#475569', fontWeight: '500' }}>{formatDateDDMMYYYY(item.assigned_date)}</td>
                        <td style={{ fontSize: '0.85rem', fontWeight: '700', color: item.status === 'Expired' ? '#d97706' : '#0f172a' }}>
                          {formatDateDDMMYYYY(item.expiry_date)}
                        </td>
                        <td>
                          <span className={`status-pill ${statusClass}`}>{displayStatus}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button
                              className="btn-invoice-pt"
                              onClick={() => handleGeneratePtInvoice(item)}
                              title="View Invoice"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                              Invoice
                            </button>
                            <button
                              className="btn-history-pt"
                              onClick={() => openHistoryModal(item)}
                              title="View Class History"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                              History
                            </button>

                            {/* Edit & Delete Actions */}
                            {(() => {
                              const isActive = displayStatus === 'ACTIVE' || (item.status || '').toLowerCase() === 'active' || parseInt(item.classes_completed || 0, 10) > 0;
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(item)}
                                    disabled={isActive}
                                    style={{
                                      padding: '0.35rem 0.65rem',
                                      fontSize: '0.78rem',
                                      fontWeight: '700',
                                      borderRadius: '6px',
                                      border: isActive ? '1px solid #cbd5e1' : '1px solid #cbd5e1',
                                      background: isActive ? '#f1f5f9' : '#ffffff',
                                      color: isActive ? '#94a3b8' : '#334155',
                                      cursor: isActive ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      opacity: isActive ? 0.6 : 1
                                    }}
                                    title={isActive ? 'Cannot edit: PT assignment is currently Active' : 'Edit PT Assignment Details'}
                                  >
                                    ✏️ Edit
                                  </button>

                                  {isSuperAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAssignment(item)}
                                      disabled={isActive}
                                      style={{
                                        padding: '0.35rem 0.65rem',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        borderRadius: '6px',
                                        border: isActive ? '1px solid #cbd5e1' : '1px solid #fca5a5',
                                        background: isActive ? '#f1f5f9' : '#fef2f2',
                                        color: isActive ? '#94a3b8' : '#dc2626',
                                        cursor: isActive ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        opacity: isActive ? 0.6 : 1
                                      }}
                                      title={isActive ? 'Cannot delete: PT assignment is currently Active' : 'Delete PT Assignment'}
                                    >
                                      🗑️ Delete
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="assign-pagination">
              <div className="pagination-info">
                Showing <span>{totalItems > 0 ? startIndex + 1 : 0}</span> to <span>{endIndex}</span> of <span>{totalItems}</span> assignments
              </div>
              <div className="pagination-controls">
                <div className="rows-per-page">
                  <label>Rows per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="pagination-pages">
                  <button
                    className="btn-page-nav"
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    ‹ Prev
                  </button>
                  <span className="page-indicator">
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                  </span>
                  <button
                    className="btn-page-nav"
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="trainer-modal-overlay">
          <div className="trainer-modal-content animated-scale-in">
            <div className="trainer-modal-header">
              <h2>Assign PT Package</h2>
              <button className="btn-close" onClick={() => { setIsModalOpen(false); setIsDirty(false); }}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="trainer-form">

              {/* Select Client */}
              <div className="trainer-form-group">
                <label>Select Client *</label>
                <input
                  type="text"
                  placeholder="🔍 Search client by name, ID, phone..."
                  value={clientModalSearch}
                  onChange={(e) => { setClientModalSearch(e.target.value); setIsDirty(true); }}
                  style={{ marginBottom: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', fontWeight: '700', fontSize: '0.85rem' }}
                />
                <select
                  value={formData.client_id}
                  onChange={e => {
                    const cId = e.target.value;
                    const selClient = clients.find(c => String(c.id) === String(cId));
                    if (selClient && !isClientActive(selClient)) {
                      setInactiveWarningModal({
                        isOpen: true,
                        client: selClient
                      });
                      setFormData(prev => ({
                        ...prev,
                        client_id: '',
                        hasGst: false,
                        gstin: ''
                      }));
                      return;
                    }
                    setFormData(prev => ({
                      ...prev,
                      client_id: cId,
                      hasGst: !!selClient?.gstin,
                      gstin: selClient?.gstin || ''
                    }));
                    setGstError('');
                    setIsDirty(true);
                  }}
                  required
                >
                  <option value="">-- Choose Active Client ({clients.filter(c => (c.name || '').toLowerCase().includes(clientModalSearch.toLowerCase()) || (c.clientId || '').toLowerCase().includes(clientModalSearch.toLowerCase()) || (c.phone || '').toLowerCase().includes(clientModalSearch.toLowerCase())).length} found) --</option>
                  {clients.filter(c => (c.name || '').toLowerCase().includes(clientModalSearch.toLowerCase()) || (c.clientId || '').toLowerCase().includes(clientModalSearch.toLowerCase()) || (c.phone || '').toLowerCase().includes(clientModalSearch.toLowerCase())).map(c => {
                    const active = isClientActive(c);
                    return (
                      <option key={c.id} value={c.id} style={{ color: active ? '#0f172a' : '#dc2626' }}>
                        {c.name} ({formatShortId(c.clientId || c.id)}) - {c.phone} {active ? '' : '🛑 (EXPIRED / INACTIVE)'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* GST Number Capture */}
              <div className="trainer-form-group" style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#1e1b4b', display: 'block', marginBottom: '0.35rem' }}>
                  Does this client have a GST number?
                </label>
                <div style={{ display: 'flex', gap: '1.25rem', marginBottom: formData.hasGst ? '0.5rem' : '0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="ptHasGst"
                      checked={formData.hasGst}
                      onChange={() => { setFormData(prev => ({ ...prev, hasGst: true })); setIsDirty(true); }}
                    />
                    Yes (B2B)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="ptHasGst"
                      checked={!formData.hasGst}
                      onChange={() => { setFormData(prev => ({ ...prev, hasGst: false })); setIsDirty(true); }}
                    />
                    No (B2C)
                  </label>
                </div>

                {formData.hasGst && (
                  <div>
                    <input
                      type="text"
                      placeholder="Enter 15-Digit GSTIN (e.g. 33ABCDE1234F1Z5)"
                      value={formData.gstin}
                      maxLength={15}
                      onChange={(e) => { setFormData(prev => ({ ...prev, gstin: e.target.value.toUpperCase() })); setGstError(''); setIsDirty(true); }}
                      style={{
                        width: '100%', padding: '0.55rem 0.85rem', borderRadius: '8px', border: gstError ? '2px solid #ef4444' : '1px solid #cbd5e1',
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

              {/* Select Trainer */}
              <div className="trainer-form-group">
                <label>Select Trainer *</label>
                <select
                  value={formData.trainer_id}
                  onChange={handleTrainerChange}
                  required
                >
                  <option value="">-- Choose Trainer --</option>
                  {trainers.map(t => (
                    <option key={t.id} value={t.id} disabled={!t.grade}>
                      {t.name} {t.grade ? `(${t.grade})` : '(No Grade Set - Disabled)'}
                    </option>
                  ))}
                </select>
                {selectedTrainer && !selectedTrainer.grade && (
                  <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>
                    ⚠️ This trainer has no assigned Grade. Set grade on Trainer Management first.
                  </p>
                )}
              </div>

              {/* Workout Timing */}
              <div className="trainer-form-group">
                <label>Workout Timing / Slot (Optional)</label>
                <TimingPickerInput
                  value={formData.timing}
                  onChange={val => { setFormData({ ...formData, timing: val }); setIsDirty(true); }}
                  placeholder="e.g. 10:00 AM or select time picker →"
                />
              </div>

              {/* Select Package */}
              <div className="trainer-form-group">
                <label>Select PT Package *</label>
                <select
                  value={formData.is_custom ? 'CUSTOM' : formData.pt_package_id}
                  onChange={handlePackageChange}
                  disabled={!formData.trainer_id || (selectedTrainer && !selectedTrainer.grade)}
                  required
                >
                  <option value="">-- Choose Package --</option>
                  {eligibleCatalogPackages.map(pkg => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} — {pkg.total_classes} classes ({pkg.duration_days || 30} days) {isSuperAdmin ? `(${formatCurrency(pkg.price)})` : ''}
                    </option>
                  ))}
                  <option value="CUSTOM">★ Other / Custom Package</option>
                </select>
              </div>

              {/* Custom Package Form */}
              {formData.is_custom && (
                <div className="custom-box animated-fade-in">
                  <h4 style={{ margin: 0, color: 'var(--primary-neon)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Custom Package Details</h4>
                  <div className="form-row">
                    <div className="trainer-form-group">
                      <label>Custom Package Name</label>
                      <input
                        type="text"
                        value={formData.custom_name}
                        onChange={e => { setFormData({ ...formData, custom_name: e.target.value }); setIsDirty(true); }}
                        placeholder="e.g. Special 20-Session PT"
                      />
                    </div>
                    {isSuperAdmin && (
                      <div className="trainer-form-group">
                        <label>Price (₹) *</label>
                        <input
                          type="number"
                          min="1"
                          value={formData.custom_price}
                          onChange={e => { setFormData({ ...formData, custom_price: e.target.value }); setIsDirty(true); }}
                          required
                          placeholder="e.g. 12000"
                        />
                      </div>
                    )}
                  </div>
                  <div className="form-row">
                    <div className="trainer-form-group">
                      <label>Total Classes *</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.custom_total_classes}
                        onChange={e => { setFormData({ ...formData, custom_total_classes: e.target.value }); setIsDirty(true); }}
                        required
                        placeholder="e.g. 24"
                      />
                    </div>
                    <div className="trainer-form-group">
                      <label>Duration (Days) *</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.custom_duration_days}
                        onChange={e => { setFormData({ ...formData, custom_duration_days: e.target.value }); setIsDirty(true); }}
                        required
                        placeholder="Default 30 days"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Discount Amount */}
              {isSuperAdmin && (
                <div className="trainer-form-group">
                  <label>Discount Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.discount_amount}
                    onChange={e => { setFormData({ ...formData, discount_amount: e.target.value }); setIsDirty(true); }}
                    placeholder="0"
                  />
                </div>
              )}

              {/* Assigned Date */}
              <div className="trainer-form-group">
                <label>Assigned Date *</label>
                <input
                  type="date"
                  value={formData.assigned_date}
                  onChange={e => { setFormData({ ...formData, assigned_date: e.target.value }); setIsDirty(true); }}
                  required
                />
              </div>

              <div className="trainer-modal-footer">
                <button type="button" className="trainer-btn-cancel" onClick={() => { setIsModalOpen(false); setIsDirty(false); }}>Cancel</button>
                <button type="submit" className="trainer-btn-save">Confirm Assignment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Calendar Modal */}
      {historyModal.isOpen && historyModal.assignment && (
        <div className="trainer-modal-overlay">
          <div className="trainer-modal-content animated-scale-in" style={{ maxWidth: '750px' }}>
            <div className="trainer-modal-header">
              <h2>PT Attendance History — {historyModal.assignment.clientName}</h2>
              <button className="btn-close" onClick={() => setHistoryModal({ ...historyModal, isOpen: false })}>&times;</button>
            </div>

            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px', marginBottom: '1rem', fontSize: '0.9rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div><strong>Package:</strong> {historyModal.assignment.packageName} ({historyModal.assignment.classes_completed} / {historyModal.assignment.total_classes_snapshot} Classes Conducted)</div>
              <div><strong>Trainer:</strong> {historyModal.assignment.trainerName} ({historyModal.assignment.trainerGrade || 'No Grade'})</div>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.2rem' }}>
                <span><strong>Start Date:</strong> {formatDateDDMMYYYY(historyModal.assignment.assigned_date)}</span>
                <span><strong>Expiry Date:</strong> {formatDateDDMMYYYY(historyModal.assignment.expiry_date)}</span>
              </div>
            </div>

            {historyModal.loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading class history...</div>
            ) : historyModal.logs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No class sessions logged for this assignment yet.</div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '8px 12px' }}>Date</th>
                      <th style={{ padding: '8px 12px' }}>Session</th>
                      <th style={{ padding: '8px 12px' }}>Conducting Trainer</th>
                      {isSuperAdmin && <th style={{ padding: '8px 12px' }}>Slab / Rate</th>}
                      {isSuperAdmin && <th style={{ padding: '8px 12px' }}>Payout Rate</th>}
                      <th style={{ padding: '8px 12px' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyModal.logs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '700' }}>{formatDateDDMMYYYY(log.class_date)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: log.session_slot === 'Evening' ? '#fef3c7' : '#e0f2fe', color: log.session_slot === 'Evening' ? '#b45309' : '#0369a1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                            {log.session_slot || 'Morning'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>{log.trainerName}</td>
                        {isSuperAdmin && (
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.75rem', background: log.slab_applied === 'Slab1' ? '#d1fae5' : '#dbeafe', color: log.slab_applied === 'Slab1' ? '#047857' : '#1d4ed8', padding: '2px 8px', borderRadius: '100px', fontWeight: '700' }}>
                              {log.slab_applied}
                            </span>
                          </td>
                        )}
                        {isSuperAdmin && (
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: '#16a34a' }}>{formatCurrency(log.per_class_rate_snapshot)}</td>
                        )}
                        <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.85rem' }}>{log.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="trainer-modal-footer">
              <button type="button" className="trainer-btn-cancel" onClick={() => setHistoryModal({ ...historyModal, isOpen: false })}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Active PT Warning Modal */}
      {duplicateModal.isOpen && (
        <div className="trainer-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="trainer-modal-card" style={{ maxWidth: '520px', textAlign: 'center', padding: '2rem', background: '#ffffff', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ width: '64px', height: '64px', background: '#fef3c7', border: '1px solid #fde047', borderRadius: '50%', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem' }}>
              ⚠️
            </div>

            <h3 style={{ fontSize: '1.35rem', fontWeight: '900', color: '#1e1b4b', marginBottom: '0.75rem' }}>
              Active PT Package Already Exists
            </h3>

            <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: '1.6', marginBottom: '1.25rem' }}>
              Client <strong>{duplicateModal.clientName}</strong> already has an active PT package until <strong>{formatDateDDMMYYYY(duplicateModal.endDate)}</strong> with trainer <strong>{duplicateModal.trainerName}</strong>.
            </p>

            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '1.1rem', borderRadius: '14px', marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.88rem', color: '#92400e', lineHeight: '1.5' }}>
              💡 <strong>Advance Booking Required:</strong> To assign a new PT package to this client, it must be approved and scheduled as an <strong>Advance Booking</strong> starting after the active package expires on <strong>{formatDateDDMMYYYY(duplicateModal.nextStartDate)}</strong>.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="trainer-btn-save"
                onClick={() => {
                  setDuplicateModal({ isOpen: false, endDate: '', nextStartDate: '', clientId: '', clientName: '', trainerName: '', trainerId: '', packageId: '' });
                  setIsModalOpen(false);
                  const queryParams = new URLSearchParams({
                    tab: 'pt',
                    clientId: duplicateModal.clientId,
                    trainerId: duplicateModal.trainerId || '',
                    packageId: duplicateModal.packageId || '',
                    startDate: duplicateModal.nextStartDate || ''
                  }).toString();
                  navigate(`/advance-bookings?${queryParams}`);
                }}
                style={{ flex: 1.4, padding: '0.8rem 1rem', background: '#4f46e5', color: '#ffffff', fontWeight: '800', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
              >
                Approve & Go to Advance Booking
              </button>

              <button
                type="button"
                className="trainer-btn-cancel"
                onClick={() => setDuplicateModal({ isOpen: false, endDate: '', nextStartDate: '', clientId: '', clientName: '', trainerName: '', trainerId: '', packageId: '' })}
                style={{ flex: 0.8, padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: '700', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inactive / Expired Client Warning Modal */}
      {inactiveWarningModal.isOpen && inactiveWarningModal.client && (
        <div className="trainer-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="trainer-modal-card" style={{ maxWidth: '480px', textAlign: 'center', padding: '2rem', background: '#ffffff', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ width: '64px', height: '64px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '50%', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem' }}>
              🛑
            </div>

            <h3 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#1e1b4b', marginBottom: '0.75rem' }}>
              Cannot Assign PT — Inactive / Expired Client
            </h3>

            <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: '1.6', marginBottom: '1.25rem' }}>
              Client <strong>{inactiveWarningModal.client.name}</strong> (#{formatShortId(inactiveWarningModal.client.clientId || inactiveWarningModal.client.id)}) does not have an active general membership.
              <br />
              <span style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: '700' }}>
                Expired on: {inactiveWarningModal.client.expiryDate ? formatDateDDMMYYYY(inactiveWarningModal.client.expiryDate) : 'N/A'} (Status: {inactiveWarningModal.client.status || 'Expired'})
              </span>
            </p>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.85rem', color: '#991b1b', lineHeight: '1.5' }}>
              ⚠️ <strong>Membership Required:</strong> Personal Training packages can only be assigned to clients with an active gym membership. Please renew this client's general membership plan first.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setInactiveWarningModal({ isOpen: false, client: null });
                  setIsModalOpen(false);
                  navigate('/clients?filter=Inactive');
                }}
                style={{ flex: 1.4, padding: '0.75rem 1rem', background: '#dc2626', color: '#ffffff', fontWeight: '800', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
              >
                Renew Membership Now
              </button>

              <button
                type="button"
                onClick={() => setInactiveWarningModal({ isOpen: false, client: null })}
                style={{ flex: 0.8, padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: '700', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Workout Timing Modal (Timing Only) */}
      {timingModal.isOpen && timingModal.assignment && (
        <div className="trainer-modal-overlay">
          <div className="trainer-modal-content animated-scale-in" style={{ maxWidth: '540px', width: '92vw', boxSizing: 'border-box', overflow: 'visible', maxHeight: 'none' }}>
            <div className="trainer-modal-header" style={{ padding: '0.9rem 1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem' }}>Edit Workout Timing</h2>
              <button className="btn-close" onClick={() => setTimingModal({ isOpen: false, assignment: null, timing: '' })}>&times;</button>
            </div>

            <form onSubmit={handleSaveTiming} className="trainer-form" style={{ padding: '1rem 1.25rem', gap: '0.85rem', boxSizing: 'border-box', overflow: 'visible', flex: 'none' }}>
              {/* Compact Summary Cards Row */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.55rem 0.85rem', borderRadius: '10px', fontSize: '0.82rem', color: '#334155', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', boxSizing: 'border-box', width: '100%' }}>
                <div><span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700', display: 'block' }}>CLIENT</span><strong>{timingModal.assignment.clientName}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700', display: 'block' }}>PACKAGE</span><strong>{timingModal.assignment.packageName}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '700', display: 'block' }}>TRAINER</span><strong>{timingModal.assignment.trainerName}</strong></div>
              </div>

              <div className="trainer-form-group" style={{ boxSizing: 'border-box', width: '100%', gap: '0.35rem' }}>
                <label style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.75rem', letterSpacing: '0.05em' }}>WORKOUT TIMING RANGE</label>
                <TimingPickerInput
                  value={timingModal.timing}
                  onChange={val => setTimingModal(prev => ({ ...prev, timing: val }))}
                  placeholder="e.g. 10:00 AM"
                  autoFocus
                />
              </div>

              <div className="trainer-modal-footer" style={{ marginTop: '0.5rem', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="trainer-btn-cancel" style={{ padding: '0.55rem 1.35rem', fontSize: '0.9rem' }} onClick={() => setTimingModal({ isOpen: false, assignment: null, timing: '' })}>Cancel</button>
                <button type="submit" className="trainer-btn-save" style={{ padding: '0.55rem 1.85rem', fontSize: '0.95rem' }}>Save Timing</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit PT Assignment Modal */}
      {isEditModalOpen && editingAssignment && (
        <div className="trainer-modal-overlay">
          <div className="trainer-modal-content animated-scale-in">
            <div className="trainer-modal-header">
              <h2>Edit PT Assignment — {editingAssignment.clientName}</h2>
              <button className="btn-close" onClick={() => setIsEditModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handleSaveEdit} className="trainer-form">
              {parseInt(editingAssignment.classes_completed || 0, 10) > 0 ? (
                <div style={{ background: '#fef3c7', border: '1px solid #fde047', padding: '0.85rem', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.88rem', color: '#92400e' }}>
                  ⚠️ <strong>Classes Conducted:</strong> {editingAssignment.classes_completed} / {editingAssignment.total_classes_snapshot} — Package & Trainer details are locked because classes have started, but <strong>Workout Timing can be updated below</strong>.
                </div>
              ) : (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.85rem', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.88rem', color: '#1e40af' }}>
                  💡 <strong>Classes Conducted:</strong> 0 / {editingAssignment.total_classes_snapshot} — All assignment details can be edited.
                </div>
              )}

              {/* Workout Timing (Always Editable) */}
              <div className="trainer-form-group">
                <label>Workout Timing / Slot</label>
                <TimingPickerInput
                  value={editFormData.timing}
                  onChange={val => setEditFormData({ ...editFormData, timing: val })}
                  placeholder="e.g. 10:00 AM or select time picker →"
                />
              </div>

              {/* Select Trainer */}
              <div className="trainer-form-group">
                <label>Assigned Trainer *</label>
                <select
                  value={editFormData.trainer_id}
                  onChange={e => setEditFormData({ ...editFormData, trainer_id: e.target.value })}
                  disabled={parseInt(editingAssignment.classes_completed || 0, 10) > 0}
                  required
                >
                  <option value="">-- Choose Trainer --</option>
                  {trainers.map(t => (
                    <option key={t.id} value={t.id} disabled={!t.grade}>
                      {t.name} {t.grade ? `(${t.grade})` : '(No Grade Set)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select PT Package */}
              <div className="trainer-form-group">
                <label>PT Package *</label>
                <select
                  value={editFormData.pt_package_id}
                  onChange={e => setEditFormData({ ...editFormData, pt_package_id: e.target.value })}
                  disabled={parseInt(editingAssignment.classes_completed || 0, 10) > 0}
                  required
                >
                  <option value="">-- Choose Package --</option>
                  {packages.map(pkg => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} — {pkg.total_classes} classes ({pkg.duration_days || 30} days) ({formatCurrency(pkg.price)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned Start Date */}
              <div className="trainer-form-group">
                <label>Assigned Start Date *</label>
                <input
                  type="date"
                  value={editFormData.assigned_date}
                  onChange={e => setEditFormData({ ...editFormData, assigned_date: e.target.value })}
                  disabled={parseInt(editingAssignment.classes_completed || 0, 10) > 0}
                  required
                />
              </div>

              {/* Discount Amount */}
              {isSuperAdmin && (
                <div className="trainer-form-group">
                  <label>Discount Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={editFormData.discount_amount}
                    onChange={e => setEditFormData({ ...editFormData, discount_amount: e.target.value })}
                    disabled={parseInt(editingAssignment.classes_completed || 0, 10) > 0}
                    placeholder="0"
                  />
                </div>
              )}

              <div className="trainer-modal-footer">
                <button type="button" className="trainer-btn-cancel" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                <button type="submit" className="trainer-btn-save">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      <InvoicePreviewModal
        isOpen={!!invoiceClient}
        onClose={() => setInvoiceClient(null)}
        client={invoiceClient}
        title="PT Assignment Completed"
      />

      {/* Navigation Blocker Modal */}
      {isConfirmExitOpen && (
        <div className="alert-modal-overlay" style={{ zIndex: 11000 }}>
          <div className="alert-modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="alert-icon-circle warning" style={{ backgroundColor: '#eab308' }}>⚠</div>
            <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800' }}>Unsaved Changes</h3>
            <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
              You have unsaved changes in the PT assignment form. Are you sure you want to exit? Your changes will be lost.
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

      {/* Custom Alert / Confirm Modal */}
      {customPopup.isOpen && (
        <div className="alert-modal-overlay" style={{ zIndex: 999999 }}>
          <div className="alert-modal-card" style={{ maxWidth: '440px', textAlign: 'center', padding: '2rem', background: '#ffffff', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            {customPopup.type === 'confirm' ? (
              <div style={{ width: '64px', height: '64px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: '50%', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.8rem', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.15)' }}>
                🗑️
              </div>
            ) : (customPopup.type === 'error' || (customPopup.title || '').toLowerCase().includes('error')) ? (
              <div style={{ width: '64px', height: '64px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: '50%', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.8rem', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.15)' }}>
                ⚠️
              </div>
            ) : (
              <div style={{ width: '64px', height: '64px', background: '#dcfce7', border: '2px solid #86efac', borderRadius: '50%', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', boxShadow: '0 4px 14px rgba(22, 163, 74, 0.25)' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            )}

            <h3 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#1e1b4b', marginBottom: '0.75rem' }}>
              {customPopup.title}
            </h3>

            <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: '1.6', marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>
              {customPopup.message}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              {customPopup.type === 'confirm' && (
                <button
                  type="button"
                  onClick={() => setCustomPopup(prev => ({ ...prev, isOpen: false }))}
                  style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontWeight: '700', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const onConf = customPopup.onConfirm;
                  setCustomPopup(prev => ({ ...prev, isOpen: false }));
                  if (onConf) onConf();
                }}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: customPopup.type === 'confirm' ? '#dc2626' : ((customPopup.type === 'error' || (customPopup.title || '').toLowerCase().includes('error')) ? '#dc2626' : 'linear-gradient(135deg, #16a34a, #15803d)'),
                  color: '#ffffff',
                  fontWeight: '800',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: (customPopup.type === 'error' || customPopup.type === 'confirm' || (customPopup.title || '').toLowerCase().includes('error')) ? '0 4px 12px rgba(220, 38, 38, 0.25)' : '0 4px 12px rgba(22, 163, 74, 0.25)'
                }}
              >
                {customPopup.type === 'confirm' ? 'Yes, Delete' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PTAssignmentPage;
