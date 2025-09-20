import React, { useMemo } from 'react';
import { useAgents } from '../../core/agents/AgentContext';
import { useMessages } from '../../core/messages/MessageContext';
import { ApiKeySettings } from '../../types/globalSettings';

interface SidePanelProps {
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: string, value: string) => void;
}

export const SidePanel: React.FC<SidePanelProps> = ({ apiKeys, onApiKeyChange }) => {
  const { agents, agentMap, toggleAgent } = useAgents();
  const { quickCommands, appendToDraft, agentResponses, formatTimestamp } = useMessages();

  const recentActivity = useMemo(
    () => agentResponses.slice(-6).reverse().map(message => ({ message, agent: message.agentId ? agentMap.get(message.agentId) : undefined })),
    [agentMap, agentResponses],
  );

  return (
    <aside className="controls-panel">
      <div className="controls-panel-content">
        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Credenciales</h2>
            <p>Conecta tus proveedores en caliente.</p>
          </header>
          <div className="key-field">
            <label htmlFor="openai-key">OpenAI</label>
            <input
              id="openai-key"
              type="password"
              value={apiKeys.openai}
              onChange={event => onApiKeyChange('openai', event.target.value)}
              placeholder="sk-..."
              className={!apiKeys.openai ? 'is-empty' : ''}
            />
          </div>
          <div className="key-field">
            <label htmlFor="anthropic-key">Anthropic</label>
            <input
              id="anthropic-key"
              type="password"
              value={apiKeys.anthropic}
              onChange={event => onApiKeyChange('anthropic', event.target.value)}
              placeholder="anthropic-..."
              className={!apiKeys.anthropic ? 'is-empty' : ''}
            />
          </div>
          <div className="key-field">
            <label htmlFor="groq-key">Groq</label>
            <input
              id="groq-key"
              type="password"
              value={apiKeys.groq}
              onChange={event => onApiKeyChange('groq', event.target.value)}
              placeholder="groq-..."
              className={!apiKeys.groq ? 'is-empty' : ''}
            />
          </div>
        </section>

        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Modelos activos</h2>
            <p>Activa y desactiva agentes al instante.</p>
          </header>
          <div className="agent-grid">
            {agents.map(agent => (
              <button
                key={agent.id}
                type="button"
                className={`agent-chip ${agent.active ? 'is-active' : ''}`}
                style={{ '--agent-accent': agent.accent } as React.CSSProperties}
                onClick={() => toggleAgent(agent.id)}
              >
                <span className="agent-chip-name">{agent.name}</span>
                <span className="agent-chip-provider">{agent.provider}</span>
                <span className="agent-chip-status">{agent.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Comandos frecuentes</h2>
            <p>Guarda instrucciones recurrentes para dispararlas en el chat.</p>
          </header>
          <div className="command-list">
            {quickCommands.map(command => (
              <button key={command} type="button" className="command-item" onClick={() => appendToDraft(command)}>
                <span>{command}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Actividad reciente</h2>
            <p>Monitoriza cómo responden los agentes.</p>
          </header>
          <ul className="activity-feed">
            {recentActivity.map(({ message, agent }) => {
              if (!agent) {
                return null;
              }

              const preview = Array.isArray(message.content)
                ? message.content
                    .map(part => {
                      if (typeof part === 'string') {
                        return part;
                      }
                      if (part.type === 'text') {
                        return part.text;
                      }
                      return `[${part.type}]`;
                    })
                    .join(' · ')
                : message.content;

              return (
                <li key={message.id} className="activity-item">
                  <span className="activity-dot" style={{ background: agent.accent }} />
                  <div className="activity-content">
                    <div className="activity-title">
                      <strong>{agent.name}</strong>
                      <span>{formatTimestamp(message.timestamp)}</span>
                    </div>
                    <p>{preview}</p>
                  </div>
                </li>
              );
            })}
            {!agentResponses.length && <li className="activity-empty">Todavía no hay actividad de los agentes.</li>}
          </ul>
        </section>
      </div>
    </aside>
  );
};
