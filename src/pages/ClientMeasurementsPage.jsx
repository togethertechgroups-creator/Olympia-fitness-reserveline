import React, { useState, useEffect } from 'react';
import { 
  getClients, 
  getClientMeasurements, 
  addClientMeasurement, 
  updateClientMeasurement, 
  deleteClientMeasurement 
} from '../api';
import { formatShortId } from '../utils/formatShortId';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './ClientMeasurementsPage.css';

const getBMICategory = (heightCm, weightKg) => {
  if (!heightCm || !weightKg) return '';
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  
  if (bmi < 18.5) return 'UNDERWEIGHT';
  if (bmi < 25) return 'NORMAL';
  if (bmi < 30) return 'OVERWEIGHT';
  if (bmi < 35) return 'OBESITY I';
  if (bmi < 40) return 'OBESITY II';
  return 'OBESITY III';
};

const calculateLBM = (heightCm, weightKg, gender) => {
  const height = parseFloat(heightCm);
  const weight = parseFloat(weightKg);
  if (height && weight && height > 0) {
    const isFemale = gender && gender.toLowerCase() === 'female';
    if (isFemale) {
      return ((0.29569 * weight) + (0.41813 * height) - 43.2933).toFixed(1);
    } else {
      return ((0.32810 * weight) + (0.33929 * height) - 29.5336).toFixed(1);
    }
  }
  return '';
};

const calculateFatPercent = (weightKg, lbmKg) => {
  const weight = parseFloat(weightKg);
  const lbm = parseFloat(lbmKg);
  if (weight && lbm && weight > 0) {
    const fatMass = weight - lbm;
    const fatPercent = (fatMass / weight) * 100;
    return Math.max(0, fatPercent).toFixed(1);
  }
  return '';
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const ClientMeasurementsPage = () => {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('add'); // 'add' or 'history'
  
  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    height: '',
    weight: '',
    bmi: '',
    lbm: '',
    fat: '',
    chest_inspiration: '',
    chest_expiration: '',
    abs: '',
    waist: '',
    hip: '',
    thigh: '',
    calf: '',
    arm: '',
    forearm: '',
    hip_waist_ratio: ''
  });
  
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const fetchClientsData = async () => {
      try {
        const data = await getClients();
        setClients(data);
        if (data.length > 0) {
          setSelectedClient(data[0]);
        }
      } catch (error) {
        console.error('Failed to load clients', error);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClientsData();
  }, []);

  useEffect(() => {
    if (!selectedClient) {
      setMeasurements([]);
      return;
    }
    
    const fetchMeasurements = async () => {
      setLoadingHistory(true);
      try {
        const data = await getClientMeasurements(selectedClient.id);
        setMeasurements(data);
      } catch (error) {
        console.error('Failed to load measurements', error);
      } finally {
        setLoadingHistory(false);
      }
    };
    
    fetchMeasurements();
    resetForm();
  }, [selectedClient]);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      height: '',
      weight: '',
      bmi: '',
      lbm: '',
      fat: '',
      chest_inspiration: '',
      chest_expiration: '',
      abs: '',
      waist: '',
      hip: '',
      thigh: '',
      calf: '',
      arm: '',
      forearm: '',
      hip_waist_ratio: ''
    });
    setEditingId(null);
    setErrorMessage('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      const gender = selectedClient?.gender || 'Male';

      if (name === 'height' || name === 'weight') {
        const h = parseFloat(nextData.height);
        const w = parseFloat(nextData.weight);
        if (h && w) {
          const lbmVal = calculateLBM(h, w, gender);
          nextData.lbm = lbmVal;
          nextData.fat = calculateFatPercent(w, lbmVal);
          nextData.bmi = getBMICategory(h, w);
        } else {
          nextData.bmi = '';
          nextData.lbm = '';
          nextData.fat = '';
        }
      }
      
      if (name === 'fat') {
        const w = parseFloat(nextData.weight);
        const fatVal = parseFloat(nextData.fat);
        if (w && !isNaN(fatVal) && fatVal >= 0) {
          nextData.lbm = (w * (1 - fatVal / 100)).toFixed(1);
        } else if (!nextData.fat) {
          nextData.lbm = '';
        }
      }
      
      if (name === 'lbm') {
        const w = parseFloat(nextData.weight);
        const lbmVal = parseFloat(nextData.lbm);
        if (w && !isNaN(lbmVal) && w > 0) {
          const fatMass = w - lbmVal;
          const fatPercent = (fatMass / w) * 100;
          nextData.fat = Math.max(0, fatPercent).toFixed(1);
        } else if (!nextData.lbm) {
          nextData.fat = '';
        }
      }
      
      if (name === 'waist' || name === 'hip') {
        const waist = parseFloat(nextData.waist);
        const hip = parseFloat(nextData.hip);
        if (waist && hip) {
          nextData.hip_waist_ratio = (waist / hip).toFixed(3);
        } else {
          nextData.hip_waist_ratio = '';
        }
      }
      
      return nextData;
    });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClient) {
      setErrorMessage('Please select a client first.');
      return;
    }
    
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    
    const payload = {
      ...formData,
      height: formData.height ? parseFloat(formData.height) : null,
      weight: formData.weight ? parseFloat(formData.weight) : null,
      lbm: formData.lbm ? parseFloat(formData.lbm) : null,
      fat: formData.fat ? parseFloat(formData.fat) : null,
      chest_inspiration: formData.chest_inspiration ? parseFloat(formData.chest_inspiration) : null,
      chest_expiration: formData.chest_expiration ? parseFloat(formData.chest_expiration) : null,
      abs: formData.abs ? parseFloat(formData.abs) : null,
      waist: formData.waist ? parseFloat(formData.waist) : null,
      hip: formData.hip ? parseFloat(formData.hip) : null,
      thigh: formData.thigh ? parseFloat(formData.thigh) : null,
      calf: formData.calf ? parseFloat(formData.calf) : null,
      arm: formData.arm ? parseFloat(formData.arm) : null,
      forearm: formData.forearm ? parseFloat(formData.forearm) : null,
      hip_waist_ratio: formData.hip_waist_ratio ? parseFloat(formData.hip_waist_ratio) : null,
    };

    try {
      if (editingId) {
        await updateClientMeasurement(selectedClient.id, editingId, payload);
        setSuccessMessage('Measurement updated successfully.');
      } else {
        await addClientMeasurement(selectedClient.id, payload);
        setSuccessMessage('New measurement added successfully.');
      }
      
      const data = await getClientMeasurements(selectedClient.id);
      setMeasurements(data);
      
      resetForm();
      setActiveTab('history');
    } catch (error) {
      setErrorMessage(error.message || 'Failed to save measurement data.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (record) => {
    setEditingId(record.id);
    setFormData({
      date: record.date,
      height: record.height !== null ? record.height.toString() : '',
      weight: record.weight !== null ? record.weight.toString() : '',
      bmi: record.bmi || '',
      lbm: record.lbm !== null ? record.lbm.toString() : '',
      fat: record.fat !== null ? record.fat.toString() : '',
      chest_inspiration: record.chest_inspiration !== null ? record.chest_inspiration.toString() : '',
      chest_expiration: record.chest_expiration !== null ? record.chest_expiration.toString() : '',
      abs: record.abs !== null ? record.abs.toString() : '',
      waist: record.waist !== null ? record.waist.toString() : '',
      hip: record.hip !== null ? record.hip.toString() : '',
      thigh: record.thigh !== null ? record.thigh.toString() : '',
      calf: record.calf !== null ? record.calf.toString() : '',
      arm: record.arm !== null ? record.arm.toString() : '',
      forearm: record.forearm !== null ? record.forearm.toString() : '',
      hip_waist_ratio: record.hip_waist_ratio !== null ? record.hip_waist_ratio.toString() : ''
    });
    setActiveTab('add');
  };

  const handleDeleteClick = async (id) => {
    if (!window.confirm('Are you sure you want to delete this measurement entry?')) return;
    
    try {
      await deleteClientMeasurement(selectedClient.id, id);
      setMeasurements(measurements.filter(m => m.id !== id));
      setSuccessMessage('Measurement deleted successfully.');
    } catch (error) {
      alert('Failed to delete: ' + error.message);
    }
  };

  const filteredClients = clients.filter(c => {
    const term = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(term) || 
           c.clientId.toLowerCase().includes(term) || 
           (c.phone && c.phone.includes(term));
  });

  const chartData = [...measurements].reverse().map(m => ({
    name: formatDate(m.date),
    weight: m.weight,
    fat: m.fat
  }));

  const latestEntry = measurements.length > 0 ? measurements[0] : null;

  return (
    <div className="measurements-page-container">
      {/* Header Banner */}
      <header className="measurements-header">
        <div className="title-group">
          <h1><span>FITNESS</span> TRACKING</h1>
          <p>Record anthropometric statistics & track body transformation progress</p>
        </div>

        {selectedClient && (
          <div className="selected-client-quickbadge">
            <div className="avatar">
              {selectedClient.profileImage ? (
                <img src={selectedClient.profileImage} alt={selectedClient.name} />
              ) : (
                <span>{selectedClient.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="name">{selectedClient.name}</div>
              <div className="meta">ID: {formatShortId(selectedClient.clientId || selectedClient.id)} • {selectedClient.plan || 'Monthly'}</div>
            </div>
          </div>
        )}
      </header>

      {/* 2-Column Responsive Layout */}
      <div className="measurements-grid">
        {/* Left Side: Client Selector */}
        <div className="client-selector-card">
          <div className="search-box-wrapper">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--primary-neon)' }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input 
              type="text" 
              placeholder="SEARCH CLIENTS..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="clients-list-scroll">
            {loadingClients ? (
              <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1rem' }}>Loading clients list...</p>
            ) : filteredClients.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1rem' }}>No matching clients found.</p>
            ) : (
              filteredClients.map(client => (
                <div 
                  key={client.id} 
                  className={`client-item-pill ${selectedClient?.id === client.id ? 'active' : ''}`}
                  onClick={() => setSelectedClient(client)}
                >
                  <div className="client-avatar-thumb">
                    {client.profileImage ? (
                      <img src={client.profileImage} alt={client.name} />
                    ) : (
                      <span>{client.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="client-info-text">
                    <span className="name">{client.name}</span>
                    <span className="meta">ID: {formatShortId(client.clientId || client.id)} • {client.plan || 'Monthly'}</span>
                  </div>
                  <span className={`status-dot-indicator ${client.status === 'Active' ? 'active' : 'inactive'}`} />
                </div>
              ))
            )}
          </div>

          {/* Quick Client Summary Card */}
          {selectedClient && latestEntry && (
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '1.25rem', marginTop: 'auto' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '700', marginBottom: '0.5rem' }}>
                LATEST STATS ({formatDate(latestEntry.date)})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div><strong>Weight:</strong> <span style={{ color: 'var(--primary-neon)', fontWeight: '800' }}>{latestEntry.weight || '—'} kg</span></div>
                <div><strong>BMI:</strong> <span style={{ color: '#10b981', fontWeight: '800' }}>{latestEntry.bmi || '—'}</span></div>
                <div><strong>Fat %:</strong> <span>{latestEntry.fat || '—'}%</span></div>
                <div><strong>WHR Ratio:</strong> <span>{latestEntry.hip_waist_ratio || '—'}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Main Form & History Tabs Card */}
        <div className="measurements-main-card">
          {/* Top Tab Bar */}
          <div className="measurements-tab-bar">
            <button
              className={`measurements-tab-btn ${activeTab === 'add' ? 'active' : ''}`}
              onClick={() => setActiveTab('add')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              {editingId ? 'Edit Entry' : 'Add New Entry'}
            </button>

            <button
              className={`measurements-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              History & Trends ({measurements.length})
            </button>
          </div>

          {errorMessage && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', padding: '1rem', borderRadius: '12px', fontWeight: '700' }}>
              ⚠️ {errorMessage}
            </div>
          )}

          {successMessage && (
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981', padding: '1rem', borderRadius: '12px', fontWeight: '700' }}>
              ✓ {successMessage}
            </div>
          )}

          {activeTab === 'add' ? (
            <form onSubmit={handleFormSubmit}>
              {/* Section 01 */}
              <div className="form-section-title">01. GENERAL & BODY COMPOSITION</div>
              <div className="form-grid-3col">
                <div className="form-field-group">
                  <label>Measurement Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-field-group">
                  <label>Height (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="height"
                    placeholder="e.g. 175"
                    value={formData.height}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-field-group">
                  <label>Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="weight"
                    placeholder="e.g. 75.5"
                    value={formData.weight}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-field-group">
                  <label>BMI Category (Auto)</label>
                  <input
                    type="text"
                    name="bmi"
                    className="readonly-calc"
                    value={formData.bmi}
                    readOnly
                    placeholder="Auto-calculated"
                  />
                </div>

                <div className="form-field-group">
                  <label>Lean Body Mass / LBM (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="lbm"
                    placeholder="Auto or Manual"
                    value={formData.lbm}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-field-group">
                  <label>Body Fat %</label>
                  <input
                    type="number"
                    step="0.1"
                    name="fat"
                    placeholder="Auto or Manual"
                    value={formData.fat}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {/* Section 02 */}
              <div className="form-section-title">02. CIRCUMFERENCE MEASUREMENTS (CM)</div>
              <div className="form-grid-3col">
                <div className="form-field-group">
                  <label>Chest (Inspiration)</label>
                  <input type="number" step="0.1" name="chest_inspiration" placeholder="e.g. 98" value={formData.chest_inspiration} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Chest (Expiration)</label>
                  <input type="number" step="0.1" name="chest_expiration" placeholder="e.g. 94" value={formData.chest_expiration} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Abs / Abdominal</label>
                  <input type="number" step="0.1" name="abs" placeholder="e.g. 82" value={formData.abs} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Waist</label>
                  <input type="number" step="0.1" name="waist" placeholder="e.g. 80" value={formData.waist} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Hip</label>
                  <input type="number" step="0.1" name="hip" placeholder="e.g. 95" value={formData.hip} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Hip-Waist Ratio (WHR)</label>
                  <input type="text" name="hip_waist_ratio" className="readonly-calc" value={formData.hip_waist_ratio} readOnly placeholder="Auto-calculated" />
                </div>

                <div className="form-field-group">
                  <label>Thigh</label>
                  <input type="number" step="0.1" name="thigh" placeholder="e.g. 55" value={formData.thigh} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Calf</label>
                  <input type="number" step="0.1" name="calf" placeholder="e.g. 38" value={formData.calf} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Arm (Biceps)</label>
                  <input type="number" step="0.1" name="arm" placeholder="e.g. 35" value={formData.arm} onChange={handleInputChange} />
                </div>

                <div className="form-field-group">
                  <label>Forearm</label>
                  <input type="number" step="0.1" name="forearm" placeholder="e.g. 28" value={formData.forearm} onChange={handleInputChange} />
                </div>
              </div>

              <button type="submit" className="btn-save-measurement" disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Update Measurement' : 'Save Measurement Entry'}
              </button>

              {editingId && (
                <button
                  type="button"
                  style={{ marginLeft: '1rem', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-dim)', padding: '1rem 2rem', borderRadius: '100px', cursor: 'pointer', fontWeight: '700' }}
                  onClick={resetForm}
                >
                  Cancel Edit
                </button>
              )}
            </form>
          ) : (
            /* History & Trends Tab */
            <div>
              {loadingHistory ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading measurement history...</div>
              ) : measurements.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>No recorded measurements yet for this client.</div>
              ) : (
                <div>
                  {/* Trend Charts */}
                  <div className="trend-charts-grid">
                    <div className="chart-card-box">
                      <h4>Weight Progression (kg)</h4>
                      <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={11} />
                            <YAxis stroke="var(--text-dim)" fontSize={11} />
                            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid var(--glass-border)', borderRadius: '8px' }} />
                            <Line type="monotone" dataKey="weight" stroke="#ea580c" strokeWidth={3} dot={{ r: 4, fill: '#ea580c' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="chart-card-box">
                      <h4>Body Fat % Progression</h4>
                      <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={11} />
                            <YAxis stroke="var(--text-dim)" fontSize={11} />
                            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid var(--glass-border)', borderRadius: '8px' }} />
                            <Line type="monotone" dataKey="fat" stroke="#a78bfa" strokeWidth={3} dot={{ r: 4, fill: '#a78bfa' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* History Table */}
                  <div className="history-table-wrapper">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Weight</th>
                          <th>BMI</th>
                          <th>Fat %</th>
                          <th>Chest</th>
                          <th>Waist / Hip</th>
                          <th>Arm</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {measurements.map(item => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: '700' }}>{formatDate(item.date)}</td>
                            <td style={{ fontWeight: '800', color: 'var(--primary-neon)' }}>{item.weight ? `${item.weight} kg` : '—'}</td>
                            <td>{item.bmi || '—'}</td>
                            <td>{item.fat ? `${item.fat}%` : '—'}</td>
                            <td>{item.chest_inspiration ? `${item.chest_inspiration} cm` : '—'}</td>
                            <td>{item.waist && item.hip ? `${item.waist} / ${item.hip} cm` : '—'}</td>
                            <td>{item.arm ? `${item.arm} cm` : '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-bright)', padding: '0.35rem 0.7rem', borderRadius: '6px', fontSize: '0.78rem', marginRight: '0.5rem', cursor: 'pointer' }}
                                onClick={() => handleEditClick(item)}
                              >
                                Edit
                              </button>
                              <button
                                style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.35rem 0.7rem', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer' }}
                                onClick={() => handleDeleteClick(item.id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientMeasurementsPage;
