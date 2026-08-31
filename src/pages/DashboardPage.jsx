import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStats, fetchRevenue, fetchPerformance, getClients, fetchPtSummary, getSupplementDashboardSummary, getPtAssignments, getDashboardStats } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import RevenueChart from '../components/RevenueChart';
import PtRevenueChart from '../components/PtRevenueChart';
import gymLogo from '../assets/olympialogo.jpeg';
import './DashboardPage.css';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [clients, setClients] = useState([]);
  const [allClientsList, setAllClientsList] = useState([]);
  const [ptSummary, setPtSummary] = useState(null);
  const [supplementsSummary, setSupplementsSummary] = useState(null);
  const [activePtCount, setActivePtCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedMonth] = useState(new Date().toLocaleDateString('en-GB', { month: 'short' }));

  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₹0';
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(num)) return '₹0';
    const rounded = Math.round(num);
    return `₹${rounded.toLocaleString('en-IN')}`;
  };

  const todayFormatted = formatDateDDMMYYYY(new Date());

  const [dateFilterMode, setDateFilterMode] = useState('This Month'); // 'Today' | 'This Week' | 'This Month' | 'Custom'
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [rangeStats, setRangeStats] = useState(null);

  const getFilterDates = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (dateFilterMode === 'Today') {
      return { start: todayStr, end: todayStr };
    } else if (dateFilterMode === 'This Week') {
      const d = new Date(today);
      const day = d.getDay();
      const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diffToMon));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const startOfWeek = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      const endOfWeek = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
      return { start: startOfWeek, end: endOfWeek };
    } else if (dateFilterMode === 'This Month') {
      const firstDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(year, month + 1, 0).getDate();
      const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      return { start: firstDayStr, end: lastDayStr };
    } else {
      return { start: customStartDate, end: customEndDate };
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const dates = getFilterDates();
        const results = await Promise.allSettled([
          fetchStats(selectedMonth),
          fetchRevenue(),
          fetchPerformance(),
          getClients(),
          fetchPtSummary(),
          getSupplementDashboardSummary(),
          getPtAssignments({ status: 'Active' }),
          getDashboardStats(dates.start, dates.end)
        ]);

        const statsData = results[0].status === 'fulfilled' ? results[0].value : null;
        const revenueData = results[1].status === 'fulfilled' ? (Array.isArray(results[1].value) ? results[1].value : []) : [];
        const perfData = results[2].status === 'fulfilled' ? (Array.isArray(results[2].value) ? results[2].value : []) : [];
        const rawClients = results[3].status === 'fulfilled' ? results[3].value : [];
        const clientsData = Array.isArray(rawClients) ? rawClients : (rawClients?.data || []);
        const ptData = results[4].status === 'fulfilled' ? results[4].value : null;
        const suppSummaryData = results[5].status === 'fulfilled' ? results[5].value : null;
        const rawPtAssign = results[6].status === 'fulfilled' ? results[6].value : [];
        const ptAssignData = Array.isArray(rawPtAssign) ? rawPtAssign : (rawPtAssign?.data || []);
        const dateStatsRes = results[7].status === 'fulfilled' ? results[7].value : null;

        setStats(statsData);
        setRevenue(revenueData);
        setPerformance(perfData);
        setClients(clientsData.slice(0, 8));
        setAllClientsList(clientsData || []);
        setPtSummary(ptData);
        setSupplementsSummary(suppSummaryData);
        const activeCount = (ptAssignData || []).filter(a => (a.status || '').toLowerCase() === 'active').length;
        setActivePtCount(activeCount);
        setRangeStats(dateStatsRes);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [selectedMonth, dateFilterMode, customStartDate, customEndDate]);

  const activeMaleCount = rangeStats?.activeMaleClients !== undefined ? rangeStats.activeMaleClients : (stats?.activeMaleClients !== undefined ? stats.activeMaleClients : allClientsList.filter(c => c.status === 'active' && (c.gender || '').toLowerCase() !== 'female').length);
  const activeFemaleCount = rangeStats?.activeFemaleClients !== undefined ? rangeStats.activeFemaleClients : (stats?.activeFemaleClients !== undefined ? stats.activeFemaleClients : allClientsList.filter(c => c.status === 'active' && (c.gender || '').toLowerCase() === 'female').length);
  const inactiveMaleCount = rangeStats?.inactiveMaleClients !== undefined ? rangeStats.inactiveMaleClients : (stats?.inactiveMaleClients !== undefined ? stats.inactiveMaleClients : allClientsList.filter(c => c.status !== 'active' && (c.gender || '').toLowerCase() !== 'female').length);
  const inactiveFemaleCount = rangeStats?.inactiveFemaleClients !== undefined ? rangeStats.inactiveFemaleClients : (stats?.inactiveFemaleClients !== undefined ? stats.inactiveFemaleClients : allClientsList.filter(c => c.status !== 'active' && (c.gender || '').toLowerCase() === 'female').length);

  if (loading) return <div className="dashboard-loading-screen">Loading Management Portal...</div>;

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userRole');
    localStorage.removeItem('alertSnoozed');
    window.location.hash = '#/login';
    window.location.reload();
  };

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main">

        {/* Top Header Bar */}
        <header className="dash-header-bar">
          <div className="dash-header-title-group">
            <h1 className="dash-title">Dashboard</h1>
            <p className="dash-subtitle">Welcome back to the Management Portal.</p>
          </div>

          <div className="dash-header-controls">
            <button className="maroon-action-btn" onClick={() => navigate('/create-invoice')} style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
              Create Invoice
            </button>

            <button className="maroon-action-btn" onClick={() => navigate('/advance-bookings')} style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <polyline points="12 14 15 17 20 12"></polyline>
              </svg>
              Advance Booking
            </button>

            <button className="maroon-action-btn" onClick={() => navigate('/pt-class-log')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <path d="m9 16 2 2 4-4"></path>
              </svg>
              PT Attendance
            </button>

            <div className="dash-date-picker-box">
              <span>{todayFormatted}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>

            <button className="dash-logout-btn" onClick={handleLogout} title="Logout Session">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Logout
            </button>

            {gymLogo && (
              <img src={gymLogo} alt="Gym Logo" style={{ height: '48px', borderRadius: '8px', objectFit: 'contain' }} />
            )}
          </div>
        </header>

        {/* Date-Wise Filter Bar */}
        <div style={{ background: '#ffffff', padding: '1rem 1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e1b4b' }}>📅 Filter Period:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['Today', 'This Week', 'This Month', 'Custom'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setDateFilterMode(mode)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '100px',
                    border: dateFilterMode === mode ? '2px solid #4338ca' : '1px solid #cbd5e1',
                    background: dateFilterMode === mode ? '#e0e7ff' : '#ffffff',
                    color: dateFilterMode === mode ? '#3730a3' : '#475569',
                    fontWeight: '800',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {dateFilterMode === 'Custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                style={{ padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.8rem' }}
              />
              <span style={{ fontWeight: '800', color: '#64748b' }}>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                style={{ padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.8rem' }}
              />
            </div>
          )}

          {rangeStats && (
            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#059669', background: '#ecfdf5', padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              Period Collection: <strong>₹{(rangeStats.rangeRevenue || 0).toLocaleString('en-IN')}</strong> | Expenses: <strong>₹{(rangeStats.rangeExpenses || 0).toLocaleString('en-IN')}</strong>
            </div>
          )}
        </div>

        {/* Existing Metric Cards Grid in modern UI style */}
        <div className="dashboard-grid-section">
          <div className="cards-grid-4">

            {/* 1. Monthly Collection */}
            <div className="ui-dash-card" style={{ cursor: 'default' }}>
              <div className="card-top-row">
                <span className="card-category-title">COLLECTION ({dateFilterMode})</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val">{formatCurrency(rangeStats?.rangeRevenue !== undefined ? rangeStats.rangeRevenue : stats?.monthlyCollection)}</div>
              </div>
              <div className="card-bottom-row" style={{ justifyContent: 'flex-end' }}>
                <div className="card-icon-badge badge-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </div>
              </div>
            </div>

            {/* 2. Monthly Expenses */}
            <div className="ui-dash-card" onClick={() => navigate('/expenses')}>
              <div className="card-top-row">
                <span className="card-category-title">EXPENSES ({dateFilterMode})</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val card-val-red">{formatCurrency(rangeStats?.rangeExpenses !== undefined ? rangeStats.rangeExpenses : stats?.monthlyExpenses)}</div>
              </div>
              <div className="card-bottom-row">
                <span className="card-link-action">View Details</span>
                <div className="card-icon-badge badge-red">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="7" x2="17" y2="17"></line>
                    <polyline points="17 7 17 17 7 17"></polyline>
                  </svg>
                </div>
              </div>
            </div>

            {/* 3. PT Commission Payable */}
            <div className="ui-dash-card" onClick={() => navigate('/trainer-salary-report')}>
              <div className="card-top-row">
                <span className="card-category-title">PT COMMISSION PAYABLE</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val card-val-amber">{formatCurrency(ptSummary?.totalPtCommissionPayable)}</div>
              </div>
              <div className="card-bottom-row">
                <span className="card-link-action">View Report</span>
                <div className="card-icon-badge badge-yellow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </div>
              </div>
            </div>

            {/* 4. Net Profit */}
            <div className="ui-dash-card" onClick={() => navigate('/transactions')}>
              <div className="card-top-row">
                <span className="card-category-title">NET PROFIT</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val card-val-green">{formatCurrency(rangeStats?.rangeRevenue !== undefined ? (rangeStats.rangeRevenue - (rangeStats.rangeExpenses || 0)) : stats?.netProfit)}</div>
              </div>
              <div className="card-bottom-row">
                <span className="card-link-action">View Details</span>
                <div className="card-icon-badge badge-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                    <polyline points="17 6 23 6 23 12"></polyline>
                  </svg>
                </div>
              </div>
            </div>

            {/* Row 2: Supplements & Other Services (4 cards) */}
            {/* 5. Supplements Revenue (Month) */}
            <div className="ui-dash-card" onClick={() => navigate('/supplements/revenue')}>
              <div className="card-top-row">
                <span className="card-category-title">SUPPLEMENTS REVENUE</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val card-val-purple">{formatCurrency(supplementsSummary?.monthRevenue)}</div>
              </div>
              <div className="card-bottom-row">
                <span className="card-link-action">View Revenue</span>
                <div className="card-icon-badge badge-purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                  </svg>
                </div>
              </div>
            </div>

            {/* 6. Supplements Profit (Month) */}
            <div className="ui-dash-card" onClick={() => navigate('/supplements/revenue')}>
              <div className="card-top-row">
                <span className="card-category-title">SUPPLEMENTS PROFIT</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val card-val-purple">{formatCurrency(supplementsSummary?.monthProfit)}</div>
              </div>
              <div className="card-bottom-row">
                <span className="card-link-action">View Profit</span>
                <div className="card-icon-badge badge-purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
                    <path d="M12 6v2m0 8v2"></path>
                  </svg>
                </div>
              </div>
            </div>

            {/* 7. Other Services Revenue */}
            <div className="ui-dash-card" onClick={() => navigate('/other-services')}>
              <div className="card-top-row">
                <span className="card-category-title">OTHER SERVICES REVENUE</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val" style={{ color: '#0284c7' }}>{formatCurrency(stats?.otherServicesRevenue)}</div>
              </div>
              <div className="card-bottom-row">
                <span className="card-link-action">View Catalog</span>
                <div className="card-icon-badge" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                </div>
              </div>
            </div>

            {/* 8. Other Services Sales */}
            <div className="ui-dash-card" onClick={() => navigate('/service-sales-history')}>
              <div className="card-top-row">
                <span className="card-category-title">OTHER SERVICES SALES</span>
              </div>
              <div className="card-val-row">
                <div className="card-main-val" style={{ color: '#ea580c' }}>{stats?.otherServicesSalesCount || 0} <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '700' }}>Sales</span></div>
              </div>
              <div className="card-bottom-row">
                <span className="card-link-action">View Sales History</span>
                <div className="card-icon-badge" style={{ background: '#ffedd5', color: '#ea580c' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                  </svg>
                </div>
              </div>
            </div>

            {/* Row 3: Full Width Combined Client & Advance Bookings Card */}
            <div className="ui-dash-card combined-status-card" style={{ gridColumn: 'span 4' }}>
              <div className="card-top-row" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.65rem', marginBottom: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#dc2626' }}></div>
                  <span className="card-category-title" style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', letterSpacing: '0.04em' }}>
                    CLIENT & ADVANCE BOOKINGS OVERVIEW
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>Live Status Sync</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Active Side-by-Side: Active Clients & Active PT */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div className="combined-metric-box" style={{ background: '#f0fdf4', padding: '0.9rem', borderRadius: '12px', border: '1.5px solid #bbf7d0', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/manage-clients?status=Active')}>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#16a34a', lineHeight: 1 }}>{stats?.activeClients || 0}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', marginTop: '0.35rem' }}>🟢 Active General Clients</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '0.45rem', fontSize: '0.76rem', fontWeight: '800' }}>
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', border: '1px solid #86efac' }}>♂️ Male: {activeMaleCount}</span>
                      <span style={{ background: '#fce7f3', color: '#be185d', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fbcfe8' }}>♀️ Female: {activeFemaleCount}</span>
                    </div>
                  </div>

                  <div className="combined-metric-box" style={{ background: '#fdf2f8', padding: '0.9rem', borderRadius: '12px', border: '1.5px solid #fbcfe8', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/pt-assignments?status=Active')}>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#db2777', lineHeight: 1 }}>{activePtCount || 0}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#be185d', textTransform: 'uppercase', marginTop: '0.35rem' }}>🏋️ Active PT Packages</div>
                  </div>
                </div>

                {/* Inactive Side-by-Side: Inactive Clients & Inactive PT (ITEM 16) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div className="combined-metric-box" style={{ background: '#fffbeb', padding: '0.9rem', borderRadius: '12px', border: '1.5px solid #fde68a', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/manage-clients?status=Inactive')}>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#d97706', lineHeight: 1 }}>{stats?.inactiveClients || 0}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', marginTop: '0.35rem' }}>⚠️ Inactive Clients</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '0.45rem', fontSize: '0.76rem', fontWeight: '800' }}>
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fde68a' }}>♂️ Male: {inactiveMaleCount}</span>
                      <span style={{ background: '#ffe4e6', color: '#be123c', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fecdd3' }}>♀️ Female: {inactiveFemaleCount}</span>
                    </div>
                  </div>

                  <div className="combined-metric-box" style={{ background: '#fff1f2', padding: '0.9rem', borderRadius: '12px', border: '1.5px solid #fecdd3', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/pt-assignments?status=Inactive')}>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#e11d48', lineHeight: 1 }}>{rangeStats?.inactivePT || stats?.inactivePt || 0}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#be123c', textTransform: 'uppercase', marginTop: '0.35rem' }}>🏋️ Inactive PT</div>
                  </div>
                </div>

                {/* Advance Bookings Side-by-Side: General & PT */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div className="combined-metric-box" style={{ background: '#eeF2ff', padding: '0.75rem', borderRadius: '12px', border: '1px solid #c7d2fe', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/advance-bookings?tab=general')}>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#4f46e5', lineHeight: 1 }}>{stats?.generalAdvanceBookings || 0}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#4338ca', textTransform: 'uppercase', marginTop: '0.35rem' }}>General Advance Bookings</div>
                  </div>

                  <div className="combined-metric-box" style={{ background: '#fae8ff', padding: '0.75rem', borderRadius: '12px', border: '1px solid #f5d0fe', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/advance-bookings?tab=pt')}>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#c026d3', lineHeight: 1 }}>{stats?.ptAdvanceBookings || 0}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#a21caf', textTransform: 'uppercase', marginTop: '0.35rem' }}>PT Advance Bookings</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Charts & Recent Transactions Feed */}
        <div className="dashboard-bottom-grid">
          <div className="charts-column">
            <div className="chart-card-wrapper">
              <RevenueChart data={revenue} />
            </div>
            <div className="chart-card-wrapper">
              <PtRevenueChart data={ptSummary?.trainerRevenueList || []} />
            </div>
          </div>

          <div className="recent-feed-column">
            <section className="feed-section recent-feed-card">
              <div className="feed-header-compact">
                <h3>Recent Transactions</h3>
                <div className="feed-header-actions">
                  <span className="total-val-small">Total: {formatCurrency(stats?.totalRevenue)}</span>
                </div>
              </div>
              <div className="dynamic-list-scroll">
                {(stats?.transactions || [])
                  .slice()
                  .sort((a, b) => {
                    const parseTimeToMs = (item) => {
                      const raw = item.created_at || item.timestamp || item.date || '';
                      if (!raw) return 0;
                      let str = String(raw).trim();
                      const match = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(.*))?$/);
                      if (match) {
                        const day = match[1].padStart(2, '0');
                        const month = match[2].padStart(2, '0');
                        const year = match[3];
                        const timePart = match[4] ? match[4].trim() : '00:00:00';
                        str = `${year}-${month}-${day}T${timePart}`;
                      }
                      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(str)) str = str.replace(' ', 'T');
                      const pDate = new Date(str);
                      return !isNaN(pDate.getTime()) ? pDate.getTime() : 0;
                    };
                    const timeA = parseTimeToMs(a);
                    const timeB = parseTimeToMs(b);
                    if (timeA !== timeB) return timeB - timeA;
                    return String(b.id || '').localeCompare(String(a.id || ''));
                  })
                  .slice(0, 6)
                  .map((txn, i) => (
                  <div key={txn.id || i} className="list-item-card compact">
                    <div className={`item-icon-small icon-${i % 3}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <div className="item-details">
                      <span className="item-name-small">{txn.name}</span>
                      <span className="item-meta-small">{txn.method} • {formatDateDDMMYYYY(txn.date)}</span>
                    </div>
                    <div className="item-amount">
                      <span className="amount-val-small">+{formatCurrency(txn.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="view-all-btn-compact" onClick={() => navigate('/transactions')}>
                View Records
              </button>
            </section>
          </div>
        </div>

      </main>
    </div>
  );
};

export default DashboardPage;
