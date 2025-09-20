import { ApiKeySettings } from '../../types/globalSettings';
import { isSupportedProvider } from '../../utils/globalSettings';

export type AgentKind = 'cloud' | 'local';

export type AgentStatus = 'Disponible' | 'Sin clave' | 'Cargando' | 'Inactivo';

export interface AgentDefinition {
  id: string;
  model: string;
  name: string;
  provider: string;
  description: string;
  kind: AgentKind;
  accent: string;
  active: boolean;
  status: AgentStatus;
  apiKey?: string;
}

export const INITIAL_AGENTS: AgentDefinition[] = [
  {
    id: 'openai-gpt-4o-mini',
    model: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    description: 'Modelo ligero ideal para brainstorming visual y prototipos rápidos.',
    kind: 'cloud',
    accent: '#8E8DFF',
    active: true,
    status: 'Disponible',
  },
  {
    id: 'anthropic-claude-35-sonnet',
    model: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Especialista en refinamiento, redacción y coherencia narrativa.',
    kind: 'cloud',
    accent: '#FFB347',
    active: true,
    status: 'Disponible',
  },
  {
    id: 'groq-llama3-70b',
    model: 'llama3-70b-8192',
    name: 'LLaMA3 70B',
    provider: 'Groq',
    description: 'Respuesta ultrarrápida para tareas analíticas y técnicas.',
    kind: 'cloud',
    accent: '#7FDBFF',
    active: true,
    status: 'Disponible',
  },
  {
    id: 'local-phi3',
    model: 'local-phi3',
    name: 'Phi-3 Mini',
    provider: 'Local',
    description: 'Modelo local optimizado para dispositivos ligeros.',
    kind: 'local',
    accent: '#4DD0E1',
    active: false,
    status: 'Inactivo',
  },
  {
    id: 'local-mistral',
    model: 'local-mistral',
    name: 'Mistral 7B',
    provider: 'Local',
    description: 'Gran equilibrio entre velocidad y creatividad en local.',
    kind: 'local',
    accent: '#FF8A65',
    active: false,
    status: 'Cargando',
  },
];

export const syncAgentWithApiKeys = (
  agent: AgentDefinition,
  apiKeys: ApiKeySettings,
  forceStatus = false,
): AgentDefinition => {
  if (agent.kind !== 'cloud') {
    return agent.apiKey ? { ...agent, apiKey: undefined } : agent;
  }

  const providerKey = agent.provider.toLowerCase();
  if (!isSupportedProvider(providerKey)) {
    return agent.apiKey ? { ...agent, apiKey: undefined } : agent;
  }

  const key = apiKeys[providerKey];
  const desiredStatus = forceStatus || agent.active ? (key ? 'Disponible' : 'Sin clave') : agent.status;

  if (agent.apiKey === key && agent.status === desiredStatus) {
    return agent;
  }

  return {
    ...agent,
    apiKey: key,
    status: desiredStatus,
  };
};

export const initializeAgents = (apiKeys: ApiKeySettings): AgentDefinition[] =>
  INITIAL_AGENTS.map(agent => syncAgentWithApiKeys({ ...agent }, apiKeys, true));
