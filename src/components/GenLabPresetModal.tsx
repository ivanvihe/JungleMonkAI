import React, { useState } from 'react';
import { LoadedPreset } from '../core/PresetLoader';
import PresetControls from './PresetControls';
import { setNestedValue } from '../utils/objectPath';
import './GenLabPresetModal.css';

interface GenLabPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  basePreset: LoadedPreset;
  initial?: { name: string; config: any };
  onSave: (preset: { name: string; config: any }) => void;
}

export const GenLabPresetModal: React.FC<GenLabPresetModalProps> = ({
  isOpen,
  onClose,
  basePreset,
  initial,
  onSave,
}) => {
  const [name, setName] = useState(initial?.name || '');
  const [config, setConfig] = useState<any>(() => {
    return initial?.config
      ? JSON.parse(JSON.stringify(initial.config))
      : JSON.parse(JSON.stringify(basePreset.config.defaultConfig || {}));
  });

  const handleControlChange = (path: string, value: any) => {
    setConfig((prev: any) => {
      const clone = JSON.parse(JSON.stringify(prev));
      setNestedValue(clone, path, value);
      return clone;
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), config });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="preset-gallery-overlay" onClick={onClose}>
      <div className="preset-gallery-modal small" onClick={e => e.stopPropagation()}>
        <div className="preset-gallery-header">
          <h2>{initial ? 'Edit Gen Lab Preset' : 'New Gen Lab Preset'}</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>
        <div className="genlab-modal-content">
          <input
            type="text"
            className="genlab-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Preset name"
          />
          <PresetControls preset={basePreset} config={config} onChange={handleControlChange} />
          <div className="genlab-modal-actions">
            <button onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};
