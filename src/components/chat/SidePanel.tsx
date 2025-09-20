import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgents } from '../../core/agents/AgentContext';
import { AgentPresenceEntry, AgentPresenceStatus } from '../../core/agents/presence';
import { useMessages } from '../../core/messages/MessageContext';
import { ApiKeySettings } from '../../types/globalSettings';
import { ModelGallery } from '../models/ModelGallery';
import { AgentPresenceList } from '../agents/AgentPresenceList';
import { ChatMessage } from '../../core/messages/messageTypes';
import { QualityDashboard } from '../quality/QualityDashboard';
import { AgentConversationPanel } from '../orchestration/AgentConversationPanel';
import { providerSecretExists, storeProviderSecret } from '../../utils/secrets';
import {
  getAgentChannelLabel,
  getAgentDisplayName,
  getAgentVersionLabel,
} from '../../utils/agentDisplay';

interface SidePanelProps {
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: string, value: string) => void;
  presenceMap: Map<string, AgentPresenceEntry>;
  onRefreshAgentPresence: (agentId?: string) => void | Promise<void>;
}

const CHANNEL_STATUS_LABELS: Record<AgentPresenceStatus, string> = {
  online: 'Operativo',
  offline: 'En espera',
  error: 'Con incidencias',
  loading: 'Verificando…',
};

const getChannelStatusClass = (status: AgentPresenceStatus): string => {
  switch (status) {
    case 'online':
      return 'is-online';
    case 'error':
      return 'is-error';
    case 'loading':
      return 'is-loading';
    default:
      return 'is-offline';
  }
};

interface ChannelStatusView {
  key: string;
  label: string;
  version: string;
  status: AgentPresenceStatus;
  accent: string;
  message?: string;
  active: boolean;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  apiKeys,
  onApiKeyChange,
  presenceMap,
  onRefreshAgentPresence,
}) => {
  const [githubInput, setGithubInput] = useState('');
  const [gitlabInput, setGitlabInput] = useState('');
  const [githubStored, setGithubStored] = useState(false);
  const [gitlabStored, setGitlabStored] = useState(false);

  const { agents, agentMap, toggleAgent, assignAgentRole } = useAgents();
  const {
    quickCommands,
    appendToDraft,
    messages,
    pendingResponses,
    agentResponses,
    formatTimestamp,
    toPlainText,
    feedbackByMessage,
    markMessageFeedback,
    submitCorrection,
    correctionHistory,
    coordinationStrategy,
    setCoordinationStrategy,
    sharedSnapshot,
    orchestrationTraces,
  } = useMessages();

  const recentActivity = useMemo(
    () => agentResponses.slice(-6).reverse().map(message => ({ message, agent: message.agentId ? agentMap.get(message.agentId) : undefined })),
    [agentMap, agentResponses],
  );

  const handleMarkIncorrect = useCallback(
    (message: ChatMessage) => {
      const currentFeedback = feedbackByMessage[message.id];

      if (currentFeedback?.hasError) {
        const shouldClear = window.confirm('La respuesta ya está marcada como incorrecta. ¿Quieres retirar la marca?');
        if (shouldClear) {
          markMessageFeedback(message.id, { hasError: false });
        }
        return;
      }

      const reason = window.prompt('Describe el problema detectado en la respuesta', currentFeedback?.notes ?? '');
      if (reason === null) {
        return;
      }

      const tagsInput = window.prompt(
        'Asigna etiquetas de seguimiento (separadas por comas)',
        currentFeedback?.tags?.join(', ') ?? '',
      );
      const tags = tagsInput !== null ? tagsInput.split(',').map(tag => tag.trim()).filter(Boolean) : currentFeedback?.tags;

      markMessageFeedback(message.id, {
        hasError: true,
        notes: reason.trim() ? reason.trim() : undefined,
        tags,
      });
    },
    [feedbackByMessage, markMessageFeedback],
  );

  const handleEditAndResend = useCallback(
    (message: ChatMessage) => {
      const plain = toPlainText(message.content);
      const proposal = window.prompt('Edita la respuesta antes de reenviarla al agente o revisor', plain);
      if (proposal === null) {
        return;
      }

      const trimmedProposal = proposal.trim();
      if (!trimmedProposal) {
        alert('La corrección no puede estar vacía.');
        return;
      }

      const currentFeedback = feedbackByMessage[message.id];
      const notes = window.prompt('Notas adicionales para contextualizar la corrección', currentFeedback?.notes ?? '') ?? '';
      const tagsInput = window.prompt(
        'Etiquetas asociadas (separadas por comas)',
        currentFeedback?.tags?.join(', ') ?? '',
      );
      const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(Boolean) : currentFeedback?.tags;

      void submitCorrection(message.id, trimmedProposal, notes.trim() ? notes.trim() : undefined, tags);
    },
    [feedbackByMessage, submitCorrection, toPlainText],
  );

  useEffect(() => {
    void providerSecretExists('github').then(setGithubStored).catch(() => setGithubStored(false));
    void providerSecretExists('gitlab').then(setGitlabStored).catch(() => setGitlabStored(false));
  }, []);

  const handleSecureKeySave = useCallback(
    async (provider: 'github' | 'gitlab', value: string) => {
      const trimmed = value.trim();
      await storeProviderSecret(provider, trimmed);
      onApiKeyChange(provider, trimmed ? '__secure__' : '');
      if (provider === 'github') {
        setGithubStored(Boolean(trimmed));
        setGithubInput('');
      } else {
        setGitlabStored(Boolean(trimmed));
        setGitlabInput('');
      }
    },
    [onApiKeyChange],
  );

  const channelStatuses = useMemo<ChannelStatusView[]>(() => {
    const entries: ChannelStatusView[] = [];
    const baseChannels: Array<{ id: string; fallback: string }> = [
      { id: 'claude', fallback: 'Claude' },
      { id: 'gpt', fallback: 'GPT' },
      { id: 'groq', fallback: 'Groq' },
    ];

    baseChannels.forEach(({ id, fallback }) => {
      const agent = agents.find(candidate => candidate.channel === id);
      if (!agent) {
        entries.push({
          key: id,
          label: fallback,
          version: 'No disponible',
          status: 'offline',
          accent: 'rgba(255, 255, 255, 0.35)',
          message: 'Activa el agente en la consola.',
          active: false,
        });
        return;
      }

      const presenceEntry = presenceMap.get(agent.id);
      entries.push({
        key: id,
        label: getAgentChannelLabel(agent),
        version: getAgentVersionLabel(agent),
        status: presenceEntry?.status ?? (agent.active ? 'loading' : 'offline'),
        accent: agent.accent,
        message: presenceEntry?.message,
        active: agent.active,
      });
    });

    const localAgents = agents.filter(agent => agent.kind === 'local');
    const activeLocal = localAgents.find(agent => agent.active) ?? localAgents[0];
    const localPresence = activeLocal ? presenceMap.get(activeLocal.id) : undefined;
    const localStatus: AgentPresenceStatus = localPresence?.status
      ?? (activeLocal ? (activeLocal.status === 'Cargando' ? 'loading' : 'offline') : 'offline');

    entries.push({
      key: 'jarvis',
      label: 'Jarvis',
      version: activeLocal ? getAgentVersionLabel(activeLocal) : 'Sin modelo activo',
      status: localStatus,
      accent: activeLocal?.accent ?? '#4DD0E1',
      message: activeLocal ? localPresence?.message : 'Carga un modelo local para habilitar Jarvis.',
      active: Boolean(activeLocal?.active),
    });

    return entries;
  }, [agents, presenceMap]);

  const usageStats = useMemo(
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

  const dataStats = useMemo(
    () => {
      const configuredProviders = (['openai', 'anthropic', 'groq'] as Array<keyof ApiKeySettings>).filter(
        provider => Boolean(apiKeys[provider]),
      );
      const secureTokens = (githubStored ? 1 : 0) + (gitlabStored ? 1 : 0);

      return [
        { label: 'API keys activas', value: configuredProviders.length },
        { label: 'Tokens seguros', value: secureTokens },
        { label: 'Correcciones', value: correctionHistory.length },
        { label: 'Comandos rápidos', value: quickCommands.length },
      ];
    },
    [apiKeys, correctionHistory, githubStored, gitlabStored, quickCommands],
  );

  return (
    <aside className="controls-panel">
      <div className="controls-panel-content">
        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Canales conectados</h2>
            <p>Estado en tiempo real de tus proveedores.</p>
          </header>
          <ul className="channel-status-list">
            {channelStatuses.map(entry => (
              <li key={entry.key} className={`channel-status-item ${entry.active ? 'is-active' : 'is-idle'}`}>
                <span
                  className={`channel-status-led ${getChannelStatusClass(entry.status)}`}
                  style={{ background: entry.accent, color: entry.accent }}
                  aria-hidden
                />
                <div className="channel-status-body">
                  <div className="channel-status-text">
                    <span className="channel-status-name">{entry.label}</span>
                    {entry.version && <em className="channel-status-version">{entry.version}</em>}
                  </div>
                  <span className="channel-status-state">{CHANNEL_STATUS_LABELS[entry.status]}</span>
                  {entry.message && <span className="channel-status-hint">{entry.message}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Estadísticas de uso</h2>
            <p>Actividad general de esta sesión.</p>
          </header>
          <ul className="sidebar-metrics">
            {usageStats.map(stat => (
              <li key={stat.label}>
                <span className="sidebar-metric-label">{stat.label}</span>
                <span className="sidebar-metric-value">{stat.value}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Datos guardados</h2>
            <p>Resumen del contenido almacenado en local.</p>
          </header>
          <ul className="sidebar-metrics">
            {dataStats.map(stat => (
              <li key={stat.label}>
                <span className="sidebar-metric-label">{stat.label}</span>
                <span className="sidebar-metric-value">{stat.value}</span>
              </li>
            ))}
          </ul>
        </section>

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
        <div className="key-field">
          <label htmlFor="github-key">
            GitHub
            {githubStored ? <span className="badge">guardado</span> : null}
          </label>
          <div className="secure-key-input">
            <input
              id="github-key"
              type="password"
              value={githubInput}
              onChange={event => setGithubInput(event.target.value)}
              placeholder={githubStored ? 'token almacenado' : 'ghp_...'}
            />
            <button
              type="button"
              onClick={() => void handleSecureKeySave('github', githubInput)}
              disabled={!githubInput.trim() && !githubStored}
            >
              {githubInput.trim() || !githubStored ? 'Guardar' : 'Eliminar'}
            </button>
          </div>
        </div>
        <div className="key-field">
          <label htmlFor="gitlab-key">
            GitLab
            {gitlabStored ? <span className="badge">guardado</span> : null}
          </label>
          <div className="secure-key-input">
            <input
              id="gitlab-key"
              type="password"
              value={gitlabInput}
              onChange={event => setGitlabInput(event.target.value)}
              placeholder={gitlabStored ? 'token almacenado' : 'glpat-...'}
            />
            <button
              type="button"
              onClick={() => void handleSecureKeySave('gitlab', gitlabInput)}
              disabled={!gitlabInput.trim() && !gitlabStored}
            >
              {gitlabInput.trim() || !gitlabStored ? 'Guardar' : 'Eliminar'}
            </button>
          </div>
        </div>
      </section>

        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Modelos activos</h2>
            <p>Activa y desactiva agentes al instante.</p>
          </header>
          <AgentPresenceList
            agents={agents}
            presence={presenceMap}
            onToggleAgent={toggleAgent}
            onUpdateRole={assignAgentRole}
            onOpenConsole={agentId =>
              console.log(`Abrir consola interactiva para el agente ${agentId}`)
            }
            onRefreshAgent={agentId => onRefreshAgentPresence(agentId)}
          />
        </section>

        <section className="panel-section">
          <ModelGallery />
        </section>

        <section className="panel-section">
          <header className="panel-section-header">
            <h2>Conversa entre agentes</h2>
            <p>Visualiza cómo coordinan los modelos antes de responder.</p>
          </header>
          <AgentConversationPanel
            traces={orchestrationTraces}
            sharedSnapshot={sharedSnapshot}
            agents={agents}
            currentStrategy={coordinationStrategy}
            onChangeStrategy={setCoordinationStrategy}
          />
        </section>

        <QualityDashboard />

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

              const displayName = getAgentDisplayName(agent);
              const variantLabel = agent.kind === 'local' ? getAgentVersionLabel(agent) : undefined;

              return (
                <li key={message.id} className="activity-item">
                  <span className="activity-dot" style={{ background: agent.accent }} />
                  <div className="activity-content">
                    <div className="activity-title">
                      <strong>{displayName}</strong>
                      {variantLabel && <span className="activity-variant">{variantLabel}</span>}
                      <span>{formatTimestamp(message.timestamp)}</span>
                      {feedbackByMessage[message.id]?.hasError && (
                        <span className="activity-flag">Revisión pendiente</span>
                      )}
                    </div>
                    <p>{preview}</p>
                    {feedbackByMessage[message.id]?.notes && (
                      <p className="activity-note">{feedbackByMessage[message.id]?.notes}</p>
                    )}
                    <div className="activity-actions">
                      <button type="button" className="activity-action" onClick={() => handleMarkIncorrect(message)}>
                        {feedbackByMessage[message.id]?.hasError ? 'Desmarcar error' : 'Marcar como incorrecto'}
                      </button>
                      <button type="button" className="activity-action" onClick={() => handleEditAndResend(message)}>
                        Editar y reenviar
                      </button>
                    </div>
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
