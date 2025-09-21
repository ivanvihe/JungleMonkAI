import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentDefinition, AgentKind } from '../../core/agents/agentRegistry';
import { AgentPresenceSummary, AgentPresenceStatus } from '../../core/agents/presence';
import { ChatActorFilter } from '../../types/chat';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import { useProjects } from '../../core/projects/ProjectContext';
import { useJarvisCore, type JarvisRuntimeStatus } from '../../core/jarvis/JarvisCoreContext';

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
  onOpenModelManager: () => void;
  activeView: 'chat' | 'repo' | 'canvas';
  onChangeView: (view: 'chat' | 'repo' | 'canvas') => void;
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
  onOpenModelManager,
  activeView,
  onChangeView,
}) => {
  const hasPending = pendingResponses > 0;
  const overallStatus = resolveStatus(presenceSummary);
  const { projects, activeProjectId, activeProject, selectProject } = useProjects();
  const {
    runtimeStatus,
    ensureOnline,
    uptimeMs,
    lastError,
    lastHealthMessage,
  } = useJarvisCore();
  const [isEnsuring, setEnsuring] = useState(false);
  const activeAgentsMessage = useMemo(() => {
    const base = `${activeAgents} agente${activeAgents === 1 ? '' : 's'}`;
    return `${base} coordinando la conversación`;
  }, [activeAgents]);

  const handleEnsureJarvis = useCallback(async () => {
    setEnsuring(true);
    try {
      await ensureOnline();
    } finally {
      setEnsuring(false);
    }
  }, [ensureOnline]);

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

  const jarvisStatusLabels: Record<JarvisRuntimeStatus, string> = useMemo(
    () => ({
      offline: 'Jarvis Core desconectado',
      starting: 'Jarvis Core iniciando…',
      ready: 'Jarvis Core operativo',
      error: 'Jarvis Core con incidencias',
    }),
    [],
  );

  const jarvisTooltip = useMemo(() => {
    const base = jarvisStatusLabels[runtimeStatus];
    const detail = lastError ?? lastHealthMessage;
    if (!detail) {
      return base;
    }
    return `${base} · ${detail}`;
  }, [jarvisStatusLabels, runtimeStatus, lastError, lastHealthMessage]);

  const jarvisAriaLabel = useMemo(() => {
    const base = jarvisStatusLabels[runtimeStatus];
    if (!uptimeMs || uptimeMs <= 0) {
      return base;
    }
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const uptimeDescription =
      hours > 0
        ? `${hours} hora${hours === 1 ? '' : 's'} y ${minutes} minuto${minutes === 1 ? '' : 's'}`
        : `${minutes} minuto${minutes === 1 ? '' : 's'} y ${seconds} segundo${seconds === 1 ? '' : 's'}`;
    return `${base}. Tiempo en línea: ${uptimeDescription}`;
  }, [jarvisStatusLabels, runtimeStatus, uptimeMs]);

  const uptimeLabel = useMemo(() => {
    if (!uptimeMs || uptimeMs <= 0) {
      return null;
    }
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `↑ ${days}d ${hours.toString().padStart(2, '0')}h`;
    }
    if (hours > 0) {
      return `↑ ${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `↑ ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }, [uptimeMs]);

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
          <button
            type="button"
            className={activeView === 'canvas' ? 'is-active' : ''}
            onClick={() => onChangeView('canvas')}
            role="tab"
            aria-selected={activeView === 'canvas'}
            aria-label="Abrir canvas de código"
          >
            🧪
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
          <button
            type="button"
            className={`icon-button jarvis-runtime-button status-${runtimeStatus}${
              isEnsuring ? ' is-busy' : ''
            }`}
            onClick={handleEnsureJarvis}
            aria-label={jarvisAriaLabel}
            title={jarvisTooltip}
          >
            <span className="jarvis-runtime-icon" aria-hidden>
              🤖
            </span>
            <span className="jarvis-runtime-copy" aria-hidden>
              <span className="jarvis-runtime-status">{jarvisStatusLabels[runtimeStatus]}</span>
              {uptimeLabel && <span className="jarvis-runtime-uptime">{uptimeLabel}</span>}
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenModelManager}
            aria-label="Abrir gestor de modelos"
          >
            💾
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
