import React from 'react';

interface CheckboxControlProps {
  control: any;
  value: boolean;
  id: string;
  onChange: (value: boolean) => void;
  isReadOnly: boolean;
}

export const CheckboxControl: React.FC<CheckboxControlProps> = ({
  control,
  value,
  id,
  onChange,
  isReadOnly,
}) => (
  <div className="control-group">
    <label htmlFor={id} className="control-checkbox-label">
      <input
        id={id}
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="control-checkbox"
        disabled={isReadOnly}
      />
      <span className="checkbox-custom"></span>
      {control.label}
    </label>
  </div>
);

export default CheckboxControl;
