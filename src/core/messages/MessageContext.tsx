import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiKeySettings } from '../../types/globalSettings';
import { AgentDefinition } from '../agents/agentRegistry';
import { useAgents } from '../agents/AgentContext';
import { fetchAgentReply } from '../agents/providerRouter';

export type ChatAuthor = 'system' | 'user' | 'agent';

export interface ChatMessage {
  id: string;
  author: ChatAuthor;
  content: string;
  timestamp: string;
  agentId?: string;
  status?: 'pending' | 'sent';
  sourcePrompt?: string;
}

interface MessageContextValue {
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  appendToDraft: (value: string) => void;
  sendMessage: () => void;
  pendingResponses: number;
  lastUserMessage?: ChatMessage;
  agentResponses: ChatMessage[];
  quickCommands: string[];
  formatTimestamp: (isoString: string) => string;
}

interface MessageProviderProps {
  apiKeys: ApiKeySettings;
  children: React.ReactNode;
}

const QUICK_COMMANDS: string[] = [
  'gpt, analiza este briefing y propón un storyboard.',
  'claude, revisa el copy y hazlo más humano.',
  'groq, genera casos de prueba para esta API.',
  'equipo, proponed variantes de UI para el panel lateral.',
];

const formatTimestamp = (isoString: string): string => {
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

const MessageContext = createContext<MessageContextValue | undefined>(undefined);

export const MessageProvider: React.FC<MessageProviderProps> = ({ apiKeys, children }) => {
  const { activeAgents, agentMap } = useAgents();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: buildMessageId('system'),
      author: 'system',
      content: 'Bienvenido a JungleMonk.AI Control Hub. Activa tus modelos y coordina la conversación multimodal desde un solo lugar.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [draft, setDraftState] = useState('');
  const scheduledResponsesRef = useRef<Set<string>>(new Set());

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
  }, []);

  const appendToDraft = useCallback((command: string) => {
    setDraftState(prev => (prev ? `${prev}\n${command}` : command));
  }, []);

  const sendMessage = useCallback(() => {
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
    setDraftState('');
  }, [activeAgents, draft]);

  const resolveAgentReply = useCallback(
    (agent: AgentDefinition, prompt: string) =>
      fetchAgentReply({ agent, prompt, apiKeys, fallback: mockAgentReply }),
    [apiKeys],
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

        const resolve = async () => {
          try {
            let content: string;
            if (agent.kind === 'cloud') {
              content = await resolveAgentReply(agent, message.sourcePrompt ?? message.content);
            } else {
              content = await new Promise<string>(resolvePromise => {
                const delay = 700 + Math.random() * 1200;
                setTimeout(() => resolvePromise(mockAgentReply(agent, message.sourcePrompt)), delay);
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

        resolve();
      });

    return () => {
      cancelers.forEach(cancel => cancel());
    };
  }, [agentMap, messages, resolveAgentReply]);

  const pendingResponses = useMemo(
    () => messages.filter(message => message.author === 'agent' && message.status === 'pending').length,
    [messages],
  );

  const lastUserMessage = useMemo(
    () => [...messages].reverse().find(message => message.author === 'user'),
    [messages],
  );

  const agentResponses = useMemo(
    () => messages.filter(message => message.author === 'agent'),
    [messages],
  );

  const value = useMemo(
    () => ({
      messages,
      draft,
      setDraft,
      appendToDraft,
      sendMessage,
      pendingResponses,
      lastUserMessage,
      agentResponses,
      quickCommands: QUICK_COMMANDS,
      formatTimestamp,
    }),
    [agentResponses, appendToDraft, draft, lastUserMessage, messages, pendingResponses, sendMessage, setDraft],
  );

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
};

export const useMessages = (): MessageContextValue => {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessages debe utilizarse dentro de un MessageProvider');
  }
  return context;
};
