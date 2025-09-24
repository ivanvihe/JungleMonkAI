import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { gitInvoke, isGitBackendUnavailableError } from '../../utils/runtimeBridge';
import { ApiKeySettings } from '../../types/globalSettings';
import { AgentDefinition } from '../agents/agentRegistry';
import { useAgents } from '../agents/AgentContext';
import { fetchAgentReply } from '../agents/providerRouter';
import type { AgentExchangeTrace, AgentStreamingEvent } from '../agents/providerRouter';
import { emitAgentPresenceOverride } from '../agents/presence';
import type { ChatProviderResponse } from '../../utils/aiProviders';
import {
  ChatAttachment,
  ChatContentPart,
  ChatMessage,
  ChatModality,
  ChatTranscription,
  MessageCorrection,
  MessageFeedback,
  ChatMessageAction,
  ChatSuggestedAction,
} from './messageTypes';
import { buildCorrectionPipeline } from '../agents/providerRouter';
import { getAgentDisplayName, getAgentVersionLabel } from '../../utils/agentDisplay';
import {
  CoordinationStrategyId,
  createInitialSnapshot,
  getCoordinationStrategy,
  registerAgentConclusion,
  registerSystemNote,
  buildTraceFromBridge,
  limitSnapshotHistory,
  type MultiAgentContext,
  type OrchestrationProjectContext,
  type OrchestrationTraceEntry,
  type SharedConversationSnapshot,
} from '../orchestration';
import { useProjects } from '../projects/ProjectContext';
import { enqueueRepoWorkflowRequest, syncRepositoryViaWorkflow } from '../codex/workflowBridge';
import { isTauriEnvironment } from '../storage/userDataPathsClient';
import { useJarvisCore } from '../jarvis/JarvisCoreContext';
import type { JarvisActionKind } from '../../services/jarvisCoreClient';

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
  toPlainText: (content: ChatMessage['content']) => string;
  feedbackByMessage: Record<string, MessageFeedback>;
  correctionHistory: MessageCorrection[];
  qualityMetrics: QualityMetrics;
  markMessageFeedback: (
    messageId: string,
    updates: Partial<MessageFeedback> & { hasError?: boolean },
  ) => void;
  submitCorrection: (
    messageId: string,
    correctedText: string,
    notes?: string,
    tags?: string[],
  ) => Promise<void>;
  coordinationStrategy: CoordinationStrategyId;
  setCoordinationStrategy: (strategy: CoordinationStrategyId) => void;
  sharedSnapshot: SharedConversationSnapshot;
  orchestrationTraces: OrchestrationTraceEntry[];
  shareMessageWithAgent: (
    agentId: string,
    messageId: string,
    options?: { canonicalCode?: string },
  ) => void;
  loadMessageIntoDraft: (messageId: string) => void;
  sharedMessageLog: SharedMessageLogEntry[];
  composerTargetAgentIds: string[];
  setComposerTargetAgentIds: (agentIds: string[]) => void;
  composerTargetMode: 'broadcast' | 'independent';
  setComposerTargetMode: (mode: 'broadcast' | 'independent') => void;
  pendingActions: ChatMessageAction[];
  triggerAction: (actionId: string) => Promise<void>;
  rejectAction: (actionId: string) => void;
}

interface PersistedQualityState {
  feedback: Record<string, MessageFeedback>;
  corrections: MessageCorrection[];
}

interface QualityMetrics {
  totalAgentMessages: number;
  flaggedResponses: number;
  totalCorrections: number;
  correctionRate: number;
  tagRanking: Array<{ tag: string; count: number }>;
}

const CORRECTION_STORAGE_KEY = 'junglemonk.corrections.v1';
const CORRECTION_STORAGE_FILE = 'corrections-log.json';
const SHARED_MESSAGES_STORAGE_KEY = 'junglemonk.shared-messages.v1';
const SHARED_MESSAGES_STORAGE_FILE = 'shared-messages.json';
const ACTIONS_STORAGE_KEY = 'junglemonk.jarvis-actions.v1';
const ACTIONS_STORAGE_FILE = 'jarvis-actions.json';

export interface SharedMessageLogEntry {
  id: string;
  messageId: string;
  agentId: string;
  sharedAt: string;
  originAgentId?: string;
  sharedByMessageId: string;
  canonicalCode?: string;
}

interface PersistedSharedState {
  entries: SharedMessageLogEntry[];
}

interface PersistedActionState {
  status: ChatMessageAction['status'];
  createdAt: string;
  updatedAt: string;
  resultPreview?: string;
  errorMessage?: string;
}

type PersistedActionRegistry = Record<string, PersistedActionState>;

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

const normalizeCommandText = (input: string): string => {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const ANALYZE_PROJECT_REGEX = /\banaliza(?:r)? mi proyecto\b/;

const truncate = (value: string, maxLength = 400): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
};

const formatActionResultPreview = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return truncate(value.trim());
  }

  try {
    return truncate(JSON.stringify(value, null, 2));
  } catch {
    return truncate(String(value));
  }
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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface MentionParseResult {
  targetedAgents: AgentDefinition[];
  promptsByAgent: Record<string, string>;
  unmatchedMentions: Array<{ alias: string; candidates: AgentDefinition[] }>;
  hasMentions: boolean;
  defaultPrompt: string;
}

const parseAgentMentions = (
  input: string,
  allAgents: AgentDefinition[],
  activeAgents: AgentDefinition[],
): MentionParseResult => {
  if (!input.trim()) {
    return {
      targetedAgents: [],
      promptsByAgent: {},
      unmatchedMentions: [],
      hasMentions: false,
      defaultPrompt: '',
    };
  }

  const aliasToAgents = new Map<string, AgentDefinition[]>();
  allAgents.forEach(agent => {
    if (!agent.aliases?.length) {
      return;
    }

    const normalizedAliases = new Set(
      agent.aliases
        .map(alias => alias.trim().toLowerCase())
        .filter(alias => alias.length > 0),
    );

    normalizedAliases.forEach(alias => {
      const existing = aliasToAgents.get(alias);
      if (existing) {
        existing.push(agent);
      } else {
        aliasToAgents.set(alias, [agent]);
      }
    });
  });

  if (!aliasToAgents.size) {
    return {
      targetedAgents: [],
      promptsByAgent: {},
      unmatchedMentions: [],
      hasMentions: false,
      defaultPrompt: input.trim(),
    };
  }

  const aliasPattern = Array.from(aliasToAgents.keys())
    .map(escapeRegExp)
    .join('|');

  if (!aliasPattern) {
    return {
      targetedAgents: [],
      promptsByAgent: {},
      unmatchedMentions: [],
      hasMentions: false,
      defaultPrompt: input.trim(),
    };
  }

  const mentionRegex = new RegExp(`(?:^|[\\r\\n]+)\\s*(${aliasPattern})\\s*([:,])`, 'gi');
  const mentions: Array<{
    index: number;
    contentStart: number;
    original: string;
    normalized: string;
    agent?: AgentDefinition;
  }> = [];
  const unmatchedMap = new Map<string, { alias: string; candidates: AgentDefinition[] }>();
  const activeIds = new Set(activeAgents.map(agent => agent.id));

  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(input)) !== null) {
    const originalAlias = match[1];
    const normalizedAlias = originalAlias.toLowerCase();
    const candidates = aliasToAgents.get(normalizedAlias) ?? [];
    const activeCandidate = candidates.find(candidate => activeIds.has(candidate.id));
    const contentStart = match.index + match[0].length;

    if (!activeCandidate) {
      if (!unmatchedMap.has(normalizedAlias)) {
        unmatchedMap.set(normalizedAlias, { alias: originalAlias, candidates });
      }
    }

    mentions.push({
      index: match.index,
      contentStart,
      original: originalAlias,
      normalized: normalizedAlias,
      agent: activeCandidate,
    });
  }

  if (!mentions.length) {
    return {
      targetedAgents: [],
      promptsByAgent: {},
      unmatchedMentions: [],
      hasMentions: false,
      defaultPrompt: input.trim(),
    };
  }

  const promptsByAgent: Record<string, string> = {};
  const targetedAgents: AgentDefinition[] = [];
  const seenAgents = new Set<string>();
  const firstMention = mentions[0];
  const defaultPrompt = input.slice(0, firstMention.index).trim();

  for (let i = 0; i < mentions.length; i += 1) {
    const mention = mentions[i];
    const nextIndex = i + 1 < mentions.length ? mentions[i + 1].index : input.length;

    if (!mention.agent) {
      continue;
    }

    const slice = input.slice(mention.contentStart, nextIndex).trim();

    if (!seenAgents.has(mention.agent.id)) {
      targetedAgents.push(mention.agent);
      seenAgents.add(mention.agent.id);
    }

    if (promptsByAgent[mention.agent.id]) {
      const existing = promptsByAgent[mention.agent.id];
      const appended = [existing, slice].filter(Boolean).join('\n').trim();
      promptsByAgent[mention.agent.id] = appended || existing;
    } else {
      promptsByAgent[mention.agent.id] = slice;
    }
  }

  return {
    targetedAgents,
    promptsByAgent,
    unmatchedMentions: Array.from(unmatchedMap.values()),
    hasMentions: true,
    defaultPrompt,
  };
};

const mockAgentReply = (agent: AgentDefinition, prompt?: string, context?: MultiAgentContext): string => {
  const safePrompt = prompt?.replace(/\s+/g, ' ').trim() ?? '';
  const truncatedPrompt = safePrompt.length > 120 ? `${safePrompt.slice(0, 117)}…` : safePrompt;
  const roleHint = context?.role?.role ? ` Rol: ${context.role.role}.` : '';
  const objectiveHint = context?.role?.objective ? ` Objetivo: ${context.role.objective}.` : '';
  const instructions = context?.instructions?.length
    ? ` Pistas: ${context.instructions.slice(0, 2).join(' | ')}.`
    : '';
  const repoHint = context?.project
    ? ` Contexto repo: ${context.project.repositoryPath}${
        context.project.defaultBranch ? `@${context.project.defaultBranch}` : ''
      }.`
    : '';

  if (agent.provider === 'OpenAI') {
    return `He generado una propuesta inicial basándome en «${truncatedPrompt || 'la última instrucción'}».${roleHint}${objectiveHint}${instructions}`;
  }

  if (agent.provider === 'Anthropic') {
    return `Reviso la entrega y refino el tono para «${truncatedPrompt || 'el contexto actual'}».${roleHint}${objectiveHint}${instructions}`;
  }

  if (agent.provider === 'Groq') {
    return `Desglose técnico y validaciones para «${truncatedPrompt || 'tu solicitud'}».${roleHint}${objectiveHint}${instructions}`;
  }

  if (agent.kind === 'local') {
    const versionLabel = getAgentVersionLabel(agent);
    return `Jarvis (${versionLabel}) alista cambios sobre «${truncatedPrompt || 'los parámetros indicados'}».${roleHint}${objectiveHint}${instructions}${repoHint}`;
  }

  return `Respuesta generada por ${getAgentDisplayName(agent)}.${roleHint}${objectiveHint}${instructions}`;
};

const MessageContext = createContext<MessageContextValue | undefined>(undefined);

export const MessageProvider: React.FC<MessageProviderProps> = ({ apiKeys, children }) => {
  const { agents, activeAgents, agentMap } = useAgents();
  const { activeProject } = useProjects();
  const loadPersistedQualityState = useCallback((): PersistedQualityState => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return { feedback: {}, corrections: [] };
    }

    try {
      const raw = localStorage.getItem(CORRECTION_STORAGE_KEY);
      if (!raw) {
        return { feedback: {}, corrections: [] };
      }

      const parsed = JSON.parse(raw) as PersistedQualityState;
      return {
        feedback: parsed.feedback ?? {},
        corrections: parsed.corrections ?? [],
      };
    } catch (error) {
      console.warn('No se pudo cargar el historial de correcciones desde localStorage:', error);
      return { feedback: {}, corrections: [] };
    }
  }, []);

  const loadPersistedSharedState = useCallback((): PersistedSharedState => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return { entries: [] };
    }

    try {
      const raw = localStorage.getItem(SHARED_MESSAGES_STORAGE_KEY);
      if (!raw) {
        return { entries: [] };
      }

      const parsed = JSON.parse(raw) as PersistedSharedState;
      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    } catch (error) {
      console.warn('No se pudo cargar el historial de mensajes compartidos desde localStorage:', error);
      return { entries: [] };
    }
  }, []);

  const loadPersistedActionsState = useCallback((): PersistedActionRegistry => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return {};
    }

    try {
      const raw = localStorage.getItem(ACTIONS_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return parsed as PersistedActionRegistry;
    } catch (error) {
      console.warn('No se pudo cargar las acciones pendientes desde localStorage:', error);
      return {};
    }
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: buildMessageId('system'),
      author: 'system',
      content: 'Bienvenido a JungleMonk.AI Control Hub. Activa tus modelos y coordina la conversación multimodal desde un solo lugar.',
      timestamp: new Date().toISOString(),
      modalities: ['text'],
    },
  ]);
  const persistedQualityState = useMemo(() => loadPersistedQualityState(), [loadPersistedQualityState]);
  const persistedSharedState = useMemo(() => loadPersistedSharedState(), [loadPersistedSharedState]);
  const orchestrationProject = useMemo<OrchestrationProjectContext | undefined>(() => {
    if (!activeProject) {
      return undefined;
    }
    return {
      id: activeProject.id,
      name: activeProject.name,
      repositoryPath: activeProject.repositoryPath,
      defaultBranch: activeProject.defaultBranch,
      instructions: activeProject.instructions,
      preferredProvider: activeProject.preferredProvider,
      preferredModel: activeProject.preferredModel,
    };
  }, [activeProject]);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, MessageFeedback>>(
    persistedQualityState.feedback,
  );
  const [corrections, setCorrections] = useState<MessageCorrection[]>(persistedQualityState.corrections);
  const [sharedMessageLog, setSharedMessageLog] = useState<SharedMessageLogEntry[]>(persistedSharedState.entries);
  const [draft, setDraftState] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<ChatAttachment[]>([]);
  const [composerTranscriptions, setComposerTranscriptions] = useState<ChatTranscription[]>([]);
  const [composerTargetAgentIds, setComposerTargetAgentIds] = useState<string[]>([]);
  const [composerTargetMode, setComposerTargetMode] = useState<'broadcast' | 'independent'>('broadcast');
  const scheduledResponsesRef = useRef<Set<string>>(new Set());
  const [coordinationStrategy, setCoordinationStrategy] = useState<CoordinationStrategyId>('sequential-turn');
  const [sharedSnapshot, setSharedSnapshot] = useState<SharedConversationSnapshot>(() => createInitialSnapshot());
  const [orchestrationTraces, setOrchestrationTraces] = useState<OrchestrationTraceEntry[]>([]);
  const [persistedActions, setPersistedActions] = useState<PersistedActionRegistry>(
    () => loadPersistedActionsState(),
  );
  const persistedActionsRef = useRef<PersistedActionRegistry>({});
  const { ensureOnline, invokeChat, launchAction } = useJarvisCore();

  const appendTraces = useCallback(
    (entries: OrchestrationTraceEntry | OrchestrationTraceEntry[]) => {
      const normalized = Array.isArray(entries) ? entries : [entries];
      if (!normalized.length) {
        return;
      }
      setOrchestrationTraces(prev => [...prev, ...normalized]);
    },
    [],
  );

  useEffect(() => {
    persistedActionsRef.current = persistedActions;
  }, [persistedActions]);

  const registerActionsForMessage = useCallback(
    (
      messageId: string,
      agentId: string | undefined,
      suggestions: ChatSuggestedAction[] | undefined,
      timestamp: string,
    ) => {
      setMessages(prevMessages =>
        prevMessages.map(message => {
          if (message.id !== messageId) {
            return message;
          }

          if (!suggestions?.length) {
            if (!message.actions?.length) {
              return message;
            }
            return { ...message, actions: undefined };
          }

          const mapped: ChatMessageAction[] = suggestions.map((suggestion, index) => {
            const actionId = `${messageId}-action-${index}`;
            const persisted = persistedActionsRef.current[actionId];
            const createdAt = persisted?.createdAt ?? timestamp;
            const updatedAt = persisted?.updatedAt ?? timestamp;
            const status = persisted?.status ?? 'pending';

            return {
              id: actionId,
              messageId,
              agentId,
              kind: suggestion.kind,
              payload: suggestion.payload,
              label: suggestion.label ?? 'Acción sugerida',
              description: suggestion.description,
              requiresConfirmation: suggestion.requiresConfirmation ?? true,
              status,
              createdAt,
              updatedAt,
              resultPreview: persisted?.resultPreview,
              errorMessage: persisted?.errorMessage,
            } satisfies ChatMessageAction;
          });

          return { ...message, actions: mapped };
        }),
      );

      if (suggestions?.length) {
        const additions: PersistedActionRegistry = {};
        suggestions.forEach((_, index) => {
          const actionId = `${messageId}-action-${index}`;
          if (!persistedActionsRef.current[actionId]) {
            additions[actionId] = {
              status: 'pending',
              createdAt: timestamp,
              updatedAt: timestamp,
            } satisfies PersistedActionState;
          }
        });

        if (Object.keys(additions).length) {
          setPersistedActions(prev => ({ ...prev, ...additions }));
        }
      }
    },
    [setMessages, setPersistedActions],
  );

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
  }, []);

  const appendToDraft = useCallback((command: string) => {
    setDraftState(prev => (prev ? `${prev}\n${command}` : command));
  }, []);

  const updateComposerTargetAgentIds = useCallback((agentIds: string[]) => {
    const unique = Array.from(new Set(agentIds.filter(id => typeof id === 'string' && id.trim())));
    setComposerTargetAgentIds(prev => {
      if (prev.length === unique.length && prev.every((value, index) => value === unique[index])) {
        return prev;
      }
      return unique;
    });
  }, []);

  const updateComposerTargetMode = useCallback((mode: 'broadcast' | 'independent') => {
    setComposerTargetMode(prev => (prev === mode ? prev : mode));
  }, []);

  const loadMessageIntoDraft = useCallback(
    (messageId: string) => {
      const target = messages.find(message => message.id === messageId);
      if (!target) {
        return;
      }

      const canonical = target.canonicalCode?.trim() ? target.canonicalCode : undefined;
      const plain = canonical ?? contentToPlainText(target.content);
      setDraftState(plain);
      setComposerAttachments([]);
      setComposerTranscriptions([]);
    },
    [messages, setComposerAttachments, setComposerTranscriptions],
  );

  const handleProviderTrace = useCallback(
    (trace: AgentExchangeTrace) => {
      appendTraces({
        id: `${trace.agentId}-${trace.type}-${trace.timestamp}`,
        timestamp: trace.timestamp,
        actor: trace.type === 'request' ? 'system' : 'agent',
        agentId: trace.agentId,
        description:
          trace.type === 'request'
            ? `Solicitud enviada a ${trace.agentName}`
            : trace.type === 'response'
            ? `Respuesta recibida de ${trace.agentName}`
            : `Traza registrada de ${trace.agentName}`,
        details: trace.payload,
        strategyId: trace.strategyId ?? coordinationStrategy,
      });
    },
    [appendTraces, coordinationStrategy],
  );

  const updateStrategy = useCallback((strategy: CoordinationStrategyId) => {
    setCoordinationStrategy(strategy);
  }, []);

  const shareMessageWithAgent = useCallback(
    (agentId: string, messageId: string, options?: { canonicalCode?: string }) => {
      const agent = agentMap.get(agentId);
      if (!agent) {
        console.warn(`No se encontró el agente ${agentId} para compartir el mensaje.`);
        return;
      }

      const original = messages.find(message => message.id === messageId);
      if (!original) {
        console.warn(`No se encontró el mensaje ${messageId} para compartir.`);
        return;
      }

      const canonical = options?.canonicalCode?.trim() ? options.canonicalCode : undefined;
      const prompt = canonical ?? contentToPlainText(original.content);

      if (!prompt.trim()) {
        console.warn('El contenido del mensaje compartido está vacío, se omite el reenvío.');
        return;
      }

      const timestamp = new Date().toISOString();
      const originAgentId = original.agentId ?? original.originAgentId;
      const displayName = getAgentDisplayName(agent);

      const shareNote: ChatMessage = {
        id: buildMessageId('share-note'),
        author: 'system',
        content: `Mensaje compartido con ${displayName} para seguimiento colaborativo.`,
        timestamp,
        visibility: 'internal',
        originAgentId,
        sharedByMessageId: messageId,
      };

      const pendingMessage: ChatMessage = {
        id: buildMessageId(`${agent.id}-share`),
        author: 'agent',
        agentId: agent.id,
        originAgentId,
        content: `${displayName} está analizando el mensaje compartido…`,
        timestamp,
        status: 'pending',
        sourcePrompt: prompt,
        visibility: 'public',
        sharedByMessageId: messageId,
        canonicalCode: canonical,
      };

      setSharedMessageLog(prev => [
        ...prev,
        {
          id: buildMessageId('share-log'),
          messageId,
          agentId: agent.id,
          sharedAt: timestamp,
          originAgentId,
          sharedByMessageId: messageId,
          canonicalCode: canonical,
        },
      ]);

      setMessages(prev => {
        const base = canonical
          ? prev.map(item => (item.id === messageId ? { ...item, canonicalCode: canonical } : item))
          : prev;
        return [...base, shareNote, pendingMessage];
      });

      setDraftState(prompt);
      setComposerAttachments([]);
      setComposerTranscriptions([]);
    },
    [
      agentMap,
      messages,
      setComposerAttachments,
      setComposerTranscriptions,
      setDraftState,
      setSharedMessageLog,
    ],
  );

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
      visibility: 'public',
    };

    const normalizedCommand = normalizeCommandText(trimmed);
    const shouldTriggerRepoAnalysis =
      normalizedCommand.length > 0 && ANALYZE_PROJECT_REGEX.test(normalizedCommand);

    if (shouldTriggerRepoAnalysis) {
      if (!activeProject) {
        const warningTimestamp = new Date().toISOString();
        const warningMessage: ChatMessage = {
          id: buildMessageId('system'),
          author: 'system',
          content: 'No hay ningún proyecto activo enlazado para analizar.',
          timestamp: warningTimestamp,
          visibility: 'public',
        };
        setMessages(prev => [...prev, userMessage, warningMessage]);
        setSharedSnapshot(prev =>
          limitSnapshotHistory(registerSystemNote(prev, warningMessage.content, warningTimestamp)),
        );
        setDraftState('');
        setComposerAttachments([]);
        setComposerTranscriptions([]);
        return;
      }

      const remoteLabel = activeProject.defaultRemote ?? 'origin';
      const ackTimestamp = new Date().toISOString();
      const ackMessage: ChatMessage = {
        id: buildMessageId('system'),
        author: 'system',
        content: `Sincronizando el proyecto activo (${remoteLabel}) antes del análisis…`,
        timestamp: ackTimestamp,
        visibility: 'public',
      };

      setMessages(prev => [...prev, userMessage, ackMessage]);
      setSharedSnapshot(prev =>
        limitSnapshotHistory(registerSystemNote(prev, ackMessage.content, ackTimestamp)),
      );

      void (async () => {
        try {
          await syncRepositoryViaWorkflow({
            repositoryPath: activeProject.repositoryPath,
            remote: remoteLabel,
            branch: activeProject.defaultBranch ?? null,
          });

          let activeBranch = activeProject.defaultBranch ?? null;
          try {
            const context = await gitInvoke<{ branch?: string | null }>('git_get_repository_context', {
              repoPath: activeProject.repositoryPath,
            });
            if (context?.branch) {
              activeBranch = context.branch;
            }
          } catch (error) {
            if (!isGitBackendUnavailableError(error)) {
              console.warn('No se pudo determinar la rama actual del repositorio:', error);
            }
          }

          enqueueRepoWorkflowRequest({
            messageId: userMessage.id,
            repositoryPath: activeProject.repositoryPath,
            branch: activeBranch ?? undefined,
          });
        } catch (error) {
          const description =
            (error as Error)?.message ?? 'Error desconocido al sincronizar el proyecto.';
          const failureTimestamp = new Date().toISOString();
          const failureMessage: ChatMessage = {
            id: buildMessageId('system'),
            author: 'system',
            content: `Error al preparar el proyecto: ${description}`,
            timestamp: failureTimestamp,
            visibility: 'public',
          };
          setMessages(prev => [...prev, failureMessage]);
          setSharedSnapshot(prev =>
            limitSnapshotHistory(registerSystemNote(prev, failureMessage.content, failureTimestamp)),
          );
        }
      })();

      setDraftState('');
      setComposerAttachments([]);
      setComposerTranscriptions([]);
      return;
    }

    if (activeAgents.length === 0) {
      setMessages(prev => [...prev, userMessage]);
      const note = `Sin agentes activos para responder «${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}».`;
      const traceEntry: OrchestrationTraceEntry = {
        id: `no-agents-${timestamp}`,
        timestamp,
        actor: 'system',
        description: 'No se asignaron agentes a la petición.',
        details: note,
        strategyId: coordinationStrategy,
      };
      appendTraces(traceEntry);
      setSharedSnapshot(prev => limitSnapshotHistory(registerSystemNote(prev, note, timestamp)));
      setDraftState('');
      setComposerAttachments([]);
      setComposerTranscriptions([]);
      return;
    }

    const mentionPlan = parseAgentMentions(trimmed, agents, activeAgents);
    const jarvisAgent = activeAgents.find(
      agent => agent.kind === 'local' && agent.channel === 'jarvis' && agent.active,
    );
    const agentPrompts: Record<string, string> = { ...mentionPlan.promptsByAgent };
    const targetedAgents: AgentDefinition[] = [...mentionPlan.targetedAgents];
    const targetedIds = new Set(targetedAgents.map(agent => agent.id));
    const activeAgentIds = new Set(activeAgents.map(agent => agent.id));
    const selectedAgents = composerTargetAgentIds
      .map(agentId => agentMap.get(agentId))
      .filter((candidate): candidate is AgentDefinition => Boolean(candidate && activeAgentIds.has(candidate.id)));

    let defaultPrompt = mentionPlan.defaultPrompt;

    if (selectedAgents.length > 0) {
      const basePrompt = trimmed;
      selectedAgents.forEach(agent => {
        if (!targetedIds.has(agent.id)) {
          targetedAgents.push(agent);
          targetedIds.add(agent.id);
        }

        if (composerTargetMode === 'independent') {
          agentPrompts[agent.id] = basePrompt;
        } else if (!agentPrompts[agent.id]) {
          agentPrompts[agent.id] = defaultPrompt || basePrompt;
        }
      });

      defaultPrompt = composerTargetMode === 'broadcast' ? defaultPrompt || basePrompt : '';
    }

    if (defaultPrompt && jarvisAgent) {
      const existing = agentPrompts[jarvisAgent.id];
      agentPrompts[jarvisAgent.id] = existing
        ? [existing, defaultPrompt].filter(Boolean).join('\n').trim()
        : defaultPrompt;
      if (!targetedIds.has(jarvisAgent.id)) {
        targetedAgents.push(jarvisAgent);
        targetedIds.add(jarvisAgent.id);
      }
    }

    const participants =
      targetedAgents.length > 0
        ? targetedAgents
        : jarvisAgent
        ? [jarvisAgent]
        : [];

    const formatCandidateLabel = (candidate: AgentDefinition): string => {
      const displayName = getAgentDisplayName(candidate);
      const versionLabel = getAgentVersionLabel(candidate);
      if (candidate.kind === 'local') {
        return `${displayName} (${versionLabel})`;
      }
      return `${displayName} (${candidate.model})`;
    };

    const warningMessages: ChatMessage[] = mentionPlan.unmatchedMentions.map(entry => {
      const candidates = entry.candidates.map(formatCandidateLabel);
      const text = entry.candidates.length
        ? `No hay agentes activos para «${entry.alias}». Opciones registradas: ${candidates.join(', ')}.`
        : `«${entry.alias}» no coincide con ningún agente conocido.`;
      return {
        id: buildMessageId('system'),
        author: 'system',
        content: text,
        timestamp,
        visibility: 'public',
      };
    });

    if (participants.length === 0) {
      const note =
        mentionPlan.hasMentions && warningMessages.length
          ? warningMessages.map(message => message.content).join(' ')
          : `Sin agentes activos para responder «${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}».`;

      setMessages(prev => [...prev, userMessage, ...warningMessages]);
      const traceEntry: OrchestrationTraceEntry = {
        id: `no-targets-${timestamp}`,
        timestamp,
        actor: 'system',
        description: 'No se pudo orquestar la petición.',
        details: note,
        strategyId: coordinationStrategy,
      };
      appendTraces(traceEntry);
      const snapshotWithWarnings = warningMessages.reduce(
        (acc, message) => registerSystemNote(acc, message.content, timestamp),
        registerSystemNote(sharedSnapshot, note, timestamp),
      );
      setSharedSnapshot(limitSnapshotHistory(snapshotWithWarnings));
      setDraftState('');
      setComposerAttachments([]);
      setComposerTranscriptions([]);
      return;
    }

    const strategy = getCoordinationStrategy(coordinationStrategy);
    const rolesMap = participants.reduce<Record<string, { role?: string; objective?: string }>>((acc, agent) => {
      acc[agent.id] = { role: agent.role, objective: agent.objective };
      return acc;
    }, {});

    const plan = strategy.buildPlan({
      userPrompt: trimmed,
      agents: participants,
      snapshot: sharedSnapshot,
      roles: rolesMap,
      agentPrompts,
      project: orchestrationProject,
    });

    const bridgeMessages: ChatMessage[] = plan.sharedBridgeMessages.map(message => ({
      id: message.id,
      author: message.author,
      agentId: message.agentId,
      content: message.content,
      timestamp: message.timestamp,
      visibility: 'internal',
    }));

    const agentReplies: ChatMessage[] = plan.steps.map((step, index) => ({
      id: buildMessageId(`${step.agent.id}-${index}`),
      author: 'agent',
      agentId: step.agent.id,
      originAgentId: step.agent.id,
      content: `${getAgentDisplayName(step.agent)} está preparando una respuesta…`,
      timestamp,
      status: 'pending',
      sourcePrompt: step.prompt,
      visibility: 'public',
      orchestrationContext: step.context,
    }));

    setMessages(prev => [...prev, userMessage, ...warningMessages, ...bridgeMessages, ...agentReplies]);
    const warningTraces: OrchestrationTraceEntry[] = warningMessages.map(message => ({
      id: `${message.id}-trace`,
      timestamp: message.timestamp,
      actor: 'system',
      description: message.content,
      strategyId: coordinationStrategy,
    }));
    const planTraces: OrchestrationTraceEntry[] = [
      ...warningTraces,
      ...plan.sharedBridgeMessages.map(message => buildTraceFromBridge(message, coordinationStrategy)),
      ...plan.steps.map(step => ({
        id: `${step.agent.id}-assignment-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        timestamp,
        actor: 'system',
        agentId: step.agent.id,
        description: `Turno asignado a ${getAgentDisplayName(step.agent)}`,
        details: step.context.instructions?.join('\n') ?? undefined,
        strategyId: coordinationStrategy,
      })),
    ];
    appendTraces(planTraces);

    const snapshotWithWarnings = warningMessages.reduce(
      (acc, message) => registerSystemNote(acc, message.content, message.timestamp),
      plan.nextSnapshot,
    );
    const snapshotWithNotes = plan.sharedBridgeMessages.reduce(
      (acc, message) => registerSystemNote(acc, message.content, message.timestamp),
      snapshotWithWarnings,
    );
    setSharedSnapshot(limitSnapshotHistory(snapshotWithNotes));
    setDraftState('');
    setComposerAttachments([]);
    setComposerTranscriptions([]);
  }, [
    activeAgents,
    agentMap,
    agents,
    activeProject,
    appendTraces,
    composerAttachments,
    composerTargetAgentIds,
    composerTargetMode,
    composerTranscriptions,
    coordinationStrategy,
    enqueueRepoWorkflowRequest,
    draft,
    orchestrationProject,
    sharedSnapshot,
    syncRepositoryViaWorkflow,
  ]);

  const resolveAgentReply = useCallback(
    (
      agent: AgentDefinition,
      prompt: string,
      context?: MultiAgentContext,
      onStreamUpdate?: (event: AgentStreamingEvent) => void,
    ) =>
      fetchAgentReply({
        agent,
        prompt,
        apiKeys,
        fallback: mockAgentReply,
        context,
        onTrace: handleProviderTrace,
        jarvisClient: agent.kind === 'local' ? { sendChat: invokeChat } : null,
        onStreamUpdate,
      }),
    [apiKeys, handleProviderTrace, invokeChat],
  );

  useEffect(() => {
    const syncFromUserData = async () => {
      try {
        const storage = await import('../storage/userDataFiles');
        if (!storage.isTauriEnvironment()) {
          return;
        }

        await storage.ensureUserDataDirectory();

        const [qualityState, sharedState, actionsState] = await Promise.all([
          storage.readUserDataJson<PersistedQualityState>(CORRECTION_STORAGE_FILE),
          storage.readUserDataJson<PersistedSharedState>(SHARED_MESSAGES_STORAGE_FILE),
          storage.readUserDataJson<PersistedActionRegistry>(ACTIONS_STORAGE_FILE),
        ]);

        if (qualityState) {
          setFeedbackByMessage(qualityState.feedback ?? {});
          setCorrections(qualityState.corrections ?? []);
        }

        if (sharedState?.entries) {
          setSharedMessageLog(Array.isArray(sharedState.entries) ? sharedState.entries : []);
        }

        if (actionsState && typeof actionsState === 'object') {
          setPersistedActions(prev => ({ ...actionsState, ...prev }));
        }
      } catch (error) {
        console.warn('No se pudo inicializar el almacenamiento de datos de usuario:', error);
      }
    };

    void syncFromUserData();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const payload: PersistedQualityState = {
        feedback: feedbackByMessage,
        corrections,
      };
      try {
        localStorage.setItem(CORRECTION_STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('No se pudo persistir el historial de correcciones en localStorage:', error);
      }
    }

    const persistToUserData = async () => {
      try {
        const storage = await import('../storage/userDataFiles');
        if (!storage.isTauriEnvironment()) {
          return;
        }

        await storage.writeUserDataJson(CORRECTION_STORAGE_FILE, {
          feedback: feedbackByMessage,
          corrections,
        });
      } catch (error) {
        console.warn('No se pudo persistir el historial de correcciones en Tauri:', error);
      }
    };

    void persistToUserData();
  }, [feedbackByMessage, corrections]);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const payload: PersistedSharedState = { entries: sharedMessageLog };
      try {
        localStorage.setItem(SHARED_MESSAGES_STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('No se pudo persistir el historial de mensajes compartidos en localStorage:', error);
      }
    }

    const persistSharedToUserData = async () => {
      try {
        const storage = await import('../storage/userDataFiles');
        if (!storage.isTauriEnvironment()) {
          return;
        }

        await storage.writeUserDataJson(SHARED_MESSAGES_STORAGE_FILE, {
          entries: sharedMessageLog,
        });
      } catch (error) {
        console.warn('No se pudo persistir el historial de mensajes compartidos en Tauri:', error);
      }
    };

    void persistSharedToUserData();
  }, [sharedMessageLog]);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(persistedActions));
      } catch (error) {
        console.warn('No se pudo persistir las acciones de Jarvis en localStorage:', error);
      }
    }

    const persistActionsToUserData = async () => {
      try {
        const storage = await import('../storage/userDataFiles');
        if (!storage.isTauriEnvironment()) {
          return;
        }

        await storage.writeUserDataJson(ACTIONS_STORAGE_FILE, persistedActions);
      } catch (error) {
        console.warn('No se pudo persistir las acciones de Jarvis en Tauri:', error);
      }
    };

    void persistActionsToUserData();
  }, [persistedActions]);

  useEffect(() => {
    setMessages(prevMessages =>
      prevMessages.map(message => {
        const nextFeedback = feedbackByMessage[message.id];
        const currentFeedback = message.feedback;

        const serialize = (feedback?: MessageFeedback): string =>
          JSON.stringify({
            hasError: feedback?.hasError ?? false,
            notes: feedback?.notes ?? '',
            tags: feedback?.tags ?? [],
            lastUpdatedAt: feedback?.lastUpdatedAt ?? '',
          });

        if (!nextFeedback && !currentFeedback) {
          return message;
        }

        if (serialize(nextFeedback) === serialize(currentFeedback)) {
          return message;
        }

        if (!nextFeedback) {
          const { feedback, ...rest } = message;
          return { ...rest } as ChatMessage;
        }

        return {
          ...message,
          feedback: nextFeedback,
        };
      }),
    );
  }, [feedbackByMessage]);

  useEffect(() => {
    setMessages(prevMessages => {
      let shouldUpdate = false;

      const nextMessages = prevMessages.map(message => {
        if (!message.actions?.length) {
          return message;
        }

        let actionChanged = false;
        const updatedActions = message.actions.map(action => {
          const persisted = persistedActions[action.id];
          if (!persisted) {
            return action;
          }

          if (
            action.status !== persisted.status ||
            action.updatedAt !== persisted.updatedAt ||
            action.resultPreview !== persisted.resultPreview ||
            action.errorMessage !== persisted.errorMessage
          ) {
            actionChanged = true;
            return {
              ...action,
              status: persisted.status,
              updatedAt: persisted.updatedAt,
              resultPreview: persisted.resultPreview,
              errorMessage: persisted.errorMessage,
            };
          }

          return action;
        });

        if (actionChanged) {
          shouldUpdate = true;
          return { ...message, actions: updatedActions };
        }

        return message;
      });

      return shouldUpdate ? nextMessages : prevMessages;
    });
  }, [persistedActions]);

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

        const displayName = getAgentDisplayName(agent);
        const agentLabel = agent.kind === 'local' ? `${displayName} (${getAgentVersionLabel(agent)})` : displayName;

        scheduledResponsesRef.current.add(message.id);

        let cancelled = false;
        const cancel = () => {
          cancelled = true;
          scheduledResponsesRef.current.delete(message.id);
        };

        cancelers.push(cancel);

        const resolve = async () => {
          try {
            const prompt = message.sourcePrompt ?? contentToPlainText(message.content);

            if (agent.kind === 'cloud') {
              const outcome = await resolveAgentReply(agent, prompt, message.orchestrationContext);

              if (cancelled) {
                return;
              }

              const completionTimestamp = new Date().toISOString();

              if (outcome.status === 'success') {
                let normalizedContent = normalizeProviderContent(outcome.response.content);
                let plain = contentToPlainText(normalizedContent);
                const hasContent = plain.trim().length > 0;
                const finalContent: ChatMessage['content'] = hasContent
                  ? normalizedContent
                  : `${agentLabel} no devolvió contenido.`;

                if (!hasContent) {
                  plain = contentToPlainText(finalContent);
                }

                setMessages(prev =>
                  prev.map(item =>
                    item.id === message.id
                      ? {
                          ...item,
                          status: 'sent',
                          content: finalContent,
                          attachments: outcome.response.attachments?.length
                            ? outcome.response.attachments
                            : undefined,
                          modalities: ensureResponseModalities(outcome.response),
                          transcriptions: outcome.response.transcriptions?.length
                            ? outcome.response.transcriptions
                            : undefined,
                        }
                      : item,
                  ),
                );
                registerActionsForMessage(
                  message.id,
                  agent.id,
                  outcome.response.actions,
                  completionTimestamp,
                );
                setSharedSnapshot(prev =>
                  limitSnapshotHistory(registerAgentConclusion(prev, agent.id, plain, completionTimestamp)),
                );
                appendTraces({
                  id: `${agent.id}-conclusion-${completionTimestamp}`,
                  timestamp: completionTimestamp,
                  actor: 'agent',
                  agentId: agent.id,
                  description: `Conclusión de ${agentLabel}`,
                  details: plain,
                  strategyId: message.orchestrationContext?.strategyId ?? coordinationStrategy,
                });
                return;
              }

              let normalizedContent = normalizeProviderContent(outcome.response.content);
              if (!contentToPlainText(normalizedContent).trim()) {
                normalizedContent = `${agentLabel} no devolvió contenido.`;
              }

              if (outcome.errorMessage) {
                const prefix = `⚠️ ${agentLabel} tuvo un problema al contactar a su proveedor: ${outcome.errorMessage}.`;
                if (typeof normalizedContent === 'string') {
                  const trimmed = normalizedContent.trim();
                  normalizedContent = trimmed ? `${prefix}\n\n${normalizedContent}` : prefix;
                } else {
                  normalizedContent = [
                    { type: 'text', text: prefix },
                    ...(Array.isArray(normalizedContent)
                      ? normalizedContent.map(part =>
                          typeof part === 'string' ? { type: 'text', text: part } : part,
                        )
                      : []),
                  ];
                }
              }

              const plain = contentToPlainText(normalizedContent);

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
              registerActionsForMessage(message.id, agent.id, undefined, completionTimestamp);
              setSharedSnapshot(prev =>
                limitSnapshotHistory(registerAgentConclusion(prev, agent.id, plain, completionTimestamp)),
              );
              appendTraces({
                id: `${agent.id}-fallback-${completionTimestamp}`,
                timestamp: completionTimestamp,
                actor: 'system',
                agentId: agent.id,
                description: `Se usó respuesta alternativa para ${agentLabel}`,
                details: plain,
                strategyId: message.orchestrationContext?.strategyId ?? coordinationStrategy,
              });

              if (outcome.errorMessage) {
                setFeedbackByMessage(prev => {
                  const previous = prev[message.id];
                  const nextNotes = previous?.notes ?? outcome.errorMessage;
                  if (previous?.hasError && previous.notes === nextNotes) {
                    return prev;
                  }

                  const timestamp = new Date().toISOString();
                  return {
                    ...prev,
                    [message.id]: {
                      ...(previous ?? {}),
                      hasError: true,
                      notes: nextNotes,
                      lastUpdatedAt: timestamp,
                    },
                  };
                });

                emitAgentPresenceOverride({
                  agentId: agent.id,
                  status: 'error',
                  message: outcome.errorMessage,
                });
              }

              return;
            }

            if (agent.kind === 'local') {
              await ensureOnline();

              const handleStream = (event: AgentStreamingEvent) => {
                if (cancelled) {
                  return;
                }

                if (event.type === 'delta' || event.type === 'result') {
                  setMessages(prev =>
                    prev.map(item =>
                      item.id === message.id
                        ? {
                            ...item,
                            content: event.content,
                            modalities: ['text'],
                            status: event.type === 'result' ? 'sent' : item.status,
                          }
                        : item,
                    ),
                  );

                  if (event.type === 'result') {
                    const streamTimestamp = new Date().toISOString();
                    registerActionsForMessage(message.id, agent.id, event.actions, streamTimestamp);
                  }
                }
              };

              const outcome = await resolveAgentReply(
                agent,
                prompt,
                message.orchestrationContext,
                handleStream,
              );

              if (cancelled) {
                return;
              }

              const completionTimestamp = new Date().toISOString();

              if (outcome.status === 'success') {
                let normalizedContent = normalizeProviderContent(outcome.response.content);
                let plain = contentToPlainText(normalizedContent);
                const hasContent = plain.trim().length > 0;
                const finalContent: ChatMessage['content'] = hasContent
                  ? normalizedContent
                  : `${agentLabel} no devolvió contenido.`;

                if (!hasContent) {
                  plain = contentToPlainText(finalContent);
                }

                setMessages(prev =>
                  prev.map(item =>
                    item.id === message.id
                      ? {
                          ...item,
                          status: 'sent',
                          content: finalContent,
                          attachments: outcome.response.attachments?.length
                            ? outcome.response.attachments
                            : undefined,
                          modalities: ensureResponseModalities(outcome.response),
                          transcriptions: outcome.response.transcriptions?.length
                            ? outcome.response.transcriptions
                            : undefined,
                        }
                      : item,
                  ),
                );
                registerActionsForMessage(
                  message.id,
                  agent.id,
                  outcome.response.actions,
                  completionTimestamp,
                );
                setSharedSnapshot(prev =>
                  limitSnapshotHistory(registerAgentConclusion(prev, agent.id, plain, completionTimestamp)),
                );
                appendTraces({
                  id: `${agent.id}-local-${completionTimestamp}`,
                  timestamp: completionTimestamp,
                  actor: 'agent',
                  agentId: agent.id,
                  description: `Conclusión de ${agentLabel}`,
                  details: plain,
                  strategyId: message.orchestrationContext?.strategyId ?? coordinationStrategy,
                });
                return;
              }

              let normalizedContent = normalizeProviderContent(outcome.response.content);
              if (!contentToPlainText(normalizedContent).trim()) {
                normalizedContent = `${agentLabel} no devolvió contenido.`;
              }

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
              registerActionsForMessage(message.id, agent.id, undefined, completionTimestamp);
              setSharedSnapshot(prev =>
                limitSnapshotHistory(
                  registerAgentConclusion(prev, agent.id, contentToPlainText(normalizedContent), completionTimestamp),
                ),
              );
              appendTraces({
                id: `${agent.id}-fallback-${completionTimestamp}`,
                timestamp: completionTimestamp,
                actor: 'system',
                agentId: agent.id,
                description: `Se usó respuesta alternativa para ${agentLabel}`,
                details: contentToPlainText(normalizedContent),
                strategyId: message.orchestrationContext?.strategyId ?? coordinationStrategy,
              });
              return;
            }

            const content = await new Promise<string>(resolvePromise => {
              const delay = 700 + Math.random() * 1200;
              setTimeout(
                () => resolvePromise(mockAgentReply(agent, message.sourcePrompt, message.orchestrationContext)),
                delay,
              );
            });

            if (cancelled) {
              return;
            }

            const normalizedContent = content?.trim().length
              ? content
              : `${agentLabel} no devolvió contenido.`;
            const completionTimestamp = new Date().toISOString();

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
            registerActionsForMessage(message.id, agent.id, undefined, completionTimestamp);
            setSharedSnapshot(prev =>
              limitSnapshotHistory(registerAgentConclusion(prev, agent.id, normalizedContent, completionTimestamp)),
            );
            appendTraces({
              id: `${agent.id}-local-${completionTimestamp}`,
              timestamp: completionTimestamp,
              actor: 'agent',
              agentId: agent.id,
              description: `Conclusión simulada de ${agentLabel}`,
              details: normalizedContent,
              strategyId: message.orchestrationContext?.strategyId ?? coordinationStrategy,
            });
          } catch (error) {
            if (cancelled) {
              return;
            }

            const fallbackMessage =
              agent.kind === 'cloud'
                ? `${agentLabel} no pudo generar una respuesta (${error instanceof Error ? error.message : 'error inesperado'}).`
                : mockAgentReply(agent, message.sourcePrompt, message.orchestrationContext);
            const completionTimestamp = new Date().toISOString();

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
            registerActionsForMessage(message.id, agent.id, undefined, completionTimestamp);
            setSharedSnapshot(prev =>
              limitSnapshotHistory(registerAgentConclusion(prev, agent.id, fallbackMessage, completionTimestamp)),
            );
            appendTraces({
              id: `${agent.id}-fallback-${completionTimestamp}`,
              timestamp: completionTimestamp,
              actor: 'system',
              agentId: agent.id,
              description: `Se usó respuesta alternativa para ${agentLabel}`,
              details: fallbackMessage,
              strategyId: message.orchestrationContext?.strategyId ?? coordinationStrategy,
            });

            if (agent.kind === 'local') {
              void ensureOnline();
            }
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
  }, [
    agentMap,
    appendTraces,
    coordinationStrategy,
    ensureOnline,
    messages,
    registerActionsForMessage,
    resolveAgentReply,
  ]);

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

  const pendingActions = useMemo(
    () =>
      messages
        .flatMap(message => message.actions ?? [])
        .filter(action => action.status === 'pending'),
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

  const triggerAction = useCallback(
    async (actionId: string) => {
      const targetMessage = messages.find(message => message.actions?.some(action => action.id === actionId));
      const targetAction = targetMessage?.actions?.find(action => action.id === actionId);
      if (!targetMessage || !targetAction || targetAction.status === 'executing') {
        return;
      }

      const startTimestamp = new Date().toISOString();

      setMessages(prev =>
        prev.map(message =>
          message.id === targetMessage.id
            ? {
                ...message,
                actions: message.actions?.map(action =>
                  action.id === actionId
                    ? {
                        ...action,
                        status: 'executing',
                        updatedAt: startTimestamp,
                        errorMessage: undefined,
                      }
                    : action,
                ),
              }
            : message,
        ),
      );

      setPersistedActions(prev => ({
        ...prev,
        [actionId]: {
          status: 'executing',
          createdAt: prev[actionId]?.createdAt ?? startTimestamp,
          updatedAt: startTimestamp,
        },
      }));

      try {
        await ensureOnline();
        const result = await launchAction(targetAction.kind as JarvisActionKind, targetAction.payload);
        const completionTimestamp = new Date().toISOString();
        const resultPreview = formatActionResultPreview(result);

        setMessages(prev =>
          prev.map(message =>
            message.id === targetMessage.id
              ? {
                  ...message,
                  actions: message.actions?.map(action =>
                    action.id === actionId
                      ? {
                          ...action,
                          status: 'completed',
                          updatedAt: completionTimestamp,
                          resultPreview,
                          errorMessage: undefined,
                        }
                      : action,
                  ),
                }
              : message,
          ),
        );

        setPersistedActions(prev => ({
          ...prev,
          [actionId]: {
            status: 'completed',
            createdAt: prev[actionId]?.createdAt ?? startTimestamp,
            updatedAt: completionTimestamp,
            resultPreview,
          },
        }));
      } catch (error) {
        const failureTimestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error ?? 'Acción fallida');

        setMessages(prev =>
          prev.map(message =>
            message.id === targetMessage.id
              ? {
                  ...message,
                  actions: message.actions?.map(action =>
                    action.id === actionId
                      ? {
                          ...action,
                          status: 'failed',
                          updatedAt: failureTimestamp,
                          errorMessage,
                        }
                      : action,
                  ),
                }
              : message,
          ),
        );

        setPersistedActions(prev => ({
          ...prev,
          [actionId]: {
            status: 'failed',
            createdAt: prev[actionId]?.createdAt ?? startTimestamp,
            updatedAt: failureTimestamp,
            errorMessage,
          },
        }));
      }
    },
    [ensureOnline, launchAction, messages],
  );

  const rejectAction = useCallback((actionId: string) => {
    const timestamp = new Date().toISOString();
    setMessages(prev =>
      prev.map(message =>
        message.actions?.length
          ? {
              ...message,
              actions: message.actions.map(action =>
                action.id === actionId
                  ? {
                      ...action,
                      status: 'rejected',
                      updatedAt: timestamp,
                      errorMessage: undefined,
                      resultPreview: undefined,
                    }
                  : action,
              ),
            }
          : message,
      ),
    );

    setPersistedActions(prev => ({
      ...prev,
      [actionId]: {
        status: 'rejected',
        createdAt: prev[actionId]?.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
    }));
  }, []);

  const markMessageFeedback = useCallback(
    (messageId: string, updates: Partial<MessageFeedback> & { hasError?: boolean }) => {
      setFeedbackByMessage(prev => {
        const previous = prev[messageId];
        const timestamp = new Date().toISOString();
        const merged: MessageFeedback = {
          ...(previous ?? {}),
          ...updates,
          lastUpdatedAt: timestamp,
        };

        if (updates.hasError === false && !merged.notes && (!merged.tags || merged.tags.length === 0)) {
          const next = { ...prev };
          delete next[messageId];
          return next;
        }

        if (updates.hasError === undefined) {
          merged.hasError = previous?.hasError ?? false;
        }

        return {
          ...prev,
          [messageId]: merged,
        };
      });
    },
    [],
  );

  const submitCorrection = useCallback(
    async (messageId: string, correctedText: string, notes?: string, tags?: string[]) => {
      const original = messages.find(message => message.id === messageId);
      if (!original) {
        return;
      }

      const timestamp = new Date().toISOString();
      const correctionId = buildMessageId('correction');
      const originalAgent = original.agentId ? agentMap.get(original.agentId) : undefined;
      const reviewerAgent = Array.from(agentMap.values()).find(agent => agent.id === 'openai-quality-review');
      const effectiveReviewer = reviewerAgent && reviewerAgent.active ? reviewerAgent : undefined;
      const fallbackAgent = originalAgent ?? effectiveReviewer;

      if (!fallbackAgent) {
        console.warn('No se encontró un agente para gestionar la corrección.');
      }

      const correctionEntry: MessageCorrection = {
        id: correctionId,
        messageId,
        agentId: originalAgent?.id,
        reviewerId: effectiveReviewer?.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        correctedText,
        notes,
        tags,
      };

      setCorrections(prev => [...prev, correctionEntry]);

      setFeedbackByMessage(prev => {
        const existing = prev[messageId];
        return {
          ...prev,
          [messageId]: {
            ...(existing ?? {}),
            hasError: true,
            notes: notes ?? existing?.notes,
            tags: tags ?? existing?.tags,
            lastUpdatedAt: timestamp,
          },
        };
      });

      if (!fallbackAgent) {
        return;
      }

      const { prompt, targetAgent } = buildCorrectionPipeline({
        correctionId,
        originalMessage: original,
        correctedText,
        notes,
        tags,
        agent: originalAgent ?? fallbackAgent,
        reviewer: effectiveReviewer,
      });

      const correctionMessage: ChatMessage = {
        id: buildMessageId('user-correction'),
        author: 'user',
        content: correctedText,
        timestamp,
        modalities: correctedText.trim() ? ['text'] : undefined,
        correctionId,
      };

      const pendingMessage: ChatMessage = {
        id: buildMessageId(`${targetAgent.id}-correction`),
        author: 'agent',
        agentId: targetAgent.id,
        originAgentId: targetAgent.id,
        content: `${targetAgent.name} está revisando la corrección…`,
        timestamp,
        status: 'pending',
        sourcePrompt: prompt,
        correctionId,
      };

      setMessages(prev => [...prev, correctionMessage, pendingMessage]);
    },
    [agentMap, messages],
  );

  const correctionHistory = useMemo(
    () =>
      [...corrections].sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [corrections],
  );

  const qualityMetrics = useMemo(() => {
    const totalAgentMessages = agentResponses.length;
    const flaggedResponses = agentResponses.filter(message => feedbackByMessage[message.id]?.hasError).length;
    const totalCorrections = corrections.length;
    const correctionRate = totalAgentMessages > 0 ? totalCorrections / totalAgentMessages : 0;

    const tagCounter = new Map<string, number>();
    Object.values(feedbackByMessage).forEach(feedback => {
      feedback.tags?.forEach(tag => {
        const normalized = tag.trim();
        if (!normalized) {
          return;
        }
        tagCounter.set(normalized, (tagCounter.get(normalized) ?? 0) + 1);
      });
    });

    corrections.forEach(correction => {
      correction.tags?.forEach(tag => {
        const normalized = tag.trim();
        if (!normalized) {
          return;
        }
        tagCounter.set(normalized, (tagCounter.get(normalized) ?? 0) + 1);
      });
    });

    const tagRanking = Array.from(tagCounter.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalAgentMessages,
      flaggedResponses,
      totalCorrections,
      correctionRate,
      tagRanking,
    } satisfies QualityMetrics;
  }, [agentResponses, corrections, feedbackByMessage]);

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
      toPlainText: contentToPlainText,
      feedbackByMessage,
      correctionHistory,
      qualityMetrics,
      markMessageFeedback,
      submitCorrection,
      coordinationStrategy,
      setCoordinationStrategy: updateStrategy,
      sharedSnapshot,
      orchestrationTraces,
      shareMessageWithAgent,
      loadMessageIntoDraft,
      sharedMessageLog,
      composerTargetAgentIds,
      setComposerTargetAgentIds: updateComposerTargetAgentIds,
      composerTargetMode,
      setComposerTargetMode: updateComposerTargetMode,
      pendingActions,
      triggerAction,
      rejectAction,
    }),
    [
      addAttachment,
      agentResponses,
      appendToDraft,
      composerAttachments,
      composerModalities,
      composerTargetAgentIds,
      composerTargetMode,
      composerTranscriptions,
      draft,
      lastUserMessage,
      loadMessageIntoDraft,
      markMessageFeedback,
      messages,
      orchestrationTraces,
      pendingActions,
      pendingResponses,
      feedbackByMessage,
      correctionHistory,
      qualityMetrics,
      rejectAction,
      removeAttachment,
      removeTranscription,
      sendMessage,
      setDraft,
      sharedMessageLog,
      shareMessageWithAgent,
      submitCorrection,
      triggerAction,
      coordinationStrategy,
      updateComposerTargetAgentIds,
      updateComposerTargetMode,
      updateStrategy,
      upsertTranscription,
      sharedSnapshot,
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
