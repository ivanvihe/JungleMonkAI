import React, { useCallback } from 'react';
import { useAgents } from '../../core/agents/AgentContext';
import { useMessages } from '../../core/messages/MessageContext';
import { AttachmentPicker } from './composer/AttachmentPicker';
import { AudioRecorder } from './composer/AudioRecorder';
import { MessageAttachment } from './messages/MessageAttachment';
import { AudioPlayer } from './messages/AudioPlayer';
import { ChatAttachment, ChatContentPart, ChatTranscription } from '../../core/messages/messageTypes';

interface ChatWorkspaceProps {
  sidePanel: React.ReactNode;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({ sidePanel }) => {
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

  const renderContentPart = useCallback(
    (part: ChatContentPart | string, index: number, transcriptions?: ChatTranscription[]) => {
      if (typeof part === 'string') {
        return (
          <p key={`text-${index}`} className="message-card-content">
            {part}
          </p>
        );
      }

      if (part.type === 'text') {
        return (
          <p key={`text-${index}`} className="message-card-content">
            {part.text}
          </p>
        );
      }

      if (part.type === 'image') {
        return (
          <figure key={`image-${index}`} className="message-card-media">
            <img src={part.url} alt={part.alt ?? 'Imagen generada'} />
            {part.alt && <figcaption>{part.alt}</figcaption>}
          </figure>
        );
      }

      if (part.type === 'audio') {
        const relatedTranscriptions = transcriptions?.filter(item => !item.attachmentId);
        return (
          <div key={`audio-${index}`} className="message-card-media">
            <AudioPlayer src={part.url} title="Respuesta de audio" transcriptions={relatedTranscriptions} />
          </div>
        );
      }

      if (part.type === 'file') {
        return (
          <div key={`file-${index}`} className="message-card-media">
            <a href={part.url} target="_blank" rel="noreferrer">
              {part.name ?? 'Archivo'}
            </a>
          </div>
        );
      }

      return null;
    },
    [],
  );

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
                          <span className="message-card-time">{formatTimestamp(message.timestamp)}</span>
                          {message.status === 'pending' && <span className="message-card-status">orquestando…</span>}
                        </div>
                      </div>
                      <div className="message-card-body">
                        {Array.isArray(message.content)
                          ? message.content.map((part, index) =>
                              renderContentPart(part, index, message.transcriptions),
                            )
                          : renderContentPart(message.content, 0, message.transcriptions)}
                        {message.attachments?.length ? (
                          <div className="message-card-attachments">
                            {message.attachments.map(attachment => (
                              <MessageAttachment
                                key={attachment.id}
                                attachment={attachment}
                                transcriptions={message.transcriptions}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {message.modalities?.length ? (
                        <div className="message-card-modalities">
                          {message.modalities.map(modality => (
                            <span key={modality} className="modality-chip">
                              {modality}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
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
