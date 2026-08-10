import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getClients } from '../api';
import logo from '../assets/olympialogo.jpeg';
import gifLogo from '../assets/dumbbell.gif';

import './Navbar.css';

const Navbar = ({ onLogout, userRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasUnread, setHasUnread] = useState(false);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const isAdmin = userRole === 'admin';
  const isSuperAdmin = userRole === 'superadmin';

  useEffect(() => {
    if (!isAdmin) return;

    const checkUnread = async () => {
      try {
        const data = await getClients();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiredCount = data.filter(c => {
          const expiry = new Date(c.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          return expiry < today;
        }).length;

        const totalAlerts = expiredCount;
        const lastSeen = parseInt(localStorage.getItem('lastSeenExpiredCount') || '0', 10);

        if (totalAlerts > lastSeen) {
          setHasUnread(true);
        } else {
          setHasUnread(false);
          // If the count decreased (e.g. renewals), update lastSeen to sync
          if (totalAlerts < lastSeen) {
            localStorage.setItem('lastSeenExpiredCount', totalAlerts.toString());
          }
        }
      } catch (error) { }
    };

    checkUnread();

    const handleViewed = () => setHasUnread(false);
    const handleSetUnread = () => setHasUnread(true);

    window.addEventListener('expired-plans-viewed', handleViewed);
    window.addEventListener('mark-unread-expired', handleSetUnread);
    
    return () => {
      window.removeEventListener('expired-plans-viewed', handleViewed);
      window.removeEventListener('mark-unread-expired', handleSetUnread);
    };
  }, [isAdmin, location.pathname]);

  const handleBellClick = () => {
    // Removed PT alert dispatch


    // Also trigger regular expiry if on Manage Clients
    if (location.pathname !== '/manage-clients') {
      navigate('/manage-clients');
      setTimeout(() => window.dispatchEvent(new Event('open-expired-plans')), 300);
    } else {
      window.dispatchEvent(new Event('open-expired-plans'));
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Left Section: Logo First */}
        <div className="nav-left">
          {isAdmin && (
            <>
              <NavLink to="/add-client" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                Add Clients
              </NavLink>
              <NavLink to="/manage-clients" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Manage Clients
              </NavLink>
              <NavLink to="/expenses" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                Expenses
              </NavLink>
              <NavLink to="/measurements" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Measurements
              </NavLink>
              <NavLink to="/pt-assignments" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                PT Assignments
              </NavLink>
              <NavLink to="/pt-class-log" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                PT Class Log
              </NavLink>
              <NavLink to="/advance-bookings" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="12 14 15 17 20 12"/></svg>
                Advance Bookings
              </NavLink>
              <NavLink to="/other-services" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                Other Services
              </NavLink>
            </>
          )}
          {isSuperAdmin && (
            <>
              <NavLink to="/dashboard" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                Dashboard
              </NavLink>
              <NavLink to="/manage-clients" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Manage Clients
              </NavLink>
              <NavLink to="/create-invoice" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                Create Invoice
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                Tariff Management
              </NavLink>
              <NavLink to="/gst-report" className={({ isActive }) => `btn-nav-add ${isActive ? 'active' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                GST Register
              </NavLink>
            </>
          )}
        </div>

        {/* Center Section removed as requested */}


        {/* Right Section */}
        <div className="nav-right">
          {isAdmin && (
            <button className="icon-btn" onClick={handleBellClick}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              {hasUnread && <div className="notification-badge"></div>}
            </button>
          )}



          {isSuperAdmin && (
            <button
              className="icon-btn settings-eye-btn"
              onClick={() => navigate('/admin-credentials')}
              title="Admin Credentials"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0Z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
          )}

          <button onClick={handleLogout} className="icon-btn logout-icon-btn" title="Logout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
