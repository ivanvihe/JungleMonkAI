import React from 'react';

interface SelectControlProps {
  control: any;
  value: string;
  id: string;
  onChange: (value: string) => void;
  isReadOnly: boolean;
}

export const SelectControl: React.FC<SelectControlProps> = ({
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
    <select
      id={id}
      value={value || control.default}
      onChange={(e) => onChange(e.target.value)}
      className="control-select"
      disabled={isReadOnly}
    >
      {control.options?.map((option: string) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </div>
);

export default SelectControl;
