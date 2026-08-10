import React, { useState, useEffect } from 'react';
import { getPtPackages, addPtPackage, updatePtPackage, togglePtPackageActive, deletePtPackage } from '../api';
import './PricingSettingsPage.css';
import './PTPackageManagementPage.css';

const PTPackageManagementPage = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPkg, setCurrentPkg] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    total_classes: '',
    duration_days: 30,
    category: 'Adult',
    eligible_grades: ['A_PRO_PT', 'A', 'B'],
    active: true
  });

  const gradientClasses = ['bg-gradient-pink', 'bg-gradient-orange', 'bg-gradient-teal'];

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      const data = await getPtPackages();
      setPackages(data);
    } catch (error) {
      console.error('Failed to fetch PT packages', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (pkg = null) => {
    if (pkg) {
      setCurrentPkg(pkg);
      setFormData({
        name: pkg.name,
        price: pkg.price,
        total_classes: pkg.total_classes,
        duration_days: pkg.duration_days || 30,
        category: pkg.category,
        eligible_grades: pkg.eligible_grades || [],
        active: pkg.active
      });
    } else {
      setCurrentPkg(null);
      setFormData({
        name: '',
        price: '',
        total_classes: '',
        duration_days: 30,
        category: 'Adult',
        eligible_grades: ['A_PRO_PT', 'A', 'B'],
        active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentPkg(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGradeToggle = (grade) => {
    setFormData(prev => {
      const exists = prev.eligible_grades.includes(grade);
      const updated = exists
        ? prev.eligible_grades.filter(g => g !== grade)
        : [...prev.eligible_grades, grade];
      return { ...prev, eligible_grades: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.eligible_grades.length === 0) {
      alert('Select at least one eligible trainer grade.');
      return;
    }
    try {
      if (currentPkg) {
        await updatePtPackage(currentPkg.id, formData);
      } else {
        await addPtPackage(formData);
      }
      fetchPackages();
      handleCloseModal();
    } catch (error) {
      alert(error.message || 'Failed to save PT Package');
    }
  };

  const handleToggleActive = async (id, currentActive) => {
    try {
      await togglePtPackageActive(id, !currentActive);
      setPackages(packages.map(p => p.id === id ? { ...p, active: !currentActive } : p));
    } catch (error) {
      alert('Failed to update package status');
    }
  };

  const handleDeletePackage = async (id, name, e) => {
    if (e) e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete the '${name}' PT package?`)) {
      try {
        await deletePtPackage(id);
        setPackages(prev => prev.filter(p => p.id !== id));
      } catch (err) {
        alert(err.message || 'Failed to delete PT Package');
      }
    }
  };

  return (
    <div className="pt-pkg-container">
      <header className="pt-pkg-header">
        <div className="title-group">
          <h1><span>PT PACKAGE</span> CATALOG</h1>
          <p>Superadmin Portal • Manage official Personal Training packages and grade eligibility.</p>
        </div>
        <button className="btn-add-pkg" onClick={() => handleOpenModal()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Add New Package
        </button>
      </header>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontSize: '1rem', fontWeight: '600' }}>
          Loading PT catalog packages...
        </div>
      ) : (
        <div className="pricing-cards-container">
          {packages.map((pkg, index) => {
            const bgClass = gradientClasses[index % 3];
            const isHidden = !pkg.active;

            return (
              <div className={`pricing-card ${bgClass} ${isHidden ? 'card-hidden-state' : ''}`} key={pkg.id}>
                <div className="pricing-card-header">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <h3 style={{ fontSize: '1.35rem', lineHeight: '1.2' }}>
                      {pkg.name}
                      {pkg.is_custom ? (
                        <span style={{ fontSize: '0.65rem', fontWeight: '800', background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', verticalAlign: 'middle' }}>
                          CUSTOM
                        </span>
                      ) : null}
                    </h3>
                    {isHidden && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#334155', color: '#f8fafc', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                        Disabled
                      </span>
                    )}
                  </div>

                  <div className="pricing-header-subrow">
                    <span className="pricing-read-more">PT PRICING</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="pricing-header-delete-link"
                        onClick={() => handleToggleActive(pkg.id, pkg.active)}
                        title={pkg.active ? 'Hide Tariff' : 'Unhide Tariff'}
                        style={{ color: pkg.active ? '#f59e0b' : '#10b981' }}
                      >
                        {pkg.active ? '🙈 Hide' : '👁 Unhide'}
                      </button>

                      <button
                        type="button"
                        className="pricing-header-delete-link"
                        onClick={(e) => handleDeletePackage(pkg.id, pkg.name, e)}
                        title={`Delete ${pkg.name}`}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pricing-features">
                  <div className="pricing-feature-item">
                    <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    <div className="pricing-feature-content">
                      <span>Category</span>
                      <span style={{ fontWeight: '800', color: '#1e1b4b' }}>{pkg.category}</span>
                    </div>
                  </div>

                  <div className="pricing-feature-item">
                    <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <div className="pricing-feature-content">
                      <span>Duration (Days)</span>
                      <span className="pricing-feature-value">{pkg.duration_days || 30} Days</span>
                    </div>
                  </div>

                  <div className="pricing-feature-item">
                    <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <div className="pricing-feature-content">
                      <span>Total Sessions</span>
                      <span className="pricing-feature-value">{pkg.total_classes} Classes</span>
                    </div>
                  </div>

                  <div className="pricing-feature-item">
                    <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <div className="pricing-feature-content">
                      <span>Eligible Grades</span>
                      <div className="grades-list" style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {(pkg.eligible_grades || []).map(g => (
                          <span key={g} style={{ fontSize: '0.72rem', fontWeight: '800', background: '#ffffff', color: '#1e1b4b', padding: '2px 8px', borderRadius: '100px', border: '1px solid #cbd5e1' }}>
                            {g === 'A_PRO_PT' ? 'A Pro' : `Grade ${g}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pricing-price-box">
                  <div className="pricing-price-amount">₹{(pkg.price || 0).toLocaleString('en-IN')}</div>
                  <div className="pricing-price-sub">TARIFF PRICE</div>
                </div>

                <div className="pricing-action-btn-container" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="pricing-action-btn"
                    style={{ flex: 1 }}
                    onClick={() => handleOpenModal(pkg)}
                  >
                    EDIT PLAN
                  </button>

                  <button
                    type="button"
                    className="pricing-card-delete-btn"
                    title={`Delete ${pkg.name}`}
                    onClick={(e) => handleDeletePackage(pkg.id, pkg.name, e)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}

          <div className="pricing-card add-plan-card">
            <button
              type="button"
              onClick={() => handleOpenModal()}
              style={{
                background: 'transparent', color: '#1e1b4b', border: 'none', cursor: 'pointer',
                fontSize: '1rem', fontWeight: '800', width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem'
              }}
            >
              <span style={{ width: '48px', height: '48px', background: '#1e1b4b', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>+</span>
              ADD PT PACKAGE
            </button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="trainer-modal-overlay">
          <div className="trainer-modal-content animated-scale-in">
            <div className="trainer-modal-header">
              <h2>{currentPkg ? 'Edit PT Package' : 'Add New PT Package'}</h2>
              <button className="btn-close" onClick={handleCloseModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="trainer-form">
              <div className="trainer-form-group">
                <label>Package Name *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} required placeholder="e.g. Standard PT — S1" />
              </div>

              <div className="form-row">
                <div className="trainer-form-group">
                  <label>Price (₹) *</label>
                  <input type="number" name="price" value={formData.price} onChange={handleInputChange} required min="0" placeholder="e.g. 6000" />
                </div>
                <div className="trainer-form-group">
                  <label>Total Classes *</label>
                  <input type="number" name="total_classes" value={formData.total_classes} onChange={handleInputChange} required min="1" placeholder="e.g. 16" />
                </div>
              </div>

              <div className="form-row">
                <div className="trainer-form-group">
                  <label>Duration (Days) *</label>
                  <input type="number" name="duration_days" value={formData.duration_days} onChange={handleInputChange} required min="1" placeholder="30 (or 100 for Challenge)" />
                </div>

                <div className="trainer-form-group">
                  <label>Category *</label>
                  <select name="category" value={formData.category} onChange={handleInputChange}>
                    <option value="Adult">Adult</option>
                    <option value="Kid">Kid</option>
                    <option value="Challenge">Challenge</option>
                  </select>
                </div>
              </div>

              <div className="trainer-form-group">
                <label>Status</label>
                <select name="active" value={formData.active ? '1' : '0'} onChange={e => setFormData({ ...formData, active: e.target.value === '1' })}>
                  <option value="1">Active</option>
                  <option value="0">Disabled</option>
                </select>
              </div>

              <div className="trainer-form-group">
                <label>Eligible Trainer Grades *</label>
                <div className="grade-checkbox-group">
                  {['A_PRO_PT', 'A', 'B'].map(g => (
                    <label key={g} className="grade-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.eligible_grades.includes(g)}
                        onChange={() => handleGradeToggle(g)}
                      />
                      <span>{g === 'A_PRO_PT' ? 'A Pro PT' : `Grade ${g}`}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="trainer-modal-footer">
                <button type="button" className="trainer-btn-cancel" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="trainer-btn-save">
                  {currentPkg ? 'Update Package' : 'Save Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PTPackageManagementPage;
