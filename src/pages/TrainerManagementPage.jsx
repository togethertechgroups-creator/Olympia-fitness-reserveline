import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrainers, getNextTrainerId, addTrainer, updateTrainer, deleteTrainer, getTrainerDailyStatus, saveTrainerDailyStatus } from '../api';
import './TrainerManagementPage.css';

const TrainerManagementPage = () => {
  const navigate = useNavigate();
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [isDirty, setIsDirty] = useState(false);
  const [blockedTargetUrl, setBlockedTargetUrl] = useState('');
  const [isConfirmExitOpen, setIsConfirmExitOpen] = useState(false);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTrainer, setCurrentTrainer] = useState(null);
  const [nextId, setNextId] = useState('');
  const [todayStatuses, setTodayStatuses] = useState([]);
  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    trainerId: '',
    name: '',
    phone: '',
    specialization: '',
    experience: '',
    status: 'Active',
    grade: '',
    custom_commission_percent: '',
    profileImage: ''
  });

  const [viewImageModal, setViewImageModal] = useState({ isOpen: false, imageUrl: '', title: '', subtitle: '' });

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Photo file size should be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, profileImage: reader.result }));
      setIsDirty(true);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    fetchTrainers();
    fetchDailyStatuses();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && viewImageModal.isOpen) {
        setViewImageModal({ isOpen: false, imageUrl: '', title: '', subtitle: '' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewImageModal.isOpen]);

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
      
      if (href && !href.startsWith('#/trainer-management') && href !== '#') {
        e.preventDefault();
        e.stopPropagation();
        setBlockedTargetUrl(href);
        setIsConfirmExitOpen(true);
      }
    };

    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, [isDirty]);

  const fetchTrainers = async () => {
    try {
      const data = await getTrainers();
      setTrainers(data);
    } catch (error) {
      console.error('Failed to fetch trainers');
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyStatuses = async () => {
    try {
      const res = await getTrainerDailyStatus(todayStr);
      setTodayStatuses(res);
    } catch (err) {
      console.error('Failed to fetch daily statuses', err);
    }
  };

  const handleToggleAbsence = async (trainerId, isCurrentlyAbsent) => {
    const newStatus = isCurrentlyAbsent ? 'Present' : 'Absent';
    try {
      await saveTrainerDailyStatus({
        trainer_id: trainerId,
        status_date: todayStr,
        status: newStatus,
        marked_by: localStorage.getItem('userRole') || 'Admin'
      });
      fetchDailyStatuses();
    } catch (err) {
      alert(err.message || 'Failed to update trainer daily status.');
    }
  };

  const handleOpenModal = async (trainer = null) => {
    if (trainer) {
      setCurrentTrainer(trainer);
      setFormData({
        ...trainer,
        phone: trainer.phone || '',
        grade: trainer.grade || '',
        custom_commission_percent: trainer.custom_commission_percent !== null && trainer.custom_commission_percent !== undefined ? trainer.custom_commission_percent : '',
        profileImage: trainer.profileImage || ''
      });
    } else {
      setCurrentTrainer(null);
      try {
        const { nextId: id } = await getNextTrainerId();
        setNextId(id);
        setFormData({
          trainerId: id,
          name: '',
          phone: '',
          specialization: '',
          experience: '',
          status: 'Active',
          grade: '',
          custom_commission_percent: '',
          profileImage: ''
        });
      } catch (error) {
        setFormData({
          trainerId: 'TRN001',
          name: '',
          phone: '',
          specialization: '',
          experience: '',
          status: 'Active',
          grade: '',
          custom_commission_percent: '',
          profileImage: ''
        });
      }
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentTrainer(null);
    setIsDirty(false);
  };

  const handleInputChange = (e) => {
    setIsDirty(true);
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.grade) {
      alert('Please select a valid Grade for the trainer.');
      return;
    }
    try {
      setIsDirty(false);
      if (currentTrainer) {
        await updateTrainer(currentTrainer.id, formData);
      } else {
        await addTrainer(formData);
      }
      fetchTrainers();
      handleCloseModal();
    } catch (error) {
      alert(error.message || 'Failed to save trainer');
    }
  };

  const handleProceedExit = () => {
    setIsDirty(false);
    setIsConfirmExitOpen(false);
    if (blockedTargetUrl) {
      window.location.hash = blockedTargetUrl.startsWith('#') ? blockedTargetUrl : `#${blockedTargetUrl}`;
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this trainer?')) {
      try {
        await deleteTrainer(id);
        setTrainers(trainers.filter(t => t.id !== id));
      } catch (error) {
        alert('Failed to delete trainer');
      }
    }
  };

  const formatCurrency = (val) => {
    return `₹${Math.round(val || 0).toLocaleString('en-IN')}`;
  };

  const hasUnassignedGrade = trainers.some(t => t.status === 'Active' && !t.grade);

  const getGradeLabel = (grade) => {
    if (grade === 'A_PRO_PT') return 'A PRO PT';
    if (grade === 'A') return 'GRADE A';
    if (grade === 'B') return 'GRADE B';
    return 'GRADE NOT SET';
  };

  return (
    <div className="trainer-mgmt-container">
      <header className="trainer-header">
        <div className="title-group">
          <h1><span>TRAINER</span> MANAGEMENT</h1>
          <p>Manage gym trainers, grades, specializations and PT revenue slabs.</p>
        </div>
        <button className="btn-add-trainer" onClick={() => handleOpenModal()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          ADD NEW TRAINER
        </button>
      </header>

      {hasUnassignedGrade && (
        <div className="grade-warning-banner animated-fade-in">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p><strong>Action Required:</strong> One or more active trainers do not have an assigned PT Grade. Click "EDIT" on each trainer to assign a Grade (A_PRO_PT, A, or B).</p>
        </div>
      )}

      <div className="trainer-grid">
        {loading ? (
          <div className="loading-state">Loading trainers...</div>
        ) : trainers.length === 0 ? (
          <div className="empty-state">No trainers found. Add your first trainer!</div>
        ) : (
          trainers.map(trainer => {
            const rev = trainer.monthlyPtBaseRevenue || 0;
            const target = 300000;
            const pct = Math.min(100, Math.round((rev / target) * 100));
            const isSlab1 = rev > target;
            const gradeClass = (trainer.grade || 'unassigned').toLowerCase();
            const isAbsentToday = todayStatuses.some(s => String(s.trainer_id) === String(trainer.id) && s.status === 'Absent');
            const hasCustomComm = trainer.custom_commission_percent !== null && trainer.custom_commission_percent !== undefined && trainer.custom_commission_percent !== '';

            return (
              <div key={trainer.id} className={`trainer-card ${trainer.status.toLowerCase()}`}>
                <div className="trainer-card-header">
                  <div className="header-left-badges">
                    <div className="id-badge">{trainer.trainerId}</div>
                    <div className={`grade-badge ${gradeClass}`}>
                      {getGradeLabel(trainer.grade)}
                    </div>
                    {hasCustomComm && (
                      <div className="custom-comm-badge">
                        Custom Rate: {trainer.custom_commission_percent}%
                      </div>
                    )}
                  </div>
                  <div className={`status-pill ${trainer.status.toLowerCase()}`}>
                    {trainer.status} {isAbsentToday ? '• ABSENT' : ''}
                  </div>
                </div>

                <div className="trainer-info" style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', margin: '0.75rem 0' }}>
                  <div 
                    className="trainer-avatar-wrapper"
                    onClick={() => trainer.profileImage && setViewImageModal({
                      isOpen: true,
                      imageUrl: trainer.profileImage,
                      title: trainer.name,
                      subtitle: `${trainer.trainerId || ''} • ${trainer.specialization || 'General Trainer'}`
                    })}
                    style={{ 
                      width: '56px', 
                      height: '56px', 
                      borderRadius: '50%', 
                      overflow: 'hidden', 
                      flexShrink: 0, 
                      background: 'linear-gradient(135deg, #f1f5f9, #cbd5e1)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      border: '2px solid #ffffff', 
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      cursor: trainer.profileImage ? 'pointer' : 'default',
                      position: 'relative'
                    }}
                    title={trainer.profileImage ? "Click to view full photo" : ""}
                  >
                    {trainer.profileImage ? (
                      <>
                        <img src={trainer.profileImage} alt={trainer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div className="avatar-hover-overlay">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </div>
                      </>
                    ) : (
                      <span style={{ fontWeight: '900', fontSize: '1.2rem', color: '#475569' }}>
                        {trainer.name ? trainer.name.charAt(0).toUpperCase() : 'T'}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>{trainer.name}</h3>
                    <p className="specialization" style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{trainer.specialization || 'General Trainer'}</p>
                    {trainer.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', fontSize: '0.78rem', color: '#0284c7', fontWeight: '600' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        <span>{trainer.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="trainer-stats-row">
                    <div className="experience-badge">
                      <span>{trainer.experience || '0'} Yrs Exp</span>
                    </div>
                    <div className="client-count-badge">
                      <span>{trainer.clientCount || '0'} Clients</span>
                    </div>
                  </div>

                  {/* Monthly PT Revenue & Slab Mini-Card */}
                  <div className="trainer-pt-revenue-card">
                    <div className="pt-revenue-header">
                      <span className="pt-revenue-title">This Month PT Base Revenue</span>
                      <span className={`slab-badge ${hasCustomComm ? 'custom-rate' : (isSlab1 ? 'slab1' : 'slab2')}`}>
                        {hasCustomComm ? `Custom Rate: ${trainer.custom_commission_percent}%` : (isSlab1 ? 'Slab 1' : 'Slab 2')}
                      </span>
                    </div>
                    <div className="pt-revenue-val">{formatCurrency(rev)}</div>

                    {/* Calculated Percentage-wise PT Commission Payout */}
                    <div style={{
                      marginTop: '0.65rem',
                      paddingTop: '0.65rem',
                      borderTop: '1px dashed #cbd5e1',
                      display: 'flex',
                      justify: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.03em' }}>
                          PT Commission ({trainer.commissionPercent || (hasCustomComm ? trainer.custom_commission_percent : (isSlab1 ? (trainer.grade === 'B' ? 30 : 40) : 25))}%)
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#059669', marginTop: '2px' }}>
                          {formatCurrency(trainer.commissionSalary !== undefined ? trainer.commissionSalary : (rev * ((trainer.commissionPercent || 25) / 100)))}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px' }}>
                        {trainer.classesConducted || 0} Classes Logged
                      </div>
                    </div>

                    {!hasCustomComm && (
                      <div className="slab-progress-container" style={{ marginTop: '0.65rem' }}>
                        <div className="slab-progress-bar-bg">
                          <div className="slab-progress-bar-fill" style={{ width: `${pct}%` }}></div>
                        </div>
                        <div className="slab-progress-text">
                          <span>{pct}% of ₹3L Slab Threshold</span>
                          <span>{isSlab1 ? 'Slab 1 Unlocked 🎉' : `₹${Math.round(target - rev).toLocaleString('en-IN')} to Slab 1`}</span>
                        </div>
                      </div>
                    )}
                  </div>

                <div className="trainer-card-actions">
                  <button
                    className={`btn-toggle-absence ${isAbsentToday ? 'is-absent' : 'is-present'}`}
                    onClick={() => handleToggleAbsence(trainer.id, isAbsentToday)}
                  >
                    {isAbsentToday ? 'Mark Present' : 'Mark Absent Today'}
                  </button>
                  <div className="trainer-card-actions-sub">
                    <button className="btn-edit" onClick={() => handleOpenModal(trainer)}>
                      EDIT
                    </button>
                    {isSuperAdmin && (
                      <button className="btn-delete" onClick={() => handleDelete(trainer.id)}>
                        DELETE
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className="trainer-modal-overlay">
          <div className="trainer-modal-content animated-scale-in">
            <div className="trainer-modal-header">
              <h2>{currentTrainer ? 'Edit Trainer' : 'Add New Trainer'}</h2>
              <button className="btn-close" onClick={handleCloseModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="trainer-form">
              <div className="trainer-form-group" style={{ marginBottom: '1.25rem' }}>
                <label>Profile Photo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                  <div 
                    className="trainer-form-avatar-wrapper"
                    onClick={() => formData.profileImage && setViewImageModal({
                      isOpen: true,
                      imageUrl: formData.profileImage,
                      title: formData.name || 'Trainer Profile Photo',
                      subtitle: formData.trainerId ? `Trainer ID: ${formData.trainerId}` : ''
                    })}
                    style={{ 
                      width: '64px', 
                      height: '64px', 
                      borderRadius: '50%', 
                      overflow: 'hidden', 
                      background: '#f1f5f9', 
                      border: '2px solid #cbd5e1', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      flexShrink: 0,
                      position: 'relative',
                      cursor: formData.profileImage ? 'pointer' : 'default'
                    }}
                    title={formData.profileImage ? "Click to view full photo" : ""}
                  >
                    {formData.profileImage ? (
                      <>
                        <img src={formData.profileImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div className="avatar-hover-overlay">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: '1.4rem', color: '#94a3b8' }}>📷</span>
                    )}
                  </div>
                  <div>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ fontSize: '0.82rem' }} />
                    <small style={{ display: 'block', color: '#64748b', fontSize: '0.72rem', marginTop: '4px' }}>PNG, JPG or WEBP under 2MB</small>
                    {formData.profileImage && (
                      <button
                        type="button"
                        className="btn-view-full-image"
                        onClick={() => setViewImageModal({
                          isOpen: true,
                          imageUrl: formData.profileImage,
                          title: formData.name || 'Trainer Profile Photo',
                          subtitle: formData.trainerId ? `Trainer ID: ${formData.trainerId}` : ''
                        })}
                        style={{
                          marginTop: '6px',
                          fontSize: '0.78rem',
                          color: '#ea580c',
                          background: 'rgba(234, 88, 12, 0.08)',
                          border: '1px solid rgba(234, 88, 12, 0.3)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          padding: '3px 8px',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        View Full Image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="trainer-form-group">
                  <label>Trainer ID</label>
                  <input type="text" name="trainerId" value={formData.trainerId} readOnly className="read-only" />
                </div>
                <div className="trainer-form-group">
                  <label>Trainer Name *</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} required placeholder="Full Name" />
                </div>
              </div>

              <div className="form-row">
                <div className="trainer-form-group">
                  <label>Trainer Grade *</label>
                  <select name="grade" value={formData.grade} onChange={handleInputChange} required style={{ border: !formData.grade ? '1px solid #ef4444' : undefined }}>
                    <option value="">-- Select Grade (Required) --</option>
                    <option value="A_PRO_PT">A Pro PT (A_PRO_PT)</option>
                    <option value="A">Grade A (A)</option>
                    <option value="B">Grade B (B)</option>
                  </select>
                </div>

                <div className="trainer-form-group">
                  <label>Status</label>
                  <select name="status" value={formData.status} onChange={handleInputChange}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="trainer-form-group">
                  <label>Specialization</label>
                  <input type="text" name="specialization" value={formData.specialization} onChange={handleInputChange} placeholder="e.g. Bodybuilding, Yoga" />
                </div>
                <div className="trainer-form-group">
                  <label>Experience (Years)</label>
                  <input type="text" name="experience" value={formData.experience} onChange={handleInputChange} placeholder="e.g. 5" />
                </div>
              </div>

              <div className="trainer-form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="e.g. 9876543210 (Mobile / WhatsApp)"
                />
              </div>

              <div className="trainer-form-group">
                <label>Commission % (Override)</label>
                <input
                  type="number"
                  name="custom_commission_percent"
                  value={formData.custom_commission_percent}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="e.g. 35 (Leave blank for standard grade commission)"
                />
                <small style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block', lineHeight: '1.3' }}>
                  Leave blank to use standard grade-based commission (A Pro PT/A: 40%↓25%, B: 30%↓25%). If set, this fixed rate applies to all this trainer's PT payouts regardless of monthly revenue slab.
                </small>
              </div>

              <div className="trainer-modal-footer">
                <button type="button" className="trainer-btn-cancel" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="trainer-btn-save">
                  {currentTrainer ? 'Update Trainer' : 'Add Trainer'}
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
              You have unsaved changes in the trainer form. Are you sure you want to exit? Your changes will be lost.
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

      {/* Full Image Preview Lightbox Modal */}
      {viewImageModal.isOpen && (
        <div 
          className="image-lightbox-overlay"
          onClick={() => setViewImageModal({ isOpen: false, imageUrl: '', title: '', subtitle: '' })}
        >
          <div 
            className="image-lightbox-card"
            onClick={e => e.stopPropagation()}
          >
            <div className="image-lightbox-header">
              <div>
                <h3>{viewImageModal.title || 'Trainer Profile Photo'}</h3>
                {viewImageModal.subtitle && <p>{viewImageModal.subtitle}</p>}
              </div>
              <button
                type="button"
                className="image-lightbox-close"
                onClick={() => setViewImageModal({ isOpen: false, imageUrl: '', title: '', subtitle: '' })}
                title="Close (Esc)"
              >
                &times;
              </button>
            </div>
            <div className="image-lightbox-body">
              <img 
                src={viewImageModal.imageUrl} 
                alt={viewImageModal.title || 'Full Profile Photo'} 
                className="image-lightbox-img"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainerManagementPage;

