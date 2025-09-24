import React, { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import {
  Space,
  Typography,
  Select,
  Radio,
  Badge,
  Tag,
  Button,
  AutoComplete,
  Input,
  Spin,
  Tabs,
  Descriptions,
  Divider,
  Statistic,
  Timeline,
  Empty,
  message as antdMessage,
} from 'antd';
import type { RadioChangeEvent } from 'antd';
import type { BadgeProps } from 'antd';
import { SendOutlined, PaperClipOutlined, ThunderboltOutlined, LoadingOutlined } from '@ant-design/icons';
import { VariableSizeList, type ListOnScrollProps, type ListChildComponentProps } from 'react-window';
import { useAgents } from '../../core/agents/AgentContext';
import { useMessages } from '../../core/messages/MessageContext';
import { useConversationSuggestions } from '../../core/messages/useConversationSuggestions';
import { AttachmentPicker } from './composer/AttachmentPicker';
import { AudioRecorder } from './composer/AudioRecorder';
import { ChatAttachment, ChatContentPart, ChatMessage, ChatTranscription } from '../../core/messages/messageTypes';
import { ChatActorFilter } from '../../types/chat';
import { AgentKind } from '../../core/agents/agentRegistry';
import type { AgentDefinition } from '../../core/agents/agentRegistry';
import { getAgentDisplayName, getAgentVersionLabel } from '../../utils/agentDisplay';
import { MessageCard } from './messages/MessageCard';
import type { GlobalSettings, CommandPreset } from '../../types/globalSettings';
import type { AgentPresenceEntry } from '../../core/agents/presence';

const { TextArea } = Input;
type WorkspaceTabKey = 'chat' | 'feed' | 'details';
interface ChatWorkspaceProps {
  actorFilter: ChatActorFilter;
  settings: GlobalSettings;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
  presenceMap: Map<string, AgentPresenceEntry>;
  onActorFilterChange?: (next: ChatActorFilter) => void;
  activeTab?: WorkspaceTabKey;
  onTabChange?: (next: WorkspaceTabKey) => void;
}

const COST_HINTS: Record<string, { badge: string; title: string }> = {
  openai: { badge: '€€', title: 'Coste medio estimado (OpenAI)' },
  anthropic: { badge: '€€€', title: 'Coste alto estimado (Anthropic)' },
  groq: { badge: '€', title: 'Coste bajo estimado (Groq)' },
};

const LOCAL_COST_HINT = { badge: '⚡', title: 'Ejecución local (sin coste por token)' };

const PRESENCE_LABEL: Record<AgentPresenceEntry['status'], string> = {
  online: 'en línea',
  offline: 'sin conexión',
  loading: 'calibrando',
  error: 'error',
};

const PRESENCE_STATUS_BADGE: Record<AgentPresenceEntry['status'], BadgeProps['status']> = {
  online: 'success',
  offline: 'default',
  loading: 'processing',
  error: 'error',
};

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  actorFilter,
  settings,
  onSettingsChange,
  presenceMap,
  onActorFilterChange,
}) => {
  const { agents, agentMap } = useAgents();
  const {
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
    lastUserMessage,
    quickCommands,
    formatTimestamp,
    shareMessageWithAgent,
    loadMessageIntoDraft,
    composerTargetAgentIds,
    setComposerTargetAgentIds,
    composerTargetMode,
    setComposerTargetMode,
    triggerAction,
    rejectAction,
  } = useMessages();
  const { dynamicSuggestions, recentCommands } = useConversationSuggestions();

  const [activeTabKey, setActiveTabKey] = useState<WorkspaceTabKey>(activeTab ?? 'chat');
  const [messageTypeFilter, setMessageTypeFilter] = useState<'all' | 'public' | 'internal'>('public');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'sent'>('all');
  const [visibleCount, setVisibleCount] = useState(40);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const listRef = useRef<VariableSizeList>(null);
  const sizeMap = useRef<Map<string, number>>(new Map());
  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const listOuterRef = useRef<HTMLDivElement | null>(null);
  const [feedSize, setFeedSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (activeTab && activeTab !== activeTabKey) {
      setActiveTabKey(activeTab);
    }
  }, [activeTab, activeTabKey]);

  useLayoutEffect(() => {
    const node = feedContainerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setFeedSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const messageCounts = useMemo(() => {
    const counters = { public: 0, internal: 0, pending: 0, sent: 0 };
    messages.forEach(message => {
      const isInternal = message.visibility === 'internal';
      if (isInternal) {
        counters.internal += 1;
      } else {
        counters.public += 1;
      }
      if (message.status === 'pending') {
        counters.pending += 1;
      } else {
        counters.sent += 1;
      }
    });
    return counters;
  }, [messages]);

  const messageCountByAgent = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach(message => {
      if (message.agentId) {
        map.set(message.agentId, (map.get(message.agentId) ?? 0) + 1);
      }
    });
    return map;
  }, [messages]);

  const authorCounts = useMemo(() => {
    let userCount = 0;
    let systemCount = 0;
    const kindCounts: Record<AgentKind, number> = { cloud: 0, local: 0 };

    messages.forEach(message => {
      if (message.author === 'user') {
        userCount += 1;
      } else if (message.author === 'system') {
        systemCount += 1;
      }

      if (message.agentId) {
        const agent = agentMap.get(message.agentId);
        if (agent) {
          kindCounts[agent.kind] += 1;
        }
      }
    });

    return { user: userCount, system: systemCount, byKind: kindCounts };
  }, [agentMap, messages]);

  const typeFilteredMessages = useMemo(() => {
    if (messageTypeFilter === 'all') {
      return messages;
    }
    if (messageTypeFilter === 'public') {
      return messages.filter(message => message.visibility !== 'internal');
    }
    return messages.filter(message => message.visibility === 'internal');
  }, [messageTypeFilter, messages]);

  const actorFilteredMessages = useMemo(() => {
    if (actorFilter === 'all') {
      return typeFilteredMessages;
    }

    if (actorFilter === 'user') {
      return typeFilteredMessages.filter(message => message.author === 'user');
    }

    if (actorFilter === 'system') {
      return typeFilteredMessages.filter(message => message.author === 'system');
    }

    if (actorFilter.startsWith('agent:')) {
      const targetId = actorFilter.slice('agent:'.length);
      return typeFilteredMessages.filter(message => message.agentId === targetId);
    }

    if (actorFilter.startsWith('kind:')) {
      const kind = actorFilter.slice('kind:'.length) as AgentKind;
      return typeFilteredMessages.filter(message => {
        if (!message.agentId) {
          return false;
        }
        const agent = agentMap.get(message.agentId);
        return agent?.kind === kind;
      });
    }

    return typeFilteredMessages;
  }, [actorFilter, agentMap, typeFilteredMessages]);

  const filteredMessages = useMemo(() => {
    if (statusFilter === 'all') {
      return actorFilteredMessages;
    }
    const isPending = statusFilter === 'pending';
    return actorFilteredMessages.filter(message => {
      const messageStatus = message.status ?? 'sent';
      return isPending ? messageStatus === 'pending' : messageStatus !== 'pending';
    });
  }, [actorFilteredMessages, statusFilter]);

  useEffect(() => {
    if (filteredMessages.length === 0) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(prev => {
      const baseline = Math.max(40, prev);
      return Math.min(filteredMessages.length, baseline);
    });
  }, [filteredMessages.length]);

  const visibleMessages = useMemo(() => {
    if (visibleCount === 0) {
      return [] as typeof filteredMessages;
    }
    return filteredMessages.slice(-visibleCount);
  }, [filteredMessages, visibleCount]);

  const getItemSize = useCallback(
    (index: number) => {
      const message = visibleMessages[index];
      if (!message) {
        return 240;
      }
      return sizeMap.current.get(message.id) ?? 240;
    },
    [visibleMessages],
  );

  const registerRowSize = useCallback(
    (index: number, height: number) => {
      const message = visibleMessages[index];
      if (!message) {
        return;
      }
      const nextSize = height + 24; // include spacing between bubbles
      const currentSize = sizeMap.current.get(message.id);
      if (currentSize !== nextSize) {
        sizeMap.current.set(message.id, nextSize);
        listRef.current?.resetAfterIndex(index);
      }
    },
    [visibleMessages],
  );

  const ensureAutoScroll = useCallback(() => {
    if (!isNearBottom) {
      return;
    }
    if (!visibleMessages.length) {
      return;
    }
    listRef.current?.scrollToItem(visibleMessages.length - 1, 'end');
  }, [isNearBottom, visibleMessages.length]);

  useEffect(() => {
    ensureAutoScroll();
  }, [ensureAutoScroll, visibleMessages.length]);

  const handleListScroll = useCallback(
    ({ scrollOffset }: ListOnScrollProps) => {
      if (scrollOffset < 80 && visibleMessages.length < filteredMessages.length) {
        setVisibleCount(prev => Math.min(filteredMessages.length, prev + 20));
      }

      const outer = listOuterRef.current;
      if (!outer) {
        return;
      }
      const maxOffset = outer.scrollHeight - outer.clientHeight;
      setIsNearBottom(maxOffset - scrollOffset < 80);
    },
    [filteredMessages.length, visibleMessages.length],
  );

  const typingAgents = useMemo(() => {
    const pendingIds = new Set(
      filteredMessages
        .filter(message => message.status === 'pending' && message.agentId)
        .map(message => message.agentId as string),
    );

    return Array.from(pendingIds)
      .map(agentId => {
        const agent = agentMap.get(agentId);
        if (!agent) {
          return null;
        }
        return { agent, presence: presenceMap.get(agentId) };
      })
      .filter((entry): entry is { agent: AgentDefinition; presence?: AgentPresenceEntry } => Boolean(entry));
  }, [agentMap, filteredMessages, presenceMap]);

  const presenceCounters = useMemo(() => {
    const counters: Record<AgentPresenceEntry['status'], number> = {
      online: 0,
      offline: 0,
      loading: 0,
      error: 0,
    };
    presenceMap.forEach(entry => {
      counters[entry.status] += 1;
    });
    return counters;
  }, [presenceMap]);

  const activeAgentsCount = useMemo(
    () => agents.filter(agent => agent.active).length,
    [agents],
  );

  const actorFilterSummary = useMemo(() => {
    if (actorFilter === 'all') {
      return 'Todos los actores';
    }
    if (actorFilter === 'user') {
      return 'Usuario';
    }
    if (actorFilter === 'system') {
      return 'Control Hub';
    }
    if (actorFilter.startsWith('kind:')) {
      const kind = actorFilter.slice('kind:'.length);
      return kind === 'cloud' ? 'Agentes en nube' : 'Agentes locales';
    }
    if (actorFilter.startsWith('agent:')) {
      const target = agentMap.get(actorFilter.slice('agent:'.length));
      return target ? getAgentDisplayName(target) : 'Agente seleccionado';
    }
    return 'Filtro personalizado';
  }, [actorFilter, agentMap]);

  const getMessagePreview = useCallback((message: ChatMessage) => {
    const { content } = message;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') {
          return part;
        }
        const typed = part as ChatContentPart;
        if (typed.type === 'text' && 'text' in typed) {
          return typed.text;
        }
      }
    }
    return '[Contenido enriquecido]';
  }, []);

  const feedTimelineItems = useMemo(() => {
    return messages
      .slice(-8)
      .reverse()
      .map(message => {
        const timestampLabel = formatTimestamp(message.timestamp);
        let authorLabel: string;
        if (message.author === 'user') {
          authorLabel = 'Usuario';
        } else if (message.author === 'system') {
          authorLabel = 'Control Hub';
        } else {
          const agent = message.agentId ? agentMap.get(message.agentId) : undefined;
          authorLabel = agent ? getAgentDisplayName(agent) : 'Agente';
        }
        const preview = formatChipLabel(getMessagePreview(message), 120);
        const visibilityTag = message.visibility === 'internal' ? 'Interno' : 'Público';

        return {
          key: message.id,
          color: message.visibility === 'internal' ? 'gray' : 'blue',
          label: timestampLabel,
          children: (
            <div className="feed-timeline-entry">
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space size="small" align="center">
                  <Typography.Text strong>{authorLabel}</Typography.Text>
                  <Tag bordered={false} color={message.status === 'pending' ? 'orange' : 'geekblue'}>
                    {visibilityTag}
                  </Tag>
                </Space>
                <Typography.Paragraph style={{ margin: 0 }} type="secondary">
                  {preview || 'Sin contenido visible'}
                </Typography.Paragraph>
              </Space>
            </div>
          ),
        };
      });
  }, [agentMap, formatChipLabel, formatTimestamp, getMessagePreview, messages]);

  const [autoCompleteOptions, setAutoCompleteOptions] = useState<
    Array<{ value: string; label: React.ReactNode; commandText: string }>
  >([]);

  const actorFilterOptions = useMemo(() => {
    const base: { value: ChatActorFilter; label: React.ReactNode }[] = [
      {
        value: 'all',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Todos</Typography.Text>
            <Badge count={messages.length} size="small" showZero color="blue" />
          </Space>
        ),
      },
      {
        value: 'user',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Usuario</Typography.Text>
            <Badge count={authorCounts.user} size="small" showZero color="geekblue" />
          </Space>
        ),
      },
      {
        value: 'system',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Control Hub</Typography.Text>
            <Badge count={authorCounts.system} size="small" showZero color="purple" />
          </Space>
        ),
      },
    ];

    (['cloud', 'local'] as AgentKind[]).forEach(kind => {
      const total = authorCounts.byKind[kind];
      if (total > 0) {
        base.push({
          value: `kind:${kind}` as ChatActorFilter,
          label: (
            <Space size="small" align="center">
              <Typography.Text>{KIND_LABELS[kind]}</Typography.Text>
              <Badge count={total} size="small" showZero color={kind === 'cloud' ? 'cyan' : 'green'} />
            </Space>
          ),
        });
      }
    });

    agents
      .filter(agent => agent.active)
      .forEach(agent => {
        const presence = presenceMap.get(agent.id);
        const status = presence ? PRESENCE_STATUS_BADGE[presence.status] : 'default';
        const totalMessages = messageCountByAgent.get(agent.id) ?? 0;
        base.push({
          value: `agent:${agent.id}` as ChatActorFilter,
          label: (
            <Space size="small" align="center">
              <Badge status={status} />
              <Typography.Text>{getAgentDisplayName(agent)}</Typography.Text>
              <Badge count={totalMessages} size="small" showZero color={agent.kind === 'cloud' ? 'magenta' : 'lime'} />
            </Space>
          ),
        });
      });

    return base;
  }, [agents, authorCounts, messageCountByAgent, messages.length, presenceMap]);

  const messageTypeOptions = useMemo(
    () => [
      {
        value: 'public',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Mensajes públicos</Typography.Text>
            <Badge count={messageCounts.public} size="small" showZero color="blue" />
          </Space>
        ),
      },
      {
        value: 'internal',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Notas internas</Typography.Text>
            <Badge count={messageCounts.internal} size="small" showZero color="gold" />
          </Space>
        ),
      },
      {
        value: 'all',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Todo el historial</Typography.Text>
            <Badge count={messages.length} size="small" showZero />
          </Space>
        ),
      },
    ],
    [messageCounts.internal, messageCounts.public, messages.length],
  );

  const statusFilterOptions = useMemo(
    () => [
      {
        value: 'all',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Todos los estados</Typography.Text>
            <Badge count={messages.length} size="small" showZero />
          </Space>
        ),
      },
      {
        value: 'pending',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Pendientes</Typography.Text>
            <Badge count={messageCounts.pending} size="small" showZero color="orange" />
          </Space>
        ),
      },
      {
        value: 'sent',
        label: (
          <Space size="small" align="center">
            <Typography.Text>Confirmados</Typography.Text>
            <Badge count={messageCounts.sent} size="small" showZero color="green" />
          </Space>
        ),
      },
    ],
    [messageCounts.pending, messageCounts.sent, messages.length],
  );

  type SuggestionChipType = 'dynamic' | 'command' | 'preset';

  interface SuggestionChip {
    id: string;
    type: SuggestionChipType;
    label: string;
    icon: string;
    badge: string;
    title?: string;
    text?: string;
    onSelect: () => void;
  }

  interface CommandOption {
    value: string;
    label: React.ReactNode;
    commandText: string;
  }

  const formatChipLabel = useCallback((value: string, maxLength = 70) => {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
  }, []);

  const handleApplySuggestion = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }
      appendToDraft(text);
    },
    [appendToDraft],
  );

  const applyCommandPreset = useCallback(
    (preset: CommandPreset) => {
      if (typeof preset.prompt === 'string') {
        setDraft(preset.prompt);
      }

      if (preset.targetMode === 'broadcast' || preset.targetMode === 'independent') {
        setComposerTargetMode(preset.targetMode);
      }

      let resolvedAgentIds: string[] = [];
      if (Array.isArray(preset.agentIds) && preset.agentIds.length > 0) {
        resolvedAgentIds = preset.agentIds.filter(agentId => agentMap.has(agentId));
      }

      if (resolvedAgentIds.length === 0 && preset.provider && preset.model) {
        const providerKey = preset.provider.trim().toLowerCase();
        const normalizedModel = preset.model.trim();
        const matchingAgent = agents.find(agent => {
          return (
            agent.provider.trim().toLowerCase() === providerKey &&
            agent.model.trim() === normalizedModel
          );
        });
        if (matchingAgent) {
          resolvedAgentIds = [matchingAgent.id];
        }
      }

      if (resolvedAgentIds.length > 0) {
        setComposerTargetAgentIds(resolvedAgentIds);
      }
    },
    [agentMap, agents, setComposerTargetAgentIds, setComposerTargetMode, setDraft],
  );

  const suggestionChips = useMemo(() => {
    const chips: SuggestionChip[] = [];

    dynamicSuggestions.forEach(suggestion => {
      chips.push({
        id: suggestion.id,
        type: 'dynamic',
        label: suggestion.label,
        icon: suggestion.icon ?? '💡',
        badge: suggestion.badge ?? 'Contexto',
        title: suggestion.title,
        text: suggestion.text,
        onSelect: () => handleApplySuggestion(suggestion.text),
      });
    });

    recentCommands.forEach((command, index) => {
      chips.push({
        id: `recent-command-${index}`,
        type: 'command',
        label: formatChipLabel(command),
        icon: '🕘',
        badge: 'Reciente',
        title: command,
        text: command,
        onSelect: () => handleApplySuggestion(command),
      });
    });

    quickCommands.forEach((command, index) => {
      chips.push({
        id: `quick-command-${index}`,
        type: 'command',
        label: formatChipLabel(command),
        icon: '⚡',
        badge: 'Atajo',
        title: command,
        text: command,
        onSelect: () => handleApplySuggestion(command),
      });
    });

    settings.commandPresets.forEach(preset => {
      chips.push({
        id: `preset-${preset.id}`,
        type: 'preset',
        label: preset.label,
        icon: '🎯',
        badge: 'Preset',
        title: preset.description ?? preset.label,
        onSelect: () => applyCommandPreset(preset),
      });
    });

    const seen = new Set<string>();
    const normalizedChips = chips.filter(chip => {
      if (!chip.text) {
        return true;
      }
      const normalized = chip.text.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    return normalizedChips.slice(0, 12);
  }, [
    applyCommandPreset,
    dynamicSuggestions,
    formatChipLabel,
    handleApplySuggestion,
    quickCommands,
    recentCommands,
    settings.commandPresets,
  ]);

  const slashCommandPalette = useMemo<CommandOption[]>(
    () =>
      suggestionChips
        .filter(chip => chip.text && chip.text.trim())
        .map(chip => ({
          value: chip.text ?? chip.label,
          commandText: chip.text ?? chip.label,
          label: (
            <Space size="small" align="center">
              <span aria-hidden="true">{chip.icon}</span>
              <Typography.Text>{chip.label}</Typography.Text>
              <Tag bordered={false}>{chip.badge}</Tag>
            </Space>
          ),
        })),
    [suggestionChips],
  );

  const handleAutoCompleteSearch = useCallback(
    (value: string) => {
      if (!value.startsWith('/')) {
        setAutoCompleteOptions([]);
        return;
      }
      const query = value.slice(1).toLowerCase();
      const matches = slashCommandPalette.filter(option =>
        option.commandText.toLowerCase().includes(query),
      );
      setAutoCompleteOptions(matches.slice(0, 8));
    },
    [slashCommandPalette],
  );

  const handleAutoCompleteSelect = useCallback(
    (value: string, option: unknown) => {
      const typed = option as Partial<CommandOption>;
      const commandText = typed.commandText ?? value;
      setDraft(commandText);
      setAutoCompleteOptions([]);
    },
    [setDraft],
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      if (composerError) {
        setComposerError(null);
      }
    },
    [composerError, setDraft],
  );

  const handleMessageTypeChange = useCallback(
    (event: RadioChangeEvent) => {
      setMessageTypeFilter(event.target.value);
    },
    [],
  );

  const handleStatusFilterChange = useCallback(
    (event: RadioChangeEvent) => {
      setStatusFilter(event.target.value);
    },
    [],
  );

  const handleWorkspaceTabChange = useCallback(
    (key: string) => {
      const nextKey = (key as WorkspaceTabKey) ?? 'chat';
      setActiveTabKey(nextKey);
      onTabChange?.(nextKey);
    },
    [onTabChange],
  );

  const handleActorFilterSelect = useCallback(
    (value: ChatActorFilter) => {
      onActorFilterChange?.(value);
    },
    [onActorFilterChange],
  );

  const handleSendMessage = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed && composerAttachments.length === 0) {
      const errorText = 'Escribe un mensaje o adjunta un recurso antes de enviar.';
      setComposerError(errorText);
      antdMessage.warning(errorText);
      return;
    }

    setComposerError(null);
    setIsSending(true);
    try {
      sendMessage();
    } catch (error) {
      setIsSending(false);
      setComposerError('No se pudo enviar el mensaje. Inténtalo de nuevo.');
      antdMessage.error('No se pudo enviar el mensaje.');
    }
  }, [composerAttachments.length, draft, sendMessage]);

  useEffect(() => {
    if (isSending) {
      setIsSending(false);
    }
  }, [isSending, lastUserMessage?.id]);

  useEffect(() => {
    if (composerAttachments.length > 0 || draft.trim()) {
      setComposerError(null);
    }
  }, [composerAttachments.length, draft]);

  const MessageRow: React.FC<ListChildComponentProps> = ({ index, style }) => {
    const message = visibleMessages[index];
    const rowRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
      const node = rowRef.current;
      if (!node || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry) {
          registerRowSize(index, entry.contentRect.height);
        }
      });
      observer.observe(node);
      return () => observer.disconnect();
    }, [index, registerRowSize]);

    if (!message) {
      return null;
    }

    const agent = message.agentId ? agentMap.get(message.agentId) : undefined;
    const chipColor = agent?.accent || 'var(--accent-color)';
    const agentDisplayName = agent ? getAgentDisplayName(agent) : undefined;
    const providerLabel = agent
      ? agent.kind === 'local'
        ? getAgentVersionLabel(agent)
        : agent.provider
      : undefined;

    return (
      <div style={{ ...style, width: '100%' }}>
        <div ref={rowRef} style={{ padding: '12px 0' }}>
          <MessageCard
            message={message}
            chipColor={chipColor}
            agentDisplayName={agentDisplayName}
            providerLabel={providerLabel}
            formatTimestamp={formatTimestamp}
            onAppendToComposer={appendToDraft}
            onShareMessage={(agentId, messageId, canonicalCode) =>
              shareMessageWithAgent(agentId, messageId, { canonicalCode })
            }
            onLoadIntoDraft={loadMessageIntoDraft}
            onTriggerAction={triggerAction}
            onRejectAction={rejectAction}
          />
        </div>
      </div>
    );
  };

  useEffect(() => {
    const providerGate = new Set<string>();
    const validIds = composerTargetAgentIds.filter(agentId => {
      const agent = agentMap.get(agentId);
      if (!agent) {
        return false;
      }
      const providerKey = agent.provider.trim().toLowerCase();
      if (providerGate.has(providerKey)) {
        return false;
      }
      providerGate.add(providerKey);
      return true;
    });
    if (validIds.length !== composerTargetAgentIds.length) {
      setComposerTargetAgentIds(validIds);
    }
  }, [agentMap, composerTargetAgentIds, setComposerTargetAgentIds]);

  const defaultModelByProvider = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(settings.defaultRoutingRules).forEach(rule => {
      if (!rule || typeof rule !== 'object') {
        return;
      }
      const providerKey = rule.provider?.trim().toLowerCase();
      const model = rule.model?.trim();
      if (!providerKey || !model || map.has(providerKey)) {
        return;
      }
      map.set(providerKey, model);
    });
    return map;
  }, [settings.defaultRoutingRules]);

  const providerGroups = useMemo(() => {
    const groups = new Map<string, { key: string; provider: string; agents: AgentDefinition[] }>();
    agents.forEach(agent => {
      const providerKey = agent.provider.trim().toLowerCase();
      if (!providerKey) {
        return;
      }
      const existing = groups.get(providerKey);
      if (existing) {
        existing.agents.push(agent);
      } else {
        groups.set(providerKey, { key: providerKey, provider: agent.provider, agents: [agent] });
      }
    });
    return Array.from(groups.values()).sort((a, b) => a.provider.localeCompare(b.provider));
  }, [agents]);

  const selectedByProvider = useMemo(() => {
    const map = new Map<string, string>();
    composerTargetAgentIds.forEach(agentId => {
      const agent = agentMap.get(agentId);
      if (!agent) {
        return;
      }
      const providerKey = agent.provider.trim().toLowerCase();
      if (!providerKey || map.has(providerKey)) {
        return;
      }
      map.set(providerKey, agentId);
    });
    return map;
  }, [agentMap, composerTargetAgentIds]);

  const handleToggleProvider = useCallback(
    (providerKey: string, groupAgents: AgentDefinition[]) => {
      const existing = selectedByProvider.get(providerKey);
      const groupIds = new Set(groupAgents.map(agent => agent.id));

      if (existing) {
        const remaining = composerTargetAgentIds.filter(agentId => !groupIds.has(agentId));
        setComposerTargetAgentIds(remaining);
        return;
      }

      const preferredModel = defaultModelByProvider.get(providerKey);
      let nextAgent = preferredModel
        ? groupAgents.find(agent => agent.active && agent.model === preferredModel)
        : undefined;

      if (!nextAgent) {
        nextAgent = groupAgents.find(agent => agent.active) ?? groupAgents[0];
      }

      if (!nextAgent) {
        return;
      }

      const remaining = composerTargetAgentIds.filter(agentId => !groupIds.has(agentId));
      setComposerTargetAgentIds([...remaining, nextAgent.id]);
    },
    [
      composerTargetAgentIds,
      defaultModelByProvider,
      selectedByProvider,
      setComposerTargetAgentIds,
    ],
  );

  const handleAgentChoiceChange = useCallback(
    (agentId: string, groupAgents: AgentDefinition[]) => {
      const normalized = agentId.trim();
      const groupIds = new Set(groupAgents.map(agent => agent.id));
      const remaining = composerTargetAgentIds.filter(id => !groupIds.has(id));
      if (normalized) {
        setComposerTargetAgentIds([...remaining, normalized]);
      } else {
        setComposerTargetAgentIds(remaining);
      }
    },
    [composerTargetAgentIds, setComposerTargetAgentIds],
  );

  const handleClearSelection = useCallback(() => {
    setComposerTargetAgentIds([]);
  }, [setComposerTargetAgentIds]);

  const handleSavePreset = useCallback(() => {
    if (composerTargetAgentIds.length === 0) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const selectionLabel = composerTargetAgentIds
      .map(agentId => agentMap.get(agentId))
      .filter((agent): agent is AgentDefinition => Boolean(agent))
      .map(agent => getAgentDisplayName(agent))
      .join(' + ');

    const input = window.prompt('Nombre del preset', selectionLabel || 'Nuevo preset');
    if (!input) {
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const firstAgent = agentMap.get(composerTargetAgentIds[0]);
    const newPreset: CommandPreset = {
      id: `preset-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`,
      label: trimmed,
      prompt: draft,
      description: selectionLabel || undefined,
      provider: firstAgent?.provider,
      model: firstAgent?.model,
      agentIds: composerTargetAgentIds,
      targetMode: composerTargetMode,
    };

    onSettingsChange(prev => ({
      ...prev,
      commandPresets: [...prev.commandPresets, newPreset],
    }));
  }, [
    agentMap,
    composerTargetAgentIds,
    composerTargetMode,
    draft,
    onSettingsChange,
  ]);

  const getCostHint = useCallback((agent?: AgentDefinition) => {
    if (!agent) {
      return { badge: '€€', title: 'Coste estimado' };
    }
    if (agent.kind === 'local') {
      return LOCAL_COST_HINT;
    }
    const providerKey = agent.provider.trim().toLowerCase();
    return COST_HINTS[providerKey] ?? {
      badge: '€€',
      title: `Coste estimado (${agent.provider})`,
    };
  }, []);

  const formatLatency = useCallback((entry?: AgentPresenceEntry) => {
    if (!entry) {
      return 'latencia desconocida';
    }
    if (typeof entry.latencyMs === 'number') {
      return `~${entry.latencyMs} ms`;
    }
    if (entry.status === 'loading') {
      return 'calculando latencia…';
    }
    if (entry.status === 'online') {
      return 'latencia estable';
    }
    return 'sin respuesta';
  }, []);

  const handleAddAttachments = useCallback(
    (items: ChatAttachment[]) => {
      items.forEach(attachment => addAttachment(attachment));
    },
    [addAttachment],
  );

  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      const target = composerAttachments.find(attachment => attachment.id === attachmentId);
      if (target?.url && typeof URL !== 'undefined' && target.url.startsWith('blob:')) {
        URL.revokeObjectURL(target.url);
      }
      removeAttachment(attachmentId);
      composerTranscriptions
        .filter(transcription => transcription.attachmentId === attachmentId)
        .forEach(transcription => removeTranscription(transcription.id));
    },
    [composerAttachments, composerTranscriptions, removeAttachment, removeTranscription],
  );

  const handleRecordingComplete = useCallback(
    (attachment: ChatAttachment, transcription?: ChatTranscription) => {
      addAttachment(attachment);
      if (transcription) {
        upsertTranscription(transcription);
      }
    },
    [addAttachment, upsertTranscription],
  );

  const chatTabContent = (
    <div className="chat-tab-panel">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space wrap align="center" size="middle" className="workspace-filter-bar">
          <Select
            value={actorFilter}
            onChange={value => handleActorFilterSelect(value as ChatActorFilter)}
            options={actorFilterOptions}
            style={{ minWidth: 220 }}
            placeholder="Filtro de actores"
            disabled={!onActorFilterChange}
          />
          <Radio.Group
            value={messageTypeFilter}
            onChange={handleMessageTypeChange}
            optionType="button"
            buttonStyle="solid"
          >
            {messageTypeOptions.map(option => (
              <Radio.Button key={option.value} value={option.value}>
                {option.label}
              </Radio.Button>
            ))}
          </Radio.Group>
          <Radio.Group
            value={statusFilter}
            onChange={handleStatusFilterChange}
            optionType="button"
            buttonStyle="solid"
          >
            {statusFilterOptions.map(option => (
              <Radio.Button key={option.value} value={option.value}>
                {option.label}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Space>

        <div className="chat-feed" aria-label="Historial de mensajes">
          <div className="message-feed" ref={feedContainerRef}>
            {filteredMessages.length === 0 ? (
              <div className="message-feed-empty">No hay mensajes para el filtro seleccionado.</div>
            ) : feedSize.height === 0 ? (
              <div className="message-feed-loading">
                <Spin indicator={<LoadingOutlined spin />} />
              </div>
            ) : (
              <VariableSizeList
                ref={listRef}
                outerRef={listOuterRef}
                height={feedSize.height}
                width={feedSize.width}
                itemCount={visibleMessages.length}
                itemSize={getItemSize}
                itemKey={index => visibleMessages[index]?.id ?? index}
                onScroll={handleListScroll}
                overscanCount={8}
              >
                {MessageRow}
              </VariableSizeList>
            )}
          </div>
        </div>

        {typingAgents.length > 0 && (
          <Space wrap size="small" className="typing-indicators">
            {typingAgents.map(({ agent, presence }) => (
              <Tag key={agent.id} color="processing" icon={<LoadingOutlined spin />}>
                {getAgentDisplayName(agent)}{' '}
                {presence?.status === 'loading' ? 'calibrando…' : 'escribiendo…'}
              </Tag>
            ))}
          </Space>
        )}

        <div className="composer-routing">
          <div className="composer-routing-header">
            <Typography.Title level={5}>Destinatarios activos</Typography.Title>
            <Space>
              <Button type="text" size="small" onClick={handleClearSelection}>
                Limpiar selección
              </Button>
              <Button type="text" size="small" icon={<ThunderboltOutlined />} onClick={handleSavePreset}>
                Guardar preset
              </Button>
            </Space>
          </div>
          <div className="composer-routing-grid">
            {providerGroups.length === 0 ? (
              <div className="routing-empty">No hay proveedores configurados.</div>
            ) : (
              providerGroups.map(group => {
                const selectedId = selectedByProvider.get(group.key) ?? null;
                const recommendedModel = defaultModelByProvider.get(group.key);
                const recommendedAgent = recommendedModel
                  ? group.agents.find(agent => agent.active && agent.model === recommendedModel)
                  : undefined;
                const fallbackAgent = group.agents.find(agent => agent.active) ?? group.agents[0];
                const displayAgent = selectedId
                  ? group.agents.find(agent => agent.id === selectedId) ?? fallbackAgent
                  : recommendedAgent ?? fallbackAgent;
                const presenceEntry = displayAgent ? presenceMap.get(displayAgent.id) : undefined;
                const costHint = getCostHint(displayAgent);
                const status = presenceEntry?.status ?? 'offline';
                const statusLabel = PRESENCE_LABEL[status as AgentPresenceEntry['status']] ?? 'sin datos';
                const latencyLabel = formatLatency(presenceEntry);
                const selectable = group.agents.some(agent => agent.active);

                return (
                  <div key={group.key} className="routing-provider-card">
                    <Button
                      type={selectedId ? 'primary' : 'default'}
                      block
                      onClick={() => handleToggleProvider(group.key, group.agents)}
                      disabled={!selectable}
                    >
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space align="center" justify="space-between">
                          <Typography.Text strong>{group.provider}</Typography.Text>
                          <Tag>{costHint.badge}</Tag>
                        </Space>
                        <Typography.Text type="secondary">
                          {displayAgent ? getAgentDisplayName(displayAgent) : 'Sin modelos disponibles'}
                        </Typography.Text>
                      </Space>
                    </Button>
                    {group.agents.length > 1 && (
                      <Select
                        className="routing-provider-select"
                        value={selectedId ?? undefined}
                        onChange={value => handleAgentChoiceChange(value, group.agents)}
                        placeholder="Selecciona modelo"
                        disabled={!selectedId}
                        options={group.agents.map(agent => ({
                          label: `${getAgentDisplayName(agent)} (${agent.model})${agent.active ? '' : ' – inactivo'}`,
                          value: agent.id,
                          disabled: !agent.active,
                        }))}
                      />
                    )}
                    <Space size="small" className="routing-provider-meta">
                      <Badge status={PRESENCE_STATUS_BADGE[status]} text={statusLabel} />
                      <Typography.Text type="secondary">{latencyLabel}</Typography.Text>
                    </Space>
                  </div>
                );
              })
            )}
          </div>
          <Space align="center" className="routing-mode-row">
            <Typography.Text strong>Modo de envío</Typography.Text>
            <Radio.Group
              value={composerTargetMode}
              onChange={event => setComposerTargetMode(event.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="broadcast">Un único prompt para todos</Radio.Button>
              <Radio.Button value="independent">Duplicar y enviar por agente</Radio.Button>
            </Radio.Group>
          </Space>
        </div>

        {suggestionChips.length > 0 && (
          <Space wrap className="chat-suggestions" size="small">
            {suggestionChips.map(chip => (
              <Button key={chip.id} onClick={chip.onSelect} icon={<span>{chip.icon}</span>}>
                <Space>
                  <span>{chip.label}</span>
                  <Tag bordered={false}>{chip.badge}</Tag>
                </Space>
              </Button>
            ))}
          </Space>
        )}

        {composerTranscriptions.length > 0 && (
          <Space wrap className="composer-transcriptions" size="small">
            {composerTranscriptions.map(transcription => (
              <Tag
                key={transcription.id}
                closable
                onClose={() => removeTranscription(transcription.id)}
                color="processing"
              >
                {transcription.modality ?? 'audio'}: {transcription.text}
              </Tag>
            ))}
          </Space>
        )}

        <Space align="center" size="middle">
          <AttachmentPicker
            attachments={composerAttachments}
            onAdd={handleAddAttachments}
            onRemove={handleRemoveAttachment}
            triggerAriaLabel="Adjuntar archivos"
            triggerTooltip="Adjuntar archivos"
          />
          <AudioRecorder onRecordingComplete={handleRecordingComplete} />
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => setAutoCompleteOptions(slashCommandPalette.slice(0, 6))}
          >
            Comandos rápidos
          </Button>
        </Space>

        <AutoComplete
          value={draft}
          onChange={handleDraftChange}
          onSearch={handleAutoCompleteSearch}
          onSelect={handleAutoCompleteSelect}
          options={autoCompleteOptions}
          style={{ width: '100%' }}
          placeholder="Escribe / para ver comandos disponibles"
        >
          <TextArea
            rows={4}
            onPressEnter={event => {
              if (!event.shiftKey) {
                event.preventDefault();
                handleSendMessage();
              }
            }}
            autoSize={{ minRows: 4, maxRows: 8 }}
          />
        </AutoComplete>
        {composerError && <Typography.Text type="danger">{composerError}</Typography.Text>}

        <Space align="center" justify="space-between">
          <Space size="small">
            <Typography.Text type="secondary">
              Selecciona destinatarios en el panel superior o inicia con «nombre:» para dirigir la petición.
            </Typography.Text>
            {lastUserMessage && (
              <Typography.Text type="secondary">
                Último mensaje a las {formatTimestamp(lastUserMessage.timestamp)}
              </Typography.Text>
            )}
            {composerModalities.length > 0 && (
              <Tag color="blue">Modalidades: {composerModalities.join(', ')}</Tag>
            )}
          </Space>
          <Space>
            <Button onClick={() => setDraft('')} disabled={!draft.trim() && composerAttachments.length === 0}>
              Limpiar
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              loading={isSending}
              disabled={!draft.trim() && composerAttachments.length === 0}
            >
              Enviar
            </Button>
          </Space>
        </Space>
      </Space>
    </div>
  );

  const feedTabContent = (
    <div className="chat-feed-tab">
      {feedTimelineItems.length === 0 ? (
        <Empty description="Sin actividad reciente en el feed" />
      ) : (
        <Timeline mode="left" items={feedTimelineItems} />
      )}
    </div>
  );

  const detailsTabContent = (
    <div className="chat-details-tab">
      <Typography.Title level={5}>Diagnóstico rápido</Typography.Title>
      <Descriptions size="small" column={2} colon={false} className="chat-details-descriptions">
        <Descriptions.Item label="Mensajes públicos">{messageCounts.public}</Descriptions.Item>
        <Descriptions.Item label="Notas internas">{messageCounts.internal}</Descriptions.Item>
        <Descriptions.Item label="Confirmados">{messageCounts.sent}</Descriptions.Item>
        <Descriptions.Item label="Pendientes">{messageCounts.pending}</Descriptions.Item>
      </Descriptions>
      <Divider />
      <Space wrap size="small">
        <Tag color="blue">Adjuntos: {composerAttachments.length}</Tag>
        <Tag color="magenta">Comandos recientes: {recentCommands.length}</Tag>
        <Tag color="geekblue">Sugerencias activas: {dynamicSuggestions.length}</Tag>
        {composerModalities.length > 0 ? (
          <Tag color="cyan">Modalidades: {composerModalities.join(', ')}</Tag>
        ) : (
          <Tag color="default">Modalidades: texto</Tag>
        )}
      </Space>
    </div>
  );

  const summaryPanel = (
    <div className="chat-summary-panel">
      <Typography.Title level={5}>Resumen de la sesión</Typography.Title>
      <Space size="large" className="chat-summary-metrics">
        <Statistic title="Mensajes" value={messages.length} />
        <Statistic title="Pendientes" value={messageCounts.pending} />
        <Statistic title="Agentes" value={activeAgentsCount} suffix={` / ${agents.length}`} />
      </Space>
      <Divider />
      <Descriptions size="small" column={1} colon={false} labelStyle={{ minWidth: 160 }}>
        <Descriptions.Item label="Último mensaje">
          {lastUserMessage ? formatTimestamp(lastUserMessage.timestamp) : 'Sin actividad reciente'}
        </Descriptions.Item>
        <Descriptions.Item label="Filtro aplicado">{actorFilterSummary}</Descriptions.Item>
        <Descriptions.Item label="Modo de envío">
          {composerTargetMode === 'broadcast' ? 'Broadcast simultáneo' : 'Independiente por agente'}
        </Descriptions.Item>
        <Descriptions.Item label="Destinatarios seleccionados">
          {composerTargetAgentIds.length > 0 ? composerTargetAgentIds.length : 'Automático'}
        </Descriptions.Item>
      </Descriptions>
      <Divider />
      <Space wrap size="small" className="chat-summary-status">
        <Tag color="success">Online: {presenceCounters.online}</Tag>
        <Tag color="processing">Calibrando: {presenceCounters.loading}</Tag>
        <Tag color="default">En espera: {presenceCounters.offline}</Tag>
        <Tag color="error">Incidencias: {presenceCounters.error}</Tag>
      </Space>
    </div>
  );

  return (
    <div className="chat-workspace-shell">
      <div className="chat-workspace-main">
        <Tabs
          className="chat-workspace-tabs"
          activeKey={activeTabKey}
          onChange={handleWorkspaceTabChange}
          items={[
            { key: 'chat', label: 'Chat', children: chatTabContent },
            { key: 'feed', label: 'Feed', children: feedTabContent },
            { key: 'details', label: 'Detalles', children: detailsTabContent },
          ]}
        />
      </div>
      <aside className="chat-workspace-sideinfo">{summaryPanel}</aside>
    </div>
  );
};

export default ChatWorkspace;
