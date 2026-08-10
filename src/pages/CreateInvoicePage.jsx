import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClients, getSettings, renewExpiredClient, addClient, getNextClientId } from '../api';
import { formatDateDDMMYYYY } from '../utils/formatDate';
import './CreateInvoicePage.css';

import { isValidGSTIN } from '../utils/gstValidator';

const CreateInvoicePage = () => {
  const navigate = useNavigate();
  const [expiredClients, setExpiredClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [settings, setSettings] = useState({});
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [hasGst, setHasGst] = useState(false);
  const [gstin, setGstin] = useState('');
  const [gstError, setGstError] = useState('');
  const [isRenewing, setIsRenewing] = useState(false);
  const [successToast, setSuccessToast] = useState(null);

  // Add New Client Modal State
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    phone: '',
    gender: 'Male',
    selectedPlan: null,
    hasGst: false,
    gstin: ''
  });
  const [addClientError, setAddClientError] = useState('');
  const [isSubmittingNewClient, setIsSubmittingNewClient] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsData, settingsData] = await Promise.all([
        getClients(),
        getSettings()
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expired = clientsData.filter(c => {
        if (c.status === 'Expired' || c.status === 'inactive') return true;
        if (!c.expiryDate) return false;
        const expiry = new Date(c.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        return expiry < today;
      });

      setExpiredClients(expired);
      setSettings(settingsData || {});
    } catch (err) {
      console.error("Error loading expired clients:", err);
    } finally {
      setLoading(false);
    }
  };

  const getTariffOptions = () => {
    const options = [];
    const keys = Object.keys(settings).filter(k => k.endsWith('_Strengthening') && !k.startsWith('PT_') && !k.startsWith('Diet'));

    const defaultDurations = {
      'Monthly': 30,
      'Quarterly': 90,
      'Half-Yearly': 180,
      'Annual': 365
    };

    keys.forEach(key => {
      const baseKey = key.replace('_Strengthening', '');
      const isHidden = settings[`${baseKey}_hidden`] === 1 || settings[`${baseKey}_hidden`] === '1';
      if (!isHidden) {
        const price = settings[key] || 0;
        const duration = settings[`${baseKey}_duration`] !== undefined 
          ? settings[`${baseKey}_duration`] 
          : (defaultDurations[baseKey] || 30);
        
        options.push({
          name: `${baseKey} Plan`,
          baseKey: baseKey,
          price: price,
          durationDays: duration
        });
      }
    });

    return options;
  };

  const handleOpenRenew = (client) => {
    setSelectedClient(client);
    setHasGst(!!client.gstin);
    setGstin(client.gstin || '');
    setGstError('');
    const options = getTariffOptions();
    if (options.length > 0) {
      setSelectedPlan(options[0]);
    }
  };

  const handleConfirmRenew = async () => {
    if (!selectedClient || !selectedPlan) return;
    
    if (hasGst) {
      if (!gstin || !isValidGSTIN(gstin)) {
        setGstError('Please enter a valid 15-character GSTIN (e.g. 33ABCDE1234F1Z5)');
        return;
      }
    }
    setGstError('');

    setIsRenewing(true);
    try {
      const resp = await renewExpiredClient(selectedClient.id, {
        planName: selectedPlan.name,
        price: selectedPlan.price,
        durationDays: selectedPlan.durationDays,
        hasGst,
        gstin: hasGst ? gstin.trim().toUpperCase() : null
      });

      setSuccessToast(`Invoice ${resp.billNo} generated! Client ${selectedClient.name} reactivated.`);
      setSelectedClient(null);
      setSelectedPlan(null);
      loadData();
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      alert(err.message || "Failed to renew client");
    } finally {
      setIsRenewing(false);
    }
  };

  const handleOpenAddClientModal = () => {
    const options = getTariffOptions();
    setNewClientForm({
      name: '',
      phone: '',
      gender: 'Male',
      selectedPlan: options.length > 0 ? options[0] : null,
      hasGst: false,
      gstin: ''
    });
    setAddClientError('');
    setIsAddClientOpen(true);
  };

  const handleCreateNewClientAndInvoice = async (e) => {
    e.preventDefault();
    if (!newClientForm.name || newClientForm.name.trim().length < 2) {
      setAddClientError('Please enter a valid client name.');
      return;
    }
    const cleanPhone = newClientForm.phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      setAddClientError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!newClientForm.selectedPlan) {
      setAddClientError('Please select a membership plan.');
      return;
    }
    if (newClientForm.hasGst) {
      if (!newClientForm.gstin || !isValidGSTIN(newClientForm.gstin)) {
        setAddClientError('Please enter a valid 15-character GSTIN (e.g. 33ABCDE1234F1Z5)');
        return;
      }
    }
    setAddClientError('');
    setIsSubmittingNewClient(true);

    try {
      let code = '';
      try {
        const res = await getNextClientId();
        code = res.nextClientId;
      } catch (err) {
        code = `GYM${Date.now().toString().slice(-6)}`;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const d = new Date(todayStr);
      d.setDate(d.getDate() + parseInt(newClientForm.selectedPlan.durationDays || 30, 10));
      const expiryStr = d.toISOString().split('T')[0];

      const created = await addClient({
        clientId: code,
        name: newClientForm.name.trim(),
        phone: cleanPhone,
        gender: newClientForm.gender,
        plan: newClientForm.selectedPlan.baseKey || 'Monthly',
        fromDate: todayStr,
        expiryDate: expiryStr,
        amount: newClientForm.selectedPlan.price,
        paidAmount: 0,
        dueAmount: newClientForm.selectedPlan.price,
        paymentStatus: 'Due',
        hasGst: newClientForm.hasGst,
        gstin: newClientForm.hasGst ? newClientForm.gstin.trim().toUpperCase() : null,
        status: 'Active'
      });

      setSuccessToast(`New Client ${created.name || newClientForm.name} (${created.clientId || code}) created! Initial invoice generated.`);
      setIsAddClientOpen(false);
      loadData();
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      setAddClientError(err.message || 'Failed to create new client and invoice.');
    } finally {
      setIsSubmittingNewClient(false);
    }
  };

  const filteredClients = expiredClients.filter(c =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.clientId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tariffOptions = getTariffOptions();

  return (
    <div className="premium-dashboard">
      <main className="dashboard-main create-invoice-container">
        {/* Toast Notification */}
        {successToast && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#059669',
            color: '#ffffff',
            padding: '1rem 1.5rem',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            fontWeight: '800',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
            {successToast}
          </div>
        )}

        <header className="create-invoice-header">
          <div>
            <h1 className="create-invoice-title">Client Invoicing & Renewals</h1>
            <p className="create-invoice-subtitle">Select an expired client to generate a renewal invoice or register a new client with an instant invoice.</p>
          </div>

          <div className="search-filter-box">
            <button className="btn-add-client-invoice" onClick={() => navigate('/add-client')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Add New Client
            </button>
            <input
              type="text"
              className="invoice-search-input"
              placeholder="Search by client name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </header>

        {loading ? (
          <div className="empty-expired-state">Loading expired clients...</div>
        ) : (
          <div className="expired-table-card">
            {filteredClients.length === 0 ? (
              <div className="empty-expired-state">
                <h3>No Expired Clients Found</h3>
                <p>All active client memberships are currently up to date.</p>
              </div>
            ) : (
              <table className="expired-table">
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Client Name</th>
                    <th>Phone</th>
                    <th>Last Plan</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map(client => (
                    <tr key={client.id}>
                      <td><span style={{ fontWeight: '800', color: '#4f46e5' }}>{client.clientId || 'N/A'}</span></td>
                      <td style={{ fontWeight: '800' }}>{client.name}</td>
                      <td>{client.phone || 'N/A'}</td>
                      <td>{client.plan || 'General Plan'}</td>
                      <td>
                        <span style={{ color: '#dc2626', fontWeight: '700' }}>
                          {client.expiryDate ? formatDateDDMMYYYY(client.expiryDate) : 'Expired'}
                        </span>
                      </td>
                      <td>
                        <span className="badge-expired-tag">Expired</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-renew-action"
                          onClick={() => handleOpenRenew(client)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                          Renew
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Renew Plan Modal */}
        {selectedClient && (
          <div className="renew-modal-overlay">
            <div className="renew-modal-card">
              <div className="renew-modal-header">
                <h3 className="renew-modal-title">Renew Membership — {selectedClient.name}</h3>
                <button
                  onClick={() => setSelectedClient(null)}
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', fontWeight: '800' }}
                >
                  ✕
                </button>
              </div>

              <div className="renew-modal-body">
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>
                    Select Membership Plan
                  </label>
                  <div className="plan-picker-grid">
                    {tariffOptions.map(opt => (
                      <div
                        key={opt.baseKey}
                        className={`plan-option-card ${selectedPlan?.baseKey === opt.baseKey ? 'selected' : ''}`}
                        onClick={() => setSelectedPlan(opt)}
                      >
                        <div className="plan-name-txt">{opt.name}</div>
                        <div className="plan-price-txt">₹{opt.price}</div>
                        <div className="plan-duration-txt">{opt.durationDays} Days</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GST Number Capture */}
                <div style={{ marginTop: '1.25rem', background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e1b4b', display: 'block', marginBottom: '0.5rem' }}>
                    Does this client have a GST number?
                  </label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: hasGst ? '0.75rem' : '0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="radio"
                        name="renewHasGst"
                        checked={hasGst}
                        onChange={() => { setHasGst(true); setGstError(''); }}
                      />
                      Yes (B2B Client)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="radio"
                        name="renewHasGst"
                        checked={!hasGst}
                        onChange={() => { setHasGst(false); setGstError(''); }}
                      />
                      No (B2C Consumer)
                    </label>
                  </div>

                  {hasGst && (
                    <div>
                      <input
                        type="text"
                        placeholder="Enter 15-Digit GSTIN (e.g. 33ABCDE1234F1Z5)"
                        value={gstin}
                        maxLength={15}
                        onChange={(e) => { setGstin(e.target.value.toUpperCase()); setGstError(''); }}
                        style={{
                          width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: gstError ? '2px solid #ef4444' : '1px solid #cbd5e1',
                          fontWeight: '700', fontSize: '0.9rem', outline: 'none', background: '#ffffff'
                        }}
                      />
                      {gstError && (
                        <div style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: '700', marginTop: '4px' }}>
                          ⚠️ {gstError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedPlan && (
                  <div className="renew-summary-box">
                    <div><strong>Plan:</strong> {selectedPlan.name}</div>
                    <div><strong>Amount Due:</strong> ₹{selectedPlan.price}</div>
                    <div><strong>Duration:</strong> {selectedPlan.durationDays} Days</div>
                    <div><strong>Start Date:</strong> Today ({formatDateDDMMYYYY(new Date())})</div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#475569' }}>
                      ⚡ Immediately generates a <strong>Due Invoice (INV-xxxx)</strong> and reactivates {selectedClient.name}'s status to <strong>Active</strong>.
                    </div>
                  </div>
                )}

                <div className="renew-actions-row">
                  <button
                    className="btn-cancel-renew"
                    onClick={() => setSelectedClient(null)}
                    disabled={isRenewing}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-confirm-renew"
                    onClick={handleConfirmRenew}
                    disabled={isRenewing || !selectedPlan}
                  >
                    {isRenewing ? 'Generating Invoice...' : 'Confirm Renewal & Create Invoice'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Add New Client & Generate Invoice Modal */}
        {isAddClientOpen && (
          <div className="renew-modal-overlay">
            <div className="renew-modal-card" style={{ maxWidth: '580px' }}>
              <div className="renew-modal-header" style={{ background: '#4f46e5' }}>
                <h3 className="renew-modal-title">➕ Register New Client & Generate Invoice</h3>
                <button
                  onClick={() => setIsAddClientOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', fontWeight: '800' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateNewClientAndInvoice} className="renew-modal-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                {addClientError && (
                  <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '700' }}>
                    ⚠️ {addClientError}
                  </div>
                )}

                {/* Client Basic Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'block' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={newClientForm.name}
                      onChange={e => setNewClientForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '600', fontSize: '0.9rem', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'block' }}>
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      value={newClientForm.phone}
                      onChange={e => setNewClientForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                      required
                      style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '600', fontSize: '0.9rem', outline: 'none' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'block' }}>
                    Gender *
                  </label>
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {['Male', 'Female', 'Other'].map(g => (
                      <label key={g} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.88rem' }}>
                        <input
                          type="radio"
                          name="newClientGender"
                          checked={newClientForm.gender === g}
                          onChange={() => setNewClientForm(prev => ({ ...prev, gender: g }))}
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Membership Plan Selection */}
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>
                    Select Membership Plan *
                  </label>
                  <div className="plan-picker-grid">
                    {tariffOptions.map(opt => (
                      <div
                        key={opt.baseKey}
                        className={`plan-option-card ${newClientForm.selectedPlan?.baseKey === opt.baseKey ? 'selected' : ''}`}
                        onClick={() => setNewClientForm(prev => ({ ...prev, selectedPlan: opt }))}
                      >
                        <div className="plan-name-txt">{opt.name}</div>
                        <div className="plan-price-txt">₹{opt.price}</div>
                        <div className="plan-duration-txt">{opt.durationDays} Days</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GST Capture */}
                <div style={{ background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e1b4b', display: 'block', marginBottom: '0.5rem' }}>
                    Does this client have a GST number?
                  </label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: newClientForm.hasGst ? '0.75rem' : '0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="radio"
                        name="newClientHasGst"
                        checked={newClientForm.hasGst}
                        onChange={() => setNewClientForm(prev => ({ ...prev, hasGst: true }))}
                      />
                      Yes (B2B Client)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input
                        type="radio"
                        name="newClientHasGst"
                        checked={!newClientForm.hasGst}
                        onChange={() => setNewClientForm(prev => ({ ...prev, hasGst: false }))}
                      />
                      No (B2C Consumer)
                    </label>
                  </div>

                  {newClientForm.hasGst && (
                    <input
                      type="text"
                      placeholder="Enter 15-Digit GSTIN (e.g. 33ABCDE1234F1Z5)"
                      value={newClientForm.gstin}
                      maxLength={15}
                      onChange={(e) => setNewClientForm(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                      style={{
                        width: '100%', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                        fontWeight: '700', fontSize: '0.9rem', outline: 'none', background: '#ffffff'
                      }}
                    />
                  )}
                </div>

                <div className="renew-actions-row">
                  <button
                    type="button"
                    className="btn-cancel-renew"
                    onClick={() => setIsAddClientOpen(false)}
                    disabled={isSubmittingNewClient}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-confirm-renew"
                    style={{ background: '#4f46e5' }}
                    disabled={isSubmittingNewClient || !newClientForm.selectedPlan}
                  >
                    {isSubmittingNewClient ? 'Creating Client & Invoice...' : 'Create Client & Issue Invoice'}
                  </button>
                </div>

                <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => { setIsAddClientOpen(false); navigate('/add-client'); }}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Or open full client registration form →
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateInvoicePage;
