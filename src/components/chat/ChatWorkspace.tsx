import React, { useCallback, useEffect, useMemo } from 'react';
import { useAgents } from '../../core/agents/AgentContext';
import { useMessages } from '../../core/messages/MessageContext';
import { useConversationSuggestions } from '../../core/messages/useConversationSuggestions';
import { AttachmentPicker } from './composer/AttachmentPicker';
import { AudioRecorder } from './composer/AudioRecorder';
import { ChatAttachment, ChatTranscription } from '../../core/messages/messageTypes';
import { ChatActorFilter } from '../../types/chat';
import { AgentKind } from '../../core/agents/agentRegistry';
import type { AgentDefinition } from '../../core/agents/agentRegistry';
import { getAgentDisplayName, getAgentVersionLabel } from '../../utils/agentDisplay';
import { MessageCard } from './messages/MessageCard';
import type { GlobalSettings, CommandPreset } from '../../types/globalSettings';
import type { AgentPresenceEntry } from '../../core/agents/presence';
interface ChatWorkspaceProps {
  actorFilter: ChatActorFilter;
  settings: GlobalSettings;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
  presenceMap: Map<string, AgentPresenceEntry>;
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

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  actorFilter,
  settings,
  onSettingsChange,
  presenceMap,
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
  } = useMessages();
  const { dynamicSuggestions, recentCommands } = useConversationSuggestions();

  const publicMessages = useMemo(
    () => messages.filter(message => message.visibility !== 'internal'),
    [messages],
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

  const formatChipLabel = useCallback((value: string, maxLength = 70) => {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
  }, []);

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

  const filteredMessages = useMemo(() => {
    if (actorFilter === 'all') {
      return publicMessages;
    }

    if (actorFilter === 'user') {
      return publicMessages.filter(message => message.author === 'user');
    }

    if (actorFilter === 'system') {
      return publicMessages.filter(message => message.author === 'system');
    }

    if (actorFilter.startsWith('agent:')) {
      const targetId = actorFilter.slice('agent:'.length);
      return publicMessages.filter(message => message.agentId === targetId);
    }

    if (actorFilter.startsWith('kind:')) {
      const kind = actorFilter.slice('kind:'.length) as AgentKind;
      return publicMessages.filter(message => {
        if (!message.agentId) {
          return false;
        }
        const agent = agentMap.get(message.agentId);
        return agent?.kind === kind;
      });
    }

    return publicMessages;
  }, [actorFilter, agentMap, publicMessages]);

  return (
    <div className="chat-workspace">
      <section className="chat-feed" aria-label="Historial de mensajes">
        <div className="message-feed">
          {filteredMessages.length === 0 ? (
            <div className="message-feed-empty">No hay mensajes para el filtro seleccionado.</div>
          ) : (
            filteredMessages.map(message => {
              const agent = message.agentId ? agentMap.get(message.agentId) : undefined;
              const chipColor = agent?.accent || 'var(--accent-color)';
              const agentDisplayName = agent ? getAgentDisplayName(agent) : undefined;
              const providerLabel = agent
                ? agent.kind === 'local'
                  ? getAgentVersionLabel(agent)
                  : agent.provider
                : undefined;

              return (
                <MessageCard
                  key={message.id}
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
                />
              );
            })
          )}
        </div>
      </section>

      <section className="chat-composer-area" aria-label="Redactor de mensajes">
        <div className="chat-composer">
          <div className="composer-header">
            <div className="composer-routing-panel" aria-label="Selección de agentes">
              <div className="routing-panel-header">
                <span className="routing-panel-title">Destinatarios</span>
                <div className="routing-panel-actions">
                  <button
                    type="button"
                    className="routing-action"
                    onClick={handleClearSelection}
                    disabled={composerTargetAgentIds.length === 0}
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    className="routing-action"
                    onClick={handleSavePreset}
                    disabled={composerTargetAgentIds.length === 0}
                  >
                    Guardar preset
                  </button>
                </div>
              </div>
              <div className="routing-provider-grid">
                {providerGroups.length === 0 ? (
                  <p className="routing-empty">
                    Activa agentes desde la barra lateral para planificar envíos colaborativos.
                  </p>
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
                      <div
                        key={group.key}
                        className={`routing-provider ${selectedId ? 'is-selected' : ''} ${!selectable ? 'is-disabled' : ''}`}
                      >
                        <button
                          type="button"
                          className="routing-provider-toggle"
                          onClick={() => handleToggleProvider(group.key, group.agents)}
                          disabled={!selectable}
                          aria-pressed={Boolean(selectedId)}
                        >
                          <span className="routing-provider-check" aria-hidden="true">
                            {selectedId ? '☑' : '☐'}
                          </span>
                          <span className="routing-provider-name">{group.provider}</span>
                          <span className="routing-provider-model">
                            {displayAgent ? getAgentDisplayName(displayAgent) : 'Sin modelos disponibles'}
                          </span>
                          <span className="routing-provider-cost" title={costHint.title}>
                            {costHint.badge}
                          </span>
                        </button>
                        {group.agents.length > 1 && (
                          <select
                            className="routing-provider-select"
                            value={selectedId ?? ''}
                            onChange={event => handleAgentChoiceChange(event.target.value, group.agents)}
                            disabled={!selectedId}
                          >
                            <option value="" disabled>
                              Selecciona modelo…
                            </option>
                            {group.agents.map(agent => (
                              <option key={agent.id} value={agent.id} disabled={!agent.active}>
                                {getAgentDisplayName(agent)} ({agent.model})
                                {!agent.active ? ' – inactivo' : ''}
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="routing-provider-meta">
                          <span className={`routing-status routing-status--${status}`}>
                            <span className="routing-status-dot" aria-hidden="true" />
                            {statusLabel}
                          </span>
                          <span className="routing-latency">{latencyLabel}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="routing-mode-row">
                <label className="routing-mode-label">
                  <span>Modo de envío</span>
                  <select
                    value={composerTargetMode}
                    onChange={event =>
                      setComposerTargetMode(event.target.value as 'broadcast' | 'independent')
                    }
                  >
                    <option value="broadcast">Un único prompt para todos</option>
                    <option value="independent">Duplicar y enviar por agente</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="chat-suggestions">
              <span className="suggestions-label">Sugerencias</span>
              <div className="suggestion-chip-row">
                {suggestionChips.map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`suggestion-chip suggestion-chip--${chip.type}`}
                    onClick={chip.onSelect}
                    title={chip.title ?? chip.label}
                    aria-label={`Insertar sugerencia: ${chip.label}`}
                  >
                    <span aria-hidden="true" className="suggestion-chip-icon">
                      {chip.icon}
                    </span>
                    <span className="suggestion-chip-text">{chip.label}</span>
                    <span className="suggestion-chip-badge">{chip.badge}</span>
                  </button>
                ))}
              </div>
            </div>
            {composerTranscriptions.length > 0 && (
              <div className="composer-transcriptions">
                {composerTranscriptions.map(transcription => (
                  <div key={transcription.id} className="transcription-preview">
                    <span className="transcription-label">{transcription.modality ?? 'audio'}</span>
                    <span className="transcription-text">{transcription.text}</span>
                    <button
                      type="button"
                      className="icon-button compact subtle"
                      onClick={() => removeTranscription(transcription.id)}
                      aria-label={`Eliminar transcripción ${transcription.modality ?? 'audio'}`}
                      title="Eliminar transcripción"
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="composer-extensions">
            <AttachmentPicker
              attachments={composerAttachments}
              onAdd={handleAddAttachments}
              onRemove={handleRemoveAttachment}
              triggerAriaLabel="Adjuntar archivos"
              triggerTooltip="Adjuntar archivos"
            />
            <AudioRecorder onRecordingComplete={handleRecordingComplete} />
          </div>

          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="Habla con varios agentes a la vez: por ejemplo “gpt, genera un esquema de estilos”"
            className="chat-input"
            rows={3}
          />

          <div className="composer-toolbar">
            <div className="composer-hints">
              <span>
                Selecciona destinatarios en el panel superior o inicia la línea con «nombre:» para dirigirla a un
                proveedor específico.
              </span>
              {lastUserMessage && (
                <span className="composer-last">Último mensaje a las {formatTimestamp(lastUserMessage.timestamp)}</span>
              )}
              {composerModalities.length > 0 && (
                <span className="composer-modalities">Modalidades: {composerModalities.join(', ')}</span>
              )}
            </div>
            <div className="composer-actions">
              <button
                type="button"
                className="icon-button compact subtle"
                onClick={() => setDraft('')}
                disabled={!draft.trim()}
                aria-label="Limpiar borrador"
                title="Limpiar borrador"
              >
                <span aria-hidden="true">🧹</span>
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={sendMessage}
                disabled={!draft.trim() && composerAttachments.length === 0}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
