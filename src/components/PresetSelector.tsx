import React from 'react';
import { LoadedPreset } from '../core/PresetLoader';
import './PresetSelector.css';

interface PresetSelectorProps {
  presets: LoadedPreset[];
  currentPreset: string;
  onPresetSelect: (presetId: string) => void;
  disabled?: boolean;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  presets,
  currentPreset,
  onPresetSelect,
  disabled = false
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value) {
      onPresetSelect(value);
    }
  };

  return (
    <div className="preset-selector-container">
      <label htmlFor="preset-select">Select Preset:</label>
      <select
        id="preset-select"
        value={currentPreset}
        onChange={handleChange}
        disabled={disabled}
        className="preset-select"
      >
        <option value="">-- Select a preset --</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.config.name} - {preset.config.description}
          </option>
        ))}
      </select>
      
      {presets.length === 0 && !disabled && (
        <p className="no-presets-message">
          No presets found. Make sure you have presets in the visuals/presets folder
        </p>
      )}
    </div>
  );
};