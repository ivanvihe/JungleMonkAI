import React from 'react';

interface MonitorInfo {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

interface FullscreenSettingsProps {
  monitors: MonitorInfo[];
  monitorRoles: Record<string, 'main' | 'secondary' | 'none'>;
  onMonitorRoleChange: (id: string, role: 'main' | 'secondary' | 'none') => void;
}

export const FullscreenSettings: React.FC<FullscreenSettingsProps> = ({
  monitors,
  monitorRoles,
  onMonitorRoleChange,
}) => {
  return (
    <div className="settings-section">
      <h3>🖥️ Monitor Settings</h3>

      {monitors.length > 0 ? (
        <>
          <div className="monitors-grid">
            {monitors.map((monitor) => (
              <div key={monitor.id} className="monitor-card">
                <div className="monitor-preview">
                  <div className="monitor-screen">
                    <span className="monitor-resolution">
                      {monitor.size.width}×{monitor.size.height}
                    </span>
                    {monitor.isPrimary && <span className="primary-badge">Primary</span>}
                  </div>
                </div>

                <div className="monitor-info">
                  <h4>{monitor.label}</h4>
                  <div className="monitor-details">
                    <span>Position: {monitor.position.x}, {monitor.position.y}</span>
                    <span>Scale: {monitor.scaleFactor}x</span>
                  </div>

                  <div className="monitor-role">
                    <span>Role:</span>
                    <select
                      value={monitorRoles[monitor.id] || 'none'}
                      onChange={(e) =>
                        onMonitorRoleChange(monitor.id, e.target.value as any)
                      }
                      className="setting-select"
                    >
                      <option value="none">Do not use</option>
                      <option value="main">Primary</option>
                      <option value="secondary">Secondary</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="monitors-summary">
            <strong>
              Monitors in use: {
                monitors.filter((m) => monitorRoles[m.id] !== 'none').length
              }
            </strong>
            <p>Configure a primary monitor and optionally secondary ones.</p>
          </div>
        </>
      ) : (
        <div className="monitors-summary">
          <strong>No monitors detected</strong>
          <p>Connect a display to configure fullscreen output.</p>
        </div>
      )}
    </div>
  );
};

