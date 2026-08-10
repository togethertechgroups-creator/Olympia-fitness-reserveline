import React from 'react';
import './StatCard.css';

const StatCard = ({ icon, label, value, badge, badgeType }) => {
  const isUp = badgeType === 'up';
  
  return (
    <div className="stat-card">
      <div className="stat-header">
        <div className="stat-icon-box">
          {icon.component ? icon.component : <span>{icon.emoji}</span>}
        </div>
        
        {badge && (
          <div className={`stat-badge ${isUp ? 'badge-up' : 'badge-down'}`}>
            {isUp ? '↑ ' : '↓ '} {badge}
          </div>
        )}
      </div>
      
      <div className="stat-content">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
      
      <div className="stat-decor"></div>
    </div>
  );
};


export default StatCard;
