import React from 'react';
import { AudioData } from '../core/PresetLoader';
import './StatusBar.css';

interface StatusBarProps {
  status: string;
  fps: number;
  currentPreset: string;
  audioData: AudioData;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  status,
  fps,
  currentPreset,
  audioData
}) => {
  const getStatusColor = (status: string): string => {
    if (status.includes('Error')) return '#ff4444';
    if (status.includes('Ready')) return '#44ff44';
    if (status.includes('Loading') || status.includes('Initializing')) return '#ffaa44';
    return '#ffffff';
  };

  const getFPSColor = (fps: number): string => {
    if (fps >= 55) return '#44ff44';
    if (fps >= 30) return '#ffaa44';
    return '#ff4444';
  };

  return (
    <div className="status-bar">
      <div className="status-section">
        <div className="status-item">
          <span className="status-label">Status:</span>
          <span 
            className="status-value" 
            style={{ color: getStatusColor(status) }}
          >
            {status}
          </span>
        </div>
        
        <div className="status-item">
          <span className="status-label">FPS:</span>
          <span 
            className="status-value" 
            style={{ color: getFPSColor(fps) }}
          >
            {fps}
          </span>
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