import React from 'react';

interface VisualSettingsProps {
  hideUiHotkey: string;
  onHideUiHotkeyChange: (value: string) => void;
  fullscreenHotkey: string;
  onFullscreenHotkeyChange: (value: string) => void;
  exitFullscreenHotkey: string;
  onExitFullscreenHotkeyChange: (value: string) => void;
  fullscreenByDefault: boolean;
  onFullscreenByDefaultChange: (value: boolean) => void;
  canvasBrightness: number;
  onCanvasBrightnessChange: (value: number) => void;
  canvasVibrance: number;
  onCanvasVibranceChange: (value: number) => void;
  canvasBackground: string;
  onCanvasBackgroundChange: (value: string) => void;
  glitchTextPads: number;
  onGlitchPadChange: (value: number) => void;
}

export const VisualSettings: React.FC<VisualSettingsProps> = ({
  hideUiHotkey,
  onHideUiHotkeyChange,
  fullscreenHotkey,
  onFullscreenHotkeyChange,
  exitFullscreenHotkey,
  onExitFullscreenHotkeyChange,
  fullscreenByDefault,
  onFullscreenByDefaultChange,
  canvasBrightness,
  onCanvasBrightnessChange,
  canvasVibrance,
  onCanvasVibranceChange,
  canvasBackground,
  onCanvasBackgroundChange,
  glitchTextPads,
  onGlitchPadChange,
}) => {
  return (
    <div className="settings-section">
      <h3>🎨 Visual Settings</h3>
      <div className="setting-group">
        <label className="setting-label">
          <span>Hide UI Hotkey</span>
          <input
            type="text"
            value={hideUiHotkey}
            onKeyDown={(e) => {
              e.preventDefault();
              onHideUiHotkeyChange(e.key);
            }}
            className="setting-number"
            readOnly
          />
        </label>
        <small className="setting-hint">Press a key (default F10)</small>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Fullscreen Hotkey</span>
          <input
            type="text"
            value={fullscreenHotkey}
            onKeyDown={(e) => {
              e.preventDefault();
              onFullscreenHotkeyChange(e.key);
            }}
            className="setting-number"
            readOnly
          />
        </label>
        <small className="setting-hint">Press a key (default F9)</small>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Exit Fullscreen Hotkey</span>
          <input
            type="text"
            value={exitFullscreenHotkey}
            onKeyDown={(e) => {
              e.preventDefault();
              onExitFullscreenHotkeyChange(e.key);
            }}
            className="setting-number"
            readOnly
          />
        </label>
        <small className="setting-hint">Press a key (default F11)</small>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <input
            type="checkbox"
            checked={fullscreenByDefault}
            onChange={(e) => onFullscreenByDefaultChange(e.target.checked)}
          />
          <span>Open windows in fullscreen by default</span>
        </label>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Brightness: {canvasBrightness.toFixed(2)}</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={canvasBrightness}
            onChange={(e) => onCanvasBrightnessChange(parseFloat(e.target.value))}
            className="setting-slider"
          />
        </label>
        <small className="setting-hint">Adjust overall canvas brightness</small>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Vibrance: {canvasVibrance.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={canvasVibrance}
            onChange={(e) => onCanvasVibranceChange(parseFloat(e.target.value))}
            className="setting-slider"
          />
        </label>
        <small className="setting-hint">Accentuates brightness values</small>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Canvas background color</span>
          <input
            type="color"
            value={canvasBackground}
            onChange={(e) => onCanvasBackgroundChange(e.target.value)}
            className="setting-color"
          />
        </label>
        <small className="setting-hint">Choose a canvas background color</small>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Glitch Text Pads: {glitchTextPads}</span>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={glitchTextPads}
            onChange={(e) => onGlitchPadChange(parseInt(e.target.value))}
            className="setting-slider"
          />
        </label>
        <small className="setting-hint">Number of text pads available in glitch presets</small>
      </div>

      <div className="setting-group">
        <h4>Layer Settings</h4>
        <div className="layers-info">
          <div className="layer-info">
            <span className="layer-badge layer-c">C</span>
            <span>Background Layer - renders first</span>
          </div>
          <div className="layer-info">
            <span className="layer-badge layer-b">B</span>
            <span>Middle Layer - blends with transparency</span>
          </div>
          <div className="layer-info">
            <span className="layer-badge layer-a">A</span>
            <span>Front Layer - renders on top</span>
          </div>
        </div>
        <small className="setting-hint">
          All layers are blended with automatic transparency. Presets keep transparent backgrounds to allow correct compositing.
        </small>
      </div>

      <div className="setting-group">
        <h4>Visual Quality</h4>
        <div className="quality-presets">
          <button
            className="quality-button"
            onClick={() => {
              onCanvasBrightnessChange(1);
              onCanvasVibranceChange(1);
            }}
          >
            🏃 Performance
          </button>
          <button
            className="quality-button"
            onClick={() => {
              onCanvasBrightnessChange(1);
              onCanvasVibranceChange(1);
            }}
          >
            ⚖️ Balanced
          </button>
          <button
            className="quality-button"
            onClick={() => {
              onCanvasBrightnessChange(1.5);
              onCanvasVibranceChange(1.5);
            }}
          >
            💎 Quality
          </button>
        </div>
      </div>
    </div>
  );
};

