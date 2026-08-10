import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCredentials, updateCredentials } from '../api';
import './AdminCredentialsPage.css';

const AdminCredentialsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const [creds, setCreds] = useState({
    superadmin: { username: '', password: '' },
    admin: { username: '', password: '' }
  });

  const [showPasswords, setShowPasswords] = useState({
    superadmin: false,
    admin: false
  });

  useEffect(() => {
    fetchCreds();
  }, []);

  const fetchCreds = async () => {
    try {
      const data = await getCredentials();
      const mapped = {};
      data.forEach(u => {
        mapped[u.role] = { username: u.username, password: u.password };
      });
      setCreds(mapped);
    } catch (err) {
      setError('Failed to fetch credentials');
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
                <p style={{ color: '#64748b', marginTop: '0.75rem', textTransform: 'none', letterSpacing: 'normal', fontSize: '1rem', fontWeight: '500' }}>Manage administrative access levels and passwords</p>
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
                    value={creds.superadmin.username}
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
                      value={creds.superadmin.password}
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
                    value={creds.admin.username}
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
                      value={creds.admin.password}
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
      </main>
    </div>
  );
};

export default AdminCredentialsPage;
