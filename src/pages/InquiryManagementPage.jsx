import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getInquiries,
  getNextInquiryId,
  addInquiry,
  updateInquiry,
  deleteInquiry,
  getInquiryStats,
  addFollowUp,
  getFollowUps,
  getStaff
} from '../api';
import './InquiryManagementPage.css';

const InquiryManagementPage = () => {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [stats, setStats] = useState({
    total: 0, today: 0, interested: 0, joined: 0, pending: 0, notInterested: 0
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [currentInquiry, setCurrentInquiry] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [formData, setFormData] = useState({
    InquiryId: '', name: '', phone: '', age: '', gender: 'Male', goal: '', plan: '', trainerRequired: 'No', InquiryDate: new Date().toISOString().split('T')[0], status: 'Follow Up Pending',
    marriedStatus: 'Unmarried', occupation: '', company: 'Work', address: '', email: '', height: '', weight: '', bmi: '', lbm: '', fat: '',
    referredBy: '', lookingFor: 'Weight Loss', enquiredBy: '', messaged: '', tariffDiscussed: '', reminderCall: '', call1: '', call2: '', call3: ''
  });
  const [followUpData, setFollowUpData] = useState({
    date: new Date().toISOString().split('T')[0], notes: '', clientResponse: 'Thinking', nextDate: '', status: 'Interested'
  });
  const [expandedCardId, setExpandedCardId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const inqData = await getInquiries();
      setInquiries(inqData);
    } catch (err) {
      console.error('Failed to fetch inquiries', err);
    }

    try {
      const statsData = await getInquiryStats();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }

    try {
      const staffList = await getStaff();
      setStaffOptions(staffList || []);
    } catch (err) {
      console.error('Failed to fetch staff list', err);
    }

    setLoading(false);
  };

  const handleAddInquiry = async () => {
    const { nextId } = await getNextInquiryId();
    setCurrentInquiry(null);
    setFormData({
      InquiryId: nextId,
      name: '', phone: '', age: '', gender: 'Male', goal: '', plan: '', trainerRequired: 'No',
      InquiryDate: new Date().toISOString().split('T')[0], status: 'Follow Up Pending',
      marriedStatus: 'Unmarried', occupation: '', company: 'Work', address: '', email: '', height: '', weight: '', bmi: '', lbm: '', fat: '',
      referredBy: '', lookingFor: 'Weight Loss', enquiredBy: '', messaged: '', tariffDiscussed: '', reminderCall: '', call1: '', call2: '', call3: ''
    });
    setShowModal(true);
  };

  const handleEditInquiry = (Inquiry) => {
    setCurrentInquiry(Inquiry);
    setFormData({ ...Inquiry });
    setShowModal(true);
  };

  const calculateBMI = (h, w) => {
    const heightInCm = parseFloat(h);
    const weightInKg = parseFloat(w);
    if (heightInCm && weightInKg && heightInCm > 0) {
      const heightInMeters = heightInCm / 100;
      return (weightInKg / (heightInMeters * heightInMeters)).toFixed(2);
    }
    return '';
  };

  const calculateLBM = (h, w, g) => {
    const heightInCm = parseFloat(h);
    const weightInKg = parseFloat(w);
    if (heightInCm && weightInKg && heightInCm > 0) {
      if (g === 'Female') {
        return ((0.29569 * weightInKg) + (0.41813 * heightInCm) - 43.2933).toFixed(2);
      } else {
        // Default to Male formula (includes Male and Other)
        return ((0.32810 * weightInKg) + (0.33929 * heightInCm) - 29.5336).toFixed(2);
      }
    }
    return '';
  };

  const calculateFAT = (w, lbmVal) => {
    const weightInKg = parseFloat(w);
    const lbmInKg = parseFloat(lbmVal);
    if (weightInKg && lbmInKg) {
      return (weightInKg - lbmInKg).toFixed(2);
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        age: formData.age ? parseInt(formData.age, 10) : null
      };

      if (currentInquiry) {
        await updateInquiry(currentInquiry.id, payload);
      } else {
        await addInquiry(payload);
      }
      setShowModal(false);
      await fetchData();
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving Inquiry: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this Inquiry?')) {
      await deleteInquiry(id);
      fetchData();
    }
  };

  const handleOpenFollowUp = async (Inquiry) => {
    setCurrentInquiry(Inquiry);
    const history = await getFollowUps(Inquiry.id);
    setFollowUps(history);
    setExpandedCardId(null);
    setFollowUpData({
      date: new Date().toISOString().split('T')[0],
      notes: '',
      clientResponse: 'Thinking',
      nextDate: '',
      status: Inquiry.status,
      selectedCall: null // Track which call button is selected
    });
    setShowFollowUpModal(true);
  };

  const handleSubmitFollowUp = async (e) => {
    e.preventDefault();
    try {
      // Prepare follow up data
      const followUpToSave = { ...followUpData };
      
      // Prepend call number to notes if selected (to ensure it saves in backend)
      if (followUpData.selectedCall === 1) followUpToSave.notes = `[Call 1] ${followUpData.notes}`;
      if (followUpData.selectedCall === 2) followUpToSave.notes = `[Call 2] ${followUpData.notes}`;
      if (followUpData.selectedCall === 3) followUpToSave.notes = `[Call 3] ${followUpData.notes}`;
      
      // Save follow up history
      await addFollowUp(currentInquiry.id, followUpToSave);
      
      // Also update the inquiry's call fields and status
      const updatedInquiry = {
        ...currentInquiry,
        status: followUpData.status
      };
      if (followUpData.selectedCall === 1) updatedInquiry.call1 = followUpData.notes;
      if (followUpData.selectedCall === 2) updatedInquiry.call2 = followUpData.notes;
      if (followUpData.selectedCall === 3) updatedInquiry.call3 = followUpData.notes;
      
      await updateInquiry(updatedInquiry);
      
      setShowFollowUpModal(false);
      setFollowUpData(prev => ({ ...prev, selectedCall: null })); // Reset selection
      fetchData();
    } catch (err) {
      console.error('Follow up error:', err);
      alert('Error saving follow up');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Joined': return '#10b981';
      case 'Interested': return '#3b82f6';
      case 'Follow Up Pending': return '#f59e0b';
      case 'Not Interested': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="Inquiry-container">
      <header className="Inquiry-header">
        <div className="header-title-group">
          <h1>GYM Inquiry MANAGEMENT</h1>
          <p className="header-subtitle">Manage leads and follow-ups</p>
        </div>
        <button className="btn-add-Inquiry" onClick={handleAddInquiry}>
          + New Inquiry
        </button>
      </header>

      <div className="Inquiry-stats">
        <div className="stat-card">
          <span className="stat-val">{stats.total}</span>
          <span className="stat-lbl">Total Enquiries</span>
        </div>
        <div className="stat-card">
          <span className="stat-val">{stats.today}</span>
          <span className="stat-lbl">Today's Inquiry</span>
        </div>
        <div className="stat-card highlight">
          <span className="stat-val">{stats.interested}</span>
          <span className="stat-lbl">Interested</span>
        </div>
        <div className="stat-card success">
          <span className="stat-val">{stats.joined}</span>
          <span className="stat-lbl">Joined</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-val">{stats.pending}</span>
          <span className="stat-lbl">Pending Follow Up</span>
        </div>
      </div>

      <div className="Inquiry-list-wrapper">
        <table className="Inquiry-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Member Name</th>
              <th>Mobile</th>
              <th>Goal</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Next Follow Up</th>
              <th className="actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No inquiries found. Click "+ New Inquiry" to add one.
                </td>
              </tr>
            ) : (
              inquiries.map(inq => (
                <tr key={inq.id}>
                  <td>{inq.InquiryId}</td>
                  <td><div className="name-cell">{inq.name} <span className="age-tag">{inq.age ? `${inq.age}y` : ''} {inq.gender ? inq.gender[0] : ''}</span></div></td>
                  <td>{inq.phone}</td>
                  <td>{inq.goal || 'General Fitness'}</td>
                  <td>{inq.plan || 'Not Decided'}</td>
                  <td>
                    <span className="status-badge" style={{ backgroundColor: getStatusColor(inq.status) }}>
                      {inq.status}
                    </span>
                  </td>
                  <td>{inq.nextFollowUp || 'None'}</td>
                  <td className="actions-cell-Inquiry">
                    <div className="action-btns-Inquiry">
                      <button className="inq-action-btn follow-up" title="Follow Up" onClick={() => handleOpenFollowUp(inq)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                      </button>
                      <button className="inq-action-btn edit" title="Edit" onClick={() => handleEditInquiry(inq)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path>
                        </svg>
                      </button>
                      <button className="inq-action-btn delete" title="Delete" onClick={() => handleDelete(inq.id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inquiry Modal */}
      {showModal && (
        <div className="inquiry-modal-overlay">
          <div className="inquiry-modal-content">
            <h2>{currentInquiry ? 'Edit Inquiry' : 'New Gym Inquiry'}</h2>
            <form onSubmit={handleSubmit} className="inquiry-form">
              <div className="inquiry-form-scroll-area">
                <div className="form-section-title" style={{ marginTop: 0 }}>Personal Information</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" value={formData.InquiryDate} onChange={e => setFormData({ ...formData, InquiryDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Name</label>
                    <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Age</label>
                    <input type="number" value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Sex</label>
                    <select 
                      value={formData.gender} 
                      onChange={e => {
                        const newGender = e.target.value;
                        const newLbm = calculateLBM(formData.height, formData.weight, newGender);
                        const newFat = calculateFAT(formData.weight, newLbm);
                        setFormData({ ...formData, gender: newGender, lbm: newLbm, fat: newFat });
                      }}
                    >
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Married Status</label>
                    <select value={formData.marriedStatus} onChange={e => setFormData({ ...formData, marriedStatus: e.target.value })}>
                      <option>Married</option>
                      <option>Unmarried</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Occupation</label>
                    <input type="text" value={formData.occupation} onChange={e => setFormData({ ...formData, occupation: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Company Status</label>
                    <select value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })}>
                      <option>Work</option>
                      <option>Retired</option>
                      <option>Others</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Phone No</label>
                    <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>E-Mail ID</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                </div>

                <div className="form-section-title">Body Metrics</div>
                <div className="metrics-grid">
                  <div className="form-group">
                    <label>Height</label>
                    <input 
                       type="text" 
                       value={formData.height} 
                       onChange={e => {
                         const newHeight = e.target.value;
                         const newBmi = calculateBMI(newHeight, formData.weight);
                         const newLbm = calculateLBM(newHeight, formData.weight, formData.gender);
                         const newFat = calculateFAT(formData.weight, newLbm);
                         setFormData({ ...formData, height: newHeight, bmi: newBmi, lbm: newLbm, fat: newFat });
                       }} 
                     />
                  </div>
                  <div className="form-group">
                    <label>Weight</label>
                    <input 
                       type="text" 
                       value={formData.weight} 
                       onChange={e => {
                         const newWeight = e.target.value;
                         const newBmi = calculateBMI(formData.height, newWeight);
                         const newLbm = calculateLBM(formData.height, newWeight, formData.gender);
                         const newFat = calculateFAT(newWeight, newLbm);
                         setFormData({ ...formData, weight: newWeight, bmi: newBmi, lbm: newLbm, fat: newFat });
                       }} 
                     />
                  </div>
                  <div className="form-group">
                    <label>BMI</label>
                    <input type="text" value={formData.bmi} onChange={e => setFormData({ ...formData, bmi: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>LBM</label>
                    <input 
                      type="text" 
                      value={formData.lbm} 
                      onChange={e => {
                        const newLbm = e.target.value;
                        const newFat = calculateFAT(formData.weight, newLbm);
                        setFormData({ ...formData, lbm: newLbm, fat: newFat });
                      }} 
                    />
                  </div>
                  <div className="form-group">
                    <label>FAT</label>
                    <input type="text" value={formData.fat} onChange={e => setFormData({ ...formData, fat: e.target.value })} />
                  </div>
                </div>

                <div className="form-section-title">Training Details</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Referred By</label>
                    <input type="text" value={formData.referredBy} onChange={e => setFormData({ ...formData, referredBy: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Training Type</label>
                    <select value={formData.lookingFor} onChange={e => setFormData({...formData, lookingFor: e.target.value})}>
                      <option>Weight Loss</option>
                      <option>Strength Condition</option>
                      <option>Rehabilitation</option>
                      <option>Injury Management</option>
                      <option>Others</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Trainer Required</label>
                    <select value={formData.trainerRequired} onChange={e => setFormData({ ...formData, trainerRequired: e.target.value })}>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Goal (General)</label>
                    <input type="text" value={formData.goal} onChange={e => setFormData({ ...formData, goal: e.target.value })} placeholder="e.g. Gain Muscle" />
                  </div>
                  <div className="form-group">
                    <label>Plan Interested</label>
                    <input type="text" value={formData.plan} onChange={e => setFormData({ ...formData, plan: e.target.value })} placeholder="e.g. 3 Months" />
                  </div>
                </div>

                <div className="form-section-title">Office Use</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Enquired By</label>
                    <select 
                      value={formData.enquiredBy} 
                      onChange={e => setFormData({ ...formData, enquiredBy: e.target.value })}
                    >
                      <option value="">Select Staff</option>
                      {staffOptions.map(staff => (
                        <option key={staff.id} value={staff.name}>
                          {staff.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Messaged</label>
                    <input type="text" value={formData.messaged} onChange={e => setFormData({ ...formData, messaged: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Tariff Discussed</label>
                    <input type="text" value={formData.tariffDiscussed} onChange={e => setFormData({ ...formData, tariffDiscussed: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Reminder Call</label>
                    <input type="text" value={formData.reminderCall} onChange={e => setFormData({ ...formData, reminderCall: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                      <option>Follow Up Pending</option>
                      <option>Interested</option>
                      <option>Joined</option>
                      <option>Not Interested</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="inquiry-modal-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-save">Save Inquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Follow Up Modal */}
      {showFollowUpModal && (
        <div className="inquiry-modal-overlay">
          <div className="inquiry-modal-content follow-up-modal">
            <h2>Follow Up: {currentInquiry?.name}</h2>

            <div className="follow-up-layout">
              <div className="follow-up-form-side">
                <form onSubmit={handleSubmitFollowUp}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label>Follow Up Date</label>
                      <input type="date" value={followUpData.date} onChange={e => setFollowUpData({ ...followUpData, date: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Client Response</label>
                      <select value={followUpData.clientResponse} onChange={e => setFollowUpData({ ...followUpData, clientResponse: e.target.value })}>
                        <option>Thinking</option>
                        <option>Interested</option>
                        <option>Call Later</option>
                        <option>Joined</option>
                        <option>Not Interested</option>
                        <option>No Response</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Discussion Notes</label>
                      <textarea value={followUpData.notes} onChange={e => setFollowUpData({ ...followUpData, notes: e.target.value })} placeholder="What was discussed?" />
                    </div>
                    <div className="form-group">
                      <label>Next Follow Up Date</label>
                      <input type="date" value={followUpData.nextDate} onChange={e => setFollowUpData({ ...followUpData, nextDate: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Update Status</label>
                      <select value={followUpData.status} onChange={e => setFollowUpData({ ...followUpData, status: e.target.value })}>
                        <option>Follow Up Pending</option>
                        <option>Interested</option>
                        <option>Joined</option>
                        <option>Not Interested</option>
                      </select>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e2d5a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mark As:</span>
                    {(() => {
                      const isCall1Made = followUps.some(fu => fu.notes?.startsWith('[Call 1]'));
                      const isCall2Made = followUps.some(fu => fu.notes?.startsWith('[Call 2]'));
                      const isCall3Made = followUps.some(fu => fu.notes?.startsWith('[Call 3]'));
                      
                      return (
                        <>
                          <button 
                            type="button" 
                            className={`call-btn ${followUpData.selectedCall === 1 ? 'active' : ''}`}
                            onClick={() => setFollowUpData({ ...followUpData, selectedCall: 1 })}
                            disabled={isCall1Made}
                            style={{ 
                              padding: '0.4rem 0.8rem', 
                              borderRadius: '6px', 
                              border: '1.5px solid #dde3ec', 
                              background: (followUpData.selectedCall === 1 && !isCall1Made) ? '#ef4444' : (isCall1Made ? '#f1f5f9' : 'white'), 
                              color: (followUpData.selectedCall === 1 && !isCall1Made) ? 'white' : (isCall1Made ? '#94a3b8' : '#1e293b'), 
                              cursor: isCall1Made ? 'not-allowed' : 'pointer', 
                              fontWeight: '600', 
                              fontSize: '0.85rem', 
                              transition: 'all 0.2s' 
                            }}
                          >
                            Call 1
                          </button>
                          <button 
                            type="button" 
                            className={`call-btn ${followUpData.selectedCall === 2 ? 'active' : ''}`}
                            onClick={() => setFollowUpData({ ...followUpData, selectedCall: 2 })}
                            disabled={isCall2Made}
                            style={{ 
                              padding: '0.4rem 0.8rem', 
                              borderRadius: '6px', 
                              border: '1.5px solid #dde3ec', 
                              background: (followUpData.selectedCall === 2 && !isCall2Made) ? '#ef4444' : (isCall2Made ? '#f1f5f9' : 'white'), 
                              color: (followUpData.selectedCall === 2 && !isCall2Made) ? 'white' : (isCall2Made ? '#94a3b8' : '#1e293b'), 
                              cursor: isCall2Made ? 'not-allowed' : 'pointer', 
                              fontWeight: '600', 
                              fontSize: '0.85rem', 
                              transition: 'all 0.2s' 
                            }}
                          >
                            Call 2
                          </button>
                          <button 
                            type="button" 
                            className={`call-btn ${followUpData.selectedCall === 3 ? 'active' : ''}`}
                            onClick={() => setFollowUpData({ ...followUpData, selectedCall: 3 })}
                            disabled={isCall3Made}
                            style={{ 
                              padding: '0.4rem 0.8rem', 
                              borderRadius: '6px', 
                              border: '1.5px solid #dde3ec', 
                              background: (followUpData.selectedCall === 3 && !isCall3Made) ? '#ef4444' : (isCall3Made ? '#f1f5f9' : 'white'), 
                              color: (followUpData.selectedCall === 3 && !isCall3Made) ? 'white' : (isCall3Made ? '#94a3b8' : '#1e293b'), 
                              cursor: isCall3Made ? 'not-allowed' : 'pointer', 
                              fontWeight: '600', 
                              fontSize: '0.85rem', 
                              transition: 'all 0.2s' 
                            }}
                          >
                            Call 3
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  
                  <div className="inquiry-modal-actions" style={{ marginTop: '1.5rem' }}>
                    <button type="button" onClick={() => setShowFollowUpModal(false)}>Close</button>
                    <button type="submit" className="btn-save">Update Follow Up</button>
                  </div>
                </form>
              </div>

              <div className="follow-up-history-side">
                <h3>Follow-up History</h3>
                <div className="history-list">
                  {followUps.length === 0 ? <p className="empty-history">No follow up records found.</p> : followUps.map(fu => {
                    const cleanNotes = fu.notes ? fu.notes.replace(/^\[Call \d\] /, '') : '';
                    const isExpanded = expandedCardId === fu.id;

                    return (
                      <div 
                        key={fu.id} 
                        className={`history-card ${isExpanded ? 'active' : ''}`}
                        title="Click to view details"
                        onClick={() => setExpandedCardId(isExpanded ? null : fu.id)}
                      >
                        <div className="history-header" style={{ cursor: 'pointer' }}>
                          <span className="history-date">
                            {fu.date}
                            {fu.notes?.startsWith('[Call 1]') && <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontWeight: '800' }}>(Call 1)</span>}
                            {fu.notes?.startsWith('[Call 2]') && <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontWeight: '800' }}>(Call 2)</span>}
                            {fu.notes?.startsWith('[Call 3]') && <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontWeight: '800' }}>(Call 3)</span>}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span className={`history-response ${fu.clientResponse.toLowerCase().replace(' ', '-')}`}>
                              {fu.clientResponse}
                            </span>
                            <svg 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                              style={{ 
                                width: '14px', 
                                height: '14px', 
                                marginLeft: '0.5rem', 
                                color: '#64748b', 
                                transition: 'transform 0.2s', 
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' 
                              }}
                            >
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                          </div>
                        </div>
                        <div className="history-body">
                           {isExpanded ? (
                            <div className="history-details">
                              <div className="history-detail-item">
                                <span className="history-detail-label">Follow Up Date:</span>
                                <span className="history-detail-val">{fu.date}</span>
                              </div>
                              <div className="history-detail-item">
                                <span className="history-detail-label">Client Response:</span>
                                <span className="history-detail-val">{fu.clientResponse}</span>
                              </div>
                              <div className="history-detail-item">
                                <span className="history-detail-label">Status:</span>
                                <span className="history-detail-val">{fu.status}</span>
                              </div>
                              {fu.nextDate && (
                                <div className="history-detail-item">
                                  <span className="history-detail-label">Next Follow Up:</span>
                                  <span className="history-detail-val">{fu.nextDate}</span>
                                </div>
                              )}
                              <div className="history-detail-item history-notes-item">
                                <span className="history-detail-label">Discussion Notes:</span>
                                <p className="history-detail-notes-val">{cleanNotes || 'No notes added.'}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="history-summary">
                              <p className="history-notes-summary">
                                {cleanNotes ? (cleanNotes.length > 50 ? `${cleanNotes.slice(0, 50)}...` : cleanNotes) : 'No notes added.'}
                              </p>
                              <div className="history-footer">
                                <span className="history-status-tag">Status: {fu.status}</span>
                                {fu.nextDate && <span className="history-next-tag">Next: {fu.nextDate}</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InquiryManagementPage;
