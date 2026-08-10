import React from 'react';
import { useNavigate } from 'react-router-dom';
import './PTExpiryModal.css';

const PTExpiryModal = ({ isOpen, onClose, expiredClients }) => {
  const navigate = useNavigate();

  if (!isOpen || !expiredClients || expiredClients.length === 0) return null;

  return (
    <div className="pt-modal-overlay">
      <div className="pt-modal-content animated-scale-in">
        <div className="pt-modal-header">
          <div className="alert-icon-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h2>Expired Plans Alert</h2>
          <p>The following clients' memberships have expired and require immediate attention.</p>
        </div>

        <div className="pt-modal-body">
          <div className="pt-list-header">
            <span>CLIENT INFO</span>
            <span>TYPE</span>
            <span>TRAINER</span>
            <span>EXPIRED ON</span>
            <span>ACTION</span>
          </div>
          <div className="pt-list-scroll">
            {expiredClients.map((item, idx) => (
              <div key={`${item.id}-${idx}`} className="pt-list-item">
                <div className="client-meta">
                  <span className="c-name">{item.name}</span>
                  <span className="c-id">{item.clientId}</span>
                </div>
                <div className="type-meta">
                  <span className={`type-tag ${item.type === 'PT' ? 'tag-pt' : 'tag-member'}`}>
                    {item.type === 'PT' ? 'PT Plan' : 'Membership'}
                  </span>
                </div>
                <div className="trainer-meta">
                  <span className="t-name">{item.trainerName || 'N/A'}</span>
                </div>
                <div className="expiry-meta">
                  <span className="e-date">{item.expiryDate}</span>
                </div>
                <button 
                  className="btn-renew-inline"
                  onClick={() => {
                    onClose();
                    navigate(`/edit-client/${item.id}`);
                  }}
                >
                  RENEW
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-modal-footer">
          <div className="modal-actions-row">
            <button className="btn-handle-it" onClick={onClose}>OK, I'll handle it</button>
            <button className="btn-go-manage" onClick={() => { onClose(); navigate('/manage-clients'); }}>
              Go to Manage Clients →
            </button>
          </div>
          <button className="btn-snooze" onClick={onClose}>Snooze for this session</button>
        </div>
      </div>
    </div>
  );
};

export default PTExpiryModal;
