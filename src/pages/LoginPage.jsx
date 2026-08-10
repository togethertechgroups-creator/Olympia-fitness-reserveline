import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../api';
import loginLogo from '../assets/olympialogo.jpeg';
import './LoginPage.css';

const LoginPage = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('superadmin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoggingIn) return;

    setError('');
    setIsLoggingIn(true);

    try {
      const response = await loginUser({ password, role });

      if (response.success) {
        sessionStorage.removeItem('hasSeenPTAlert');
        sessionStorage.removeItem('hasSeenPTAlertDashboard');

        onLogin(response.role);
        const target = response.role === 'superadmin' ? '/dashboard' : '/manage-clients';
        navigate(target);
      }
    } catch (err) {
      setError(err.message || 'Invalid password. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left Side: Login Box */}
      <div className="login-form-side">
        <div className="beast-login-card">
          <div className="login-header">
            <div className="logo-badge-container">
              <img src={loginLogo} alt="Olympia Fitness Logo" className="beast-login-logo" />
            </div>
            <h2 className="login-title">OLYMPIA FITNESS</h2>
            <p className="login-subtitle">Administrator Access</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="role-selector-wrapper">
              <div className="role-selector-tabs">
                <button
                  type="button"
                  className={`role-tab ${role === 'superadmin' ? 'active' : ''}`}
                  onClick={() => setRole('superadmin')}
                >
                  Super Admin
                </button>
                <button
                  type="button"
                  className={`role-tab ${role === 'admin' ? 'active' : ''}`}
                  onClick={() => setRole('admin')}
                >
                  Admin
                </button>
                <div className={`role-tab-indicator ${role}`} />
              </div>
            </div>

            {error && (
              <div className="error-banner">
                <span className="error-text">{error}</span>
              </div>
            )}

            <div className="form-group">
              <div className="input-container">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="beast-login-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0Z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="login-submit-btn">
              {isLoggingIn ? 'Verifying...' : 'Initialize Session'}
            </button>
          </form>

          <div className="login-card-footer">
            <p className="footer-disclaimer">
              Powered by <span className="powered-highlight">Together Tech</span>
            </p>
          </div>
        </div>
      </div>

      {/* Right Side: Full Poster Image */}
      <div className="login-image-side">
        <img src={loginLogo} alt="Olympia Fitness Poster" className="login-poster-img" />
      </div>
    </div>
  );
};

export default LoginPage;
