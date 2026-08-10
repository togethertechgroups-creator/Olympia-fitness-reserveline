import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { planDurationDays } from '../data/mockData';
import { getClientById, updateClient, getSettings, getTrainers } from '../api';
import './AddClientPage.css'; // Reuse AddClientPage styles

const EditClientPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [settings, setSettings] = useState({});
  const [formData, setFormData] = useState({
    clientId: '',
    name: '',
    gender: 'Male',
    phone: '',
    plan: '',
    programType: 'Strengthening',
    fromDate: '',
    expiryDate: '',
    personalTraining: false,
    ptCategory: 'None',
    ptPackage: '1 Month Package',
    ptFromDate: '',
    ptToDate: '',
    diet: false,
    amount: 0,
    status: 'Active',
    admissionDate: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [initialPlanDetails, setInitialPlanDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ toDate: '', totalAmount: 0 });
  const [trainers, setTrainers] = useState([]);
  const [alertConfig, setAlertConfig] = useState({ isOpen: false, title: '', message: '', type: 'error' });
  const [profileImage, setProfileImage] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image must be smaller than 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setProfileImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const playAlertSound = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.5;
      audio.play();
    } catch (e) {
      console.error('Failed to play sound:', e);
    }
  };


  useEffect(() => {
    fetchClient();
    fetchSettings();
    fetchTrainers();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [id]);

  const fetchTrainers = async () => {
    try {
      const data = await getTrainers();
      setTrainers(data); // Include inactive ones for historical data
    } catch (error) {
      console.error('Failed to fetch trainers');
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to fetch pricing settings');
    }
  };

  const fetchClient = async () => {
    try {
      const data = await getClientById(id);
      const details = {
        plan: data.plan,
        ptCategory: data.ptCategory || 'None',
        ptPackage: data.ptPackage || '1 Month Package',
        diet: !!data.diet,
        fromDate: data.fromDate || ''
      };
      setInitialPlanDetails(details);
      setProfileImage(data.profileImage || null);
      setFormData({
        clientId: data.clientId || data.id,
        name: data.name,
        gender: data.gender || 'Male',
        phone: data.phone.replace('+91', '').trim(),
        ...details,
        fromDate: data.fromDate || '',
        personalTraining: !!data.personalTraining,
        ptFromDate: data.ptFromDate || '',
        ptToDate: data.ptToDate || '',
        amount: data.amount || 0,
        status: data.status || 'Active',
        trainerId: data.trainerId || '',
        admissionDate: data.admissionDate || ''
      });
      // Store initial amount and expiry date natively
      setSummary({ toDate: data.expiryDate || '', totalAmount: data.amount || 0 });
    } catch (error) {
      alert('Failed to fetch client data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!formData.plan || !Object.keys(settings).length || !initialPlanDetails) return;
    
    const basePrice = settings[`${formData.plan}_Strengthening`] || 0;
    
    let ptPrice = 0;
    if (formData.ptCategory !== 'None') {
      const ptPrefix = formData.ptCategory === 'Certified PT' ? 'PT_Certified' : 'PT_Pro';
      const ptSuffix = formData.ptPackage === '3 Months Package' ? '_3M' : '_1M';
      ptPrice = settings[`${ptPrefix}${ptSuffix}`] || 0;
    }
    
    const dietPrice = formData.diet ? (settings.Diet || 0) : 0;
    const currentCalculatedTotal = basePrice + ptPrice + dietPrice;

    // Check if plan details have actually changed from the original data
    const hasPlanChanged = 
      formData.plan !== initialPlanDetails.plan ||
      formData.ptCategory !== initialPlanDetails.ptCategory ||
      formData.ptPackage !== initialPlanDetails.ptPackage ||
      formData.diet !== initialPlanDetails.diet ||
      formData.fromDate !== initialPlanDetails.fromDate;

    const start = new Date(formData.fromDate);
    if (!isNaN(start.getTime())) {
      let durationMonths = 1;
      if (formData.plan === 'Quarterly') durationMonths = 3;
      else if (formData.plan === 'Half-Yearly' || formData.plan === 'Semi-Annual') durationMonths = 6;
      else if (formData.plan === 'Annual') durationMonths = 12;

      let duration = 0;
      let tempDate = new Date(start);
      for (let i = 0; i < durationMonths; i++) {
        if (tempDate.getMonth() === 1) { // February
          duration += 28;
        } else {
          duration += 30;
        }
        tempDate = new Date(tempDate.getFullYear(), tempDate.getMonth() + 1, 1);
      }

      const end = new Date(start);
      end.setDate(start.getDate() + duration);
      
      setSummary(prev => ({ 
        toDate: hasPlanChanged ? end.toISOString().split('T')[0] : (prev.toDate || end.toISOString().split('T')[0]), 
        totalAmount: hasPlanChanged ? currentCalculatedTotal : (formData.amount || prev.totalAmount)
      }));
    }
  }, [formData.plan, formData.programType, formData.fromDate, formData.ptCategory, formData.ptPackage, formData.diet, settings, initialPlanDetails]);

  // Removed PT date calculation useEffect


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.name.length < 3) {
      setErrors({ name: 'Please enter a valid name' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      await updateClient(id, {
        ...formData,
        profileImage: profileImage,
        personalTraining: formData.ptCategory !== 'None',
        expiryDate: summary.toDate,
        amount: summary.totalAmount
      });
      setShowSuccess(true);
      setTimeout(() => navigate('/manage-clients'), 1500);
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message || "Failed to update profile.";
      if (errorMsg.includes('Client ID is already in use')) {
        playAlertSound();
        setAlertConfig({
          isOpen: true,
          title: 'Duplicate Client ID',
          message: `The Client ID "${formData.clientId}" is already registered. Please enter a unique ID for this client.`,
          type: 'error'
        });
      } else {
        alert(errorMsg);
      }
    } finally {

      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const nextState = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'fromDate') {
        nextState.ptFromDate = value;
      }
      return nextState;
    });
    if (name === 'name' && value.length >= 3) setErrors({});
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading client details...</div>;

  return (
    <div className="add-client-container">
      <div className="add-client-content">
        <div className="registration-card reveal">
          <div className="card-header inline-header">
            <div className="card-title-group">
              <Link to="/manage-clients" className="btn-back-link">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                BACK
              </Link>
              <h2>Edit Client Profile</h2>
              <span className="subtitle">Modify membership details for {formData.name}</span>
            </div>
          </div>

          {showSuccess && (
            <div className="success-toast">
              <div className="toast-msg">
                <span className="toast-icon">✓</span>
                <span>Client updated successfully! Redirecting...</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="card-form-body">
            
            <div className="form-split-layout">
                {/* COLUMN 1: CLIENT IDENTITY */}
                <div className="form-column">
                  <div className="bento-panel">
                      <h3 className="col-heading">Personal Details</h3>
                      <div className="avatar-upload-container">
                        <div className="avatar-preview">
                          {profileImage ? (
                            <img src={profileImage} alt="Profile" />
                          ) : (
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          )}
                        </div>
                        <label className="avatar-upload-btn">
                          Upload Photo
                          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                        </label>
                      </div>

                      <div className="input-group">
                          <label className="input-label">Client ID No.</label>
                          <input 
                              type="text" name="clientId" className="input-field" 
                              value={formData.clientId} onChange={handleInputChange} 
                              placeholder="Enter Client ID"
                          />
                      </div>
                      <div className="input-group">
                          <label className="input-label">Full Name {errors.name && <span className="inline-error">({errors.name})</span>}</label>
                          <input 
                              type="text" name="name" 
                              className={`input-field ${errors.name ? 'error-border' : ''}`}
                              value={formData.name} onChange={handleInputChange} 
                              placeholder="Enter full name"
                          />
                      </div>
                      <div className="input-group">
                          <label className="input-label">Admission Date</label>
                          <input 
                              type="date" name="admissionDate" className="input-field" 
                              value={formData.admissionDate} onChange={handleInputChange} 
                          />
                      </div>
                  </div>

                  <div className="bento-panel">
                      <h3 className="col-heading">Contact Details</h3>
                      <div className="input-group">
                          <label className="input-label">Mobile Number {errors.phone && <span className="inline-error">({errors.phone})</span>}</label>
                          <div className={`mobile-input-wrapper ${errors.phone ? 'error-border' : ''}`}>
                              <span className="mobile-prefix">+91</span>
                              <input 
                                  type="tel" name="phone" className="mobile-input input-field"
                                  value={formData.phone} onChange={handleInputChange}
                                  placeholder="Enter mobile number"
                              />
                          </div>
                      </div>
                      <div className="input-group">
                          <label className="input-label">Gender</label>
                          <div className="gender-options">
                              {['Male', 'Female', 'Other'].map(g => (
                              <label key={g} className={`gender-btn ${formData.gender === g ? 'active' : ''}`}>
                                  <input 
                                  type="radio" name="gender" value={g} 
                                  checked={formData.gender === g} onChange={handleInputChange} 
                                  style={{ display: 'none' }}
                                  />
                                  {g}
                              </label>
                              ))}
                          </div>
                      </div>
                  </div>
                </div>

                {/* COLUMN 2: MEMBERSHIP & SUMMARY */}
                <div className="form-column">
                  <div className="bento-panel">
                      <h3 className="col-heading">Membership Selection</h3>
                      <div className="membership-grid-v">
                          <div className="input-group">
                              <label className="input-label">Membership Plan {errors.plan && <span className="inline-error">({errors.plan})</span>}</label>
                              <select name="plan" className={`input-field ${errors.plan ? 'error-border' : ''}`} value={formData.plan} onChange={handleInputChange}>
                                  <option value="">-- Choose Plan --</option>
                                  {Object.keys(settings)
                                  .filter(k => k.endsWith('_Strengthening') && !k.startsWith('PT_') && !k.startsWith('Diet'))
                                  .map(k => k.replace('_Strengthening', ''))
                                  .filter(planBase => {
                                    const isHidden = settings[`${planBase}_hidden`] === 1 || settings[`${planBase}_hidden`] === '1';
                                    return !isHidden || formData.plan === planBase;
                                  })
                                  .sort((a,b) => {
                                      const standardOrder = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annual'];
                                      const idxA = standardOrder.indexOf(a);
                                      const idxB = standardOrder.indexOf(b);
                                      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                                      if (idxA !== -1) return -1;
                                      if (idxB !== -1) return 1;
                                      return a.localeCompare(b);
                                  })
                                  .map(planBase => (
                                      <option key={planBase} value={planBase}>{planBase === 'Half-Yearly' ? 'Semi-Annual' : planBase}</option>
                                  ))}
                              </select>
                          </div>
                          
                          <div className="input-group">
                              <label className="input-label">Payment Method</label>
                              <select name="paymentMethod" className="input-field" value={formData.paymentMethod} onChange={handleInputChange}>
                                  <option value="CASH">CASH</option>
                                  <option value="UPI">UPI</option>
                                  <option value="CARD">CARD</option>
                                  <option value="BANK TRANSFER">BANK TRANSFER</option>
                              </select>
                          </div>
                      </div>
                  </div>

                  <div className="bento-panel summary-panel-v">
                       <h3 className="col-heading">Activation Scope</h3>
                       <div className="activation-area-v">
                           <div className="input-group">
                               <label className="input-label">Join Date</label>
                               <input type="date" name="fromDate" className="input-field" value={formData.fromDate} onChange={handleInputChange} />
                           </div>
                           <div className="input-group">
                               <label className="input-label">Expires On</label>
                               <input type="date" className="input-field readonly" value={summary.toDate} readOnly />
                           </div>

                          <div className="summary-box-mini">
                              <div className="summary-row">
                                  <span>{formData.plan || 'No Plan'}</span>
                                  <span> ₹ {(formData.plan ? settings[`${formData.plan}_Strengthening`] : 0)?.toLocaleString() || 0}</span>
                              </div>
                              <div className="summary-total-mini">
                                  <span>TOTAL:</span>
                                  <span className="total-green">₹ {summary.totalAmount.toLocaleString()}</span>
                              </div>
                          </div>
                       </div>
                  </div>
                </div>
            </div>

            <div className="form-footer-actions">
              <Link to="/manage-clients" className="btn-cancel-gray" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Discard</Link>
              <button type="submit" className="btn-save-green" disabled={isSubmitting}>
                {isSubmitting ? 'UPDATING...' : 'UPDATE PROFILE'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Custom Validation Alert Modal */}
      {alertConfig.isOpen && (
        <div className="alert-modal-overlay">
          <div className="alert-modal-card">
            <div className={`alert-icon-circle ${alertConfig.type}`}>
              {alertConfig.type === 'error' ? '!' : '⚠'}
            </div>
            <h3>{alertConfig.title}</h3>
            <p>{alertConfig.message}</p>
            <div className="alert-modal-actions">
              <button 
                className={`btn-alert-primary ${alertConfig.type}`}
                onClick={() => setAlertConfig({ ...alertConfig, isOpen: false })}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditClientPage;
