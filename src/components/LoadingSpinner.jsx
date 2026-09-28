import React from 'react';
import './LoadingSpinner.css';

export const LoadingSpinner = ({ size = 'md', text = '', fullScreen = false, style = {} }) => {
  return (
    <div className={`olympia-spinner-container ${fullScreen ? 'full-screen' : ''}`} style={style}>
      <div className="olympia-spinner-wrapper">
        <div className={`olympia-spinner-ring ${size}`} />
        {size !== 'sm' && <div className="olympia-spinner-pulse" />}
      </div>
      {text && <span className="olympia-spinner-text">{text}</span>}
    </div>
  );
};

export default LoadingSpinner;
