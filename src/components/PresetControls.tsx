import React from 'react';
import { LoadedPreset } from '../core/PresetLoader';
import { getNestedValue } from '../utils/objectPath';
import {
  SliderControl,
  TextControl,
  ColorControl,
  CheckboxControl,
  SelectControl,
} from './controls';
import './PresetControls.css';

interface ControlRendererProps {
  control: any;
  value: any;
  id: string;
  onChange: (value: any) => void;
  isReadOnly: boolean;
  isCustomTextPreset?: boolean;
}

const CONTROL_RENDERERS: Record<string, React.FC<ControlRendererProps>> = {
  slider: SliderControl,
  text: TextControl,
  color: ColorControl,
  checkbox: CheckboxControl,
  select: SelectControl,
};


interface PresetControlsProps {
  preset: LoadedPreset;
  config: Record<string, any>;
  onChange?: (path: string, value: any) => void;
  isReadOnly?: boolean;
}

const PresetControls: React.FC<PresetControlsProps> = ({
  preset,
  config,
  onChange,
  isReadOnly = false
}) => {
  const handleControlChange = (controlName: string, value: any) => {
    if (isReadOnly || !onChange) return;
    onChange(controlName, value);
  };

  const getControlValue = (controlName: string, defaultValue: any): any => {
    if (config) {
      const value = getNestedValue(config, controlName);
      return value !== undefined ? value : defaultValue;
    }
    return defaultValue;
  };

  const isCustomTextPreset = preset.id.startsWith('custom-glitch-text');

  const renderControl = (control: any) => {
    const value = getControlValue(control.name, control.default);
    const controlId = `${preset.id}-${control.name}`;
    const Renderer = CONTROL_RENDERERS[control.type];
    if (!Renderer) return null;
    return (
      <Renderer
        key={control.name}
        control={control}
        value={value}
        id={controlId}
        onChange={(val) => handleControlChange(control.name, val)}
        isReadOnly={isReadOnly}
        isCustomTextPreset={isCustomTextPreset}
      />
    );
  };

  if (!preset.config.controls || preset.config.controls.length === 0) {
    return (
      <div className="preset-controls no-controls">
        <p>No controls available for this preset.</p>
      </div>
    );
  }

  return (
    <div className={`preset-controls ${isCustomTextPreset ? 'custom-text-controls' : ''} ${isReadOnly ? 'read-only' : ''}`}>
      {isCustomTextPreset && !isReadOnly && (
        <div className="custom-text-header">
          <div className="custom-text-badge">
            📝 Custom Text Instance
          </div>
          <div className="instance-info">
            <small>Instance: {preset.config.name}</small>
          </div>
        </div>
      )}

      <div className="controls-container">
        {preset.config.controls.map(renderControl)}
      </div>

      {preset.config.audioMapping && (
        <div className="audio-mapping">
          <h4>Audio Mapping</h4>
          <div className="audio-mapping-grid">
            {Object.entries(preset.config.audioMapping).map(([band, mapping]: [string, any]) => (
              <div key={band} className="audio-band">
                <div className="band-label">{band.toUpperCase()}</div>
                <div className="band-frequency">{mapping.frequency}</div>
                <div className="band-effect">{mapping.effect}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isReadOnly && (
        <div className="read-only-notice">
          <small>👁️ Preview - Values will apply when added to a layer</small>
        </div>
      )}
    </div>
  );
};

export default PresetControls;