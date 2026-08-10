import React, { useState, useEffect } from 'react';
import {
  getPtClassLogsToday,
  getPtAssignments,
  getTrainers,
  logPtClass,
  deletePtClassLog,
  getClients,
  getPtClassHistory,
  getTrainerDailyStatus,
  saveTrainerDailyStatus
} from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './PTClassLogPage.css';

const PTClassLogPage = () => {
  const isSuperAdmin = localStorage.getItem('userRole') === 'superadmin';
  const [viewMode, setViewMode] = useState('entry'); // 'entry' | 'calendar'
  const [subView, setSubView] = useState('calendar'); // 'calendar' | 'table'

  const [todayLogs, setTodayLogs] = useState([]);
  const [activeAssignments, setActiveAssignments] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    pt_assignment_id: '',
    class_date: new Date().toISOString().split('T')[0],
    session_slot: 'Morning',
    trainer_id: '', // optional substitute
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Daily Statuses (Absence / Present)
  const [dailyStatuses, setDailyStatuses] = useState([]);

  // History & Calendar Filters state
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [filterClientId, setFilterClientId] = useState('');
  const [filterTrainerId, setFilterTrainerId] = useState('');
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal for Day Details
  const [dayModal, setDayModal] = useState({ isOpen: false, dateStr: '', logs: [] });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    fetchDailyStatuses(formData.class_date);
  }, [formData.class_date]);

  useEffect(() => {
    if (viewMode === 'calendar') {
      fetchHistory();
    }
  }, [viewMode, historyMonth, filterClientId, filterTrainerId]);

  const loadInitialData = async () => {
    try {
      const [logsRes, assignRes, trainerRes, clientRes] = await Promise.all([
        getPtClassLogsToday(),
        getPtAssignments({ status: 'Active' }),
        getTrainers(),
        getClients()
      ]);
      setTodayLogs(logsRes);
      // Exclude expired/completed/cancelled assignments
      const activeOnly = (assignRes || []).filter(a => a.status === 'Active');
      setActiveAssignments(activeOnly);
      setTrainers(trainerRes);
      setClients(clientRes);
    } catch (error) {
      console.error('Failed to load PT Class Log data', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyStatuses = async (dateStr) => {
    try {
      const res = await getTrainerDailyStatus(dateStr);
      setDailyStatuses(res);
    } catch (err) {
      console.error('Failed to fetch trainer daily statuses', err);
    }
  };

  const getTrainerStatus = (trainerId) => {
    const found = dailyStatuses.find(s => String(s.trainer_id) === String(trainerId));
    return found ? found.status : 'Present';
  };

  const toggleTrainerStatus = async (trainerId) => {
    const current = getTrainerStatus(trainerId);
    const newStatus = current === 'Absent' ? 'Present' : 'Absent';
    try {
      await saveTrainerDailyStatus({
        trainer_id: trainerId,
        status_date: formData.class_date,
        status: newStatus,
        marked_by: localStorage.getItem('userRole') || 'Admin'
      });
      await fetchDailyStatuses(formData.class_date);
    } catch (err) {
      alert(err.message || 'Failed to update trainer status.');
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await getPtClassHistory({
        month: historyMonth,
        client_id: filterClientId || undefined,
        trainer_id: filterTrainerId || undefined
      });
      setHistoryLogs(data);
    } catch (err) {
      console.error('Failed to fetch class history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAssignmentChange = (e) => {
    const assignId = e.target.value;
    setFormData(prev => ({
      ...prev,
      pt_assignment_id: assignId,
      trainer_id: ''
    }));
  };

  const selectedAssignment = activeAssignments.find(a => String(a.id) === formData.pt_assignment_id);
  const isDefaultTrainerAbsent = selectedAssignment ? getTrainerStatus(selectedAssignment.trainer_id) === 'Absent' : false;
  const selectedSubstitute = trainers.find(t => String(t.id) === String(formData.trainer_id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.pt_assignment_id) {
      alert('Please select an active PT Assignment.');
      return;
    }
    if (!formData.class_date) {
      alert('Please select class date.');
      return;
    }

    if (isDefaultTrainerAbsent && (!formData.trainer_id || String(formData.trainer_id) === String(selectedAssignment.trainer_id))) {
      alert(`Default trainer ${selectedAssignment.trainerName} is marked ABSENT on ${formData.class_date}. Please select a substitute trainer to conduct this class.`);
      return;
    }

    setSubmitting(true);
    try {
      await logPtClass({
        pt_assignment_id: parseInt(formData.pt_assignment_id, 10),
        class_date: formData.class_date,
        session_slot: formData.session_slot || 'Morning',
        trainer_id: formData.trainer_id || undefined,
        notes: formData.notes
      });

      setFormData({
        pt_assignment_id: '',
        class_date: new Date().toISOString().split('T')[0],
        session_slot: 'Morning',
        trainer_id: '',
        notes: ''
      });
      loadInitialData();
      if (viewMode === 'calendar') fetchHistory();
    } catch (error) {
      alert(error.message || 'Failed to log class.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async (id) => {
    if (window.confirm('Undo / delete this class log entry?')) {
      try {
        await deletePtClassLog(id);
        loadInitialData();
        if (viewMode === 'calendar') fetchHistory();
      } catch (error) {
        alert(error.message || 'Failed to delete class log entry.');
      }
    }
  };

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  // ─── Monthly Calendar Helper Functions ─────────────────────────────────────
  const renderCalendarGrid = () => {
    const [yearStr, monthStr] = historyMonth.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1; // 0-indexed

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startDayOfWeek = new Date(year, monthIndex, 1).getDay(); // 0 = Sun

    const todayStr = new Date().toISOString().split('T')[0];

    // Group history logs by date: { 'YYYY-MM-DD': [logs] }
    const logsByDate = {};
    historyLogs.forEach(log => {
      if (!logsByDate[log.class_date]) logsByDate[log.class_date] = [];
      logsByDate[log.class_date].push(log);
    });

    const cells = [];

    // Empty cells before month start
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-day-cell empty"></div>);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayFormatted = String(day).padStart(2, '0');
      const dateStr = `${historyMonth}-${dayFormatted}`;
      const dayLogs = logsByDate[dateStr] || [];
      const isToday = dateStr === todayStr;

      cells.push(
        <div
          key={dateStr}
          className={`calendar-day-cell ${dayLogs.length > 0 ? 'has-classes' : ''} ${isToday ? 'today' : ''}`}
          onClick={() => dayLogs.length > 0 && setDayModal({ isOpen: true, dateStr, logs: dayLogs })}
        >
          <div className="calendar-day-header">
            <span className="calendar-day-num">{day}</span>
            {dayLogs.length > 0 && (
              <span className="calendar-day-count">{dayLogs.length} PT</span>
            )}
          </div>

          <div className="calendar-sessions-list">
            {dayLogs.slice(0, 3).map((log, idx) => (
              <div key={log.id || idx} className="calendar-session-pill" title={`${log.session_slot || 'Morning'} — ${log.clientName} (${log.packageName}) — ${log.trainerName}`}>
                <span className="client-name">{log.session_slot === 'Evening' ? '🌆' : '🌅'} {log.clientName}</span>
                <span className="trainer-name">{log.trainerName}</span>
              </div>
            ))}
            {dayLogs.length > 3 && (
              <div style={{ fontSize: '0.68rem', color: '#ea580c', fontWeight: '700', marginTop: '2px' }}>
                +{dayLogs.length - 3} more...
              </div>
            )}
          </div>
        </div>
      );
    }

    return cells;
  };

  return (
    <div className="pt-log-container">
      <header className="pt-log-header">
        <div className="title-group">
          <h1><span>PT CLASS LOG</span> & ATTENDANCE HISTORY</h1>
          <p>Record daily PT sessions & explore interactive attendance history calendars.</p>
        </div>
      </header>

      {/* Mode Switch Bar */}
      <div className="mode-toggle-bar">
        <button
          className={`mode-toggle-btn ${viewMode === 'entry' ? 'active' : ''}`}
          onClick={() => setViewMode('entry')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Log Daily Class
        </button>

        <button
          className={`mode-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
          onClick={() => setViewMode('calendar')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          PT Attendance Calendar & History
        </button>
      </div>

      {/* Quick Trainer Availability Strip */}
      <div className="availability-strip">
        <div className="availability-strip-header">
          <div className="availability-strip-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Trainer Daily Availability ({formatDateDDMMYYYY(formData.class_date)})
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Quick operational absence toggle for selected date</span>
        </div>
        <div className="availability-pills-row">
          {trainers.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>No active trainers found.</div>
          ) : (
            trainers.map(t => {
              const isAbsent = getTrainerStatus(t.id) === 'Absent';
              return (
                <div key={t.id} className={`trainer-status-pill ${isAbsent ? 'absent' : ''}`}>
                  <div className="trainer-info">
                    <span className="trainer-name">{t.name}</span>
                    <span className="trainer-grade">Grade {t.grade || 'Unassigned'} • {isAbsent ? '🔴 ABSENT' : '🟢 Present'}</span>
                  </div>
                  <button
                    type="button"
                    className={`btn-toggle-status ${isAbsent ? 'mark-present' : 'mark-absent'}`}
                    onClick={() => toggleTrainerStatus(t.id)}
                  >
                    {isAbsent ? 'Mark Present' : 'Mark Absent Today'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {viewMode === 'entry' ? (
        <div className="pt-log-grid">
          {/* Left Card: Quick Entry Form */}
          <div className="pt-log-card">
            <h3>Log New PT Class</h3>
            <form onSubmit={handleSubmit} className="log-form">
              <div className="log-form-group">
                <label>Select Active Assignment *</label>
                <select
                  value={formData.pt_assignment_id}
                  onChange={handleAssignmentChange}
                  required
                >
                  <option value="">-- Select Active Assignment --</option>
                  {activeAssignments.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.clientName} ({a.packageName}) — {a.classes_completed}/{a.total_classes_snapshot} Done
                    </option>
                  ))}
                </select>
              </div>

              {selectedAssignment && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                  <div><strong>Assigned Trainer:</strong> {selectedAssignment.trainerName} ({selectedAssignment.trainerGrade || 'No Grade'})</div>
                  <div><strong>Progress:</strong> {selectedAssignment.classes_completed} of {selectedAssignment.total_classes_snapshot} classes completed</div>
                  {isSuperAdmin && <div><strong>Package Price:</strong> {formatCurrency(selectedAssignment.package_price_snapshot)}</div>}
                </div>
              )}

              {selectedAssignment && isDefaultTrainerAbsent && (
                <div className="absence-warning-banner">
                  <span>⚠️</span>
                  <div>
                    <strong>{selectedAssignment.trainerName}</strong> is marked <strong>ABSENT</strong> on {formData.class_date}. Please select a substitute trainer below to conduct this class.
                  </div>
                </div>
              )}

              <div className="log-form-group">
                <label>Class Date & Session Slot *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <input
                    type="date"
                    value={formData.class_date}
                    onChange={e => setFormData({ ...formData, class_date: e.target.value })}
                    required
                  />
                  <select
                    value={formData.session_slot}
                    onChange={e => setFormData({ ...formData, session_slot: e.target.value })}
                    required
                  >
                    <option value="Morning">🌅 Morning Session</option>
                    <option value="Evening">🌆 Evening Session</option>
                  </select>
                </div>
              </div>

              <div className={`log-form-group ${isDefaultTrainerAbsent ? 'substitute-highlight' : ''}`}>
                <label>
                  Conducting Trainer {isDefaultTrainerAbsent ? '(Substitute Required due to Absence) *' : '(Substitute Override)'}
                </label>
                <select
                  value={formData.trainer_id}
                  onChange={e => setFormData({ ...formData, trainer_id: e.target.value })}
                  required={isDefaultTrainerAbsent}
                >
                  <option value="">{isDefaultTrainerAbsent ? '-- Select Substitute Trainer --' : '-- Same as Assigned Trainer --'}</option>
                  {trainers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Grade {t.grade || 'Unassigned'})
                    </option>
                  ))}
                </select>

                {selectedSubstitute && selectedAssignment && String(selectedSubstitute.id) !== String(selectedAssignment.trainer_id) && (
                  <div className="cross-grade-tag">
                    <span>ℹ️</span>
                    <span>Cross-grade substitution — <strong>{selectedSubstitute.name}</strong> (Grade {selectedSubstitute.grade || 'N/A'}) will be paid at their own grade's rate for this class.</span>
                  </div>
                )}
              </div>

              <div className="log-form-group">
                <label>Class Notes / Workout Focus</label>
                <textarea
                  rows="3"
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Chest & Triceps workout completed."
                ></textarea>
              </div>

              <button type="submit" className="btn-log-submit" disabled={submitting}>
                {submitting ? 'Logging Class...' : 'Log Conducted Class'}
              </button>
            </form>
          </div>

          {/* Right Card: Today's Logged Classes */}
          <div className="pt-log-card">
            <h3>Today's Logged Classes</h3>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading today's logs...</div>
            ) : todayLogs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>No PT classes logged today yet.</div>
            ) : (
              <div className="table-responsive">
                <table className="today-logs-table">
                  <thead>
                    <tr>
                      <th style={{ width: '30%' }}>Client & Session</th>
                      <th style={{ width: '24%' }}>Package</th>
                      <th style={{ width: '20%' }}>Trainer</th>
                      {isSuperAdmin && <th style={{ width: '16%' }}>Rate</th>}
                      <th style={{ width: '10%', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayLogs.map(log => {
                      const isSubstituted = log.assigned_trainer_id && String(log.trainer_id) !== String(log.assigned_trainer_id);
                      return (
                        <tr key={log.id}>
                          <td>
                            <div className="client-cell-group">
                              <div className="client-name-title">{log.clientName}</div>
                              <div className="session-code-row">
                                <span className={`session-slot-pill ${log.session_slot === 'Evening' ? 'evening' : 'morning'}`}>
                                  {log.session_slot === 'Evening' ? '🌆 Evening' : '🌅 Morning'}
                                </span>
                                <span className="client-code-tag">{log.clientCode}</span>
                              </div>
                            </div>
                          </td>
                          <td><span className="pkg-badge">{log.packageName}</span></td>
                          <td>
                            <div className="trainer-info-block">
                              <span className="trainer-name">{log.trainerName}</span>
                              {isSubstituted && (
                                <div className="substituted-badge">
                                  🔄 Substituted covering for {log.assignedTrainerName || 'Assigned'}
                                </div>
                              )}
                            </div>
                          </td>
                          {isSuperAdmin && (
                            <td>
                              <div className="rate-cell-block">
                                <div className="rate-amount">{formatCurrency(log.per_class_rate_snapshot)}</div>
                                <span className={`slab-badge ${log.slab_applied === 'Slab1' ? 'slab1' : 'slab2'}`}>
                                  {log.slab_applied === 'Slab1' ? 'Slab 1' : 'Slab 2'}
                                </span>
                              </div>
                            </td>
                          )}
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn-undo-log" onClick={() => handleUndo(log.id)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                              Undo
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Calendar & History View */
        <div className="calendar-card">
          <div className="calendar-filter-bar">
            <div className="calendar-filter-item">
              <label>Select Month</label>
              <input
                type="month"
                value={historyMonth}
                onChange={e => setHistoryMonth(e.target.value)}
              />
            </div>

            <div className="calendar-filter-item">
              <label>Filter Client</label>
              <select
                value={filterClientId}
                onChange={e => setFilterClientId(e.target.value)}
              >
                <option value="">All Clients</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.clientId})</option>
                ))}
              </select>
            </div>

            <div className="calendar-filter-item">
              <label>Filter Trainer</label>
              <select
                value={filterTrainerId}
                onChange={e => setFilterTrainerId(e.target.value)}
              >
                <option value="">All Trainers</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="calendar-filter-item" style={{ flex: 'none' }}>
              <label>View Mode</label>
              <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.2rem', borderRadius: '8px' }}>
                <button
                  type="button"
                  style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: subView === 'calendar' ? '#ffffff' : 'transparent', fontWeight: '700', cursor: 'pointer', color: subView === 'calendar' ? '#ea580c' : '#64748b' }}
                  onClick={() => setSubView('calendar')}
                >
                  📅 Grid
                </button>
                <button
                  type="button"
                  style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none', background: subView === 'table' ? '#ffffff' : 'transparent', fontWeight: '700', cursor: 'pointer', color: subView === 'table' ? '#ea580c' : '#64748b' }}
                  onClick={() => setSubView('table')}
                >
                  📋 List Table
                </button>
              </div>
            </div>
          </div>

          {loadingHistory ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading attendance history...</div>
          ) : subView === 'calendar' ? (
            <div>
              <div
                className="calendar-weekday-header"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '8px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  padding: '0.65rem 0',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '10px'
                }}
              >
                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.78rem', letterSpacing: '0.08em' }}>SUN</div>
                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.78rem', letterSpacing: '0.08em' }}>MON</div>
                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.78rem', letterSpacing: '0.08em' }}>TUE</div>
                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.78rem', letterSpacing: '0.08em' }}>WED</div>
                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.78rem', letterSpacing: '0.08em' }}>THU</div>
                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.78rem', letterSpacing: '0.08em' }}>FRI</div>
                <div style={{ fontWeight: '800', color: '#475569', fontSize: '0.78rem', letterSpacing: '0.08em' }}>SAT</div>
              </div>
              <div
                className="calendar-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '8px'
                }}
              >
                {renderCalendarGrid()}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="today-logs-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th>Client</th>
                    <th>Package</th>
                    <th>Trainer</th>
                    {isSuperAdmin && <th>Rate Snapshot</th>}
                  </tr>
                </thead>
                <tbody>
                  {historyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 6 : 5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>
                        No attendance history records found for selected filters.
                      </td>
                    </tr>
                  ) : (
                    historyLogs.map(log => {
                      const isSubstituted = log.assigned_trainer_id && String(log.trainer_id) !== String(log.assigned_trainer_id);
                      return (
                        <tr key={log.id}>
                          <td style={{ fontWeight: '700' }}>{formatDateDDMMYYYY(log.class_date)}</td>
                          <td>
                            <span style={{ background: log.session_slot === 'Evening' ? '#fef3c7' : '#e0f2fe', color: log.session_slot === 'Evening' ? '#b45309' : '#0369a1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                              {log.session_slot || 'Morning'}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: '700' }}>{log.clientName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{log.clientCode}</div>
                          </td>
                          <td>{log.packageName}</td>
                          <td>
                            <div>{log.trainerName}</div>
                            {isSubstituted && (
                              <div className="substituted-badge">
                                🔄 Substituted: {log.trainerName} ({log.trainerGrade || 'Grade ?'}) covering for {log.assignedTrainerName || 'Assigned'}
                              </div>
                            )}
                          </td>
                          {isSuperAdmin && (
                            <td>
                              <div style={{ fontWeight: '700', color: '#10b981' }}>{formatCurrency(log.per_class_rate_snapshot)}</div>
                              <span className={`slab-badge ${log.slab_applied === 'Slab1' ? 'slab1' : 'slab2'}`}>
                                {log.slab_applied === 'Slab1' ? 'Slab 1' : 'Slab 2'}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Day Details Modal */}
      {dayModal.isOpen && (
        <div className="day-modal-overlay" onClick={() => setDayModal({ ...dayModal, isOpen: false })}>
          <div className="day-modal-card animated-fade-in" onClick={e => e.stopPropagation()}>
            <div className="day-modal-header">
              <h3>PT Classes Conducted — {dayModal.dateStr}</h3>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}
                onClick={() => setDayModal({ ...dayModal, isOpen: false })}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {dayModal.logs.map(log => {
                const isSubstituted = log.assigned_trainer_id && String(log.trainer_id) !== String(log.assigned_trainer_id);
                return (
                  <div key={log.id} style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#0f172a' }}>
                        <span style={{ fontSize: '0.8rem', background: log.session_slot === 'Evening' ? '#fef3c7' : '#e0f2fe', color: log.session_slot === 'Evening' ? '#b45309' : '#0369a1', padding: '2px 8px', borderRadius: '4px', marginRight: '8px', fontWeight: '700' }}>
                          {log.session_slot || 'Morning'}
                        </span>
                        {log.clientName} ({log.clientCode})
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                        <strong>Trainer:</strong> {log.trainerName} • <strong>Package:</strong> {log.packageName}
                      </div>
                      {isSubstituted && (
                        <div className="substituted-badge">
                          🔄 Substituted: {log.trainerName} covering for {log.assignedTrainerName || 'Assigned Trainer'}
                        </div>
                      )}
                      {log.notes && (
                        <div style={{ fontSize: '0.8rem', color: '#ea580c', marginTop: '6px', fontStyle: 'italic' }}>
                          Note: "{log.notes}"
                        </div>
                      )}
                    </div>

                    {isSuperAdmin && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '800', color: '#16a34a', fontSize: '1.1rem' }}>{formatCurrency(log.per_class_rate_snapshot)}</div>
                        <span style={{ fontSize: '0.72rem', background: log.slab_applied === 'Slab1' ? '#d1fae5' : '#dbeafe', color: log.slab_applied === 'Slab1' ? '#047857' : '#1d4ed8', padding: '2px 8px', borderRadius: '100px', fontWeight: '700' }}>
                          {log.slab_applied === 'Slab1' ? 'Slab 1 (> ₹3L)' : 'Slab 2 (≤ ₹3L)'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '0.6rem 1.25rem', borderRadius: '100px', fontWeight: '700', cursor: 'pointer' }}
                onClick={() => setDayModal({ ...dayModal, isOpen: false })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PTClassLogPage;
