import React from 'react';

interface ColorControlProps {
  control: any;
  value: string;
  id: string;
  onChange: (value: string) => void;
  isReadOnly: boolean;
}

export const ColorControl: React.FC<ColorControlProps> = ({
  control,
  value,
  id,
  onChange,
  isReadOnly,
}) => (
  <div className="control-group">
    <label htmlFor={id} className="control-label">
      {control.label}
    </label>
    <div className="color-control-container">
      <input
        id={id}
        type="color"
        value={value || control.default}
        onChange={(e) => onChange(e.target.value)}
        className="control-color"
        disabled={isReadOnly}
      />
      <input
        type="text"
        value={value || control.default}
        onChange={(e) => onChange(e.target.value)}
        className="control-color-text"
        placeholder="#ffffff"
        disabled={isReadOnly}
      />
    </div>
  </div>
);

export default ColorControl;
