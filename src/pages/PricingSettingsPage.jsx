import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../api';
import './PricingSettingsPage.css';

const PricingSettingsPage = () => {
    const [settings, setSettings] = useState({});

    const [isSaving, setIsSaving] = useState(false);
    const [editingPlanKey, setEditingPlanKey] = useState(null);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [newPlanName, setNewPlanName] = useState('');
    const [newPlanDuration, setNewPlanDuration] = useState('30');
    const [isAddingPlan, setIsAddingPlan] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const data = await getSettings();
            setSettings(prev => ({ ...prev, ...data }));
        } catch (error) {
            console.error('Failed to fetch settings');
        }
    };


    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setIsSaving(true);
        setMessage({ text: '', type: '' });
        try {
            await updateSettings(settings);
            setMessage({ text: 'Tariff updated successfully!', type: 'success' });
            setEditingPlanKey(null);
            setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        } catch (error) {
            setMessage({ text: 'Failed to update tariff. Please try again.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setEditingPlanKey(null);
        setIsAddingPlan(false);
        setNewPlanName('');
        setNewPlanDuration('30');
        fetchSettings();
    };

    const handleDeletePlan = async (baseKey, e) => {
        if (e) {
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
        }
        if (window.confirm(`Are you sure you want to permanently delete the '${baseKey}' plan format and its tariff settings?`)) {
            const updatedSettings = { ...settings };
            delete updatedSettings[`${baseKey}_Strengthening`];
            delete updatedSettings[`${baseKey}_Cardio`];
            delete updatedSettings[`${baseKey}_duration`];
            delete updatedSettings[`${baseKey}_hidden`];
            delete updatedSettings[`${baseKey}`];
            
            setSettings(updatedSettings);
            if (editingPlanKey === baseKey) {
                setEditingPlanKey(null);
            }

            try {
                await updateSettings(updatedSettings);
                setMessage({ text: `'${baseKey}' plan deleted successfully!`, type: 'success' });
                setTimeout(() => setMessage({ text: '', type: '' }), 3000);
            } catch (error) {
                console.error('Delete plan error:', error);
                setMessage({ text: 'Failed to delete plan tariff. Please try again.', type: 'error' });
            }
        }
    };

    const handleToggleHide = async (baseKey, e) => {
        if (e) e.stopPropagation();
        const currentHidden = settings[`${baseKey}_hidden`] === 1 || settings[`${baseKey}_hidden`] === '1';
        const newHiddenVal = currentHidden ? 0 : 1;
        const updated = { ...settings, [`${baseKey}_hidden`]: newHiddenVal };
        setSettings(updated);
        try {
            await updateSettings(updated);
            setMessage({ text: `'${baseKey}' tariff is now ${newHiddenVal ? 'Hidden' : 'Visible'} in registration dropdowns.`, type: 'success' });
            setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        } catch (error) {
            console.error('Failed to toggle hide state:', error);
        }
    };

    const handleAddPlan = () => {
        const baseKey = newPlanName.trim();
        if (!baseKey) return;
        
        if (settings[`${baseKey}_Strengthening`] !== undefined) {
            alert('This plan already exists!');
            return;
        }
        
        const durDays = parseInt(newPlanDuration, 10) || 30;

        setSettings(prev => ({
            ...prev,
            [`${baseKey}_Strengthening`]: 0,
            [`${baseKey}_Cardio`]: 0,
            [`${baseKey}_duration`]: durDays,
            [`${baseKey}_hidden`]: 0
        }));
        setNewPlanName('');
        setNewPlanDuration('30');
        setIsAddingPlan(false);
    };

    const renderCardFeature = (label, dbKey, isEditingThisCard) => (
        <div className="pricing-feature-item">
            <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <div className="pricing-feature-content">
                <span>{label}</span>
                {isEditingThisCard ? (
                    <input 
                        className="pricing-card-input"
                        type="number" 
                        value={settings[dbKey] || ''} 
                        onChange={(e) => handleChange(dbKey, e.target.value)}
                    />
                ) : (
                    <span className="pricing-feature-value">₹{settings[dbKey] || 0}</span>
                )}
            </div>
        </div>
    );

    const gradientClasses = ['bg-gradient-pink', 'bg-gradient-orange', 'bg-gradient-teal'];

    const renderPlanSection = (title, baseKey, index) => {
        const bgClass = gradientClasses[index % 3];
        const isEditingThisCard = editingPlanKey === baseKey;
        const isHidden = settings[`${baseKey}_hidden`] === 1 || settings[`${baseKey}_hidden`] === '1';
        
        const defaultDuration = baseKey === 'Quarterly' ? 90 : (baseKey === 'Half-Yearly' ? 180 : (baseKey === 'Annual' ? 365 : 30));
        const currentDuration = settings[`${baseKey}_duration`] !== undefined ? settings[`${baseKey}_duration`] : defaultDuration;
        
        return (
            <div className={`pricing-card ${bgClass} ${isHidden ? 'card-hidden-state' : ''}`} key={baseKey}>
                <div className="pricing-card-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <h3>{title.replace(' Plan', '')}</h3>
                        {isHidden && (
                            <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#334155', color: '#f8fafc', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                                Hidden
                            </span>
                        )}
                    </div>

                    <div className="pricing-header-subrow">
                        <span className="pricing-read-more">GYM PRICING</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                                type="button"
                                className="pricing-header-delete-link"
                                onClick={(e) => handleToggleHide(baseKey, e)}
                                title={isHidden ? 'Unhide Tariff' : 'Hide Tariff'}
                                style={{ color: isHidden ? '#10b981' : '#f59e0b' }}
                            >
                                {isHidden ? '👁 Unhide' : '🙈 Hide'}
                            </button>

                            <button 
                                type="button" 
                                className="pricing-header-delete-link"
                                onClick={(e) => handleDeletePlan(baseKey, e)}
                                title={`Delete ${baseKey} Plan`}
                            >
                                🗑 Delete
                            </button>
                        </div>
                    </div>
                </div>

                <div className="pricing-features">
                    {renderCardFeature('Normal Price', `${baseKey}_Strengthening`, isEditingThisCard)}
                    
                    <div className="pricing-feature-item">
                        <svg className="pricing-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <div className="pricing-feature-content">
                            <span>Duration (Days)</span>
                            {isEditingThisCard ? (
                                <input 
                                    className="pricing-card-input"
                                    type="number" 
                                    value={settings[`${baseKey}_duration`] !== undefined ? settings[`${baseKey}_duration`] : currentDuration}
                                    onChange={(e) => handleChange(`${baseKey}_duration`, e.target.value)}
                                />
                            ) : (
                                <span className="pricing-feature-value">{currentDuration} Days</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pricing-price-box">
                    <div className="pricing-price-amount">₹{settings[`${baseKey}_Strengthening`] || 0}</div>
                    <div className="pricing-price-sub">TARIFF PRICE</div>
                </div>

                <div className="pricing-action-btn-container" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button 
                        type="button" 
                        className={`pricing-action-btn ${isEditingThisCard ? 'edit-mode' : ''}`}
                        style={{ flex: 1 }}
                        onClick={() => {
                            if (!isEditingThisCard) setEditingPlanKey(baseKey);
                            else handleSubmit(new Event('submit'));
                        }}
                    >
                        {isEditingThisCard ? 'SAVE PLAN' : 'EDIT PLAN'}
                    </button>

                    <button 
                        type="button" 
                        className="pricing-card-delete-btn"
                        title={`Delete ${baseKey} Plan`}
                        onClick={(e) => handleDeletePlan(baseKey, e)}
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
    };

    const dynamicPlanKeys = Object.keys(settings)
        .filter(k => k.endsWith('_Strengthening') && !k.startsWith('PT_') && !k.startsWith('Diet'))
        .map(k => k.replace('_Strengthening', ''));

    const standardOrder = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annual'];
    dynamicPlanKeys.sort((a, b) => {
        const idxA = standardOrder.indexOf(a);
        const idxB = standardOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    return (
        <div className="premium-dashboard">
            <main className="dashboard-main">
                <header className="main-header">
                    <div className="header-greeting">
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div>
                                <span style={{ color: '#1e1b4b' }}>Fee Tariff</span>{' '}
                                <span style={{ background: 'linear-gradient(to right, #ea580c, #db2777)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Management</span>
                            </div>
                            <img 
                                src="./document_19016375.gif" 
                                alt="Document" 
                                style={{ width: '58px', height: '58px', objectFit: 'contain', mixBlendMode: 'multiply' }} 
                            />
                        </h1>
                        <p style={{ color: '#64748b', marginTop: '0.75rem', textTransform: 'none', letterSpacing: 'normal', fontSize: '1rem', fontWeight: '500' }}>Update gym plan pricing, duration days, and hide/unhide tariffs.</p>
                    </div>
                </header>

                <form onSubmit={handleSubmit} className="settings-form">
                    <div className="pricing-cards-container">
                        {dynamicPlanKeys.map((planBase, index) => 
                            renderPlanSection(`${planBase} Plan`, planBase, index)
                        )}

                        <div className="pricing-card add-plan-card">
                            {!isAddingPlan ? (
                                <button type="button" onClick={() => setIsAddingPlan(true)} style={{ background: 'transparent', color: '#1e1b4b', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: '800', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                    <span style={{ width: '48px', height: '48px', background: '#1e1b4b', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>+</span> 
                                    ADD PLAN FORMAT
                                </button>
                            ) : (
                                <div style={{ padding: '2rem', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', margin: 'auto' }}>
                                    <input 
                                        type="text" 
                                        placeholder="Plan Name (e.g. Weekly)" 
                                        value={newPlanName} 
                                        onChange={(e) => setNewPlanName(e.target.value)}
                                        style={{ padding: '0.85rem 1.25rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', color: '#1e1b4b', outline: 'none', width: '100%', fontSize: '1rem', fontWeight: '800' }}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Plan Duration (Days)</label>
                                        <input 
                                            type="number" 
                                            placeholder="Duration in Days (e.g. 30)" 
                                            value={newPlanDuration} 
                                            onChange={(e) => setNewPlanDuration(e.target.value)}
                                            style={{ padding: '0.85rem 1.25rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', color: '#1e1b4b', outline: 'none', width: '100%', fontSize: '1rem', fontWeight: '800' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                        <button type="button" onClick={handleAddPlan} className="pricing-action-btn edit-mode" style={{ flex: 1, padding: '0.85rem', background: '#1e1b4b' }}>Create</button>
                                        <button type="button" onClick={() => setIsAddingPlan(false)} className="pricing-action-btn" style={{ flex: 1, padding: '0.85rem' }}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="settings-actions">
                        {message.text && (
                            <span className={`msg-${message.type}`} style={{marginRight: 'auto', fontWeight: '700', paddingLeft: '1rem'}}>{message.text}</span>
                        )}
                        <div style={{display: 'flex', gap: '1rem'}}>
                            {editingPlanKey !== null && (
                                <button type="button" className="btn-cancel" onClick={handleCancel} disabled={isSaving}>
                                    Discard Changes
                                </button>
                            )}
                            <button type="submit" className="save-settings-btn" disabled={isSaving || editingPlanKey === null} style={{ display: editingPlanKey !== null ? 'block' : 'none' }}>
                                {isSaving ? 'Saving...' : 'Update Global Fees'}
                            </button>
                        </div>
                    </div>
                </form>


            </main>
        </div>
    );
};

export default PricingSettingsPage;
