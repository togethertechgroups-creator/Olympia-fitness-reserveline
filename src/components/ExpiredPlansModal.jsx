import React from 'react';
import { formatShortId } from '../utils/formatShortId';
import './ExpiredPlansModal.css';

const ExpiredPlansModal = ({ isOpen, onClose, onGoToManage, expiredClients }) => {
  if (!isOpen) return null;

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
        <div className="item-right">
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
