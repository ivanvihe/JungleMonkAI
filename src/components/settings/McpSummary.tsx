import React from 'react';
import { GlobalSettings } from '../../types/globalSettings';
import './McpSummary.css';

interface McpSummaryProps {
  settings: GlobalSettings;
}

export const McpSummary: React.FC<McpSummaryProps> = ({ settings }) => {
  const { mcpProfiles } = settings;

  if (!mcpProfiles.length) {
    return <p className="mcp-summary__empty">No tienes perfiles MCP configurados todavía.</p>;
  }

  return (
    <div className="mcp-summary">
      <p>Gestiona conexiones MCP y consulta rápidamente sus endpoints.</p>
      <ul>
        {mcpProfiles.map(profile => (
          <li key={profile.id}>
            <header>
              <div>
                <strong>{profile.label}</strong>
                {profile.description && <span>{profile.description}</span>}
              </div>
              <span className={profile.autoConnect ? 'badge badge-active' : 'badge'}>
                {profile.autoConnect ? 'Auto-connect' : 'Manual'}
              </span>
            </header>
            <ul className="mcp-summary__endpoints">
              {profile.endpoints.map(endpoint => (
                <li key={endpoint.id}>
                  <span className="endpoint-transport">{endpoint.transport.toUpperCase()}</span>
                  <span className="endpoint-url">{endpoint.url}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default McpSummary;
