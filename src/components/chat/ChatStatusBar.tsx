import React from 'react';

interface ChatStatusBarProps {
  activeAgents: number;
  totalMessages: number;
  pendingResponses: number;
}

export const ChatStatusBar: React.FC<ChatStatusBarProps> = ({
  activeAgents,
  totalMessages,
  pendingResponses,
}) => {
  return (
    <div className="chat-status-bar">
      <div className="status-pill">
        <span className="pill-label">Agentes activos</span>
        <span className="pill-value">{activeAgents}</span>
      </div>
      <div className="status-pill">
        <span className="pill-label">Mensajes en sesión</span>
        <span className="pill-value">{totalMessages}</span>
      </div>
      <div className={`status-pill ${pendingResponses ? 'warning' : ''}`}>
        <span className="pill-label">Pendientes</span>
        <span className="pill-value">{pendingResponses}</span>
      </div>
      <div className="status-hint">
        Coordina instrucciones simultáneas: el hub distribuirá las tareas a cada modelo activo.
      </div>
    </div>
  );
};
