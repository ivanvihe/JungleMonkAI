import React, { useEffect, useState } from 'react';
import { LAUNCHPAD_PRESETS } from '../utils/launchpad';
import './TopBar.css';

interface TopBarProps {
  midiActive: boolean;
  midiDeviceName: string | null;
  midiDeviceCount: number;
  bpm: number | null;
  beatActive: boolean;
  audioDeviceName: string | null;
  audioDeviceCount: number;
  audioGain: number;
  onAudioGainChange: (value: number) => void;
  audioLevel: number;
  onFullScreen: () => void;
  onToggleUi: () => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onOpenResources: () => void;
  launchpadAvailable: boolean;
  launchpadOutput: any | null;
  launchpadRunning: boolean;
  launchpadPreset: string;
  onToggleLaunchpad?: () => void;
  launchpadText?: string;
  onLaunchpadTextChange?: (text: string) => void;
  onLaunchpadPresetChange?: (preset: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  midiActive,
  midiDeviceName,
  midiDeviceCount,
  bpm,
  beatActive,
  audioDeviceName,
  audioDeviceCount,
  audioGain,
  onAudioGainChange,
  audioLevel,
  onFullScreen,
  onToggleUi,
  onClearAll,
  onOpenSettings,
  onOpenResources,
  launchpadAvailable,
  launchpadOutput,
  launchpadRunning,
  launchpadPreset,
  onToggleLaunchpad,
  onLaunchpadPresetChange,
  launchpadText,
  onLaunchpadTextChange
}) => {
  const [activeLed, setActiveLed] = useState(0);

  useEffect(() => {
    if (beatActive) {
      setActiveLed(prev => (prev === 0 ? 1 : 0));
    }
  }, [beatActive]);

  return (
    <div className="top-bar">
      <div className="midi-section">
        <div className={`midi-led ${midiActive ? 'active' : ''}`}></div>
        <span className="midi-device">
          {midiDeviceName || `${midiDeviceCount} MIDI devices`}
        </span>
      </div>

      <div className="separator" />

      <div className="bpm-section">
        <span>BPM: {bpm ? bpm.toFixed(1) : '--'}</span>
        <div className="metronome">
          <div className={`metronome-led ${activeLed === 0 ? 'active' : ''}`}></div>
          <div className={`metronome-led ${activeLed === 1 ? 'active' : ''}`}></div>
        </div>
      </div>

      <div className="separator" />

      <div className="audio-section">
        <span className="audio-device">
          {audioDeviceName || `${audioDeviceCount} audio devices`}
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={audioGain}
          onChange={(e) => onAudioGainChange(parseFloat(e.target.value))}
          className="audio-gain-slider"
        />
        <div className="vu-meter">
          <div
            className="vu-fill"
            style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
          />
        </div>
      </div>

        {/* Flexible spacer to center the actions section */}
        <div className="top-bar-spacer"></div>

        {/* Center section - Actions and resources */}
        <div className="actions-section">
          <button
            onClick={onOpenResources}
            className="action-button"
            title="Abrir galería completa"
            aria-label="Open resource library"
          >🗂️</button>
          <button
            onClick={onClearAll}
            className="action-button"
            title="Clear all"
            aria-label="Clear all"
          >🗑️</button>
          <button
            onClick={onToggleUi}
            className="action-button"
            title="Hide controls (F10)"
            aria-label="Hide controls"
          >🙈</button>
          <button
            onClick={onFullScreen}
            className="action-button"
            title="Full screen"
            aria-label="Full screen"
          >⛶</button>
          <button
            onClick={onOpenSettings}
            className="action-button"
            title="Settings"
            aria-label="Settings"
          >⚙️</button>
        </div>

        {/* Flexible spacer to push Launchpad controls to the right */}
        <div className="top-bar-spacer"></div>

        {/* Right section - Launchpad controls */}
        {launchpadAvailable && (
          <>
            <div className="separator" />
            <div className="launchpad-controls">
              <select
                value={launchpadPreset}
                onChange={(e) => onLaunchpadPresetChange?.(e.target.value)}
                className="launchpad-preset-select"
              >
                {LAUNCHPAD_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {launchpadPreset === 'custom-text' && (
                <input
                  type="text"
                  value={launchpadText || ''}
                  onChange={(e) => onLaunchpadTextChange?.(e.target.value)}
                />
              )}
              <button
                onClick={() => {
                  console.log('🖱️ LaunchPad button clicked manually by user');
                  onToggleLaunchpad?.();
                }}
                className={`launchpad-button ${launchpadRunning ? 'running' : ''}`}
                type="button"
                disabled={!launchpadOutput}
                title={
                  launchpadOutput
                    ? `Toggle LaunchPad (${launchpadOutput.name})`
                    : 'No LaunchPad device available'
                }
              >
                {launchpadRunning ? '⏹️ Stop LaunchPad' : '▶️ Go LaunchPad'}
              </button>
            </div>
          </>
        )}
        </div>
  );
};
