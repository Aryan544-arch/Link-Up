import React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export default function AlertBanner({
  type = 'info',
  title,
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}) {
  const icons = {
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle2,
  };

  const IconComponent = icons[type] || Info;

  return (
    <div 
      className={`alert-banner alert-${type} ${className}`}
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
    >
      <div className="alert-icon-wrap" aria-hidden="true">
        <IconComponent size={18} />
      </div>

      <div className="alert-content">
        {title && <h4 className="alert-title">{title}</h4>}
        {message && <p className="alert-message">{message}</p>}
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-outline btn-sm alert-retry-btn"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
