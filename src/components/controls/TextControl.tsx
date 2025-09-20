import React from 'react';

interface TextControlProps {
  control: any;
  value: string;
  id: string;
  onChange: (value: string) => void;
  isReadOnly: boolean;
  isCustomTextPreset?: boolean;
}

export const TextControl: React.FC<TextControlProps> = ({
  control,
  value,
  id,
  onChange,
  isReadOnly,
  isCustomTextPreset,
}) => (
  <div className="control-group">
    <label htmlFor={id} className="control-label">
      {control.label}
      {isCustomTextPreset && control.name === 'text.content' && (
        <span className="custom-text-indicator">✨</span>
      )}
    </label>
    <div className="text-control-container">
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`control-text ${isCustomTextPreset ? 'custom-text-input' : ''}`}
        placeholder={control.placeholder || control.label}
        disabled={isReadOnly}
      />
      {isCustomTextPreset && control.name === 'text.content' && !isReadOnly && (
        <div className="text-control-hints">
          <small>Custom text for this instance</small>
        </div>
      )}
    </div>
  </div>
);

export default TextControl;
