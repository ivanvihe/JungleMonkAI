import React from 'react';
import { AgentDefinition } from '../../core/agents/agentRegistry';
import { AgentPresenceEntry, AgentPresenceStatus } from '../../core/agents/presence';
import './AgentPresenceList.css';

interface AgentPresenceListProps {
  agents: AgentDefinition[];
  presence: Map<string, AgentPresenceEntry>;
  onToggleAgent: (agentId: string) => void;
  onOpenConsole?: (agentId: string) => void;
  onRefreshAgent?: (agentId: string) => void | Promise<void>;
}

const STATUS_LABELS: Record<AgentPresenceStatus, string> = {
  online: 'Operativo',
  offline: 'En espera',
  error: 'Con incidencias',
  loading: 'Verificando…',
};

const getStatusClass = (status: AgentPresenceStatus): string => {
  switch (status) {
    case 'online':
      return 'is-online';
    case 'error':
      return 'is-error';
    case 'offline':
      return 'is-offline';
    default:
      return 'is-loading';
  }
};

const buildAvatarLabel = (agent: AgentDefinition): string => {
  const [first] = agent.name.trim();
  if (first) {
    return first.toUpperCase();
  }
  return agent.provider.slice(0, 1).toUpperCase();
};

export const AgentPresenceList: React.FC<AgentPresenceListProps> = ({
  agents,
  presence,
  onToggleAgent,
  onOpenConsole,
  onRefreshAgent,
}) => (
  <ul className="agent-presence-list">
    {agents.map(agent => {
      const entry = presence.get(agent.id) ?? { status: 'loading', lastChecked: null };
      const statusClass = getStatusClass(entry.status);
      const latencyInfo =
        entry.latencyMs !== undefined ? `${entry.latencyMs} ms` : agent.kind === 'local' ? '∼ local' : '—';

      return (
        <li key={agent.id} className={`agent-presence-item ${statusClass}`}>
          <div
            className="agent-presence-avatar"
            style={{ background: `linear-gradient(135deg, ${agent.accent}, rgba(255, 255, 255, 0.08))` }}
            aria-hidden
          >
            {buildAvatarLabel(agent)}
          </div>
          <div className="agent-presence-info">
            <div className="agent-presence-name">{agent.name}</div>
            <div className="agent-presence-meta">
              <span className="agent-presence-provider">{agent.provider}</span>
              <span className="agent-presence-latency">{latencyInfo}</span>
              <span className={`agent-presence-status status-${entry.status}`}>
                <span className="presence-led" aria-hidden />
                {STATUS_LABELS[entry.status]}
              </span>
            </div>
            {entry.message && <div className="agent-presence-message">{entry.message}</div>}
          </div>
          <div className="agent-presence-actions">
            <button
              type="button"
              className={`presence-action ${agent.active ? 'is-active' : ''}`}
              onClick={() => onToggleAgent(agent.id)}
            >
              {agent.active ? 'Desactivar' : 'Activar'}
            </button>
            <button
              type="button"
              className="presence-action"
              onClick={() => onOpenConsole?.(agent.id)}
            >
              Consola
            </button>
            <button
              type="button"
              className="presence-action is-ghost"
              onClick={() => onRefreshAgent?.(agent.id)}
              title="Reevaluar disponibilidad"
            >
              ↻
            </button>
          </div>
        </li>
      );
    })}
  </ul>
);
