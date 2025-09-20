import React from 'react';
import { useAgents } from '../../core/agents/AgentContext';
import { useMessages } from '../../core/messages/MessageContext';

interface ChatWorkspaceProps {
  sidePanel: React.ReactNode;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({ sidePanel }) => {
  const { activeAgents, agentMap } = useAgents();
  const {
    messages,
    draft,
    setDraft,
    appendToDraft,
    sendMessage,
    pendingResponses,
    lastUserMessage,
    quickCommands,
    formatTimestamp,
  } = useMessages();

  return (
    <>
      <div className="layer-grid-container chat-layer-grid">
        <div className="chat-header">
          <div className="chat-header-text">
            <h1 className="chat-title">JungleMonk.AI · Control Hub</h1>
            <p className="chat-subtitle">
              Orquesta múltiples agentes en paralelo manteniendo la estética original del entorno.
            </p>
          </div>
          <div className="chat-metrics">
            <div className="metric-chip">
              <span className="metric-label">Agentes activos</span>
              <span className="metric-value">{activeAgents.length}</span>
            </div>
            <div className="metric-chip">
              <span className="metric-label">Mensajes totales</span>
              <span className="metric-value">{messages.length}</span>
            </div>
            <div className={`metric-chip ${pendingResponses ? 'metric-warning' : ''}`}>
              <span className="metric-label">Respuestas pendientes</span>
              <span className="metric-value">{pendingResponses}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-section">
        <div className="visual-stage">
          <div className="visual-wrapper chat-visual-wrapper">
            <div className="chat-stage">
              <div className="message-feed">
                {messages.map(message => {
                  const isUser = message.author === 'user';
                  const isSystem = message.author === 'system';
                  const agent = message.agentId ? agentMap.get(message.agentId) : undefined;
                  const chipColor = agent?.accent || 'var(--accent-color)';

                  return (
                    <div
                      key={message.id}
                      className={`message-card ${isUser ? 'message-user' : ''} ${isSystem ? 'message-system' : ''}`}
                    >
                      <div className="message-card-header">
                        <div className="message-card-author" style={{ borderColor: chipColor }}>
                          {isUser && 'Tú'}
                          {isSystem && 'Control Hub'}
                          {!isUser && !isSystem && agent?.name}
                        </div>
                        <div className="message-card-meta">
                          {!isUser && !isSystem && (
                            <span className="message-card-tag" style={{ color: chipColor }}>
                              {agent?.provider}
                            </span>
                          )}
                          <span className="message-card-time">{formatTimestamp(message.timestamp)}</span>
                          {message.status === 'pending' && <span className="message-card-status">orquestando…</span>}
                        </div>
                      </div>
                      <p className="message-card-content">{message.content}</p>
                    </div>
                  );
                })}
              </div>

              <div className="chat-suggestions">
                <span className="suggestions-label">Sugerencias:</span>
                {quickCommands.slice(0, 3).map(command => (
                  <button
                    key={command}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => appendToDraft(command)}
                  >
                    {command}
                  </button>
                ))}
              </div>

              <div className="chat-composer">
                <textarea
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  placeholder="Habla con varios agentes a la vez: por ejemplo “gpt, genera un esquema de estilos”"
                  className="chat-input"
                  rows={3}
                />
                <div className="composer-toolbar">
                  <div className="composer-hints">
                    <span>Usa @ para mencionar modelos concretos</span>
                    {lastUserMessage && (
                      <span className="composer-last">Último mensaje a las {formatTimestamp(lastUserMessage.timestamp)}</span>
                    )}
                  </div>
                  <div className="composer-actions">
                    <button type="button" className="ghost-button" onClick={() => setDraft('')} disabled={!draft.trim()}>
                      Limpiar
                    </button>
                    <button type="button" className="primary-button" onClick={sendMessage}>
                      Enviar a {activeAgents.length || 'ningún'} agente{activeAgents.length === 1 ? '' : 's'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {sidePanel}
      </div>
    </>
  );
};
