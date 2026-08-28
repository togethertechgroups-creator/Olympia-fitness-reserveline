import React, { useState } from 'react';
import { formatShortId } from '../utils/formatShortId';
import { sendWhatsAppText } from '../api';
import './ExpiredPlansModal.css';

const ExpiredPlansModal = ({ isOpen, onClose, onGoToManage, expiredClients }) => {
  const [toast, setToast] = useState(null);

  if (!isOpen) return null;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => prev?.message === message ? null : prev);
    }, 4500);
  };

  const handleSendWa = async (client, e) => {
    e.stopPropagation();
    const rawPhone = String(client.phone || '').replace(/\D/g, '');
    if (!rawPhone) {
      showToast(`No phone number for ${client.name}`, 'error');
      return;
    }
    const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const isExpiring = client.isExpiringSoon || (client.daysLeft !== undefined && !client.isExpired);
    let text = `Hello ${client.name},\n\n`;
    if (isExpiring) {
      text += `Your gym membership plan (${client.plan || 'Plan'}) is expiring in ${client.daysLeft} days. Please renew to keep training uninterrupted!\n`;
    } else {
      text += `Your gym membership plan (${client.plan || 'Plan'}) has expired. Please renew your membership to continue your workouts.\n`;
    }
    text += `\nThank you, Olympia Fitness! 💪🏋️‍♂️`;

    showToast(`Sending reminder to ${client.name}...`, 'info');
    try {
      await sendWhatsAppText(phone, text, client.name, client.id || client.clientId, isExpiring ? 'expiring_soon' : 'expired');
      showToast(`✅ WhatsApp reminder sent to ${client.name} (${phone})!`, 'success');
    } catch (err) {
      console.warn('Direct WhatsApp API notice, attempting web fallback:', err);
      window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`, '_blank');
      showToast(`✅ WhatsApp message opened for ${client.name} (${phone})!`, 'success');
    }
  };

  const renderClientItem = (client, key) => {
    const isExpiring = client.isExpiringSoon || (client.daysLeft !== undefined && !client.isExpired);
    return (
      <div key={key} className="premium-modal-item">
        <div className="item-left">
          <div className="client-avatar-mini-glow">
            {client.profileImage ? (
              <img src={client.profileImage} alt={client.name} />
            ) : (
              <span>{client.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="item-info">
            <span className="item-name">{client.name}</span>
            <span className="item-id">ID: {formatShortId(client.clientId || client.id)}</span>
          </div>
        </div>
        <div className="item-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn-wa-reminder-sm"
            onClick={(e) => handleSendWa(client, e)}
            title={`Send WhatsApp Reminder to ${client.name}`}
            style={{
              background: '#25d366',
              color: '#ffffff',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37, 211, 102, 0.4)',
              flexShrink: 0
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.012 2c-5.506 0-9.989 4.478-9.989 9.984 0 1.758.459 3.474 1.33 4.982l-1.413 5.163 5.285-1.385c1.455.793 3.096 1.224 4.787 1.224 5.507 0 9.989-4.478 9.989-9.984s-4.482-9.984-9.989-9.984zm5.79 14.161c-.242.684-1.206 1.256-1.97 1.423-.526.113-1.21.204-3.518-.752-2.956-1.226-4.856-4.238-5.004-4.436-.146-.198-1.206-1.606-1.206-3.063 0-1.457.764-2.176 1.036-2.47.272-.294.594-.368.792-.368.198 0 .396.002.569.01.184.009.431-.07.674.513.242.583.83 2.023.903 2.171.073.149.122.322.024.516-.098.194-.147.316-.292.488-.146.172-.307.385-.438.516-.146.146-.298.305-.128.596.17.291.756 1.246 1.621 2.017 1.114.992 2.054 1.3 2.346 1.446.292.146.463.122.634-.073.171-.194.731-.852.927-1.144.195-.292.392-.243.659-.146.267.098 1.683.793 1.975.939.292.146.486.219.559.342.073.123.073.712-.169 1.396z"/>
            </svg>
          </button>
          {isExpiring ? (
            <span className="expiring-tag">
              {client.daysLeft === 0 ? '⚠️ EXPIRES TODAY' : `⏳ ${client.daysLeft} DAYS LEFT`}
            </span>
          ) : (
            <span className="expired-tag">
              {client.daysAgo === 0 ? 'EXPIRED TODAY' : `${client.daysAgo} DAYS AGO`}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay reveal">
      <div className="modal-backdrop" onClick={onClose}></div>
      
      <div className="modal-card premium-glass">
        {toast && (
          <div style={{
            background: toast.type === 'error' ? 'linear-gradient(135deg, #dc2626, #ef4444)' : (toast.type === 'info' ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'linear-gradient(135deg, #059669, #10b981)'),
            color: '#ffffff',
            padding: '0.75rem 1.25rem',
            borderRadius: '10px',
            fontWeight: '700',
            fontSize: '0.9rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>✕</button>
          </div>
        )}
        <button className="btn-modal-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>

        <div className="modal-header-section">
          <div className="warning-badge-glow">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
          <h2 className="premium-title">Expiry <span>Alert</span></h2>
          <p className="premium-subtitle">7 DAYS REMAINING & EXPIRED MEMBERSHIPS</p>
        </div>
        
        <div 
          className={`modal-scroll-list ${expiredClients.length > 2 ? 'marquee-active' : ''}`}
          style={{ '--item-count': expiredClients.length }}
        >
          {expiredClients.length === 0 ? (
            <div className="empty-alert-state">
              <span className="celebrate-icon">✨</span>
              <p>NO EXPIRED OR EXPIRING MEMBERSHIPS DETECTED</p>
            </div>
          ) : (
            <div className="marquee-inner">
              {/* Original List */}
              {expiredClients.map((client) => renderClientItem(client, client.id))}

              {/* Duplicated List for seamless loop (only if many) */}
              {expiredClients.length > 2 && expiredClients.map((client) => renderClientItem(client, `dup-${client.id}`))}
            </div>
          )}
        </div>
        
        <div className="modal-actions-grid">
          <button onClick={onGoToManage} className="btn-modal-primary">
            GO TO MANAGE CLIENTS
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          
          <div className="modal-secondary-actions">
            <button onClick={onClose} className="btn-modal-text">OK, I'll HANDLE IT</button>
            <span className="divider"></span>
            <button onClick={onClose} className="btn-modal-text snooze">SNOOZE SESSION</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpiredPlansModal;
