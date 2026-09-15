import React, { useState, useEffect } from 'react';
import { getZkClientAttendance, getZkTrainerAttendance, getZkAbsentClients, pushZkTestScan, sendWhatsAppText } from '../api';
import { formatShortId } from '../utils/formatShortId';
import './AttendancePage.css';

const AttendancePage = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [clientAttendance, setClientAttendance] = useState([]);
  const [trainerAttendance, setTrainerAttendance] = useState([]);
  const [absentClients, setAbsentClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [daysLeftFilter, setDaysLeftFilter] = useState('');
  const [activeTab, setActiveTab] = useState('clients'); // 'clients' | 'trainers' | 'absent5'
  
  // Test Simulator state
  const [testUserId, setTestUserId] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState(null);

  const fetchAttendanceData = async (dateStr) => {
    setLoading(true);
    try {
      const [clientsData, trainersData, absentData] = await Promise.all([
        getZkClientAttendance(dateStr),
        getZkTrainerAttendance(dateStr),
        getZkAbsentClients(dateStr, 5)
      ]);
      setClientAttendance(clientsData || []);
      setTrainerAttendance(trainersData || []);
      setAbsentClients(absentData || []);
    } catch (err) {
      console.error('Failed to load attendance records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData(selectedDate);
    // Auto polling every 10 seconds for real-time biometric scan sync
    const interval = setInterval(() => {
      fetchAttendanceData(selectedDate);
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const handleSimulateScan = async (e) => {
    e.preventDefault();
    if (!testUserId.trim()) return;
    setSimulating(true);
    setSimMessage(null);
    try {
      const res = await pushZkTestScan(testUserId.trim());
      if (res.success) {
        if (res.duplicate) {
          setSimMessage({ type: 'warning', text: `ℹ️ ${res.message || 'Duplicate scan ignored for today'}` });
        } else {
          setSimMessage({ 
            type: 'success', 
            text: `✅ Face matched! Attendance marked for ${res.record?.name || testUserId} (${res.record?.userType})` 
          });
        }
        fetchAttendanceData(selectedDate);
      } else {
        setSimMessage({ type: 'error', text: `❌ ${res.reason || 'Failed to process face scan'}` });
      }
    } catch (err) {
      setSimMessage({ type: 'error', text: `❌ Error: ${err.message}` });
    } finally {
      setSimulating(false);
      setTestUserId('');
    }
  };

  const getDaysLeft = (expiryDateStr, refDateStr) => {
    if (!expiryDateStr) return null;
    const refDate = refDateStr ? new Date(refDateStr) : new Date();
    refDate.setHours(0, 0, 0, 0);

    let exp = new Date(expiryDateStr);
    if (isNaN(exp.getTime())) {
      const parts = String(expiryDateStr).split(/[\/\-\.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          exp = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          exp = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
      }
    }
    if (isNaN(exp.getTime())) return null;
    exp.setHours(0, 0, 0, 0);

    const diffTime = exp.getTime() - refDate.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, daysLeftFilter, selectedDate]);

  // Search and Days Left filtering
  const filterClients = (records) => {
    return records.filter(r => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchSearch = (r.name && r.name.toLowerCase().includes(term)) ||
          (r.userId && r.userId.toLowerCase().includes(term)) ||
          (r.memberId && r.memberId.toLowerCase().includes(term));
        if (!matchSearch) return false;
      }

      if (daysLeftFilter !== '' && !isNaN(parseInt(daysLeftFilter, 10))) {
        const maxDays = parseInt(daysLeftFilter, 10);
        const daysLeft = getDaysLeft(r.expiryDate, selectedDate);
        if (daysLeft === null || daysLeft > maxDays) {
          return false;
        }
      }

      return true;
    });
  };

  const filterAbsentClients = (records) => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase();
    return records.filter(r => 
      (r.name && r.name.toLowerCase().includes(term)) ||
      (r.userId && r.userId.toLowerCase().includes(term)) ||
      (r.clientId && r.clientId.toLowerCase().includes(term)) ||
      (r.phone && r.phone.includes(term))
    );
  };

  const filterTrainers = (records) => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase();
    return records.filter(r => 
      (r.name && r.name.toLowerCase().includes(term)) ||
      (r.userId && r.userId.toLowerCase().includes(term)) ||
      (r.memberId && r.memberId.toLowerCase().includes(term))
    );
  };

  const filteredClients = filterClients(clientAttendance);
  const filteredTrainers = filterTrainers(trainerAttendance);
  const filteredAbsentClients = filterAbsentClients(absentClients);

  // Pagination Calculations
  const totalClients = filteredClients.length;
  const clientTotalPages = Math.ceil(totalClients / itemsPerPage) || 1;
  const clientStartIndex = (currentPage - 1) * itemsPerPage;
  const clientEndIndex = Math.min(clientStartIndex + itemsPerPage, totalClients);
  const paginatedClients = filteredClients.slice(clientStartIndex, clientEndIndex);

  const totalTrainers = filteredTrainers.length;
  const trainerTotalPages = Math.ceil(totalTrainers / itemsPerPage) || 1;
  const trainerStartIndex = (currentPage - 1) * itemsPerPage;
  const trainerEndIndex = Math.min(trainerStartIndex + itemsPerPage, totalTrainers);
  const paginatedTrainers = filteredTrainers.slice(trainerStartIndex, trainerEndIndex);

  const totalAbsent = filteredAbsentClients.length;
  const absentTotalPages = Math.ceil(totalAbsent / itemsPerPage) || 1;
  const absentStartIndex = (currentPage - 1) * itemsPerPage;
  const absentEndIndex = Math.min(absentStartIndex + itemsPerPage, totalAbsent);
  const paginatedAbsentClients = filteredAbsentClients.slice(absentStartIndex, absentEndIndex);

  const handleSendAbsentWhatsApp = async (client) => {
    const rawPhone = String(client.phone || '').replace(/\D/g, '');
    if (!rawPhone) {
      alert(`No phone number recorded for ${client.name}`);
      return;
    }
    const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const absentText = client.isNeverCheckedIn 
      ? `Hello ${client.name},\n\nWe missed you at Olympia Fitness! You haven't checked in yet. Come visit us today for your workout session! 💪🏋️‍♂️\n\nThank you, Olympia Fitness!`
      : `Hello ${client.name},\n\nWe missed you at Olympia Fitness! It has been ${client.absentDays} days since your last gym check-in (${formattedDate(client.lastCheckInDate)}). Come back today to stay on track with your fitness goals! 💪🏋️‍♂️\n\nThank you, Olympia Fitness!`;

    try {
      await sendWhatsAppText(phone, absentText, client.name, client.id || client.clientId, 'absent_reminder');
      alert(`✅ WhatsApp reminder sent to ${client.name} (${phone})!`);
    } catch (err) {
      console.error('WhatsApp API send failed:', err);
      alert(`❌ Failed to send WhatsApp reminder to ${client.name}: ${err.message || 'API error'}`);
    }
  };

  const formattedDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="attendance-page-container reveal">
      {/* ── Header Section ── */}
      <header className="attendance-page-header">
        <div className="title-group">
          <h1><span>ZKTeco</span> ATTENDANCE</h1>
          <p className="subtitle">SpeedFace-V5L Automated Biometric Attendance Log</p>
        </div>

        <div className="header-actions">
          <div className="date-picker-wrapper">
            <span className="date-label">Select Date:</span>
            <input
              id="attendance-date"
              type="date"
              className="attendance-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <button 
            className="refresh-btn" 
            onClick={() => fetchAttendanceData(selectedDate)}
            title="Refresh Attendance Log"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>

      {/* ── Summary Stats & Quick Scan Simulator Bar ── */}
      <div className="attendance-top-bar">
        <div className="stats-cards-grid">
          <div className="stat-card">
            <span className="stat-label">Client Check-ins</span>
            <span className="stat-value text-green">{clientAttendance.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Trainer Check-ins</span>
            <span className="stat-value text-blue">{trainerAttendance.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">5+ Days Absent</span>
            <span className="stat-value text-orange">{absentClients.length}</span>
          </div>
        </div>

        <div className="scanner-simulator-box">
          <div className="sim-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            ZKTeco Device Simulator
          </div>
          <form onSubmit={handleSimulateScan} className="sim-form">
            <input
              type="text"
              placeholder="Enter User ID (e.g. a1 or TRN001)..."
              value={testUserId}
              onChange={(e) => setTestUserId(e.target.value)}
              className="sim-input"
            />
            <button type="submit" className="sim-btn" disabled={simulating || !testUserId.trim()}>
              {simulating ? 'Scanning...' : 'Scan Face'}
            </button>
          </form>
          {simMessage && (
            <div className={`sim-msg ${simMessage.type}`}>
              {simMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs Navigation & Search Row ── */}
      <div className="attendance-controls-row">
        <div className="attendance-tabs-container">
          <button 
            className={`att-tab-btn ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => setActiveTab('clients')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Client Attendance
            <span className="att-tab-count client">{filteredClients.length}</span>
          </button>

          <button 
            className={`att-tab-btn ${activeTab === 'trainers' ? 'active' : ''}`}
            onClick={() => setActiveTab('trainers')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Trainer Attendance
            <span className="att-tab-count trainer">{filteredTrainers.length}</span>
          </button>

          <button 
            className={`att-tab-btn ${activeTab === 'absent5' ? 'active' : ''}`}
            onClick={() => setActiveTab('absent5')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            5+ Days Absent
            <span className="att-tab-count absent">{filteredAbsentClients.length}</span>
          </button>
        </div>

        <div className="attendance-search-filters-group">
          {activeTab === 'clients' && (
            <div className="days-left-input-wrapper">
              <span className="days-left-label">Days Left ≤</span>
              <input
                type="number"
                min="0"
                placeholder="e.g. 3"
                value={daysLeftFilter}
                onChange={(e) => setDaysLeftFilter(e.target.value)}
                className="days-left-input"
              />
              {daysLeftFilter !== '' && (
                <button 
                  className="clear-days-filter-btn" 
                  onClick={() => setDaysLeftFilter('')}
                  title="Clear Days Left Filter"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          <div className="search-input-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search by ID, Name or Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="table-search-input"
            />
          </div>
        </div>
      </div>

      {/* ── Main Content: Tables Section ── */}
      <div className="attendance-tables-container">
        
        {/* ── TABLE 1: CLIENT ATTENDANCE ── */}
        {activeTab === 'clients' && (
          <section className="attendance-table-section">
            <div className="section-header client-header">
              <div className="section-header-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <h2>CLIENT ATTENDANCE</h2>
              </div>
              <span className="count-badge">{filteredClients.length} Records</span>
            </div>

            <div className="table-responsive">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Client Name</th>
                    <th>Date</th>
                    <th>Check-in Time</th>
                    <th>Plan & Expiry</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="table-empty-td">Loading client attendance records...</td>
                    </tr>
                  ) : filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="table-empty-td">
                        {daysLeftFilter !== '' 
                          ? `No client attendance records found with ≤ ${daysLeftFilter} days left.` 
                          : 'No client attendance records found for this date.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedClients.map((row) => {
                      const daysLeft = getDaysLeft(row.expiryDate, selectedDate);
                      const isExpired = row.status && (row.status.toLowerCase().includes('expired') || row.status.toLowerCase().includes('renew'));
                      return (
                        <tr key={row.id}>
                          <td className="font-mono">{formatShortId(row.memberId || row.userId)}</td>
                          <td className="font-semibold">{row.name}</td>
                          <td className="date-col">{formattedDate(row.date)}</td>
                          <td className="time-badge">{row.checkInTime}</td>
                          <td>
                            <div className="plan-expiry-info">
                              <span className="client-plan-name">{row.plan || 'General Plan'}</span>
                              {row.expiryDate ? (
                                <div className="expiry-date-sub">
                                  <span className="exp-date-label">Expires {formattedDate(row.expiryDate)}</span>
                                  {daysLeft !== null && (
                                    <span className={`badge-days-left ${daysLeft < 0 ? 'expired' : daysLeft <= 3 ? 'warning' : 'active'}`}>
                                      {daysLeft < 0 ? `Expired (${Math.abs(daysLeft)}d ago)` : daysLeft === 0 ? 'Expires Today' : `⏳ ${daysLeft} Days Left`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="no-expiry-text">No Expiry Date</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill ${isExpired ? 'pill-expired' : 'pill-present'}`}>
                              {isExpired ? '⚠️ Your Plan Expired. Renew It' : '✅ Present'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && filteredClients.length > 0 && (
              <div className="att-pagination-footer">
                <div className="pagination-info">
                  Showing <span>{clientStartIndex + 1}</span> to <span>{clientEndIndex}</span> of <span>{totalClients}</span> records
                </div>
                <div className="pagination-controls">
                  <div className="rows-per-page">
                    <label>Rows per page:</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="pagination-pages">
                    <button
                      className="btn-page-nav"
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      ‹ Prev
                    </button>
                    <span className="page-indicator">
                      Page <strong>{currentPage}</strong> of <strong>{clientTotalPages}</strong>
                    </span>
                    <button
                      className="btn-page-nav"
                      onClick={() => setCurrentPage(p => Math.min(p + 1, clientTotalPages))}
                      disabled={currentPage === clientTotalPages}
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── TABLE 2: TRAINER ATTENDANCE ── */}
        {activeTab === 'trainers' && (
          <section className="attendance-table-section">
            <div className="section-header trainer-header">
              <div className="section-header-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <h2>TRAINER ATTENDANCE</h2>
              </div>
              <span className="count-badge">{filteredTrainers.length} Records</span>
            </div>

            <div className="table-responsive">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Trainer ID</th>
                    <th>Trainer Name</th>
                    <th>Date</th>
                    <th>Check-in Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="table-empty-td">Loading trainer attendance records...</td>
                    </tr>
                  ) : filteredTrainers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="table-empty-td">No trainer attendance records found for this date.</td>
                    </tr>
                  ) : (
                    paginatedTrainers.map((row) => (
                      <tr key={row.id}>
                        <td className="font-mono">{formatShortId(row.memberId || row.userId)}</td>
                        <td className="font-semibold">{row.name}</td>
                        <td className="date-col">{formattedDate(row.date)}</td>
                        <td className="time-badge">{row.checkInTime}</td>
                        <td>
                          <span className="status-pill pill-present">
                            ✅ Present
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && filteredTrainers.length > 0 && (
              <div className="att-pagination-footer">
                <div className="pagination-info">
                  Showing <span>{trainerStartIndex + 1}</span> to <span>{trainerEndIndex}</span> of <span>{totalTrainers}</span> records
                </div>
                <div className="pagination-controls">
                  <div className="rows-per-page">
                    <label>Rows per page:</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="pagination-pages">
                    <button
                      className="btn-page-nav"
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      ‹ Prev
                    </button>
                    <span className="page-indicator">
                      Page <strong>{currentPage}</strong> of <strong>{trainerTotalPages}</strong>
                    </span>
                    <button
                      className="btn-page-nav"
                      onClick={() => setCurrentPage(p => Math.min(p + 1, trainerTotalPages))}
                      disabled={currentPage === trainerTotalPages}
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── TABLE 3: 5+ DAYS CONTINUOUS ABSENT CLIENTS ── */}
        {activeTab === 'absent5' && (
          <section className="attendance-table-section">
            <div className="section-header absent-header">
              <div className="section-header-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h2>CONTINUOUS ABSENT CLIENTS (5+ DAYS)</h2>
              </div>
              <span className="count-badge absent-badge">{filteredAbsentClients.length} Absent Clients</span>
            </div>

            <div className="table-responsive">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Client Name</th>
                    <th>Phone</th>
                    <th>Last Check-in Date</th>
                    <th>Continuous Absence</th>
                    <th>Membership Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="table-empty-td">Loading 5+ days absent clients...</td>
                    </tr>
                  ) : filteredAbsentClients.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="table-empty-td">🎉 Excellent! No active clients are continuously absent for 5+ days.</td>
                    </tr>
                  ) : (
                    paginatedAbsentClients.map((row) => (
                      <tr key={row.id}>
                        <td className="font-mono">{formatShortId(row.clientId || row.id)}</td>
                        <td className="font-semibold">{row.name}</td>
                        <td className="phone-col">{row.phone || 'N/A'}</td>
                        <td className="date-col">
                          {row.lastCheckInDate ? formattedDate(row.lastCheckInDate) : <span className="no-expiry-text">Never Checked In</span>}
                        </td>
                        <td>
                          <span className="status-pill pill-absent">
                            ⚠️ {row.isNeverCheckedIn ? 'Not Checked In' : `${row.absentDays} Days Absent`}
                          </span>
                        </td>
                        <td>
                          <div className="plan-expiry-info">
                            <span className="client-plan-name">{row.plan || 'General Plan'}</span>
                            {row.expiryDate && (
                              <span className="expiry-date-sub">Expires {formattedDate(row.expiryDate)}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button 
                            className="btn-wa-reminder"
                            onClick={() => handleSendAbsentWhatsApp(row)}
                            title="Send WhatsApp Reminder"
                          >
                            💬 WhatsApp
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && filteredAbsentClients.length > 0 && (
              <div className="att-pagination-footer">
                <div className="pagination-info">
                  Showing <span>{absentStartIndex + 1}</span> to <span>{absentEndIndex}</span> of <span>{totalAbsent}</span> absent clients
                </div>
                <div className="pagination-controls">
                  <div className="rows-per-page">
                    <label>Rows per page:</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div className="pagination-pages">
                    <button
                      className="btn-page-nav"
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      ‹ Prev
                    </button>
                    <span className="page-indicator">
                      Page <strong>{currentPage}</strong> of <strong>{absentTotalPages}</strong>
                    </span>
                    <button
                      className="btn-page-nav"
                      onClick={() => setCurrentPage(p => Math.min(p + 1, absentTotalPages))}
                      disabled={currentPage === absentTotalPages}
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );
};

export default AttendancePage;
