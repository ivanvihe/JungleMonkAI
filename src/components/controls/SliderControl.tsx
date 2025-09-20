import React from 'react';

interface SliderControlProps {
  control: any;
  value: number;
  id: string;
  onChange: (value: number) => void;
  isReadOnly: boolean;
  isCustomTextPreset?: boolean;
}

export const SliderControl: React.FC<SliderControlProps> = ({
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
    <div className="slider-container">
      <input
        id={id}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="control-slider"
        disabled={isReadOnly}
      />
      <input
        type="number"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider-number"
        disabled={isReadOnly}
      />
    </div>
  </div>
);

export default SliderControl;
