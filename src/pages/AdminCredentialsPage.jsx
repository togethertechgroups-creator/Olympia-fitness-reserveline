import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCredentials, updateCredentials, getGstSettings, updateGstSettings } from '../api';
import './AdminCredentialsPage.css';

const AdminCredentialsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGstSubmitting, setIsGstSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showGstSuccess, setShowGstSuccess] = useState(false);
  const [error, setError] = useState('');
  const [gstError, setGstError] = useState('');
  
  const [creds, setCreds] = useState({
    superadmin: { username: '', password: '' },
    admin: { username: '', password: '' }
  });

  const [showPasswords, setShowPasswords] = useState({
    superadmin: false,
    admin: false
  });

  const [gstSettings, setGstSettings] = useState({
    business_legal_name: '',
    business_gstin: '',
    business_address: '',
    gst_rate_percent: 4.8
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [credsData, gstData] = await Promise.all([
        getCredentials(),
        getGstSettings()
      ]);
      const mapped = {};
      credsData.forEach(u => {
        mapped[u.role] = { username: u.username, password: u.password };
      });
      setCreds(mapped);
      setGstSettings({
        business_legal_name: gstData.business_legal_name || '',
        business_gstin: gstData.business_gstin || '',
        business_address: gstData.business_address || '',
        gst_rate_percent: gstData.gst_rate_percent ?? 4.8
      });
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (role, field, value) => {
    setCreds(prev => ({
      ...prev,
      [role]: { ...prev[role], [field]: value }
    }));
  };

  const togglePassword = (role) => {
    setShowPasswords(prev => ({ ...prev, [role]: !prev[role] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const payload = Object.entries(creds).map(([role, data]) => ({
        role,
        ...data
      }));
      await updateCredentials(payload);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update credentials');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGstSubmit = async (e) => {
    e.preventDefault();
    setGstError('');
    setIsGstSubmitting(true);

    try {
      await updateGstSettings(gstSettings);
      setShowGstSuccess(true);
      setTimeout(() => setShowGstSuccess(false), 3000);
    } catch (err) {
      setGstError(err.message || 'Failed to update GST settings');
    } finally {
      setIsGstSubmitting(false);
    }
  };

  if (loading) return <div className="loading-state">Loading Security Settings...</div>;

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">
        <header className="main-header">
            <div className="header-greeting">
                <h1 style={{ fontSize: '2.5rem', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div>
                        <span style={{ color: '#1e1b4b' }}>Login Page</span>{' '}
                        <span style={{ background: 'linear-gradient(to right, #ea580c, #db2777)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Management</span>
                    </div>
                    <img 
                        src="./password_19027973.gif" 
                        alt="Security" 
                        style={{ width: '58px', height: '58px', objectFit: 'contain', mixBlendMode: 'multiply' }} 
                    />
                </h1>
                <p style={{ color: '#64748b', marginTop: '0.75rem', textTransform: 'none', letterSpacing: 'normal', fontSize: '1rem', fontWeight: '500' }}>Manage administrative access levels, passwords, and GST registration</p>
            </div>
            <div className="header-controls">
                {/* Logo removed as requested - only for Home page */}
            </div>
        </header>

        {showSuccess && (
          <div className="creds-success-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Credentials updated successfully!</span>
          </div>
        )}

        {error && <div className="creds-error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="creds-form">
          <div className="creds-sections">
            {/* Master Login Section */}
            <div className="creds-card master-card">
              <div className="card-badge master-badge">MASTER ACCESS</div>
              <div className="card-header">
                <h3>Master Administrator</h3>
                <p>Full system access and settings control</p>
              </div>
              <div className="card-body">
                <div className="input-group">
                  <label>Username</label>
                  <input 
                    type="text" 
                    value={creds.superadmin?.username || ''}
                    onChange={(e) => handleInputChange('superadmin', 'username', e.target.value)}
                    placeholder="Enter Master username"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Password</label>
                  <div className="password-input-wrapper">
                    <input 
                      type={showPasswords.superadmin ? "text" : "password"}
                      value={creds.superadmin?.password || ''}
                      onChange={(e) => handleInputChange('superadmin', 'password', e.target.value)}
                      placeholder="Enter Master password"
                      required
                    />
                    <button type="button" onClick={() => togglePassword('superadmin')} className="eye-toggle">
                      {showPasswords.superadmin ? 
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                        :
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Login Section */}
            <div className="creds-card admin-card">
              <div className="card-badge admin-badge">STAFF ACCESS</div>
              <div className="card-header">
                <h3>General Administrator</h3>
                <p>Limited access for daily operations</p>
              </div>
              <div className="card-body">
                <div className="input-group">
                  <label>Username</label>
                  <input 
                    type="text" 
                    value={creds.admin?.username || ''}
                    onChange={(e) => handleInputChange('admin', 'username', e.target.value)}
                    placeholder="Enter Admin username"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Password</label>
                  <div className="password-input-wrapper">
                    <input 
                      type={showPasswords.admin ? "text" : "password"}
                      value={creds.admin?.password || ''}
                      onChange={(e) => handleInputChange('admin', 'password', e.target.value)}
                      placeholder="Enter Admin password"
                      required
                    />
                    <button type="button" onClick={() => togglePassword('admin')} className="eye-toggle">
                      {showPasswords.admin ? 
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                        :
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving Changes...' : 'Update All Credentials'}
            </button>
          </div>
        </form>

        {/* ─── GST Registration Section ─────────────────────────────────────────── */}
        <div className="gst-section-divider">
          <span>GST &amp; Business Registration</span>
        </div>

        {showGstSuccess && (
          <div className="creds-success-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>GST settings updated successfully!</span>
          </div>
        )}

        {gstError && <div className="creds-error-banner">{gstError}</div>}

        <form onSubmit={handleGstSubmit} className="creds-form">
          <div className="creds-card gst-card" style={{ maxWidth: '100%' }}>
            <div className="card-badge gst-badge">GST REGISTRATION</div>
            <div className="card-header">
              <h3>Business GST Details</h3>
              <p>GSTIN and business info printed on all invoices and GST reports</p>
            </div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="input-group">
                <label>Business Legal Name</label>
                <input
                  type="text"
                  value={gstSettings.business_legal_name}
                  onChange={(e) => setGstSettings(p => ({ ...p, business_legal_name: e.target.value }))}
                  placeholder="e.g. OLYMPIA FITNESS A/C UNISEX"
                />
              </div>

              <div className="input-group">
                <label>GSTIN (15-digit)</label>
                <input
                  type="text"
                  value={gstSettings.business_gstin}
                  onChange={(e) => setGstSettings(p => ({ ...p, business_gstin: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 33ABCDE1234F1Z5"
                  maxLength={15}
                  style={{ letterSpacing: '0.08em', fontFamily: 'monospace', fontSize: '1rem' }}
                />
              </div>

              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label>Business Address</label>
                <input
                  type="text"
                  value={gstSettings.business_address}
                  onChange={(e) => setGstSettings(p => ({ ...p, business_address: e.target.value }))}
                  placeholder="Full registered business address"
                />
              </div>

              <div className="input-group">
                <label>GST Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="28"
                  value={gstSettings.gst_rate_percent}
                  onChange={(e) => setGstSettings(p => ({ ...p, gst_rate_percent: parseFloat(e.target.value) || 0 }))}
                  placeholder="e.g. 4.8"
                />
                <small style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.3rem', display: 'block' }}>
                  Split equally as CGST + SGST on invoices
                </small>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={isGstSubmitting}>
              {isGstSubmitting ? 'Saving GST Settings...' : 'Update GST Settings'}
            </button>
          </div>
        </form>

      </main>
    </div>
  );
};

export default AdminCredentialsPage;
