import React, { useState, useEffect, useRef } from 'react';
import { getClients, getAttendanceByDate, markAttendance, getAttendanceMonthly, getClientBills } from '../api';
import InvoicePreviewModal from '../components/InvoicePreviewModal';
import { formatShortId } from '../utils/formatShortId';
import './ClientAttendancePage.css';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
};

const ClientAttendancePage = () => {
  const [clients, setClients] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('present');

  // Client report modal
  const [reportClient, setReportClient] = useState(null);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Invoice modal
  const [invoicePreviewClient, setInvoicePreviewClient] = useState(null);

  useEffect(() => { fetchData(selectedDate); }, [selectedDate]);

  const fetchData = async (dateStr) => {
    setLoading(true);
    try {
      const [clientsData, attendanceData] = await Promise.all([getClients(), getAttendanceByDate(dateStr)]);
      setClients(clientsData);
      const attMap = {};
      attendanceData.forEach(r => { attMap[r.clientId] = r.status; });
      setAttendanceMap(attMap);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const playSound = (type) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      }
      osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
  };

  const handleMark = async (client, status) => {
    try {
      await markAttendance(client.id, selectedDate, status);
      setAttendanceMap(prev => ({ ...prev, [client.id]: status }));
      playSound(status === 'Present' ? 'success' : 'error');
    } catch (e) { console.error(e); }
  };

  // ── Report ──────────────────────────────────────────────────────────────────
  const openReport = async (client) => {
    setReportClient(client);
    setReportData(null);
    loadReport(client.id, reportYear, reportMonth);
  };

  const loadReport = async (clientId, year, month) => {
    setReportLoading(true);
    try {
      const data = await getAttendanceMonthly(clientId, year, String(month).padStart(2,'0'));
      setReportData(data);
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  };

  const handleReportMonthChange = (m) => {
    setReportMonth(m);
    if (reportClient) loadReport(reportClient.id, reportYear, m);
  };
  const handleReportYearChange = (y) => {
    setReportYear(y);
    if (reportClient) loadReport(reportClient.id, y, reportMonth);
  };

  // ── Derived counts ───────────────────────────────────────────────────────────
  const presentCount = Object.values(attendanceMap).filter(s => s === 'Present').length;
  const absentCount  = Object.values(attendanceMap).filter(s => s === 'Absent').length;

  const todayISO = new Date().toISOString().split('T')[0];

  const presentClients = clients.filter(c => attendanceMap[c.id] === 'Present');
  const absentClients  = clients.filter(c => attendanceMap[c.id] === 'Absent');
  const expiredPresentClients = clients.filter(c => {
    const isExpired = c.expiryDate && new Date(c.expiryDate).toISOString().split('T')[0] < todayISO;
    return attendanceMap[c.id] === 'Present' && isExpired;
  });

  let displayClients = [];
  if (activeTab === 'present') displayClients = presentClients;
  else if (activeTab === 'absent') displayClients = absentClients;
  else if (activeTab === 'expired_present') displayClients = expiredPresentClients;

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.clientId?.toLowerCase().includes(searchTerm.toLowerCase())
  );



  return (
    <div className="attendance-container">
      {/* ── Header ── */}
      <header className="attendance-header-section reveal">
        <div className="title-group">
          <h1><span>CLIENT</span> ATTENDANCE</h1>
        </div>
        <div className="header-right-group">
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-label">Total Clients</span>
              <span className="stat-value">{clients.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Present Today</span>
              <span className="stat-value green">{presentCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Absent Today</span>
              <span className="stat-value red">{absentCount}</span>
            </div>
          </div>
          <div className="date-picker-group">
            <input type="date" className="date-picker" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)} />
          </div>
        </div>
      </header>

      <div className="attendance-main-layout reveal">
        {/* ── Sidebar: Client List ── */}
        <div className="attendance-sidebar">
          <div className="sidebar-header">
            <h3>CLIENT LIST</h3>
            <div className="sidebar-search">
              <input type="text" placeholder="Search name or ID..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="sidebar-client-list">
            {loading ? (
              <div className="empty-record">Loading...</div>
            ) : filteredClients.map(client => {
              const status = attendanceMap[client.id];
              return (
                <div key={client.id} className="sidebar-client-item">
                  <div className="client-info-compact" onClick={() => openReport(client)} style={{ cursor: 'pointer' }}>
                    <span className="client-name-compact">{client.name}</span>
                    <span className="client-id-compact">{formatShortId(client.clientId || client.id)}</span>
                  </div>
                  <div className="client-action-group">
                    {status ? (
                      <span className={`manual-status ${status.toLowerCase()}`}>
                        {status === 'Present' ? '✅ Present' : '❌ Absent'}
                      </span>
                    ) : (
                      <div className="inline-mark-btns">
                        <button className="mark-btn present" onClick={e => { e.stopPropagation(); handleMark(client, 'Present'); }}>✅ Present</button>
                        <button className="mark-btn absent"  onClick={e => { e.stopPropagation(); handleMark(client, 'Absent');  }}>❌ Absent</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Attendance Logs + Due Balance ── */}
        <div className="attendance-content">
          {/* Attendance Log */}
          <div className="attendance-record-section">
            <div className="record-tabs">
              <button className={`record-tab ${activeTab === 'present' ? 'active green' : ''}`}
                onClick={() => setActiveTab('present')}>
                ✅ Present ({presentCount})
              </button>
              <button className={`record-tab ${activeTab === 'absent' ? 'active red' : ''}`}
                onClick={() => setActiveTab('absent')}>
                ❌ Absent ({absentCount})
              </button>
              <button className={`record-tab ${activeTab === 'expired_present' ? 'active orange' : ''}`}
                onClick={() => setActiveTab('expired_present')}>
                ⚠️ Expired Clients Present ({expiredPresentClients.length})
              </button>
            </div>
            <div className="record-list-container">
              {displayClients.length === 0 ? (
                <div className="empty-record">No entries yet for this tab.</div>
              ) : (
                <div className="record-list">
                  {displayClients.map(client => (
                    <div key={client.id} className="record-item">
                      <div className="record-info">
                        <div className="record-avatar">
                          {client.profileImage ? <img src={client.profileImage} alt={client.name} /> : <span>{client.name.charAt(0).toUpperCase()}</span>}
                        </div>
                        <div className="record-details">
                          <span className="record-name" onClick={() => openReport(client)} style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>{client.name}</span>
                          <span className="record-id">{formatShortId(client.clientId || client.id)}</span>
                        </div>
                      </div>
                      <span className={`status-badge ${activeTab}`}>
                        {activeTab === 'present' ? '✅ Present' : '❌ Absent'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>


        </div>
      </div>

      {/* ── Monthly Report Modal ── */}
      {reportClient && (
        <div className="modal-overlay" onClick={() => setReportClient(null)}>
          <div className="report-modal" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <div>
                <h2>{reportClient.name}</h2>
                <span className="report-client-id">{formatShortId(reportClient.clientId || reportClient.id)}</span>
              </div>
              <button className="modal-close-btn" onClick={() => setReportClient(null)}>✕</button>
            </div>

            <div className="report-selectors">
              <select value={reportMonth} onChange={e => handleReportMonthChange(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select value={reportYear} onChange={e => handleReportYearChange(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {reportLoading ? (
              <div className="report-loading">Loading report...</div>
            ) : reportData ? (
              <div className="report-stats-grid">
                <div className="report-stat-card total">
                  <span className="rs-val">{reportData.totalDays}</span>
                  <span className="rs-lbl">Total Days</span>
                </div>
                <div className="report-stat-card present">
                  <span className="rs-val">{reportData.presentDays}</span>
                  <span className="rs-lbl">Present Days</span>
                </div>
                <div className="report-stat-card absent">
                  <span className="rs-val">{reportData.absentDays}</span>
                  <span className="rs-lbl">Absent Days</span>
                </div>
                <div className="report-stat-card neutral">
                  <span className="rs-val">{reportData.totalDays - reportData.presentDays - reportData.absentDays}</span>
                  <span className="rs-lbl">Not Marked</span>
                </div>
              </div>
            ) : null}

            <div className="report-footer">
              <span className="report-month-label">Selected Month: {MONTHS[reportMonth - 1]} {reportYear}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Bill Modal (PDF) ── */}
      <InvoicePreviewModal
        isOpen={!!invoicePreviewClient}
        onClose={() => setInvoicePreviewClient(null)}
        client={invoicePreviewClient}
      />
    </div>
  );
};

export default ClientAttendancePage;
