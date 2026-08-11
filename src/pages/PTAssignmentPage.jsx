import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPtAssignments, getClients, getTrainers, getPtPackages, addPtAssignment, getPtClassHistory } from '../api';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './PTAssignmentPage.css';

const PTAssignmentPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId');

  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterTrainer, setFilterTrainer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [invoiceClient, setInvoiceClient] = useState(null);
  const [gstError, setGstError] = useState('');

  const isValidGSTIN = (gstin) => {
    if (!gstin) return false;
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(gstin.trim().toUpperCase());
  };

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
    assigned_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setFilterStatus(statusParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (preselectedClientId && clients.length > 0) {
      const selClient = clients.find(c => c.id === preselectedClientId);
      setFormData(prev => ({ 
        ...prev, 
        client_id: preselectedClientId,
        hasGst: !!selClient?.gstin,
        gstin: selClient?.gstin || '' 
      }));
      setIsModalOpen(true);
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
    setFormData({
      client_id: preselectedClientId || '',
      trainer_id: '',
      pt_package_id: '',
      is_custom: false,
      custom_name: 'Custom Package',
      custom_price: '',
      custom_total_classes: '',
      custom_duration_days: 30,
      assigned_date: new Date().toISOString().split('T')[0],
      hasGst: !!selClient?.gstin,
      gstin: selClient?.gstin || ''
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
    const tId = e.target.value;
    setFormData(prev => ({
      ...prev,
      trainer_id: tId,
      pt_package_id: '',
      is_custom: false
    }));
  };

  const handlePackageChange = (e) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.client_id || !formData.trainer_id) {
      alert('Please select a Client and a Trainer.');
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
    const selClient = clients.find(c => c.id === formData.client_id);
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
        hasGst: formData.hasGst,
        gstin: formData.hasGst ? formData.gstin.trim().toUpperCase() : null,
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
      setIsModalOpen(false);
      loadAllData();
      
      const selPackage = packages.find(p => p.id === formData.pt_package_id);
      
      handleGeneratePtInvoice({
        id: result?.id || Date.now(),
        clientName: result?.clientName || selClient?.name || 'Client',
        clientPhone: result?.clientPhone || selClient?.phone || '',
        clientCode: result?.clientCode || selClient?.clientId || '',
        packageName: result?.packageName || (formData.is_custom ? formData.custom_name : selPackage?.name) || 'PT Package',
        trainerName: result?.trainerName || selectedTrainer?.name || '',
        package_price_snapshot: result?.package_price_snapshot || (formData.is_custom ? parseFloat(formData.custom_price) : selPackage?.price) || 0,
        assigned_date: formData.assigned_date,
        expiry_date: result?.expiry_date || '',
        billNo: result?.billNo || `INV-PT-${result?.id || Date.now()}`
      });
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

  useEffect(() => {
    setCurrentPage(1);
  }, [filterTrainer, filterStatus]);

  const filteredAssignments = assignments.filter(a => {
    if (filterTrainer && a.trainer_id !== filterTrainer) return false;
    if (filterStatus) {
      if (filterStatus === 'Inactive') {
        if (a.status !== 'Expired' && a.status !== 'Cancelled') return false;
      } else if (a.status !== filterStatus) {
        return false;
      }
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
    setInvoiceClient({
      name: item.clientName,
      phone: item.clientPhone || '',
      clientId: item.clientCode || '',
      plan: `PT Package — ${item.packageName} (${item.trainerName || 'Assigned Trainer'})`,
      amount: item.package_price_snapshot || 0,
      paidAmount: item.package_price_snapshot || 0,
      dueAmount: 0,
      paymentStatus: 'Paid',
      paymentMethod: 'CASH',
      fromDate: item.assigned_date,
      expiryDate: item.expiry_date || 'N/A',
      billNo: item.billNo || `INV-PT-${item.id}`
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
        <div className="assign-filter-group">
          <label>Filter Trainer</label>
          <select value={filterTrainer} onChange={e => setFilterTrainer(e.target.value)}>
            <option value="">All Trainers</option>
            {trainers.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.grade || 'No Grade'})</option>
            ))}
          </select>
        </div>

        <div className="assign-filter-group">
          <label>Filter Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive (Expired/Cancelled)</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Expired">Expired</option>
          </select>
        </div>
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
                    <th>Package</th>
                    {isSuperAdmin && <th>Package Price</th>}
                    <th>Class Progress</th>
                    <th>Assigned Date</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentAssignments.map(item => {
                    const pct = item.total_classes_snapshot > 0
                      ? Math.min(100, Math.round((item.classes_completed / item.total_classes_snapshot) * 100))
                      : 0;

                    const statusClass = item.status === 'Active'
                      ? 'active-status'
                      : (item.status === 'Completed' ? 'completed-status' : (item.status === 'Expired' ? 'expired-status' : 'cancelled-status'));

                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.95rem' }}>{item.clientName}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '500' }}>{item.clientCode}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{item.trainerName}</div>
                          <span className={`grade-badge ${(item.trainerGrade || 'unassigned').toLowerCase()}`}>
                            {getGradeLabel(item.trainerGrade)}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{item.packageName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.packageCategory} ({item.duration_days || 30} days)</div>
                        </td>
                        {isSuperAdmin && (
                          <td style={{ fontWeight: '800', color: '#059669', fontSize: '0.95rem' }}>
                            {formatCurrency(item.package_price_snapshot)}
                          </td>
                        )}
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
                          <span className={`status-pill ${statusClass}`}>{item.status}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="trainer-form">

              {/* Select Client */}
              <div className="trainer-form-group">
                <label>Select Client *</label>
                <select
                  value={formData.client_id}
                  onChange={e => {
                    const cId = e.target.value;
                    const selClient = clients.find(c => c.id === cId);
                    setFormData(prev => ({
                      ...prev,
                      client_id: cId,
                      hasGst: !!selClient?.gstin,
                      gstin: selClient?.gstin || ''
                    }));
                    setGstError('');
                  }}
                  required
                >
                  <option value="">-- Choose Client --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.clientId || 'No ID'}) - {c.phone}
                    </option>
                  ))}
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
                      onChange={() => setFormData(prev => ({ ...prev, hasGst: true }))}
                    />
                    Yes (B2B)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="ptHasGst"
                      checked={!formData.hasGst}
                      onChange={() => setFormData(prev => ({ ...prev, hasGst: false }))}
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
                      onChange={(e) => { setFormData(prev => ({ ...prev, gstin: e.target.value.toUpperCase() })); setGstError(''); }}
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
                        onChange={e => setFormData({ ...formData, custom_name: e.target.value })}
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
                          onChange={e => setFormData({ ...formData, custom_price: e.target.value })}
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
                        onChange={e => setFormData({ ...formData, custom_total_classes: e.target.value })}
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
                        onChange={e => setFormData({ ...formData, custom_duration_days: e.target.value })}
                        required
                        placeholder="Default 30 days"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Assigned Date */}
              <div className="trainer-form-group">
                <label>Assigned Date *</label>
                <input
                  type="date"
                  value={formData.assigned_date}
                  onChange={e => setFormData({ ...formData, assigned_date: e.target.value })}
                  required
                />
              </div>

              <div className="trainer-modal-footer">
                <button type="button" className="trainer-btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
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

            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px', marginBottom: '1rem', fontSize: '0.9rem', color: '#334155' }}>
              <div><strong>Package:</strong> {historyModal.assignment.packageName} ({historyModal.assignment.classes_completed} / {historyModal.assignment.total_classes_snapshot} Classes Conducted)</div>
              <div><strong>Trainer:</strong> {historyModal.assignment.trainerName} ({historyModal.assignment.trainerGrade || 'No Grade'})</div>
              <div><strong>Expiry Date:</strong> {formatDateDDMMYYYY(historyModal.assignment.expiry_date)}</div>
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
        <div className="trainer-modal-overlay">
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

      <InvoicePreviewModal
        isOpen={!!invoiceClient}
        onClose={() => setInvoiceClient(null)}
        client={invoiceClient}
      />
    </div>
  );
};

export default PTAssignmentPage;
