import React, { useState, useEffect, useCallback } from 'react';
import './WhatsAppRemindersPage.css';

const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return '';
  }
  return 'http://localhost:5000';
};

const API = getApiBase();


const WhatsAppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.433 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.558 0 11.894-5.335 11.897-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);

const formatDate = (d) => {
  if (!d) return 'N/A';
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return 'N/A';
  return `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}`;
};

const getDaysLabel = (expiryDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diff = Math.round((expiry - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `Expired ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago`;
  if (diff === 0) return 'Expires today';
  return `Expires in ${diff} day${diff !== 1 ? 's' : ''}`;
};

const ClientRow = ({ client, type, onSent }) => {
  const [status, setStatus] = useState('idle'); // idle | sending | sent | failed
  const [errMsg, setErrMsg] = useState('');

  const send = async () => {
    setStatus('sending');
    setErrMsg('');
    try {
      const res = await fetch(`${API}/api/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          clientName: client.name,
          phone: client.phone,
          type
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStatus('sent');
      onSent && onSent(client.id);
    } catch (err) {
      setStatus('failed');
      setErrMsg(err.message);
    }
  };

  return (
    <div className={`wa-client-row ${status === 'sent' ? 'row-sent' : ''}`}>
      <div className="wa-client-avatar">
        {client.name.charAt(0).toUpperCase()}
      </div>
      <div className="wa-client-info">
        <span className="wa-client-name">{client.name}</span>
        <span className="wa-client-sub">
          <span className="wa-plan-pill">{client.plan}</span>
          <span className="wa-phone">{client.phone}</span>
        </span>
      </div>
      <div className="wa-client-expiry">
        <span className={`wa-days-label ${type === 'expired' ? 'expired' : 'warning'}`}>
          <ClockIcon /> {getDaysLabel(client.expiryDate)}
        </span>
        <span className="wa-expiry-date">{formatDate(client.expiryDate)}</span>
      </div>
      <div className="wa-client-action">
        {status === 'failed' && <span className="wa-err-tip" title={errMsg}>⚠</span>}
        <button
          className={`wa-send-btn ${status}`}
          onClick={send}
          disabled={status === 'sending' || status === 'sent'}
          title={status === 'sent' ? 'Message sent!' : `Send WhatsApp to ${client.name}`}
        >
          {status === 'sending' && <span className="wa-spinner" />}
          {status === 'sent' && <CheckIcon />}
          {(status === 'idle' || status === 'failed') && <SendIcon />}
          <span>
            {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent!' : 'Send'}
          </span>
        </button>
      </div>
    </div>
  );
};

const WhatsAppRemindersPage = () => {
  const [activeTab, setActiveTab] = useState('expiring');
  const [data, setData] = useState({ expiringSoon: [], expiredToday: [], counts: {}, configured: true });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bulkStatus, setBulkStatus] = useState('idle'); // idle | sending | done
  const [bulkResult, setBulkResult] = useState(null);
  const [sentIds, setSentIds] = useState(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [remRes, logRes] = await Promise.all([
        fetch(`${API}/api/whatsapp/reminders`),
        fetch(`${API}/api/whatsapp/log`)
      ]);
      const remData = await remRes.json();
      const logData = await logRes.json();
      setData(remData);
      setLogs(logData);
    } catch (err) {
      console.error('Failed to fetch WhatsApp data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSent = (id) => {
    setSentIds(prev => new Set([...prev, id]));
  };

  const sendAll = async () => {
    const type = activeTab === 'expiring' ? 'expiring_soon' : 'expired';
    setBulkStatus('sending');
    setBulkResult(null);
    try {
      const res = await fetch(`${API}/api/whatsapp/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      const result = await res.json();
      setBulkResult(result);
      setBulkStatus('done');
      // Mark all as sent in local state
      const list = activeTab === 'expiring' ? data.expiringSoon : data.expiredToday;
      setSentIds(new Set(list.map(c => c.id)));
      fetchData(); // refresh logs
    } catch (err) {
      setBulkStatus('idle');
      alert('Bulk send failed: ' + err.message);
    }
  };

  const currentList = activeTab === 'expiring' ? data.expiringSoon : data.expiredToday;
  const currentType = activeTab === 'expiring' ? 'expiring_soon' : 'expired';

  return (
    <div className="wa-page">
      {/* Header */}
      <header className="wa-header reveal">
        <div className="wa-header-left">
          <div className="wa-icon-badge">
            <WhatsAppIcon />
          </div>
          <div>
            <h1><span>WHATSAPP</span> REMINDERS</h1>
            <p>Automated membership alerts via WhatsApp Business API</p>
          </div>
        </div>
        <div className="wa-header-stats">
          <div className="wa-stat-pill warning">
            <span className="wa-stat-num">{data.counts?.expiringSoon || 0}</span>
            <span className="wa-stat-label">Expiring Soon</span>
          </div>
          <div className="wa-stat-pill expired">
            <span className="wa-stat-num">{data.counts?.expiredToday || 0}</span>
            <span className="wa-stat-label">Expired</span>
          </div>
          <button className="wa-refresh-btn" onClick={fetchData} title="Refresh">
            <RefreshIcon />
          </button>
        </div>
      </header>

      {/* Config Warning */}
      {!data.configured && (
        <div className="wa-config-warning reveal">
          <span>⚠️</span>
          <div>
            <strong>Phone Number ID not set.</strong>
            <span> Add <code>WHATSAPP_PHONE_NUMBER_ID</code> to <code>server/.env</code> to enable real sending. Get it from Meta Developer Console → WhatsApp → API Setup.</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="wa-tabs reveal">
        <button
          className={`wa-tab ${activeTab === 'expiring' ? 'active' : ''}`}
          onClick={() => { setActiveTab('expiring'); setBulkStatus('idle'); setBulkResult(null); }}
          id="tab-expiring"
        >
          <span className="wa-tab-dot warning" />
          Expiring in 1–7 Days
          <span className="wa-tab-badge warning">{data.counts?.expiringSoon || 0}</span>
        </button>
        <button
          className={`wa-tab ${activeTab === 'expired' ? 'active' : ''}`}
          onClick={() => { setActiveTab('expired'); setBulkStatus('idle'); setBulkResult(null); }}
          id="tab-expired"
        >
          <span className="wa-tab-dot expired" />
          Expired Plans
          <span className="wa-tab-badge expired">{data.counts?.expiredToday || 0}</span>
        </button>
        <button
          className={`wa-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          id="tab-history"
        >
          Send History
          <span className="wa-tab-badge neutral">{logs.length}</span>
        </button>
      </div>

      {/* Content */}
      <div className="wa-content reveal">
        {activeTab !== 'history' ? (
          <>
            {/* Bulk action bar */}
            <div className="wa-bulk-bar">
              <span className="wa-bulk-count">
                {currentList.length} client{currentList.length !== 1 ? 's' : ''} to notify
              </span>
              <div className="wa-bulk-actions">
                {bulkStatus === 'done' && bulkResult && (
                  <span className="wa-bulk-result">
                    ✅ {bulkResult.sent} sent{bulkResult.failed > 0 ? `, ❌ ${bulkResult.failed} failed` : ''}
                  </span>
                )}
                <button
                  className={`wa-send-all-btn ${bulkStatus}`}
                  onClick={sendAll}
                  disabled={bulkStatus === 'sending' || currentList.length === 0}
                  id="btn-send-all"
                >
                  {bulkStatus === 'sending' ? (
                    <><span className="wa-spinner" /> Sending All…</>
                  ) : (
                    <><WhatsAppIcon /> Send All ({currentList.length})</>
                  )}
                </button>
              </div>
            </div>

            {/* Client list */}
            <div className="wa-list">
              {loading ? (
                <div className="wa-empty">
                  <span className="wa-spinner-lg" />
                  <p>Loading clients…</p>
                </div>
              ) : currentList.length === 0 ? (
                <div className="wa-empty">
                  <div className="wa-empty-icon">✅</div>
                  <h3>All clear!</h3>
                  <p>
                    {activeTab === 'expiring'
                      ? 'No memberships expiring in the next 7 days.'
                      : 'No expired memberships at this time.'}
                  </p>
                </div>
              ) : (
                currentList.map(client => (
                  <ClientRow
                    key={client.id}
                    client={client}
                    type={currentType}
                    onSent={handleSent}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          /* History Tab */
          <div className="wa-history">
            {logs.length === 0 ? (
              <div className="wa-empty">
                <div className="wa-empty-icon">📭</div>
                <h3>No messages sent yet</h3>
                <p>Your WhatsApp send history will appear here.</p>
              </div>
            ) : (
              <div className="wa-log-list">
                <div className="wa-log-header">
                  <span>Client</span><span>Phone</span><span>Type</span><span>Sent At</span>
                </div>
                {logs.map((log, i) => (
                  <div key={log.id || i} className="wa-log-row">
                    <span className="wa-log-name">{log.clientName}</span>
                    <span className="wa-log-phone">{log.phone}</span>
                    <span className={`wa-log-type ${log.type === 'expiring_soon' ? 'warning' : 'expired'}`}>
                      {log.type === 'expiring_soon' ? '⏰ Expiring Soon' : '🔴 Expired'}
                    </span>
                    <span className="wa-log-time">
                      {new Date(log.sentAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-send info footer */}
      <div className="wa-footer-note reveal">
        <span>🤖</span>
        <span>
          <strong>Auto-send enabled.</strong> Every day at 9:00 AM IST, the server automatically sends WhatsApp messages to clients expiring in exactly 7 days, 3 days, and those whose plan expired today.
        </span>
      </div>
    </div>
  );
};

export default WhatsAppRemindersPage;
