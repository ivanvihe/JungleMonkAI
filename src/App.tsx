import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import './AppLayout.css';
import './components/chat/ChatInterface.css';
import { ChatTopBar } from './components/chat/ChatTopBar';
import { ChatStatusBar } from './components/chat/ChatStatusBar';
import { ApiKeySettings, GlobalSettings, SupportedProvider } from './types/globalSettings';
import { DEFAULT_GLOBAL_SETTINGS, isSupportedProvider, loadGlobalSettings, saveGlobalSettings } from './utils/globalSettings';
import { callAnthropicChat, callGroqChat, callOpenAIChat } from './utils/aiProviders';

type AgentKind = 'cloud' | 'local';

type AgentStatus = 'Disponible' | 'Sin clave' | 'Cargando' | 'Inactivo';

type AgentDefinition = {
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
};

type ChatAuthor = 'system' | 'user' | 'agent';

type ChatMessage = {
  id: string;
  author: ChatAuthor;
  content: string;
  timestamp: string;
  agentId?: string;
  status?: 'pending' | 'sent';
  sourcePrompt?: string;
};

const INITIAL_AGENTS: AgentDefinition[] = [
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

const AGENT_SYSTEM_PROMPT =
  'Actúas como parte de un colectivo de agentes creativos. Responde de forma concisa, en español cuando sea posible, y especifica los supuestos importantes que utilices al contestar.';

const syncAgentWithApiKeys = (
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

const initializeAgents = (apiKeys: ApiKeySettings): AgentDefinition[] =>
  INITIAL_AGENTS.map(agent => syncAgentWithApiKeys({ ...agent }, apiKeys, true));

const QUICK_COMMANDS: string[] = [
  'gpt, analiza este briefing y propón un storyboard.',
  'claude, revisa el copy y hazlo más humano.',
  'groq, genera casos de prueba para esta API.',
  'equipo, proponed variantes de UI para el panel lateral.',
];

const formatTime = (isoString: string): string => {
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const buildMessageId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const mockAgentReply = (agent: AgentDefinition, prompt?: string): string => {
  const safePrompt = prompt?.replace(/\s+/g, ' ').trim() ?? '';
  const truncatedPrompt = safePrompt.length > 120 ? `${safePrompt.slice(0, 117)}…` : safePrompt;

  if (agent.provider === 'OpenAI') {
    return `He generado una propuesta inicial basándome en «${truncatedPrompt || 'la última instrucción'}». Puedo preparar estilos CSS y componentes listos para copiar.`;
  }

  if (agent.provider === 'Anthropic') {
    return `He revisado la entrega de los otros modelos y propongo mejoras editoriales y de tono para «${truncatedPrompt || 'el contexto actual'}».`;
  }

  if (agent.provider === 'Groq') {
    return `Aquí tienes un desglose técnico rápido y una lista de validaciones clave a partir de «${truncatedPrompt || 'tu solicitud'}».`;
  }

  if (agent.kind === 'local') {
    return `El modelo local ${agent.name} sugiere una variante optimizada trabajando con «${truncatedPrompt || 'los parámetros indicados'}».`;
  }

  return `Respuesta generada por ${agent.name}.`;
};

const App: React.FC = () => {
  const initialSettingsRef = useRef<GlobalSettings | null>(null);
  if (!initialSettingsRef.current) {
    initialSettingsRef.current = loadGlobalSettings();
  }

  const resolvedInitialSettings = initialSettingsRef.current ?? DEFAULT_GLOBAL_SETTINGS;

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(resolvedInitialSettings);
  const [agents, setAgents] = useState<AgentDefinition[]>(() =>
    initializeAgents(resolvedInitialSettings.apiKeys),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: buildMessageId('system'),
      author: 'system',
      content: 'Bienvenido a JungleMonk.AI Control Hub. Activa tus modelos y coordina la conversación multimodal desde un solo lugar.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [draft, setDraft] = useState('');
  const scheduledResponsesRef = useRef<Set<string>>(new Set());
  const { apiKeys } = globalSettings;

  useEffect(() => {
    saveGlobalSettings(globalSettings);
  }, [globalSettings]);

  useEffect(() => {
    setAgents(prev => {
      let changed = false;
      const updatedAgents = prev.map(agent => {
        const updated = syncAgentWithApiKeys(agent, apiKeys);
        if (updated !== agent) {
          changed = true;
        }
        return updated;
      });

      return changed ? updatedAgents : prev;
    });
  }, [apiKeys]);

  const fetchAgentReply = useCallback(
    async (agent: AgentDefinition, prompt: string): Promise<string> => {
      const providerKey = agent.provider.toLowerCase();
      if (agent.kind !== 'cloud' || !isSupportedProvider(providerKey)) {
        return mockAgentReply(agent, prompt);
      }

      const apiKey = apiKeys[providerKey];
      if (!apiKey) {
        return `${agent.name} no tiene una API key configurada. Abre los ajustes globales para habilitar sus respuestas.`;
      }

      const sanitizedPrompt = prompt.trim();
      if (!sanitizedPrompt) {
        return 'Necesito un prompt válido para generar una respuesta.';
      }

      try {
        if (providerKey === 'openai') {
          return await callOpenAIChat({
            apiKey,
            model: agent.model,
            prompt: sanitizedPrompt,
            systemPrompt: AGENT_SYSTEM_PROMPT,
          });
        }

        if (providerKey === 'anthropic') {
          return await callAnthropicChat({
            apiKey,
            model: agent.model,
            prompt: sanitizedPrompt,
            systemPrompt: AGENT_SYSTEM_PROMPT,
          });
        }

        if (providerKey === 'groq') {
          return await callGroqChat({
            apiKey,
            model: agent.model,
            prompt: sanitizedPrompt,
            systemPrompt: AGENT_SYSTEM_PROMPT,
          });
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('Error desconocido al contactar con el proveedor.');
      }

      return mockAgentReply(agent, prompt);
    },
    [apiKeys],
  );

  const activeAgents = useMemo(() => agents.filter(agent => agent.active), [agents]);
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentDefinition>();
    agents.forEach(agent => map.set(agent.id, agent));
    return map;
  }, [agents]);

  const pendingResponses = useMemo(
    () => messages.filter(message => message.author === 'agent' && message.status === 'pending').length,
    [messages],
  );

  useEffect(() => {
    const cancelers: Array<() => void> = [];

    messages
      .filter(
        message =>
          message.author === 'agent' &&
          message.status === 'pending' &&
          !scheduledResponsesRef.current.has(message.id),
      )
      .forEach(message => {
        const agent = message.agentId ? agentMap.get(message.agentId) : undefined;
        if (!agent) {
          return;
        }

        scheduledResponsesRef.current.add(message.id);

        let cancelled = false;
        const cancel = () => {
          cancelled = true;
          scheduledResponsesRef.current.delete(message.id);
        };

        cancelers.push(cancel);

        const resolveAgentReply = async () => {
          try {
            let content: string;
            if (agent.kind === 'cloud') {
              content = await fetchAgentReply(agent, message.sourcePrompt ?? message.content);
            } else {
              content = await new Promise<string>(resolve => {
                const delay = 700 + Math.random() * 1200;
                setTimeout(() => resolve(mockAgentReply(agent, message.sourcePrompt)), delay);
              });
            }

            if (cancelled) {
              return;
            }

            const normalizedContent = content?.trim().length
              ? content
              : `${agent.name} no devolvió contenido.`;

            setMessages(prev =>
              prev.map(item =>
                item.id === message.id
                  ? {
                      ...item,
                      status: 'sent',
                      content: normalizedContent,
                    }
                  : item,
              ),
            );
          } catch (error) {
            if (cancelled) {
              return;
            }

            const fallbackMessage =
              agent.kind === 'cloud'
                ? `${agent.name} no pudo generar una respuesta (${error instanceof Error ? error.message : 'error inesperado'}).`
                : mockAgentReply(agent, message.sourcePrompt);

            setMessages(prev =>
              prev.map(item =>
                item.id === message.id
                  ? {
                      ...item,
                      status: 'sent',
                      content: fallbackMessage,
                    }
                  : item,
              ),
            );
          } finally {
            if (!cancelled) {
              scheduledResponsesRef.current.delete(message.id);
            }
          }
        };

        resolveAgentReply();
      });

    return () => {
      cancelers.forEach(cancel => cancel());
    };
  }, [messages, agentMap, fetchAgentReply]);

  const handleToggleAgent = (agentId: string) => {
    setAgents(prev =>
      prev.map(agent => {
        if (agent.id !== agentId) {
          return agent;
        }

        const willBeActive = !agent.active;

        if (agent.kind === 'cloud') {
          const providerKey = agent.provider.toLowerCase();
          let nextStatus = agent.status;
          if (willBeActive && isSupportedProvider(providerKey)) {
            nextStatus = apiKeys[providerKey] ? 'Disponible' : 'Sin clave';
          } else if (!willBeActive) {
            nextStatus = 'Inactivo';
          }

          return {
            ...agent,
            active: willBeActive,
            status: nextStatus,
          };
        }

        return {
          ...agent,
          active: willBeActive,
          status: willBeActive ? 'Disponible' : agent.status,
        };
      }),
    );
  };

  const handleApiKeyChange = (provider: SupportedProvider, value: string) => {
    setGlobalSettings(prev => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: value,
      },
    }));
  };

  const handleCommandInsert = (command: string) => {
    setDraft(prev => (prev ? `${prev}\n${command}` : command));
  };

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    const timestamp = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: buildMessageId('user'),
      author: 'user',
      content: trimmed,
      timestamp,
    };

    const agentReplies: ChatMessage[] = activeAgents.map((agent, index) => ({
      id: buildMessageId(`${agent.id}-${index}`),
      author: 'agent',
      agentId: agent.id,
      content: `${agent.name} está preparando una respuesta…`,
      timestamp,
      status: 'pending',
      sourcePrompt: trimmed,
    }));

    setMessages(prev => [...prev, userMessage, ...agentReplies]);
    setDraft('');
  };

  const lastUserMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(message => message.author === 'user'),
    [messages],
  );

  const agentResponses = useMemo(
    () => messages.filter(message => message.author === 'agent'),
    [messages],
  );

  return (
    <div className="app-container">
      <ChatTopBar
        activeAgents={activeAgents.length}
        totalAgents={agents.length}
        pendingResponses={pendingResponses}
      />

      <div className="workspace">
        <div className="main-panel">
          <div className="layer-grid-container chat-layer-grid">
            <div className="chat-header">
              <div className="chat-header-text">
                <h1 className="chat-title">JungleMonk.AI · Control Hub</h1>
                <p className="chat-subtitle">
                  Orquesta múltiples agentes en paralelo manteniendo la estética original del entorno.
                </p>
              </div>
              <div className="chat-metrics">
                <div className="metric-chip">
                  <span className="metric-label">Agentes activos</span>
                  <span className="metric-value">{activeAgents.length}</span>
                </div>
                <div className="metric-chip">
                  <span className="metric-label">Mensajes totales</span>
                  <span className="metric-value">{messages.length}</span>
                </div>
                <div className={`metric-chip ${pendingResponses ? 'metric-warning' : ''}`}>
                  <span className="metric-label">Respuestas pendientes</span>
                  <span className="metric-value">{pendingResponses}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bottom-section">
            <div className="visual-stage">
              <div className="visual-wrapper chat-visual-wrapper">
                <div className="chat-stage">
                  <div className="message-feed">
                    {messages.map(message => {
                      const isUser = message.author === 'user';
                      const isSystem = message.author === 'system';
                      const agent = message.agentId ? agentMap.get(message.agentId) : undefined;
                      const chipColor = agent?.accent || 'var(--accent-color)';

                      return (
                        <div
                          key={message.id}
                          className={`message-card ${isUser ? 'message-user' : ''} ${isSystem ? 'message-system' : ''}`}
                        >
                          <div className="message-card-header">
                            <div className="message-card-author" style={{ borderColor: chipColor }}>
                              {isUser && 'Tú'}
                              {isSystem && 'Control Hub'}
                              {!isUser && !isSystem && agent?.name}
                            </div>
                            <div className="message-card-meta">
                              {!isUser && !isSystem && (
                                <span className="message-card-tag" style={{ color: chipColor }}>
                                  {agent?.provider}
                                </span>
                              )}
                              <span className="message-card-time">{formatTime(message.timestamp)}</span>
                              {message.status === 'pending' && <span className="message-card-status">orquestando…</span>}
                            </div>
                          </div>
                          <p className="message-card-content">{message.content}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="chat-suggestions">
                    <span className="suggestions-label">Sugerencias:</span>
                    {QUICK_COMMANDS.slice(0, 3).map(command => (
                      <button
                        key={command}
                        type="button"
                        className="suggestion-chip"
                        onClick={() => handleCommandInsert(command)}
                      >
                        {command}
                      </button>
                    ))}
                  </div>

                  <div className="chat-composer">
                    <textarea
                      value={draft}
                      onChange={event => setDraft(event.target.value)}
                      placeholder="Habla con varios agentes a la vez: por ejemplo “gpt, genera un esquema de estilos”"
                      className="chat-input"
                      rows={3}
                    />
                    <div className="composer-toolbar">
                      <div className="composer-hints">
                        <span>Usa @ para mencionar modelos concretos</span>
                        {lastUserMessage && (
                          <span className="composer-last">Último mensaje a las {formatTime(lastUserMessage.timestamp)}</span>
                        )}
                      </div>
                      <div className="composer-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setDraft('')}
                          disabled={!draft.trim()}
                        >
                          Limpiar
                        </button>
                        <button type="button" className="primary-button" onClick={handleSend}>
                          Enviar a {activeAgents.length || 'ningún'} agente{activeAgents.length === 1 ? '' : 's'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="controls-panel">
              <div className="controls-panel-content">
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
                      onChange={event => handleApiKeyChange('openai', event.target.value)}
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
                      onChange={event => handleApiKeyChange('anthropic', event.target.value)}
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
                      onChange={event => handleApiKeyChange('groq', event.target.value)}
                      placeholder="groq-..."
                      className={!apiKeys.groq ? 'is-empty' : ''}
                    />
                  </div>
                </section>

                <section className="panel-section">
                  <header className="panel-section-header">
                    <h2>Modelos activos</h2>
                    <p>Activa y desactiva agentes al instante.</p>
                  </header>
                  <div className="agent-grid">
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        type="button"
                        className={`agent-chip ${agent.active ? 'is-active' : ''}`}
                        style={{ '--agent-accent': agent.accent } as React.CSSProperties}
                        onClick={() => handleToggleAgent(agent.id)}
                      >
                        <span className="agent-chip-name">{agent.name}</span>
                        <span className="agent-chip-provider">{agent.provider}</span>
                        <span className="agent-chip-status">{agent.status}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="panel-section">
                  <header className="panel-section-header">
                    <h2>Comandos frecuentes</h2>
                    <p>Guarda instrucciones recurrentes para dispararlas en el chat.</p>
                  </header>
                  <div className="command-list">
                    {QUICK_COMMANDS.map(command => (
                      <button
                        key={command}
                        type="button"
                        className="command-item"
                        onClick={() => handleCommandInsert(command)}
                      >
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
                    {agentResponses.slice(-6).reverse().map(message => {
                      const agent = message.agentId ? agentMap.get(message.agentId) : undefined;
                      if (!agent) {
                        return null;
                      }

                      return (
                        <li key={message.id} className="activity-item">
                          <span className="activity-dot" style={{ background: agent.accent }} />
                          <div className="activity-content">
                            <div className="activity-title">
                              <strong>{agent.name}</strong>
                              <span>{formatTime(message.timestamp)}</span>
                            </div>
                            <p>{message.content}</p>
                          </div>
                        </li>
                      );
                    })}
                    {!agentResponses.length && <li className="activity-empty">Todavía no hay actividad de los agentes.</li>}
                  </ul>
                </section>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <ChatStatusBar
        activeAgents={activeAgents.length}
        totalMessages={messages.length}
        pendingResponses={pendingResponses}
      />
    </div>
  );
};

export default App;
