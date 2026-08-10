import React, { useState, useEffect } from 'react';
import { getTrainers, getNextTrainerId, addTrainer, updateTrainer, deleteTrainer, getTrainerDailyStatus, saveTrainerDailyStatus } from '../api';
import './TrainerManagementPage.css';

const TrainerManagementPage = () => {
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
    specialization: '',
    experience: '',
    status: 'Active',
    grade: '',
    custom_commission_percent: ''
  });

  useEffect(() => {
    fetchTrainers();
    fetchDailyStatuses();
  }, []);

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
        grade: trainer.grade || '',
        custom_commission_percent: trainer.custom_commission_percent !== null && trainer.custom_commission_percent !== undefined ? trainer.custom_commission_percent : ''
      });
    } else {
      setCurrentTrainer(null);
      try {
        const { nextId: id } = await getNextTrainerId();
        setNextId(id);
        setFormData({
          trainerId: id,
          name: '',
          specialization: '',
          experience: '',
          status: 'Active',
          grade: '',
          custom_commission_percent: ''
        });
      } catch (error) {
        setFormData({
          trainerId: 'TRN001',
          name: '',
          specialization: '',
          experience: '',
          status: 'Active',
          grade: '',
          custom_commission_percent: ''
        });
      }
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentTrainer(null);
  };

  const handleInputChange = (e) => {
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

                <div className="trainer-info">
                  <h3>{trainer.name}</h3>
                  <p className="specialization">{trainer.specialization || 'General Trainer'}</p>
                  
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

                    {!hasCustomComm && (
                      <div className="slab-progress-container">
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
                    <button className="btn-delete" onClick={() => handleDelete(trainer.id)}>
                      DELETE
                    </button>
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
    </div>
  );
};

export default TrainerManagementPage;

