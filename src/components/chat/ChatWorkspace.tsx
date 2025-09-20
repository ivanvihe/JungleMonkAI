import React, { useCallback, useMemo } from 'react';
import { useAgents } from '../../core/agents/AgentContext';
import { useMessages } from '../../core/messages/MessageContext';
import { AttachmentPicker } from './composer/AttachmentPicker';
import { AudioRecorder } from './composer/AudioRecorder';
import { ChatAttachment } from '../../core/messages/messageTypes';
import { ChatActorFilter } from '../../types/chat';
import { AgentKind } from '../../core/agents/agentRegistry';
import { getAgentDisplayName, getAgentVersionLabel } from '../../utils/agentDisplay';
import { MessageCard } from './messages/MessageCard';

interface ChatWorkspaceProps {
  sidePanel: React.ReactNode;
  actorFilter: ChatActorFilter;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({ sidePanel, actorFilter }) => {
  const { activeAgents, agentMap } = useAgents();
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
    pendingResponses,
    lastUserMessage,
    quickCommands,
    formatTimestamp,
  } = useMessages();

  const publicMessages = useMemo(() => messages.filter(message => message.visibility !== 'internal'), [messages]);

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
    <>
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
                {filteredMessages.length === 0 ? (
                  <div className="message-feed-empty">
                    No hay mensajes para el filtro seleccionado.
                  </div>
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
                      />
                    );
                  })}
              </div>

              <div className="chat-suggestions">
                <span className="suggestions-label">Sugerencias:</span>
                {quickCommands.slice(0, 3).map(command => (
                  <button
                    key={command}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => appendToDraft(command)}
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
                <div className="composer-extensions">
                  <AttachmentPicker
                    attachments={composerAttachments}
                    onAdd={handleAddAttachments}
                    onRemove={handleRemoveAttachment}
                  />
                  <AudioRecorder onRecordingComplete={handleRecordingComplete} />
                  {composerTranscriptions.length > 0 && (
                    <div className="composer-transcriptions">
                      {composerTranscriptions.map(transcription => (
                        <div key={transcription.id} className="transcription-preview">
                          <span className="transcription-label">{transcription.modality ?? 'audio'}</span>
                          <span className="transcription-text">{transcription.text}</span>
                          <button
                            type="button"
                            className="attachment-remove"
                            onClick={() => removeTranscription(transcription.id)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="composer-toolbar">
                  <div className="composer-hints">
                    <span>Usa @ para mencionar modelos concretos</span>
                    {lastUserMessage && (
                      <span className="composer-last">Último mensaje a las {formatTimestamp(lastUserMessage.timestamp)}</span>
                    )}
                    {composerModalities.length > 0 && (
                      <span className="composer-modalities">Modalidades: {composerModalities.join(', ')}</span>
                    )}
                  </div>
                  <div className="composer-actions">
                    <button type="button" className="ghost-button" onClick={() => setDraft('')} disabled={!draft.trim()}>
                      Limpiar
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={sendMessage}
                      disabled={!draft.trim() && composerAttachments.length === 0}
                    >
                      Enviar a {activeAgents.length || 'ningún'} agente{activeAgents.length === 1 ? '' : 's'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {sidePanel}
      </div>
    </>
  );
};
