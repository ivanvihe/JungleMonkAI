import React, { useEffect, useMemo } from 'react';
import { AgentDefinition, AgentKind } from '../../core/agents/agentRegistry';
import {
  AgentPresenceSummary,
  AgentPresenceStatus,
  AgentPresenceSummaryByKind,
} from '../../core/agents/presence';
import { ChatActorFilter } from '../../types/chat';

interface ChatTopBarProps {
  agents: AgentDefinition[];
  presenceSummary: AgentPresenceSummary;
  activeAgents: number;
  totalAgents: number;
  pendingResponses: number;
  activeFilter: ChatActorFilter;
  onFilterChange: (filter: ChatActorFilter) => void;
  onRefreshPresence: () => void;
}

const STATUS_LABELS: Record<AgentPresenceStatus, string> = {
  online: 'Operativo',
  offline: 'En espera',
  error: 'Con incidencias',
  loading: 'Verificando…',
};

const KIND_LABELS: Record<AgentKind, string> = {
  cloud: 'Agentes en nube',
  local: 'Agentes locales',
};

const resolveStatus = (summary: AgentPresenceSummary): AgentPresenceStatus => {
  if (summary.totals.error > 0) {
    return 'error';
  }
  if (summary.totals.online > 0) {
    return 'online';
  }
  if (summary.totals.loading > 0) {
    return 'loading';
  }
  return 'offline';
};

const resolveKindEmphasis = (bucket: AgentPresenceSummaryByKind): AgentPresenceStatus => {
  if (bucket.error > 0) {
    return 'error';
  }
  if (bucket.online > 0) {
    return 'online';
  }
  if (bucket.loading > 0) {
    return 'loading';
  }
  return 'offline';
};

export const ChatTopBar: React.FC<ChatTopBarProps> = ({
  agents,
  presenceSummary,
  activeAgents,
  totalAgents,
  pendingResponses,
  activeFilter,
  onFilterChange,
  onRefreshPresence,
}) => {
  const hasPending = pendingResponses > 0;
  const overallStatus = resolveStatus(presenceSummary);

  const filterOptions = useMemo(() => {
    const base: { value: ChatActorFilter; label: string }[] = [
      { value: 'all', label: 'Todos los actores' },
      { value: 'user', label: 'Usuario' },
      { value: 'system', label: 'Control Hub' },
    ];

    (['cloud', 'local'] as AgentKind[]).forEach(kind => {
      const bucket = presenceSummary.byKind[kind];
      if (bucket.total > 0) {
        base.push({ value: `kind:${kind}` as ChatActorFilter, label: KIND_LABELS[kind] });
      }
    });

    agents
      .filter(agent => agent.active)
      .forEach(agent => {
        base.push({ value: `agent:${agent.id}` as ChatActorFilter, label: agent.name });
      });

    return base;
  }, [agents, presenceSummary]);

  const filterValue = useMemo(() => {
    if (filterOptions.some(option => option.value === activeFilter)) {
      return activeFilter;
    }
    return 'all';
  }, [activeFilter, filterOptions]);

  useEffect(() => {
    if (filterValue !== activeFilter) {
      onFilterChange('all');
    }
  }, [filterValue, activeFilter, onFilterChange]);

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
        <div className={`status-indicator status-${overallStatus}`}>
          <span className={`status-led ${overallStatus}`} aria-hidden />
          <span>{STATUS_LABELS[overallStatus]}</span>
        </div>
        <div className="status-metrics">
          <div className="status-metric">
            <span className="metric-label">Agentes activos</span>
            <span className="metric-value">{activeAgents}/{totalAgents}</span>
          </div>
          <div className={`status-metric ${hasPending ? 'warning' : ''}`}>
            <span className="metric-label">Pendientes</span>
            <span className="metric-value">{pendingResponses}</span>
          </div>
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

      <div className="topbar-section topbar-presence">
        {(['cloud', 'local'] as AgentKind[]).map(kind => {
          const bucket = presenceSummary.byKind[kind];
          if (!bucket.total) {
            return null;
          }
          const emphasis = resolveKindEmphasis(bucket);
          return (
            <div key={kind} className={`presence-card presence-${emphasis}`}>
              <div className="presence-card-header">
                <span className="presence-card-title">{KIND_LABELS[kind]}</span>
                <span className="presence-card-active">{bucket.active} activos</span>
              </div>
              <div className="presence-card-body">
                <div className="presence-card-metric">
                  <span className="presence-card-value">{bucket.online}</span>
                  <span className="presence-card-label">online</span>
                </div>
                <div className="presence-card-metric">
                  <span className="presence-card-value">{bucket.offline}</span>
                  <span className="presence-card-label">offline</span>
                </div>
                <div className="presence-card-metric">
                  <span className="presence-card-value">{bucket.error}</span>
                  <span className="presence-card-label">errores</span>
                </div>
                <div className="presence-card-metric">
                  <span className="presence-card-value">{bucket.loading}</span>
                  <span className="presence-card-label">cargando</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="topbar-section topbar-filter">
        <label className="filter-label" htmlFor="chat-actor-filter">
          Actor activo
        </label>
        <div className="filter-controls">
          <select
            id="chat-actor-filter"
            className="filter-select"
            value={filterValue}
            onChange={event => onFilterChange(event.target.value as ChatActorFilter)}
          >
            {filterOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="topbar-button ghost" onClick={onRefreshPresence}>
            ↻
          </button>
        </div>
      </div>
    </header>
  );
};
