import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function FormInput({
  id,
  name,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
  helperText,
  disabled = false,
  autoComplete,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor={id} className="form-label">
          {label} {required && <span className="required-star" aria-hidden="true">*</span>}
        </label>
      </div>

      <div className="input-wrapper">
        <input
          id={id}
          name={name || id}
          type={effectiveType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
          className={`input ${error ? 'input-error' : ''} ${isPassword ? 'input-with-action' : ''}`}
        />

        {isPassword && (
          <button
            type="button"
            className="input-action-btn"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={0}
          >
            {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="form-error-msg" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="form-helper-text">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
