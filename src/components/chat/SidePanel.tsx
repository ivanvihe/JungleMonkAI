import React, { useMemo, useState, useEffect, useCallback } from 'react';
import './SidePanel.css';
import { useAgents } from '../../core/agents/AgentContext';
import { AgentPresenceEntry, AgentPresenceStatus } from '../../core/agents/presence';
import { useMessages } from '../../core/messages/MessageContext';
import { ApiKeySettings, ProjectProfile } from '../../types/globalSettings';
import { useLocalModels } from '../../hooks/useLocalModels';
import { getAgentDisplayName, getAgentVersionLabel } from '../../utils/agentDisplay';
import { useProjects, ProjectDraft } from '../../core/projects/ProjectContext';

interface ProviderSummary {
  id: string;
  label: string;
  status: AgentPresenceStatus;
  active: number;
  total: number;
  hasKey: boolean;
}

interface SuggestionItem {
  id: string;
  title: string;
  description: string;
  action?: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  groq: 'Groq',
};

const createDraftFromProject = (project?: ProjectProfile | null): ProjectDraft => ({
  id: project?.id,
  name: project?.name ?? '',
  repositoryPath: project?.repositoryPath ?? '',
  defaultBranch: project?.defaultBranch ?? '',
  instructions: project?.instructions ?? '',
  preferredProvider: project?.preferredProvider ?? '',
  preferredModel: project?.preferredModel ?? '',
});

interface SidePanelProps {
  apiKeys: ApiKeySettings;
  presenceMap: Map<string, AgentPresenceEntry>;
  onRefreshAgentPresence: (agentId?: string) => void | Promise<void>;
  onOpenGlobalSettings: () => void;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  apiKeys,
  presenceMap,
  onRefreshAgentPresence,
  onOpenGlobalSettings,
}) => {
  const { agents } = useAgents();
  const {
    messages,
    quickCommands,
    appendToDraft,
    pendingResponses,
    agentResponses,
    formatTimestamp,
  } = useMessages();
  const { models } = useLocalModels();
  const { projects, activeProject, selectProject, upsertProject, removeProject } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(activeProject?.id ?? 'new');
  const [projectForm, setProjectForm] = useState<ProjectDraft>(() => createDraftFromProject(activeProject));
  const [formError, setFormError] = useState<string | null>(null);

  const configuredProviders = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(apiKeys).forEach(([key, value]) => {
      if (typeof value !== 'string') {
        if (value) {
          map.set(key.trim().toLowerCase(), String(value));
        }
        return;
      }
      const trimmed = value.trim();
      if (trimmed) {
        map.set(key.trim().toLowerCase(), trimmed);
      }
    });
    return map;
  }, [apiKeys]);

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId('new');
      setProjectForm(createDraftFromProject());
      return;
    }

    if (!activeProject) {
      if (!projects.some(project => project.id === selectedProjectId)) {
        const [first] = projects;
        if (first) {
          setSelectedProjectId(first.id);
          setProjectForm(createDraftFromProject(first));
          setFormError(null);
        }
      }
      return;
    }

    if (selectedProjectId === 'new' || selectedProjectId === activeProject.id) {
      setSelectedProjectId(activeProject.id);
      setProjectForm(createDraftFromProject(activeProject));
      setFormError(null);
      return;
    }

    if (!projects.some(project => project.id === selectedProjectId)) {
      setSelectedProjectId(activeProject.id);
      setProjectForm(createDraftFromProject(activeProject));
      setFormError(null);
    }
  }, [activeProject, projects, selectedProjectId]);

  const handleProjectSelectChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setFormError(null);
      if (value === 'new') {
        setSelectedProjectId('new');
        setProjectForm(createDraftFromProject());
        return;
      }

      setSelectedProjectId(value);
      const match = projects.find(project => project.id === value) ?? null;
      setProjectForm(createDraftFromProject(match));
    },
    [projects],
  );

  const updateFormField = useCallback(
    (field: keyof ProjectDraft) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { value } = event.target;
        setProjectForm(prev => ({ ...prev, [field]: value }));
        setFormError(null);
      },
    [],
  );

  const handleSaveProject = useCallback(() => {
    if (!projectForm.name?.trim() || !projectForm.repositoryPath?.trim()) {
      setFormError('Indica al menos nombre y ruta del repositorio.');
      return;
    }

    try {
      const saved = upsertProject(projectForm, { activate: selectedProjectId === 'new' });
      setSelectedProjectId(saved.id);
      setProjectForm(createDraftFromProject(saved));
      setFormError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el proyecto.';
      setFormError(message);
    }
  }, [projectForm, selectedProjectId, upsertProject]);

  const handleActivateProject = useCallback(() => {
    if (selectedProjectId === 'new') {
      return;
    }
    selectProject(selectedProjectId);
    setFormError(null);
  }, [selectProject, selectedProjectId]);

  const handleDeleteProject = useCallback(() => {
    if (selectedProjectId === 'new') {
      setProjectForm(createDraftFromProject());
      setFormError(null);
      return;
    }

    removeProject(selectedProjectId);
    setSelectedProjectId('new');
    setProjectForm(createDraftFromProject());
    setFormError(null);
  }, [removeProject, selectedProjectId]);

  const providerSummaries = useMemo<ProviderSummary[]>(() => {
    const grouped = new Map<
      string,
      ProviderSummary & { statusCounts: Record<AgentPresenceStatus, number> }
    >();

    agents
      .filter(agent => agent.kind === 'cloud')
      .forEach(agent => {
        const providerKey = (agent.provider || agent.channel || agent.id).toLowerCase();
        const providerValue = configuredProviders.get(providerKey);
        if (!providerValue) {
          return;
        }
        const providerId = providerKey;
        const summary = grouped.get(providerId) ?? {
          id: providerId,
          label: PROVIDER_LABELS[providerId] ?? providerId.toUpperCase(),
          status: 'offline' as AgentPresenceStatus,
          active: 0,
          total: 0,
          hasKey: Boolean(providerValue),
          statusCounts: {
            online: 0,
            offline: 0,
            loading: 0,
            error: 0,
          } as Record<AgentPresenceStatus, number>,
        };

        const presence = presenceMap.get(agent.id);
        const status = presence?.status ?? (agent.active ? 'loading' : 'offline');
        summary.total += 1;
        summary.active += agent.active ? 1 : 0;
        summary.statusCounts[status] += 1;
        summary.hasKey = summary.hasKey || Boolean(providerValue);
        grouped.set(providerId, summary);
      });

    return Array.from(grouped.values())
      .map(entry => {
        const status: AgentPresenceStatus =
          entry.statusCounts.error > 0
            ? 'error'
            : entry.statusCounts.online > 0
            ? 'online'
            : entry.statusCounts.loading > 0
            ? 'loading'
            : 'offline';

        return {
          id: entry.id,
          label: entry.label,
          status,
          active: entry.active,
          total: entry.total,
          hasKey: entry.hasKey,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [agents, apiKeys, configuredProviders, presenceMap]);

  const activeModel = useMemo(() => models.find(model => model.active), [models]);

  const messageStats = useMemo(
    () => {
      const userCount = messages.filter(message => message.author === 'user').length;
      const agentCount = messages.filter(message => message.author === 'agent').length;
      const systemCount = messages.filter(message => message.author === 'system').length;

      return [
        { label: 'Mensajes usuario', value: userCount },
        { label: 'Mensajes agentes', value: agentCount },
        { label: 'Mensajes sistema', value: systemCount },
        { label: 'Pendientes', value: pendingResponses },
      ];
    },
    [messages, pendingResponses],
  );

  const latestAgentResponse = agentResponses.length ? agentResponses[agentResponses.length - 1] : null;
  const latestAgentSummary = latestAgentResponse
    ? (() => {
        const agent = latestAgentResponse.agentId
          ? agents.find(candidate => candidate.id === latestAgentResponse.agentId)
          : undefined;
        if (!agent) {
          return null;
        }
        return {
          name: getAgentDisplayName(agent),
          variant: agent.kind === 'local' ? getAgentVersionLabel(agent) : agent.provider,
          timestamp: formatTimestamp(latestAgentResponse.timestamp),
        };
      })()
    : null;

  const suggestions = useMemo<SuggestionItem[]>(() => {
    const items: SuggestionItem[] = [];

    if (pendingResponses > 0) {
      items.push({
        id: 'pending',
        title: 'Revisar respuestas pendientes',
        description: 'Hay agentes pensando todavía, actualiza su estado.',
        action: () => void onRefreshAgentPresence(),
      });
    }

    if (!activeModel) {
      items.push({
        id: 'local-model',
        title: 'Activa un modelo local',
        description: 'Jarvis está inactivo, gestiona los modelos en los ajustes globales.',
        action: onOpenGlobalSettings,
      });
    }

    if (latestAgentSummary) {
      items.push({
        id: 'latest-agent',
        title: `Última respuesta de ${latestAgentSummary.name}`,
        description: `${latestAgentSummary.variant ?? ''} · ${latestAgentSummary.timestamp}`.trim(),
      });
    }

    if (!items.length) {
      items.push({
        id: 'start',
        title: 'Lanza una nueva instrucción',
        description: 'Combina @menciones para coordinar varios agentes en la misma orden.',
      });
    }

    return items.slice(0, 3);
  }, [activeModel, latestAgentSummary, onOpenGlobalSettings, onRefreshAgentPresence, pendingResponses]);

  return (
    <div className="sidebar">
      <section className="sidebar-section">
        <header>
          <h2>Proyectos</h2>
          <p>Configura repositorios y preferencias activas.</p>
        </header>
        <div className="project-manager">
          <label htmlFor="project-selector">Proyecto</label>
          <select
            id="project-selector"
            value={selectedProjectId}
            onChange={handleProjectSelectChange}
          >
            <option value="new">Nuevo proyecto…</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <label htmlFor="project-name">Nombre</label>
          <input
            id="project-name"
            type="text"
            value={projectForm.name ?? ''}
            onChange={updateFormField('name')}
            placeholder="Nombre descriptivo"
          />

          <label htmlFor="project-path">Repositorio</label>
          <input
            id="project-path"
            type="text"
            value={projectForm.repositoryPath ?? ''}
            onChange={updateFormField('repositoryPath')}
            placeholder="/ruta/al/repositorio"
          />

          <label htmlFor="project-branch">Rama por defecto</label>
          <input
            id="project-branch"
            type="text"
            value={projectForm.defaultBranch ?? ''}
            onChange={updateFormField('defaultBranch')}
            placeholder="main"
          />

          <label htmlFor="project-provider">Proveedor preferido</label>
          <input
            id="project-provider"
            type="text"
            value={projectForm.preferredProvider ?? ''}
            onChange={updateFormField('preferredProvider')}
            placeholder="openai"
          />

          <label htmlFor="project-model">Modelo preferido</label>
          <input
            id="project-model"
            type="text"
            value={projectForm.preferredModel ?? ''}
            onChange={updateFormField('preferredModel')}
            placeholder="gpt-4"
          />

          <label htmlFor="project-instructions">Instrucciones fijas</label>
          <textarea
            id="project-instructions"
            value={projectForm.instructions ?? ''}
            onChange={updateFormField('instructions')}
            placeholder="Notas clave para este repositorio"
            rows={3}
          />

          {formError && <p className="project-error">{formError}</p>}

          <div className="project-actions">
            <button type="button" onClick={handleSaveProject}>
              Guardar
            </button>
            <button
              type="button"
              onClick={handleActivateProject}
              disabled={selectedProjectId === 'new' || activeProject?.id === selectedProjectId}
            >
              Activar
            </button>
            <button
              type="button"
              className="danger"
              onClick={handleDeleteProject}
              disabled={selectedProjectId === 'new'}
            >
              Eliminar
            </button>
          </div>
        </div>
      </section>

      <section className="sidebar-section">
        <header>
          <h2>Proveedores</h2>
          <p>Resumen rápido del estado de conexión.</p>
        </header>
        <div className="provider-grid">
          {providerSummaries.map(provider => (
            <article key={provider.id} className={`provider-card status-${provider.status}`}>
              <header>
                <span className="provider-name">{provider.label}</span>
                <span className="provider-status">{provider.status}</span>
              </header>
              <div className="provider-body">
                <span>{provider.active} activos de {provider.total}</span>
                <span>{provider.hasKey ? 'API key configurada' : 'Configura la API key'}</span>
              </div>
            </article>
          ))}
        </div>
        <div className="local-model-card">
          <div>
            <h3>Modelo local</h3>
            <p>{activeModel ? `${activeModel.name} listo para usar` : 'Ningún modelo activo'}</p>
          </div>
          <button type="button" onClick={onOpenGlobalSettings}>
            Gestionar
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <header>
          <h2>Estadísticas</h2>
          <p>Actividad en la sesión actual.</p>
        </header>
        <ul className="sidebar-stats">
          {messageStats.map(stat => (
            <li key={stat.label}>
              <span className="stat-label">{stat.label}</span>
              <span className="stat-value">{stat.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sidebar-section">
        <header>
          <h2>Sugerencias</h2>
          <p>Acciones rápidas según la actividad.</p>
        </header>
        <ul className="suggestion-list">
          {suggestions.map(item => (
            <li key={item.id}>
              <button type="button" onClick={item.action} disabled={!item.action}>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="sidebar-section">
        <header>
          <h2>Comandos rápidos</h2>
          <p>Inserta instrucciones guardadas en el chat.</p>
        </header>
        <div className="command-list">
          {quickCommands.length === 0 && <p className="command-empty">No tienes comandos guardados.</p>}
          {quickCommands.map(command => (
            <button key={command} type="button" onClick={() => appendToDraft(command)}>
              {command}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SidePanel;
