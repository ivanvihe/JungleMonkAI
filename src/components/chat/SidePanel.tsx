import React, { useMemo } from 'react';
import './SidePanel.css';
import { useAgents } from '../../core/agents/AgentContext';
import { AgentPresenceEntry, AgentPresenceStatus } from '../../core/agents/presence';
import { useMessages } from '../../core/messages/MessageContext';
import { ApiKeySettings } from '../../types/globalSettings';
import { useLocalModels } from '../../hooks/useLocalModels';
import { getAgentDisplayName, getAgentVersionLabel } from '../../utils/agentDisplay';

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

  const providerSummaries = useMemo<ProviderSummary[]>(() => {
    const grouped = new Map<
      string,
      ProviderSummary & { statusCounts: Record<AgentPresenceStatus, number> }
    >();

    agents
      .filter(agent => agent.kind === 'cloud')
      .forEach(agent => {
        const providerId = agent.provider || agent.channel || agent.id;
        const summary = grouped.get(providerId) ?? {
          id: providerId,
          label: PROVIDER_LABELS[providerId] ?? providerId.toUpperCase(),
          status: 'offline' as AgentPresenceStatus,
          active: 0,
          total: 0,
          hasKey: Boolean(apiKeys[providerId]),
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
        summary.hasKey = summary.hasKey || Boolean(apiKeys[providerId]);
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
  }, [agents, apiKeys, presenceMap]);

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
