import React from 'react';
import { AgentDefinition } from '../../core/agents/agentRegistry';
import { AgentPresenceEntry, AgentPresenceStatus } from '../../core/agents/presence';
import { getAgentDisplayName, getAgentVersionLabel } from '../../utils/agentDisplay';
import './AgentPresenceList.css';

interface AgentPresenceListProps {
  agents: AgentDefinition[];
  presence: Map<string, AgentPresenceEntry>;
  onToggleAgent: (agentId: string) => void;
  onOpenConsole?: (agentId: string) => void;
  onRefreshAgent?: (agentId: string) => void | Promise<void>;
  onUpdateRole: (agentId: string, updates: { role?: string; objective?: string }) => void;
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
  const name = getAgentDisplayName(agent);
  const [first] = name.trim();
  if (first) {
    return first.toUpperCase();
  }
  return agent.provider.slice(0, 1).toUpperCase();
};

const ROLE_PRESETS = [
  '',
  'Diseñador/a',
  'Crítico/a',
  'Ejecutor/a',
  'Investigador/a',
  'Product Manager',
];

export const AgentPresenceList: React.FC<AgentPresenceListProps> = ({
  agents,
  presence,
  onToggleAgent,
  onOpenConsole,
  onRefreshAgent,
  onUpdateRole,
}) => (
  <ul className="agent-presence-list">
    {agents.map(agent => {
      const entry = presence.get(agent.id) ?? { status: 'loading', lastChecked: null };
      const statusClass = getStatusClass(entry.status);
      const latencyInfo =
        entry.latencyMs !== undefined ? `${entry.latencyMs} ms` : agent.kind === 'local' ? '∼ local' : '—';
      const displayName = getAgentDisplayName(agent);
      const variantLabel = agent.kind === 'local' ? getAgentVersionLabel(agent) : undefined;

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
            <div className="agent-presence-name">
              <span>{displayName}</span>
              {variantLabel && <span className="agent-presence-variant">{variantLabel}</span>}
            </div>
            <div className="agent-presence-meta">
              <span className="agent-presence-provider">{agent.provider}</span>
              <span className="agent-presence-latency">{latencyInfo}</span>
              <span className={`agent-presence-status status-${entry.status}`}>
                <span className="presence-led" aria-hidden />
                {STATUS_LABELS[entry.status]}
              </span>
            </div>
            {entry.message && <div className="agent-presence-message">{entry.message}</div>}
            <div className="agent-presence-role">
              <label>
                Rol
                <select
                  value={agent.role ?? ''}
                  onChange={event => onUpdateRole(agent.id, { role: event.target.value || undefined, objective: agent.objective })}
                >
                  {ROLE_PRESETS.map(option => (
                    <option key={option || 'none'} value={option}>
                      {option ? option : 'Sin asignar'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Objetivo
                <input
                  type="text"
                  value={agent.objective ?? ''}
                  onChange={event =>
                    onUpdateRole(agent.id, {
                      role: agent.role,
                      objective: event.target.value.trim() ? event.target.value : undefined,
                    })
                  }
                  placeholder="Describe el foco actual"
                />
              </label>
            </div>
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
