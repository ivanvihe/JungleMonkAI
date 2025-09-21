import React from 'react';
import { AudioData } from '../core/PresetLoader';
import './StatusBar.css';

interface StatusBarProps {
  status: string;
  fps: number;
  currentPreset: string;
  audioData: AudioData;
}

export const StatusBar: React.FC<StatusBarProps> = ({ status, fps, currentPreset, audioData }) => {
  const resolveToneFromStatus = (value: string): 'critical' | 'warning' | 'positive' | 'neutral' => {
    const normalized = value.toLowerCase();
    if (normalized.includes('error') || normalized.includes('fail')) {
      return 'critical';
    }
    if (normalized.includes('ready') || normalized.includes('ok')) {
      return 'positive';
    }
    if (normalized.includes('load') || normalized.includes('init')) {
      return 'warning';
    }
    return 'neutral';
  };

  const resolveToneFromFps = (value: number): 'critical' | 'warning' | 'positive' => {
    if (value >= 55) {
      return 'positive';
    }
    if (value >= 30) {
      return 'warning';
    }
    return 'critical';
  };

  const statusTone = resolveToneFromStatus(status);
  const fpsTone = resolveToneFromFps(fps);

  return (
    <div className="status-bar">
      <div className="status-section">
        <div className="status-item">
          <span className="status-label">Status:</span>
          <span className={`status-value tone-${statusTone}`}>{status}</span>
        </div>

        <div className="status-item">
          <span className="status-label">FPS:</span>
          <span className={`status-value tone-${fpsTone}`}>{fps}</span>
        </div>

        <div className="status-item">
          <span className="status-label">Preset:</span>
          <span className="status-value">
            {currentPreset}
          </span>
        </div>
      </div>
      
      <div className="audio-levels">
        <div className="audio-level-group">
          <span className="level-label">Bass</span>
          <div className="audio-level-bar">
            <div 
              className="audio-level-fill low"
              style={{ width: `${Math.min(audioData.low * 100, 100)}%` }}
            />
          </div>
          <span className="level-value">{Math.round(audioData.low * 100)}%</span>
        </div>
        
        <div className="audio-level-group">
          <span className="level-label">Mid</span>
          <div className="audio-level-bar">
            <div 
              className="audio-level-fill mid"
              style={{ width: `${Math.min(audioData.mid * 100, 100)}%` }}
            />
          </div>
          <span className="level-value">{Math.round(audioData.mid * 100)}%</span>
        </div>
        
        <div className="audio-level-group">
          <span className="level-label">Treble</span>
          <div className="audio-level-bar">
            <div 
              className="audio-level-fill high"
              style={{ width: `${Math.min(audioData.high * 100, 100)}%` }}
            />
          </div>
          <span className="level-value">{Math.round(audioData.high * 100)}%</span>
        </div>
      </div>
    </div>
  );
};