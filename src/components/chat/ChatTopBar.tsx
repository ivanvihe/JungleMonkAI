import React from 'react';

interface ChatTopBarProps {
  activeAgents: number;
  totalAgents: number;
  pendingResponses: number;
}

export const ChatTopBar: React.FC<ChatTopBarProps> = ({
  activeAgents,
  totalAgents,
  pendingResponses,
}) => {
  const hasPending = pendingResponses > 0;

  return (
    <header className="chat-top-bar">
      <div className="topbar-section topbar-branding">
        <div className="brand-icon" aria-hidden>🌀</div>
        <div className="brand-copy">
          <span className="brand-title">JungleMonk.AI</span>
          <span className="brand-subtitle">Multi-Agent Studio</span>
        </div>
      </div>

      <div className="topbar-section topbar-status">
        <div className="status-indicator">
          <span className={`status-led ${activeAgents ? 'online' : 'offline'}`} aria-hidden />
          <span>{activeAgents ? 'Operativo' : 'En espera'}</span>
        </div>
        <div className="status-metric">
          <span className="metric-label">Agentes activos</span>
          <span className="metric-value">{activeAgents}/{totalAgents}</span>
        </div>
        <div className={`status-metric ${hasPending ? 'warning' : ''}`}>
          <span className="metric-label">Pendientes</span>
          <span className="metric-value">{pendingResponses}</span>
        </div>
      </div>

      <div className="topbar-section topbar-actions">
        <button type="button" className="topbar-button" onClick={() => console.log('Abrir comandos habituales')}>
          ⚡ Comandos
        </button>
        <button type="button" className="topbar-button" onClick={() => console.log('Abrir actividad reciente')}>
          📊 Actividad
        </button>
        <button type="button" className="topbar-button" onClick={() => console.log('Abrir ajustes globales')}>
          ⚙️ Ajustes
        </button>
      </div>
    </header>
  );
};
