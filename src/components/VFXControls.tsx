import React from 'react';
import { LoadedPreset } from '../core/PresetLoader';

interface VFXControlsProps {
  preset: LoadedPreset;
  assignedLayers: string[];
  activeEffects: Record<string, string[]>;
  onToggle: (
    layerId: string,
    presetId: string,
    effect: string,
    enabled: boolean
  ) => void;
}

const VFXControls: React.FC<VFXControlsProps> = ({
  preset,
  assignedLayers,
  activeEffects,
  onToggle
}) => {
  const effects = preset.config.vfx?.effects || [];

  return (
    <div className="vfx-controls">
      <div className="controls-header">
        <h3>{preset.config.name} VFX</h3>
      </div>
      {effects.length === 0 && <p>No effects available</p>}
      {effects.map((effect: any) => (
        <div key={effect.name} className="vfx-effect-group">
          <h4>{effect.label}</h4>
          {assignedLayers.length === 0 && <p>No layers assigned</p>}
          {assignedLayers.map(layer => (
            <label key={layer} className="layer-toggle">
              <input
                type="checkbox"
                checked={activeEffects[layer]?.includes(effect.name) || false}
                onChange={e =>
                  onToggle(layer, preset.id, effect.name, e.target.checked)
                }
              />
              {layer}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
};

export default VFXControls;
