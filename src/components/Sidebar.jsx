import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = ({ onLogout, isCollapsed, onToggle }) => {
  const navigate = useNavigate();

  return (
    <nav className={`sidebar-global ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-left">
          <div className="sidebar-brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M9 4v16M15 4v16"/>
            </svg>
          </div>
          <div className="sidebar-brand-info">
            <span className="sidebar-brand-title">OLYMPIA</span>
            <span className="sidebar-brand-sub">FITNESS CLUB</span>
          </div>
        </div>
        <button 
          className="sidebar-toggle-btn" 
          onClick={onToggle}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          aria-label="Toggle Sidebar"
        >
          {isCollapsed ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          )}
        </button>
      </div>

      <div className="sidebar-global-links">
        
        {/* 1. Dashboard */}
        <NavLink to="/dashboard" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="9" rx="1"/>
            <rect x="14" y="3" width="7" height="5" rx="1"/>
            <rect x="14" y="12" width="7" height="9" rx="1"/>
            <rect x="3" y="16" width="7" height="5" rx="1"/>
          </svg>
          <span className="sidebar-link-text">Dashboard</span>
          <span className="sidebar-tooltip">Dashboard</span>
        </NavLink>

        {/* 2. Manage Clients */}
        <NavLink to="/manage-clients" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="sidebar-link-text">Manage Clients</span>
          <span className="sidebar-tooltip">Manage Clients</span>
        </NavLink>

        {/* 2. Add Client */}
        <NavLink to="/add-client" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="16" y1="11" x2="22" y2="11"/>
          </svg>
          <span className="sidebar-link-text">Add Client</span>
          <span className="sidebar-tooltip">Add Client</span>
        </NavLink>

        {/* 3. Create Invoice */}
        <NavLink to="/create-invoice" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <path d="M14 2v6h6"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
          <span className="sidebar-link-text">Create Invoice</span>
          <span className="sidebar-tooltip">Create Invoice</span>
        </NavLink>

        {/* 4. Tariff Management */}
        <NavLink to="/settings" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <circle cx="7" cy="7" r="1.5"/>
          </svg>
          <span className="sidebar-link-text">Tariff Management</span>
          <span className="sidebar-tooltip">Tariff Management</span>
        </NavLink>

        {/* 5. GST Sales Register */}
        <NavLink to="/gst-report" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <path d="M14 2v6h6"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9" x2="14" y2="9"/>
          </svg>
          <span className="sidebar-link-text">GST Sales Register</span>
          <span className="sidebar-tooltip">GST Sales Register</span>
        </NavLink>

        {/* 6. Other Services */}
        <NavLink to="/other-services" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <span className="sidebar-link-text">Other Services</span>
          <span className="sidebar-tooltip">Other Services</span>
        </NavLink>

        {/* 7. Financial Transactions */}
        <NavLink to="/transactions" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
            <rect x="4" y="14" width="4" height="3" rx="0.5"/>
          </svg>
          <span className="sidebar-link-text">Financial Transactions</span>
          <span className="sidebar-tooltip">Financial Transactions</span>
        </NavLink>

        {/* 8. Expenses */}
        <NavLink to="/expenses" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7h-7L10 3H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
            <circle cx="16" cy="13" r="1.5"/>
          </svg>
          <span className="sidebar-link-text">Expenses</span>
          <span className="sidebar-tooltip">Expenses</span>
        </NavLink>

        {/* 9. Measurements */}
        <NavLink to="/measurements" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="6" y1="5" x2="6" y2="10"/>
            <line x1="10" y1="5" x2="10" y2="8"/>
            <line x1="14" y1="5" x2="14" y2="10"/>
            <line x1="18" y1="5" x2="18" y2="8"/>
          </svg>
          <span className="sidebar-link-text">Measurements</span>
          <span className="sidebar-tooltip">Measurements</span>
        </NavLink>

        {/* 10. Trainers */}
        <NavLink to="/trainers" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M9 4v16M15 4v16"/>
          </svg>
          <span className="sidebar-link-text">Trainers</span>
          <span className="sidebar-tooltip">Trainers</span>
        </NavLink>

        {/* 11. PT Assignments */}
        <NavLink to="/pt-assignments" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <polyline points="17 11 19 13 23 9"/>
          </svg>
          <span className="sidebar-link-text">PT Assignments</span>
          <span className="sidebar-tooltip">PT Assignments</span>
        </NavLink>

        {/* 12. PT Class Log */}
        <NavLink to="/pt-class-log" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1"/>
            <path d="M9 14l2 2 4-4"/>
          </svg>
          <span className="sidebar-link-text">PT Class Log</span>
          <span className="sidebar-tooltip">PT Class Log</span>
        </NavLink>

        {/* 13. Advance Bookings */}
        <NavLink to="/advance-bookings" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <polyline points="9 16 12 19 18 13"/>
          </svg>
          <span className="sidebar-link-text">Advance Bookings</span>
          <span className="sidebar-tooltip">Advance Bookings</span>
        </NavLink>

        {/* 14. Trainer Salary Report */}
        <NavLink to="/trainer-salary-report" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2"/>
            <circle cx="12" cy="12" r="2"/>
            <path d="M6 12h.01M18 12h.01"/>
          </svg>
          <span className="sidebar-link-text">Trainer Salary Report</span>
          <span className="sidebar-tooltip">Trainer Salary Report</span>
        </NavLink>

        {/* 15. Supplements Module */}
        <NavLink to="/supplements" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.5 20.5l-7-7a5 5 0 0 1 7.07-7.07l7 7a5 5 0 0 1-7.07 7.07z"/>
            <line x1="8.5" y1="8.5" x2="15.5" y2="15.5"/>
          </svg>
          <span className="sidebar-link-text">Supplements</span>
          <span className="sidebar-tooltip">Supplements</span>
        </NavLink>

        {/* 16. Login Page Management */}
        <NavLink to="/admin-credentials" className={({ isActive }) => `sidebar-global-link ${isActive ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            <circle cx="12" cy="16" r="1.5"/>
          </svg>
          <span className="sidebar-link-text">Login Page Management</span>
          <span className="sidebar-tooltip">Login Page Management</span>
        </NavLink>

      </div>

      {/* Logout */}
      <div className="sidebar-global-bottom">
        <button onClick={() => { onLogout(); navigate('/login'); }} className="sidebar-global-logout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span className="sidebar-link-text">Logout</span>
          <span className="sidebar-tooltip">Logout</span>
        </button>
      </div>

      <div className="sidebar-powered">
        <p className="powered-text">
          Powered by <span className="powered-brand">Together Tech</span>
        </p>
      </div>
    </nav>
  );
};

export default Sidebar;
