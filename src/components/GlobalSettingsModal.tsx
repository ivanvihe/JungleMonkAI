import React, { useState } from 'react';
import './GlobalSettingsModal.css';

import { AudioSettings } from './settings/AudioSettings';
import { MidiSettings } from './settings/MidiSettings';
import { LaunchpadSettings } from './settings/LaunchpadSettings';
import { VideoSettings } from './settings/VideoSettings';
import { FullscreenSettings } from './settings/FullscreenSettings';
import { VisualSettings } from './settings/VisualSettings';
import { SystemSettings } from './settings/SystemSettings';
import { VideoProviderSettings as VideoProviderSettingsSection } from './settings/VideoProviderSettings';
import { VideoProviderId } from '../utils/videoProviders';

interface DeviceOption {
  id: string;
  label: string;
}

interface MonitorInfo {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

interface MidiClockSettings {
  resolution: number;
  delay: number;
  quantization: number;
  jumpMode: boolean;
  stability: number;
  type: 'midi' | 'internal' | 'off';
}

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioDevices: DeviceOption[];
  midiDevices: DeviceOption[];
  launchpadDevices: DeviceOption[];
  selectedAudioId: string | null;
  selectedMidiId: string | null;
  selectedLaunchpadId: string | null;
  onSelectAudio: (id: string) => void;
  onSelectMidi: (id: string) => void;
  onSelectLaunchpad: (id: string | null) => void;
  audioGain: number;
  onAudioGainChange: (value: number) => void;
  midiClockSettings: MidiClockSettings;
  onUpdateClockSettings: (updates: Partial<MidiClockSettings>) => void;
  internalBpm: number;
  onSetInternalBpm: (bpm: number) => void;
  clockStable: boolean;
  currentMeasure: number;
  currentBeat: number;
  layerChannels: Record<string, number>;
  onLayerChannelChange: (layerId: string, channel: number) => void;
  effectMidiNotes: Record<string, number>;
  onEffectMidiNoteChange: (effect: string, note: number) => void;
  launchpadChannel: number;
  onLaunchpadChannelChange: (value: number) => void;
  launchpadNote: number;
  onLaunchpadNoteChange: (value: number) => void;
  launchpadSmoothness: number;
  onLaunchpadSmoothnessChange: (value: number) => void;
  monitors: MonitorInfo[];
  monitorRoles: Record<string, 'main' | 'secondary' | 'none'>;
  onMonitorRoleChange: (id: string, role: 'main' | 'secondary' | 'none') => void;
  startMonitor: string | null;
  onStartMonitorChange: (id: string | null) => void;
  glitchTextPads: number;
  onGlitchPadChange: (value: number) => void;
  hideUiHotkey: string;
  onHideUiHotkeyChange: (value: string) => void;
  fullscreenHotkey: string;
  onFullscreenHotkeyChange: (value: string) => void;
  exitFullscreenHotkey: string;
  onExitFullscreenHotkeyChange: (value: string) => void;
  fullscreenByDefault: boolean;
  onFullscreenByDefaultChange: (value: boolean) => void;
  startMaximized: boolean;
  onStartMaximizedChange: (value: boolean) => void;
  canvasBrightness: number;
  onCanvasBrightnessChange: (value: number) => void;
  canvasVibrance: number;
  onCanvasVibranceChange: (value: number) => void;
  canvasBackground: string;
  onCanvasBackgroundChange: (value: string) => void;
  visualsPath: string;
  onVisualsPathChange: (value: string) => void;
  videoProvider: VideoProviderId;
  videoApiKey: string;
  videoQuery: string;
  videoRefreshMinutes: number;
  onVideoProviderChange: (provider: VideoProviderId) => void;
  onVideoApiKeyChange: (value: string) => void;
  onVideoQueryChange: (value: string) => void;
  onVideoRefreshMinutesChange: (value: number) => void;
  onVideoCacheClear: () => void;
}

const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  onClose,
  audioDevices,
  midiDevices,
  launchpadDevices,
  selectedAudioId,
  selectedMidiId,
  selectedLaunchpadId,
  onSelectAudio,
  onSelectMidi,
  onSelectLaunchpad,
  audioGain,
  onAudioGainChange,
  midiClockSettings,
  onUpdateClockSettings,
  internalBpm,
  onSetInternalBpm,
  clockStable,
  currentMeasure,
  currentBeat,
  layerChannels,
  onLayerChannelChange,
  effectMidiNotes,
  onEffectMidiNoteChange,
  launchpadChannel,
  onLaunchpadChannelChange,
  launchpadNote,
  onLaunchpadNoteChange,
  launchpadSmoothness,
  onLaunchpadSmoothnessChange,
  monitors,
  monitorRoles,
  onMonitorRoleChange,
  startMonitor,
  onStartMonitorChange,
  glitchTextPads,
  onGlitchPadChange,
  hideUiHotkey,
  onHideUiHotkeyChange,
  fullscreenHotkey,
  onFullscreenHotkeyChange,
  exitFullscreenHotkey,
  onExitFullscreenHotkeyChange,
  fullscreenByDefault,
  onFullscreenByDefaultChange,
  startMaximized,
  onStartMaximizedChange,
  canvasBrightness,
  onCanvasBrightnessChange,
  canvasVibrance,
  onCanvasVibranceChange,
  canvasBackground,
  onCanvasBackgroundChange,
  visualsPath,
  onVisualsPathChange,
  videoProvider,
  videoApiKey,
  videoQuery,
  videoRefreshMinutes,
  onVideoProviderChange,
  onVideoApiKeyChange,
  onVideoQueryChange,
  onVideoRefreshMinutesChange,
  onVideoCacheClear,
}) => {
  const [activeTab, setActiveTab] = useState('audio');

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay">
      <div className="settings-modal-content">
        <div className="settings-header">
          <h2>⚙️ Global Settings</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="settings-main">
          <div className="settings-sidebar">
            {[
              { id: 'audio', label: 'Audio', icon: '🎵' },
              { id: 'hardware', label: 'MIDI Hardware', icon: '🎛️' },
              { id: 'video', label: 'Performance', icon: '🎮' },
              { id: 'videos', label: 'Videos', icon: '🎞️' },
              { id: 'fullscreen', label: 'Monitors', icon: '🖥️' },
              { id: 'visual', label: 'Visuals', icon: '🎨' },
              { id: 'system', label: 'System', icon: '🔧' },
              { id: 'integrations', label: 'Integrations', icon: '🧠' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-content">
            {activeTab === 'audio' && (
              <AudioSettings
                audioDevices={audioDevices}
                selectedAudioId={selectedAudioId}
                onSelectAudio={onSelectAudio}
                audioGain={audioGain}
                onAudioGainChange={onAudioGainChange}
              />
            )}

            {activeTab === 'hardware' && (
              <div className="settings-section">
                <MidiSettings
                  midiDevices={midiDevices}
                  selectedMidiId={selectedMidiId}
                  onSelectMidi={onSelectMidi}
                  midiClockSettings={midiClockSettings}
                  onUpdateClockSettings={onUpdateClockSettings}
                  internalBpm={internalBpm}
                  onSetInternalBpm={onSetInternalBpm}
                  clockStable={clockStable}
                  currentMeasure={currentMeasure}
                  currentBeat={currentBeat}
                  layerChannels={layerChannels}
                  onLayerChannelChange={onLayerChannelChange}
                  effectMidiNotes={effectMidiNotes}
                  onEffectMidiNoteChange={onEffectMidiNoteChange}
                />
                <LaunchpadSettings
                  launchpadDevices={launchpadDevices}
                  selectedLaunchpadId={selectedLaunchpadId}
                  onSelectLaunchpad={onSelectLaunchpad}
                  launchpadChannel={launchpadChannel}
                  onLaunchpadChannelChange={onLaunchpadChannelChange}
                  launchpadNote={launchpadNote}
                  onLaunchpadNoteChange={onLaunchpadNoteChange}
                  launchpadSmoothness={launchpadSmoothness}
                  onLaunchpadSmoothnessChange={onLaunchpadSmoothnessChange}
                />
              </div>
            )}

            {activeTab === 'video' && <VideoSettings />}

            {activeTab === 'videos' && (
              <VideoProviderSettingsSection
                provider={videoProvider}
                apiKey={videoApiKey}
                refreshMinutes={videoRefreshMinutes}
                query={videoQuery}
                onProviderChange={onVideoProviderChange}
                onApiKeyChange={onVideoApiKeyChange}
                onRefreshMinutesChange={onVideoRefreshMinutesChange}
                onQueryChange={onVideoQueryChange}
                onClearCache={onVideoCacheClear}
              />
            )}

            {activeTab === 'integrations' && (
              <div className="settings-section">
                <h3>Plugins y perfiles MCP</h3>
                <p>
                  La gestión avanzada de integraciones vive en el panel «Ajustes globales de IA».
                  Desde allí puedes habilitar plugins, configurar sus credenciales y crear perfiles MCP
                  personalizados. Abre ese panel desde la barra lateral principal para acceder a todas
                  las opciones.
                </p>
              </div>
            )}

            {activeTab === 'fullscreen' && (
              <FullscreenSettings
                monitors={monitors}
                monitorRoles={monitorRoles}
                onMonitorRoleChange={onMonitorRoleChange}
              />
            )}

            {activeTab === 'visual' && (
              <VisualSettings
                hideUiHotkey={hideUiHotkey}
                onHideUiHotkeyChange={onHideUiHotkeyChange}
                fullscreenHotkey={fullscreenHotkey}
                onFullscreenHotkeyChange={onFullscreenHotkeyChange}
                exitFullscreenHotkey={exitFullscreenHotkey}
                onExitFullscreenHotkeyChange={onExitFullscreenHotkeyChange}
                fullscreenByDefault={fullscreenByDefault}
                onFullscreenByDefaultChange={onFullscreenByDefaultChange}
                canvasBrightness={canvasBrightness}
                onCanvasBrightnessChange={onCanvasBrightnessChange}
                canvasVibrance={canvasVibrance}
                onCanvasVibranceChange={onCanvasVibranceChange}
                canvasBackground={canvasBackground}
                onCanvasBackgroundChange={onCanvasBackgroundChange}
                glitchTextPads={glitchTextPads}
                onGlitchPadChange={onGlitchPadChange}
              />
            )}


            {activeTab === 'system' && (
              <SystemSettings
                startMaximized={startMaximized}
                onStartMaximizedChange={onStartMaximizedChange}
                monitors={monitors}
                startMonitor={startMonitor}
                onStartMonitorChange={onStartMonitorChange}
                visualsPath={visualsPath}
                onVisualsPathChange={onVisualsPathChange}
              />
            )}
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-info">
            <span>💡 Changes are applied automatically</span>
          </div>
          <button className="primary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalSettingsModal;

