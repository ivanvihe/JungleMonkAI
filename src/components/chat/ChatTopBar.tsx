import React, { useEffect, useMemo } from 'react';
import { AgentDefinition, AgentKind } from '../../core/agents/agentRegistry';
import { AgentPresenceSummary, AgentPresenceStatus } from '../../core/agents/presence';
import { ChatActorFilter } from '../../types/chat';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import { useProjects } from '../../core/projects/ProjectContext';

interface ChatTopBarProps {
  agents: AgentDefinition[];
  presenceSummary: AgentPresenceSummary;
  activeAgents: number;
  totalAgents: number;
  pendingResponses: number;
  activeFilter: ChatActorFilter;
  onFilterChange: (filter: ChatActorFilter) => void;
  onRefreshPresence: () => void;
  onOpenStats: () => void;
  onOpenGlobalSettings: () => void;
  onOpenPlugins: () => void;
  onOpenMcp: () => void;
  activeView: 'chat' | 'repo';
  onChangeView: (view: 'chat' | 'repo') => void;
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

export const ChatTopBar: React.FC<ChatTopBarProps> = ({
  agents,
  presenceSummary,
  activeAgents,
  totalAgents,
  pendingResponses,
  activeFilter,
  onFilterChange,
  onRefreshPresence,
  onOpenStats,
  onOpenGlobalSettings,
  onOpenPlugins,
  onOpenMcp,
  activeView,
  onChangeView,
}) => {
  const hasPending = pendingResponses > 0;
  const overallStatus = resolveStatus(presenceSummary);
  const { projects, activeProjectId, activeProject, selectProject } = useProjects();
  const activeAgentsMessage = useMemo(() => {
    const base = `${activeAgents} agente${activeAgents === 1 ? '' : 's'}`;
    return `${base} coordinando la conversación`;
  }, [activeAgents]);

  const handleProjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value || null;
    selectProject(nextId);
  };

  const projectOptions = useMemo(
    () =>
      projects.map(project => ({
        id: project.id,
        label: project.name,
      })),
    [projects],
  );

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
        base.push({ value: `agent:${agent.id}` as ChatActorFilter, label: getAgentDisplayName(agent) });
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
      <div className="topbar-left">
        <div className="brand-mark" aria-hidden>
          🌀
        </div>
        <div className="brand-meta">
          <span className="brand-title">JungleMonk.AI</span>
          <span className="brand-status">
            <span className={`status-dot status-${overallStatus}`} aria-hidden />
            {STATUS_LABELS[overallStatus]}
          </span>
        </div>
        <div className="mode-switcher" role="tablist" aria-label="Cambiar vista">
          <button
            type="button"
            className={activeView === 'chat' ? 'is-active' : ''}
            onClick={() => onChangeView('chat')}
            role="tab"
            aria-selected={activeView === 'chat'}
          >
            💬
          </button>
          <button
            type="button"
            className={activeView === 'repo' ? 'is-active' : ''}
            onClick={() => onChangeView('repo')}
            role="tab"
            aria-selected={activeView === 'repo'}
          >
            🗂️
          </button>
        </div>
      </div>

      <div className="topbar-center">
        <div className="metric-group">
          <div className="metric-chip">
            <span className="metric-label">Activos</span>
            <span className="metric-value">
              {activeAgents}/{totalAgents}
            </span>
          </div>
          <div className={`metric-chip ${hasPending ? 'is-warning' : ''}`}>
            <span className="metric-label">Pendientes</span>
            <span className="metric-value">{pendingResponses}</span>
          </div>
          <span className="metric-caption" role="status" aria-live="polite">
            {activeAgentsMessage}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onRefreshPresence}
            aria-label="Actualizar estado de agentes"
          >
            ↻
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenStats}
            aria-label="Ver estadísticas de la conversación"
          >
            📊
          </button>
        </div>

        <div className="project-pill">
          <select
            aria-label="Seleccionar proyecto activo"
            value={activeProjectId ?? ''}
            onChange={handleProjectChange}
            disabled={!projectOptions.length}
          >
            {projectOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            {!projectOptions.length && <option value="">Sin proyectos configurados</option>}
          </select>
          <div className="project-meta" aria-live="polite">
            {activeProject
              ? `${activeProject.repositoryPath}${
                  activeProject.defaultBranch ? `@${activeProject.defaultBranch}` : ''
                }`
              : 'Sin proyecto activo'}
          </div>
        </div>

        <div className="filter-pill">
          <select
            aria-label="Filtrar actores en la conversación"
            value={filterValue}
            onChange={event => onFilterChange(event.target.value as ChatActorFilter)}
          >
            {filterOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-button"
          onClick={onOpenPlugins}
          aria-label="Abrir plugins"
        >
          🧩
        </button>
        <button type="button" className="icon-button" onClick={onOpenMcp} aria-label="Abrir perfiles MCP">
          🛰️
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onOpenGlobalSettings}
          aria-label="Ajustes globales"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
};
