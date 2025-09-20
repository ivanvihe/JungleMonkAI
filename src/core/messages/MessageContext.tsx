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
import type { ChatProviderResponse } from '../../utils/aiProviders';
import {
  ChatAttachment,
  ChatContentPart,
  ChatMessage,
  ChatModality,
  ChatTranscription,
} from './messageTypes';

interface MessageContextValue {
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  appendToDraft: (value: string) => void;
  composerAttachments: ChatAttachment[];
  addAttachment: (attachment: ChatAttachment) => void;
  removeAttachment: (attachmentId: string) => void;
  composerTranscriptions: ChatTranscription[];
  upsertTranscription: (transcription: ChatTranscription) => void;
  removeTranscription: (transcriptionId: string) => void;
  composerModalities: ChatModality[];
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

const contentToPlainText = (content: ChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map(part => {
      if (!part) {
        return '';
      }

      if (typeof part === 'string') {
        return part;
      }

      if (part.type === 'text') {
        return part.text;
      }

      if (part.type === 'image') {
        return part.alt ?? '[imagen]';
      }

      if (part.type === 'audio') {
        return part.transcript ?? '[audio]';
      }

      if (part.type === 'file') {
        return part.name ?? '[archivo]';
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const buildContentPartsFromComposer = (
  text: string,
  attachments: ChatAttachment[],
): ChatContentPart[] => {
  const parts: ChatContentPart[] = [];

  if (text.trim()) {
    parts.push({ type: 'text', text });
  }

  attachments.forEach(attachment => {
    if (attachment.type === 'image' && attachment.url) {
      parts.push({ type: 'image', url: attachment.url, alt: attachment.name });
    }

    if (attachment.type === 'audio' && attachment.url) {
      parts.push({ type: 'audio', url: attachment.url, durationSeconds: attachment.durationSeconds });
    }

    if (attachment.type === 'file' && attachment.url) {
      parts.push({ type: 'file', url: attachment.url, name: attachment.name, mimeType: attachment.mimeType });
    }
  });

  return parts;
};

const ensureModalities = (
  draft: string,
  attachments: ChatAttachment[],
  transcriptions: ChatTranscription[],
): ChatModality[] => {
  const modalities = new Set<ChatModality>();

  if (draft.trim()) {
    modalities.add('text');
  }

  attachments.forEach(attachment => {
    if (attachment.type === 'image') {
      modalities.add('image');
    }

    if (attachment.type === 'audio') {
      modalities.add('audio');
    }

    if (attachment.type === 'file') {
      modalities.add('file');
    }
  });

  if (transcriptions.length) {
    modalities.add('text');
  }

  return Array.from(modalities);
};

const normalizeProviderContent = (content: ChatProviderResponse['content']): ChatMessage['content'] => {
  if (Array.isArray(content)) {
    const normalized = content.map(part => (typeof part === 'string' ? { type: 'text', text: part } : part));
    if (normalized.length === 1) {
      const [first] = normalized;
      if (typeof first === 'string') {
        return first;
      }
      if (first.type === 'text') {
        return first.text;
      }
    }
    return normalized;
  }

  return content;
};

const ensureResponseModalities = (
  response: ChatProviderResponse,
): Required<Pick<ChatMessage, 'modalities'>>['modalities'] => {
  if (response.modalities?.length) {
    return response.modalities;
  }

  const normalizedContent = normalizeProviderContent(response.content);
  const modalities = new Set<ChatModality>();

  const registerPart = (part: ChatContentPart | string) => {
    if (typeof part === 'string') {
      if (part.trim()) {
        modalities.add('text');
      }
      return;
    }

    if (part.type === 'text') {
      if (part.text.trim()) {
        modalities.add('text');
      }
      return;
    }

    if (part.type === 'image') {
      modalities.add('image');
      return;
    }

    if (part.type === 'audio') {
      modalities.add('audio');
      return;
    }

    if (part.type === 'file') {
      modalities.add('file');
    }
  };

  if (Array.isArray(normalizedContent)) {
    normalizedContent.forEach(registerPart);
  } else {
    registerPart(normalizedContent);
  }

  response.attachments?.forEach(attachment => {
    if (attachment.type === 'image') {
      modalities.add('image');
    }
    if (attachment.type === 'audio') {
      modalities.add('audio');
    }
    if (attachment.type === 'file') {
      modalities.add('file');
    }
  });

  if (response.transcriptions?.length) {
    modalities.add('text');
  }

  const inferred = Array.from(modalities);
  return inferred.length ? inferred : ['text'];
};

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
      modalities: ['text'],
    },
  ]);
  const [draft, setDraftState] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<ChatAttachment[]>([]);
  const [composerTranscriptions, setComposerTranscriptions] = useState<ChatTranscription[]>([]);
  const scheduledResponsesRef = useRef<Set<string>>(new Set());

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
  }, []);

  const appendToDraft = useCallback((command: string) => {
    setDraftState(prev => (prev ? `${prev}\n${command}` : command));
  }, []);

  const sendMessage = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed && composerAttachments.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const contentParts = buildContentPartsFromComposer(trimmed, composerAttachments);
    let messageContent: ChatMessage['content'] = trimmed;

    if (contentParts.length === 1) {
      const [first] = contentParts;
      if (typeof first === 'string') {
        messageContent = first;
      } else if (first.type === 'text') {
        messageContent = first.text;
      } else {
        messageContent = contentParts;
      }
    } else if (contentParts.length > 1) {
      messageContent = contentParts;
    }

    const messageModalities = ensureModalities(trimmed, composerAttachments, composerTranscriptions);

    const userMessage: ChatMessage = {
      id: buildMessageId('user'),
      author: 'user',
      content: messageContent,
      timestamp,
      attachments: composerAttachments.length ? composerAttachments : undefined,
      modalities: messageModalities.length ? messageModalities : undefined,
      transcriptions: composerTranscriptions.length ? composerTranscriptions : undefined,
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
    setComposerAttachments([]);
    setComposerTranscriptions([]);
  }, [activeAgents, composerAttachments, composerTranscriptions, draft]);

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
            if (agent.kind === 'cloud') {
              const prompt = message.sourcePrompt ?? contentToPlainText(message.content);
              const response = await resolveAgentReply(agent, prompt);

              if (cancelled) {
                return;
              }

              const normalizedContent = normalizeProviderContent(response.content);
              const plain = contentToPlainText(normalizedContent);
              const hasContent = plain.trim().length > 0;
              const finalContent: ChatMessage['content'] = hasContent
                ? normalizedContent
                : `${agent.name} no devolvió contenido.`;

              setMessages(prev =>
                prev.map(item =>
                  item.id === message.id
                    ? {
                        ...item,
                        status: 'sent',
                        content: finalContent,
                        attachments: response.attachments?.length ? response.attachments : undefined,
                        modalities: ensureResponseModalities(response),
                        transcriptions: response.transcriptions?.length ? response.transcriptions : undefined,
                      }
                    : item,
                ),
              );
              return;
            }

            const content = await new Promise<string>(resolvePromise => {
              const delay = 700 + Math.random() * 1200;
              setTimeout(() => resolvePromise(mockAgentReply(agent, message.sourcePrompt)), delay);
            });

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
                      attachments: undefined,
                      modalities: ['text'],
                      transcriptions: undefined,
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
                      attachments: undefined,
                      modalities: ['text'],
                      transcriptions: undefined,
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

  const composerModalities = useMemo(
    () => ensureModalities(draft.trim(), composerAttachments, composerTranscriptions),
    [composerAttachments, composerTranscriptions, draft],
  );

  const addAttachment = useCallback((attachment: ChatAttachment) => {
    setComposerAttachments(prev => [...prev, attachment]);
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    setComposerAttachments(prev => prev.filter(attachment => attachment.id !== attachmentId));
  }, []);

  const upsertTranscription = useCallback((transcription: ChatTranscription) => {
    setComposerTranscriptions(prev => {
      const others = prev.filter(item => item.id !== transcription.id);
      return [...others, transcription];
    });
  }, []);

  const removeTranscription = useCallback((transcriptionId: string) => {
    setComposerTranscriptions(prev => prev.filter(item => item.id !== transcriptionId));
  }, []);

  const value = useMemo(
    () => ({
      messages,
      draft,
      setDraft,
      appendToDraft,
      composerAttachments,
      addAttachment,
      removeAttachment,
      composerTranscriptions,
      upsertTranscription,
      removeTranscription,
      composerModalities,
      sendMessage,
      pendingResponses,
      lastUserMessage,
      agentResponses,
      quickCommands: QUICK_COMMANDS,
      formatTimestamp,
    }),
    [
      addAttachment,
      agentResponses,
      appendToDraft,
      composerAttachments,
      composerModalities,
      composerTranscriptions,
      draft,
      lastUserMessage,
      messages,
      pendingResponses,
      removeAttachment,
      removeTranscription,
      sendMessage,
      setDraft,
      upsertTranscription,
    ],
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
