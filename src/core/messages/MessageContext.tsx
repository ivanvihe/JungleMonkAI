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
import type { AgentExchangeTrace } from '../agents/providerRouter';
import type { ChatProviderResponse } from '../../utils/aiProviders';
import {
  ChatAttachment,
  ChatContentPart,
  ChatMessage,
  ChatModality,
  ChatTranscription,
  MessageCorrection,
  MessageFeedback,
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
  type OrchestrationTraceEntry,
  type SharedConversationSnapshot,
} from '../orchestration';

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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface MentionParseResult {
  targetedAgents: AgentDefinition[];
  promptsByAgent: Record<string, string>;
  unmatchedMentions: Array<{ alias: string; candidates: AgentDefinition[] }>;
  hasMentions: boolean;
}

const parseAgentMentions = (
  input: string,
  allAgents: AgentDefinition[],
  activeAgents: AgentDefinition[],
): MentionParseResult => {
  if (!input.trim()) {
    return { targetedAgents: [], promptsByAgent: {}, unmatchedMentions: [], hasMentions: false };
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
    return { targetedAgents: [], promptsByAgent: {}, unmatchedMentions: [], hasMentions: false };
  }

  const aliasPattern = Array.from(aliasToAgents.keys())
    .map(escapeRegExp)
    .join('|');

  if (!aliasPattern) {
    return { targetedAgents: [], promptsByAgent: {}, unmatchedMentions: [], hasMentions: false };
  }

  const mentionRegex = new RegExp(`(^|[\\s,;])(${aliasPattern})\\s*:`, 'gi');
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
    const originalAlias = match[2];
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
    return { targetedAgents: [], promptsByAgent: {}, unmatchedMentions: [], hasMentions: false };
  }

  const promptsByAgent: Record<string, string> = {};
  const targetedAgents: AgentDefinition[] = [];
  const seenAgents = new Set<string>();
  const firstMention = mentions[0];
  const globalPrefix = input.slice(0, firstMention.index).trim();

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
      const segments = [globalPrefix, slice].filter(Boolean);
      const combined = segments.join('\n').trim();
      promptsByAgent[mention.agent.id] = combined || globalPrefix || slice;
    }
  }

  return {
    targetedAgents,
    promptsByAgent,
    unmatchedMentions: Array.from(unmatchedMap.values()),
    hasMentions: true,
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
    return `Jarvis (${versionLabel}) sugiere una variante optimizada con «${truncatedPrompt || 'los parámetros indicados'}».${roleHint}${objectiveHint}${instructions}`;
  }

  return `Respuesta generada por ${getAgentDisplayName(agent)}.${roleHint}${objectiveHint}${instructions}`;
};

const MessageContext = createContext<MessageContextValue | undefined>(undefined);

export const MessageProvider: React.FC<MessageProviderProps> = ({ apiKeys, children }) => {
  const { agents, activeAgents, agentMap } = useAgents();
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
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, MessageFeedback>>(
    persistedQualityState.feedback,
  );
  const [corrections, setCorrections] = useState<MessageCorrection[]>(persistedQualityState.corrections);
  const [sharedMessageLog, setSharedMessageLog] = useState<SharedMessageLogEntry[]>(persistedSharedState.entries);
  const [draft, setDraftState] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<ChatAttachment[]>([]);
  const [composerTranscriptions, setComposerTranscriptions] = useState<ChatTranscription[]>([]);
  const scheduledResponsesRef = useRef<Set<string>>(new Set());
  const [coordinationStrategy, setCoordinationStrategy] = useState<CoordinationStrategyId>('sequential-turn');
  const [sharedSnapshot, setSharedSnapshot] = useState<SharedConversationSnapshot>(() => createInitialSnapshot());
  const [orchestrationTraces, setOrchestrationTraces] = useState<OrchestrationTraceEntry[]>([]);

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

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
  }, []);

  const appendToDraft = useCallback((command: string) => {
    setDraftState(prev => (prev ? `${prev}\n${command}` : command));
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
    const participants =
      mentionPlan.targetedAgents.length > 0
        ? mentionPlan.targetedAgents
        : mentionPlan.hasMentions
        ? []
        : activeAgents;

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
      agentPrompts: mentionPlan.promptsByAgent,
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
    agents,
    appendTraces,
    composerAttachments,
    composerTranscriptions,
    coordinationStrategy,
    draft,
    sharedSnapshot,
  ]);

  const resolveAgentReply = useCallback(
    (agent: AgentDefinition, prompt: string, context?: MultiAgentContext) =>
      fetchAgentReply({ agent, prompt, apiKeys, fallback: mockAgentReply, context, onTrace: handleProviderTrace }),
    [apiKeys, handleProviderTrace],
  );

  useEffect(() => {
    const syncFromTauri = async () => {
      if (typeof window === 'undefined' || !(window as any).__TAURI__) {
        return;
      }

      try {
        const { readTextFile, BaseDirectory, createDir } = await import(
          /* @vite-ignore */ '@tauri-apps/api/fs'
        );

        try {
          const data = await readTextFile(CORRECTION_STORAGE_FILE, { dir: BaseDirectory.AppData });
          if (!data) {
            return;
          }
          const parsed = JSON.parse(data) as PersistedQualityState;
          setFeedbackByMessage(parsed.feedback ?? {});
          setCorrections(parsed.corrections ?? []);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in (error as Record<string, unknown>)) {
            if ((error as { code?: string }).code === 'NotFound') {
              await createDir('', { dir: BaseDirectory.AppData, recursive: true });
            }
          }
        }

        try {
          const sharedRaw = await readTextFile(SHARED_MESSAGES_STORAGE_FILE, { dir: BaseDirectory.AppData });
          if (sharedRaw) {
            const parsedShared = JSON.parse(sharedRaw) as PersistedSharedState;
            setSharedMessageLog(Array.isArray(parsedShared.entries) ? parsedShared.entries : []);
          }
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in (error as Record<string, unknown>)) {
            if ((error as { code?: string }).code === 'NotFound') {
              await createDir('', { dir: BaseDirectory.AppData, recursive: true });
            }
          }
        }
      } catch (error) {
        console.warn('No se pudo inicializar el almacenamiento de correcciones en Tauri:', error);
      }
    };

    void syncFromTauri();
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

    const persistToTauri = async () => {
      if (typeof window === 'undefined' || !(window as any).__TAURI__) {
        return;
      }

      try {
        const { writeTextFile, BaseDirectory, createDir } = await import(
          /* @vite-ignore */ '@tauri-apps/api/fs'
        );
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
        await writeTextFile(
          {
            contents: JSON.stringify({ feedback: feedbackByMessage, corrections }),
            path: CORRECTION_STORAGE_FILE,
          },
          { dir: BaseDirectory.AppData },
        );
      } catch (error) {
        console.warn('No se pudo persistir el historial de correcciones en Tauri:', error);
      }
    };

    void persistToTauri();
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

    const persistSharedToTauri = async () => {
      if (typeof window === 'undefined' || !(window as any).__TAURI__) {
        return;
      }

      try {
        const { writeTextFile, BaseDirectory, createDir } = await import(
          /* @vite-ignore */ '@tauri-apps/api/fs'
        );
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
        await writeTextFile(
          {
            contents: JSON.stringify({ entries: sharedMessageLog }),
            path: SHARED_MESSAGES_STORAGE_FILE,
          },
          { dir: BaseDirectory.AppData },
        );
      } catch (error) {
        console.warn('No se pudo persistir el historial de mensajes compartidos en Tauri:', error);
      }
    };

    void persistSharedToTauri();
  }, [sharedMessageLog]);

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
            if (agent.kind === 'cloud') {
              const prompt = message.sourcePrompt ?? contentToPlainText(message.content);
              const response = await resolveAgentReply(agent, prompt, message.orchestrationContext);

              if (cancelled) {
                return;
              }

              const normalizedContent = normalizeProviderContent(response.content);
              const plain = contentToPlainText(normalizedContent);
              const hasContent = plain.trim().length > 0;
              const finalContent: ChatMessage['content'] = hasContent
                ? normalizedContent
                : `${agentLabel} no devolvió contenido.`;
              const completionTimestamp = new Date().toISOString();

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
    messages,
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
      feedbackByMessage,
      correctionHistory,
      qualityMetrics,
      markMessageFeedback,
      submitCorrection,
      removeAttachment,
      removeTranscription,
      sendMessage,
      setDraft,
      upsertTranscription,
      coordinationStrategy,
      updateStrategy,
      sharedSnapshot,
      orchestrationTraces,
      shareMessageWithAgent,
      loadMessageIntoDraft,
      sharedMessageLog,
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
