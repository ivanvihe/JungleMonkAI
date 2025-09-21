import React, { useMemo } from 'react';
import './SidePanel.css';
import type { AgentDefinition } from '../../core/agents/agentRegistry';
import { useAgents } from '../../core/agents/AgentContext';
import type { AgentPresenceEntry } from '../../core/agents/presence';
import { useAgentPresence } from '../../core/agents/presence';

interface SidePanelProps {
  onOpenGlobalSettings: () => void;
  onOpenModelManager: () => void;
}

type ProviderId = 'openai' | 'anthropic' | 'groq' | 'jarvis';

type ProviderTone = 'online' | 'warning' | 'error';

interface ProviderCardState {
  id: ProviderId;
  label: string;
  modelLabel: string;
  statusLabel: string;
  tone: ProviderTone;
  description?: string;
  showManageModels?: boolean;
}

interface ProviderConfigEntry {
  id: ProviderId;
  label: string;
  kind: 'cloud' | 'local';
}

const PROVIDERS: ProviderConfigEntry[] = [
  { id: 'openai', label: 'OpenAI', kind: 'cloud' },
  { id: 'anthropic', label: 'Anthropic', kind: 'cloud' },
  { id: 'groq', label: 'Groq', kind: 'cloud' },
  { id: 'jarvis', label: 'Jarvis', kind: 'local' },
];

const mapPresenceStatus = (presence?: AgentPresenceEntry): Pick<ProviderCardState, 'tone' | 'statusLabel' | 'description'> => {
  if (!presence) {
    return {
      tone: 'warning',
      statusLabel: 'Comprobando',
      description: 'Verificando disponibilidad del proveedor.',
    };
  }

  switch (presence.status) {
    case 'online':
      return {
        tone: 'online',
        statusLabel: 'Operativo',
        description: presence.message ?? 'Proveedor operativo.',
      };
    case 'loading':
      return {
        tone: 'warning',
        statusLabel: 'Inicializando',
        description: presence.message ?? 'Inicializando proveedor.',
      };
    case 'offline':
      return {
        tone: 'warning',
        statusLabel: 'Sin respuesta',
        description: presence.message ?? 'El proveedor no responde en este momento.',
      };
    case 'error':
      return {
        tone: 'error',
        statusLabel: 'Error',
        description: presence.message ?? 'Revisa la configuración del proveedor.',
      };
    default:
      return {
        tone: 'warning',
        statusLabel: 'Comprobando',
        description: presence.message,
      };
  }
};

const buildCloudProviderState = (
  config: ProviderConfigEntry,
  agents: AgentDefinition[],
  presenceMap: Map<string, AgentPresenceEntry>,
): ProviderCardState => {
  if (!agents.length) {
    return {
      id: config.id,
      label: config.label,
      modelLabel: 'Sin modelo configurado',
      tone: 'error',
      statusLabel: 'Sin agente',
      description: 'Añade este proveedor desde los ajustes globales.',
    };
  }

  const activeAgent = agents.find(agent => agent.active) ?? agents[0];
  const modelLabel = activeAgent.name ?? activeAgent.model ?? 'Sin modelo configurado';

  if (!activeAgent.active) {
    return {
      id: config.id,
      label: config.label,
      modelLabel,
      tone: 'error',
      statusLabel: 'Desactivado',
      description: 'Activa el agente para utilizar este proveedor en las conversaciones.',
    };
  }

  if (activeAgent.status === 'Sin clave') {
    return {
      id: config.id,
      label: config.label,
      modelLabel,
      tone: 'error',
      statusLabel: 'Sin credenciales',
      description: 'Añade tu API key en los ajustes globales para activar este proveedor.',
    };
  }

  if (activeAgent.status === 'Cargando') {
    return {
      id: config.id,
      label: config.label,
      modelLabel,
      tone: 'warning',
      statusLabel: 'Inicializando',
      description: 'El proveedor está completando su arranque.',
    };
  }

  const presenceState = mapPresenceStatus(presenceMap.get(activeAgent.id));

  return {
    id: config.id,
    label: config.label,
    modelLabel,
    tone: presenceState.tone,
    statusLabel: presenceState.statusLabel,
    description:
      presenceState.tone === 'online'
        ? presenceState.description ?? 'Proveedor operativo.'
        : presenceState.description,
  };
};

const buildJarvisProviderState = (
  agents: AgentDefinition[],
  presenceMap: Map<string, AgentPresenceEntry>,
): ProviderCardState => {
  if (!agents.length) {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel: 'Sin modelo configurado',
      tone: 'error',
      statusLabel: 'Sin modelos',
      description: 'Instala un modelo local en el gestor para habilitar Jarvis.',
      showManageModels: true,
    };
  }

  const activeLocal = agents.find(agent => agent.active) ?? null;
  const fallback = activeLocal ?? agents[0];
  const modelLabel = fallback?.name ?? fallback?.model ?? 'Sin modelo configurado';

  if (!activeLocal) {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'warning',
      statusLabel: 'Sin modelo activo',
      description: 'Activa un modelo local desde el gestor para utilizar Jarvis.',
      showManageModels: true,
    };
  }

  if (activeLocal.status === 'Cargando') {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'warning',
      statusLabel: 'Inicializando',
      description: 'Jarvis está preparando el runtime local.',
      showManageModels: true,
    };
  }

  if (activeLocal.status === 'Inactivo') {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'warning',
      statusLabel: 'Runtime detenido',
      description: 'Inicia el runtime local para volver a usar Jarvis.',
      showManageModels: true,
    };
  }

  if (activeLocal.status !== 'Disponible') {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'error',
      statusLabel: activeLocal.status,
      description: 'Jarvis no está disponible. Revisa la configuración local.',
      showManageModels: true,
    };
  }

  const presenceState = mapPresenceStatus(presenceMap.get(activeLocal.id));

  return {
    id: 'jarvis',
    label: 'Jarvis',
    modelLabel,
    tone: presenceState.tone,
    statusLabel: presenceState.statusLabel,
    description:
      presenceState.tone === 'online'
        ? presenceState.description ?? 'Jarvis está listo para colaborar.'
        : presenceState.description ?? 'Revisa el runtime local si persisten los problemas.',
    showManageModels: presenceState.tone !== 'online',
  };
};

export const SidePanel: React.FC<SidePanelProps> = ({ onOpenGlobalSettings, onOpenModelManager }) => {
  const { agents } = useAgents();

  const apiKeys = useMemo(() => {
    const keys: Record<string, string> = {};
    agents.forEach(agent => {
      if (agent.kind === 'cloud' && agent.apiKey) {
        keys[agent.provider.toLowerCase()] = agent.apiKey;
      }
    });
    return keys;
  }, [agents]);

  const { presenceMap, refresh } = useAgentPresence(agents, apiKeys);

  const groupedAgents = useMemo(() => {
    const groups: Record<ProviderId, AgentDefinition[]> = {
      openai: [],
      anthropic: [],
      groq: [],
      jarvis: [],
    };

    agents.forEach(agent => {
      if (agent.kind === 'local') {
        groups.jarvis.push(agent);
        return;
      }

      const providerKey = agent.provider.toLowerCase();
      if (providerKey === 'openai') {
        groups.openai.push(agent);
      } else if (providerKey === 'anthropic') {
        groups.anthropic.push(agent);
      } else if (providerKey === 'groq') {
        groups.groq.push(agent);
      }
    });

    return groups;
  }, [agents]);

  const providerCards = useMemo<ProviderCardState[]>(
    () =>
      PROVIDERS.map(config =>
        config.kind === 'local'
          ? buildJarvisProviderState(groupedAgents[config.id], presenceMap)
          : buildCloudProviderState(config, groupedAgents[config.id], presenceMap),
      ),
    [groupedAgents, presenceMap],
  );

  return (
    <div className="sidebar">
      <section className="sidebar-section">
        <header>
          <h2>Estado de agentes</h2>
          <p>Monitoriza la disponibilidad de tus proveedores conectados y del runtime local.</p>
        </header>

        <ul className="provider-status-list">
          {providerCards.map(entry => (
            <li
              key={entry.id}
              className="provider-card"
              aria-label={`${entry.label}: ${entry.statusLabel} · ${entry.modelLabel}`}
              data-testid={`provider-card-${entry.id}`}
            >
              <div className="provider-card__header">
                <div className="provider-card__identity">
                  <span
                    className={`provider-led is-${entry.tone}`}
                    data-testid={`provider-led-${entry.id}`}
                    aria-hidden="true"
                  />
                  <div className="provider-card__identity-text">
                    <span className="provider-card__name">{entry.label}</span>
                    <span className="provider-card__model">{entry.modelLabel}</span>
                  </div>
                </div>
                <span className={`provider-card__state is-${entry.tone}`}>{entry.statusLabel}</span>
              </div>
              {entry.description && <p className="provider-card__description">{entry.description}</p>}
              {entry.showManageModels && (
                <div className="provider-card__actions">
                  <button type="button" onClick={onOpenModelManager}>
                    Gestionar modelos
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="sidebar-actions">
          <button type="button" onClick={() => void refresh()}>
            Actualizar estado
          </button>
          <button type="button" className="primary" onClick={onOpenGlobalSettings}>
            Gestionar credenciales
          </button>
        </div>
      </section>
    </div>
  );
};

export default SidePanel;
