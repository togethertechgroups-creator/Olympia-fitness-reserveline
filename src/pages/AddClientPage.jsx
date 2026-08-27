import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { addClient, getNextClientId, getSettings, getTrainers, checkClientId } from '../api';
import { planDurationDays } from '../data/mockData';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { isValidGSTIN } from '../utils/gstValidator';
import { calculatePlanExpiryDate } from '../utils/formatDate';
import './AddClientPage.css';

const getTodayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const AddClientPage = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({});
  const [formData, setFormData] = useState({
    clientId: '2857',
    name: '',
    gender: 'Male',
    phone: '',
    plan: '',
    programType: 'Strengthening',
    fromDate: getTodayDate(),
    personalTraining: false,
    ptCategory: 'None',
    ptPackage: '1 Month Package',
    ptFromDate: getTodayDate(),
    ptToDate: '',
    diet: false,
    paymentMethod: 'CASH',
    trainerId: '',
    admissionDate: getTodayDate(),
    paidAmount: '',
    hasGst: false,
    gstin: '',
    discount: ''
  });

  const [trainers, setTrainers] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [previewClient, setPreviewClient] = useState(null);
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState({ toDate: '', totalAmount: 0 });
  const [alertConfig, setAlertConfig] = useState({ isOpen: false, title: '', message: '', type: 'error' });
  const [profileImage, setProfileImage] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [blockedTargetUrl, setBlockedTargetUrl] = useState('');
  const [isConfirmExitOpen, setIsConfirmExitOpen] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image must be smaller than 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result);
        setIsDirty(true);
      };
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

      if (target.closest('.alert-modal-card')) {
        return;
      }

      const href = target.getAttribute('href');
      
      if (href && !href.startsWith('#/add-client') && href !== '#') {
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
    fetchSettings();
    fetchTrainers();
    fetchNextClientId();
  }, []);

  const fetchNextClientId = async () => {
    try {
      const data = await getNextClientId();
      if (data && data.nextId) {
        setFormData(prev => ({
          ...prev,
          clientId: (prev.clientId && prev.clientId !== '2857') ? prev.clientId : data.nextId
        }));
      }
    } catch (error) {
      console.error('Failed to fetch next client ID:', error);
      setFormData(prev => ({
        ...prev,
        clientId: prev.clientId ? prev.clientId : '2857'
      }));
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

  const fetchTrainers = async () => {
    try {
      const data = await getTrainers();
      setTrainers(data.filter(t => t.status === 'Active'));
    } catch (error) {
      console.error('Failed to fetch trainers');
    }
  };

  // Automatic ID fetching disabled by request

  useEffect(() => {
    if (previewClient || alertConfig.isOpen || showSuccess) {
      document.body.setAttribute('data-alert-open', 'true');
    } else {
      document.body.removeAttribute('data-alert-open');
    }
    return () => document.body.removeAttribute('data-alert-open');
  }, [previewClient, alertConfig.isOpen, showSuccess]);

  useEffect(() => {
    if (!formData.plan) {
      setSummary({ toDate: '', totalAmount: 0 });
      return;
    }
    // Granular Membership Pricing
    const basePrice = settings[`${formData.plan}_Strengthening`] || 0;

    // Granular PT Pricing
    let ptPrice = 0;
    if (formData.ptCategory !== 'None') {
      const ptPrefix = formData.ptCategory === 'Certified PT' ? 'PT_Certified' : 'PT_Pro';
      const ptSuffix = formData.ptPackage === '3 Months Package' ? '_3M' : '_1M';
      ptPrice = settings[`${ptPrefix}${ptSuffix}`] || 0;
    }

    const dietPrice = formData.diet ? (settings.Diet || 0) : 0;

    const startStr = formData.fromDate || getTodayDate();
    const expiryDateStr = calculatePlanExpiryDate(startStr, formData.plan, settings[`${formData.plan}_duration`]);

    const subtotal = basePrice + ptPrice + dietPrice;
    const discountVal = parseFloat(formData.discount || 0);
    setSummary({
      toDate: expiryDateStr,
      totalAmount: Math.max(0, subtotal - discountVal)
    });
  }, [formData.plan, formData.fromDate, formData.ptCategory, formData.ptPackage, formData.diet, formData.discount, settings]);

  const handleNextStep = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.clientId || formData.clientId.trim() === '') newErrors.clientId = 'Client ID is required.';
    if (formData.name.trim().length < 3) newErrors.name = 'Valid name required (min 3 chars).';
    if (!/^\d{10}$/.test(formData.phone)) newErrors.phone = 'Requires 10-digit number.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      document.querySelector(`[name="${Object.keys(newErrors)[0]}"]`)?.focus();
      return;
    }
    setErrors({});
    setCurrentStep(2);
  };

  const handlePrevStep = (e) => {
    e.preventDefault();
    setCurrentStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.plan) newErrors.plan = 'Membership plan is required.';

    if (formData.hasGst) {
      if (!formData.gstin || !isValidGSTIN(formData.gstin)) {
        newErrors.gstin = 'Please enter a valid 15-character GSTIN (e.g. 33ABCDE1234F1Z5)';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      document.querySelector(`[name="${Object.keys(newErrors)[0]}"]`)?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const { exists } = await checkClientId(formData.clientId);
      if (exists) {
        playAlertSound();
        setAlertConfig({
          isOpen: true,
          title: 'Duplicate Client ID',
          message: `The Client ID "${formData.clientId}" is already registered. Please enter a unique ID.`,
          type: 'error'
        });
        setIsSubmitting(false);
        return;
      }

      const finalData = {
        ...formData,
        profileImage: profileImage,
        personalTraining: formData.ptCategory !== 'None',
        expiryDate: summary.toDate,
        amount: summary.totalAmount,
        paidAmount: formData.paidAmount !== '' ? parseFloat(formData.paidAmount) : summary.totalAmount,
        status: 'Active',
        discount_amount: formData.discount ? parseFloat(formData.discount) : 0
      };
      setIsDirty(false);
      const newClient = await addClient(finalData);
      newClient.discount_amount = finalData.discount_amount;
      setShowSuccess(true);
      setPreviewClient(newClient);
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message || "Registration failed. Please try again.";
      alert(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e) => {
    setIsDirty(true);
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      let val = type === 'checkbox' ? checked : value;
      if (name === 'phone') {
        val = val.replace(/\D/g, '').slice(0, 10);
      }
      const nextState = { ...prev, [name]: val };
      if (name === 'fromDate') nextState.ptFromDate = value;
      return nextState;
    });
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleProceedExit = () => {
    setIsDirty(false);
    setIsConfirmExitOpen(false);
    const url = blockedTargetUrl.startsWith('#') ? blockedTargetUrl.substring(1) : blockedTargetUrl;
    navigate(url);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      const form = e.target.closest('form');
      if (!form) return;
      const focusableElements = 'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, button[type="submit"]';
      const focusable = Array.from(form.querySelectorAll(focusableElements)).filter(el => {
        return !el.disabled && !el.readOnly && el.offsetParent !== null;
      });
      const index = focusable.indexOf(e.target);
      if (index > -1 && index + 1 < focusable.length) {
        focusable[index + 1].focus();
      }
    }
  };

  return (
    <div className="add-client-container">
      <div className="add-client-content">
        <div className="registration-card reveal">
          <div className="card-header inline-header">
            <Link to="/manage-clients" className="btn-back-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              BACK
            </Link>
            <div className="card-title-group">
              <h2>Client Registration</h2>
              <span className="subtitle">Onboarding Application Form</span>
            </div>
          </div>

          {showSuccess && (
            <div className="success-toast">
              <div className="toast-msg">
                <span className="toast-icon">✓</span>
                <span>Client registered successfully! Redirecting...</span>
              </div>
            </div>
          )}

          <div className="wizard-stepper">
            <div className={`stepper-step ${currentStep >= 1 ? 'active' : ''}`}>
              <div className="step-circle">1</div>
              <span className="step-label">Personal Info</span>
            </div>
            <div className="stepper-line"></div>
            <div className={`stepper-step ${currentStep >= 2 ? 'active' : ''}`}>
              <div className="step-circle">2</div>
              <span className="step-label">Membership & Billing</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="card-form-body">

            <div className="bento-grid-2x2">
              {currentStep === 1 && (
                <>
                  {/* Panel 1: Personal Details */}
                  <div className="bento-panel">
                    <h3 className="col-heading">Personal Details</h3>

                    <div className="avatar-upload-container">
                      <div className="avatar-preview">
                        {profileImage ? (
                          <img src={profileImage} alt="Profile" />
                        ) : (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
                        <label className="avatar-upload-btn">
                          Upload Photo
                          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                        </label>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: '1.2' }}>Max file size 2MB</p>
                      </div>
                    </div>

                    <div className="input-group">
                      <label className="input-label">Client ID No. {errors.clientId && <span className="inline-error">({errors.clientId})</span>}</label>
                      <input
                        type="text" name="clientId"
                        className={`input-field ${errors.clientId ? 'error-border' : ''}`}
                        value={formData.clientId} onChange={handleInputChange}
                        placeholder="e.g. 2857"
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
                  </div>

                  {/* Panel 2: Contact & Admission */}
                  <div className="bento-panel">
                    <h3 className="col-heading">Contact & Admission</h3>
                    
                    <div className="input-group">
                      <label className="input-label">Mobile Number {errors.phone && <span className="inline-error">({errors.phone})</span>}</label>
                      <div className={`mobile-input-wrapper ${errors.phone ? 'error-border' : ''}`}>
                        <span className="mobile-prefix">+91</span>
                        <input
                          type="tel" name="phone" className="mobile-input input-field"
                          value={formData.phone} onChange={handleInputChange}
                          placeholder="Enter 10-digit mobile number"
                          maxLength={10}
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

                    <div className="input-group">
                      <label className="input-label">Admission Date</label>
                      <input
                        type="date" name="admissionDate" className="input-field"
                        value={formData.admissionDate} onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </>
              )}

              {currentStep === 2 && (
                <>
                  {/* Panel 3: Membership Selection */}
                  <div className="bento-panel">
                    <h3 className="col-heading">Membership Selection</h3>
                    <div className="membership-grid">
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
                            .sort((a, b) => {
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

                      {/* Program Type Removed */}

                      <div className="input-group">
                        <label className="input-label">Payment Method</label>
                        <select name="paymentMethod" className="input-field" value={formData.paymentMethod} onChange={handleInputChange}>
                          <option value="CASH">CASH</option>
                          <option value="UPI">UPI</option>
                          <option value="CARD">CARD</option>
                          <option value="BANK TRANSFER">BANK TRANSFER</option>
                        </select>
                      </div>

                      {/* GST Number Capture */}
                      <div className="input-group" style={{ gridColumn: '1 / -1', background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <label className="input-label" style={{ marginBottom: '0.35rem' }}>Does this client have a GST number?</label>
                        <div style={{ display: 'flex', gap: '1.25rem', marginBottom: formData.hasGst ? '0.5rem' : '0' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input
                              type="radio"
                              name="hasGst"
                              checked={formData.hasGst}
                              onChange={() => setFormData(prev => ({ ...prev, hasGst: true }))}
                            />
                            Yes (B2B Client)
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input
                              type="radio"
                              name="hasGst"
                              checked={!formData.hasGst}
                              onChange={() => setFormData(prev => ({ ...prev, hasGst: false }))}
                            />
                            No (B2C Consumer)
                          </label>
                        </div>

                        {formData.hasGst && (
                          <div>
                            <input
                              type="text"
                              name="gstin"
                              className={`input-field ${errors.gstin ? 'error-border' : ''}`}
                              placeholder="Enter 15-Digit GSTIN (e.g. 33ABCDE1234F1Z5)"
                              maxLength={15}
                              value={formData.gstin}
                              onChange={(e) => setFormData(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                              style={{ background: '#ffffff', fontWeight: '700' }}
                            />
                            {errors.gstin && (
                              <div style={{ color: '#dc2626', fontSize: '0.78rem', fontWeight: '700', marginTop: '4px' }}>
                                ⚠️ {errors.gstin}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Panel 4: Activation Scope & Summary */}
                  <div className="bento-panel summary-panel">
                    <h3 className="col-heading">Activation & Overview</h3>
                    <div className="activation-grid">
                      <div className="dates-area">
                        <div className="input-group">
                          <label className="input-label">Join Date</label>
                          <input type="date" name="fromDate" className="input-field" value={formData.fromDate} onChange={handleInputChange} />
                        </div>
                        <div className="input-group">
                          <label className="input-label">Expires On</label>
                          <input type="date" className="input-field readonly" value={summary.toDate} readOnly />
                        </div>
                        <div className="input-group">
                          <label className="input-label">Discount Amount (₹)</label>
                          <input
                            type="number"
                            name="discount"
                            className="input-field"
                            placeholder="Optional Discount (₹)"
                            value={formData.discount}
                            onChange={handleInputChange}
                            min="0"
                          />
                        </div>
                      </div>

                      <div className="summary-box">
                        <div className="summary-row">
                          <span>{formData.plan || 'No Plan'}</span>
                          <span> ₹ {(formData.plan ? settings[`${formData.plan}_Strengthening`] : 0)?.toLocaleString() || 0}</span>
                        </div>
                        <div className="summary-total">
                          <span>TOTAL AMOUNT:</span>
                          <span className="total-green">
                            <span className="currency-symbol">₹</span> {summary.totalAmount.toLocaleString()}
                          </span>
                        </div>
                        <div className="summary-total" style={{ marginTop: '0.5rem', borderTop: 'none', paddingTop: 0 }}>
                          <span style={{ whiteSpace: 'nowrap' }}>PAID AMOUNT:</span>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span className="currency-symbol">₹</span>
                            <input
                              type="number"
                              name="paidAmount"
                              style={{
                                width: '80px',
                                textAlign: 'right',
                                background: 'transparent',
                                color: 'var(--primary-neon)',
                                border: 'none',
                                borderBottom: '1px solid var(--primary-neon)',
                                borderRadius: 0,
                                padding: '2px 4px',
                                fontSize: '1.25rem',
                                fontFamily: 'var(--font-display)',
                                fontWeight: '700',
                                outline: 'none'
                              }}
                              placeholder={summary.totalAmount}
                              value={formData.paidAmount}
                              onChange={handleInputChange}
                            />
                          </div>
                        </div>
                        <div className="summary-total" style={{ marginTop: '0.5rem', borderTop: 'none', paddingTop: 0 }}>
                          <span style={{ whiteSpace: 'nowrap' }}>DUE AMOUNT:</span>
                          <span className="text-orange" style={{ color: '#ff9800', fontWeight: 'bold', fontSize: '1.25rem', fontFamily: 'var(--font-display)' }}>
                            <span className="currency-symbol">₹</span> {Math.max(0, summary.totalAmount - (formData.paidAmount !== '' ? parseFloat(formData.paidAmount) : summary.totalAmount)).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="form-footer-actions">
              {currentStep === 1 && (
                <>
                  <Link to="/manage-clients" className="btn-cancel-gray" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Discard</Link>
                  <button type="button" className="btn-save-green" onClick={handleNextStep}>
                    Next Step ➔
                  </button>
                </>
              )}
              {currentStep === 2 && (
                <>
                  <button type="button" className="btn-cancel-gray" onClick={handlePrevStep}>
                    ← Back
                  </button>
                  <button type="submit" className="btn-save-green" disabled={isSubmitting}>
                    {isSubmitting ? 'PROCESSING...' : 'INITIALIZE PROFILE'}
                  </button>
                </>
              )}
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

      <InvoicePreviewModal
        isOpen={!!previewClient}
        onClose={() => {
          setPreviewClient(null);
          navigate('/manage-clients');
        }}
        client={previewClient}
        title="Client Registration Completed"
      />

      {/* Navigation Blocker Modal */}
      {isConfirmExitOpen && (
        <div className="alert-modal-overlay" style={{ zIndex: 11000 }}>
          <div className="alert-modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="alert-icon-circle warning" style={{ backgroundColor: '#eab308' }}>⚠</div>
            <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800' }}>Unsaved Changes</h3>
            <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
              You have started filling out the registration form. Are you sure you want to exit? Your changes will be lost.
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
    </div>
  );
};

export default AddClientPage;


