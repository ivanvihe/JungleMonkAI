import React, { useState, useEffect } from 'react';

interface MonitorInfo {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

interface SystemSettingsProps {
  startMaximized: boolean;
  onStartMaximizedChange: (value: boolean) => void;
  monitors: MonitorInfo[];
  startMonitor: string | null;
  onStartMonitorChange: (id: string | null) => void;
  visualsPath: string;
  onVisualsPathChange: (value: string) => void;
}

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  startMaximized,
  onStartMaximizedChange,
  monitors,
  startMonitor,
  onStartMonitorChange,
  visualsPath,
  onVisualsPathChange,
}) => {
  const [autoCleanCache, setAutoCleanCache] = useState(() =>
    localStorage.getItem('autoCleanCache') !== 'false'
  );
  const [memoryLimit, setMemoryLimit] = useState(() =>
    parseInt(localStorage.getItem('memoryLimit') || '512')
  );
  const [webglSupport, setWebglSupport] = useState<string>('Detecting...');
  const [resourcesPath, setResourcesPath] = useState(visualsPath);

  useEffect(() => {
    setResourcesPath(visualsPath);
  }, [visualsPath]);

  useEffect(() => {
    localStorage.setItem('autoCleanCache', autoCleanCache.toString());
  }, [autoCleanCache]);

  useEffect(() => {
    localStorage.setItem('memoryLimit', memoryLimit.toString());
  }, [memoryLimit]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) {
        loseContext.loseContext();
      }
      setWebglSupport('Available');
    } else {
      setWebglSupport('Not available');
    }
  }, []);

  const handlePathChange = (value: string) => {
    setResourcesPath(value);
    onVisualsPathChange(value);
  };

  const handleClearCache = () => {
    const keysToKeep = [
      'selectedAudioDevice',
      'selectedMidiDevice',
      'monitorRoles',
      'glitchTextPads',
      'targetFPS',
      'vsync',
      'antialias',
      'pixelRatio',
      'visualScale',
      'preferredGPU',
      'audioBufferSize',
      'fftSize',
      'audioSmoothing',
      'autoCleanCache',
      'memoryLimit',
    ];

    Object.keys(localStorage).forEach((key) => {
      if (!keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    });

    if ('gc' in window) {
      (window as any).gc();
    }

    alert('Cache cleared successfully');
  };

  const handleResetSettings = () => {
    if (confirm('Are you sure you want to reset all settings?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const getMemoryUsage = () => {
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      return {
        used: Math.round(mem.usedJSHeapSize / 1048576),
        total: Math.round(mem.totalJSHeapSize / 1048576),
        limit: Math.round(mem.jsHeapSizeLimit / 1048576),
      };
    }
    return null;
  };

  const memInfo = getMemoryUsage();

  return (
    <div className="settings-section">
      <h3>🔧 System & Maintenance</h3>

      <div className="setting-group">
        <label className="setting-checkbox">
          <input
            type="checkbox"
            checked={startMaximized}
            onChange={(e) => onStartMaximizedChange(e.target.checked)}
          />
          <span>Start maximized</span>
        </label>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Startup monitor</span>
          <select
            value={startMonitor || ''}
            onChange={(e) => onStartMonitorChange(e.target.value || null)}
            className="setting-select"
          >
            <option value="">Primary monitor</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="setting-group">
        <label className="setting-label">
          <span>Visuals Path</span>
          <input
            type="text"
            value={resourcesPath}
            onChange={e => handlePathChange(e.target.value)}
            className="setting-input"
          />
        </label>
        <small className="setting-hint">Base folder for visual presets</small>
      </div>

      {memInfo && (
        <div className="memory-usage">
          <h4>Memory Usage</h4>
          <div className="memory-bar">
            <div
              className="memory-fill"
              style={{ width: `${(memInfo.used / memInfo.limit) * 100}%` }}
            />
          </div>
          <span>
            {memInfo.used}MB of {memInfo.limit}MB used
          </span>
        </div>
      )}

      <div className="setting-group">
        <label className="setting-label">
          <span>Memory Limit (MB): {memoryLimit}</span>
          <input
            type="range"
            min={256}
            max={2048}
            step={64}
            value={memoryLimit}
            onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
            className="setting-slider"
          />
        </label>
        <small className="setting-hint">
          The application will try to stay below this limit
        </small>
      </div>

      <div className="setting-group">
        <label className="setting-checkbox">
          <input
            type="checkbox"
            checked={autoCleanCache}
            onChange={(e) => setAutoCleanCache(e.target.checked)}
          />
          <span>Automatic Cache Cleanup</span>
        </label>
        <small className="setting-hint">Automatically clears unused resources</small>
      </div>

      <div className="action-buttons">
        <button
          className="action-button clear-button"
          onClick={handleClearCache}
        >
          🧹 Clear Cache
        </button>

        <button
          className="action-button reset-button"
          onClick={handleResetSettings}
        >
          ⚠️ Reset All
        </button>
      </div>

      <div className="system-details">
        <h4>Technical Information</h4>
        <div className="tech-info">
          <div className="tech-item">
            <span>User Agent:</span>
            <span className="tech-value">
              {navigator.userAgent.split(' ').slice(-2).join(' ')}
            </span>
          </div>
          <div className="tech-item">
            <span>WebGL:</span>
            <span className="tech-value">{webglSupport}</span>
          </div>
          <div className="tech-item">
            <span>Audio Context:</span>
            <span className="tech-value">
              {window.AudioContext || (window as any).webkitAudioContext
                ? 'Available'
                : 'Not available'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

