import React, { useCallback } from 'react';
import { ChatMessage } from '../../../core/messages/messageTypes';
import { MessageContent } from './MessageContent';
import { MessageAttachment } from './MessageAttachment';

interface MessageCardProps {
  message: ChatMessage;
  chipColor: string;
  agentDisplayName?: string;
  providerLabel?: string;
  formatTimestamp: (timestamp: string) => string;
  onAppendToComposer?: (value: string) => void;
  onShareMessage?: (agentId: string, messageId: string, canonicalCode?: string) => void;
  onLoadIntoDraft?: (messageId: string) => void;
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  chipColor,
  agentDisplayName,
  providerLabel,
  formatTimestamp,
  onAppendToComposer,
  onShareMessage,
  onLoadIntoDraft,
}) => {
  const isUser = message.author === 'user';
  const isSystem = message.author === 'system';
  const authorLabel = isUser ? 'Tú' : isSystem ? 'Control Hub' : agentDisplayName ?? 'Agente';
  const handleShare = useCallback(
    (agentId: string, canonicalCode?: string) => {
      if (!onShareMessage) {
        return;
      }
      onShareMessage(agentId, message.id, canonicalCode);
    },
    [message.id, onShareMessage],
  );

  return (
    <div
      className={`message-card ${isUser ? 'message-user' : ''} ${isSystem ? 'message-system' : ''}`}
      data-author={message.author}
    >
      <div className="message-card-header">
        <div className="message-card-author" style={{ borderColor: chipColor }}>
          {authorLabel}
        </div>
        <div className="message-card-meta">
          {!isUser && !isSystem && providerLabel ? (
            <span className="message-card-tag" style={{ color: chipColor }}>
              {providerLabel}
            </span>
          ) : null}
          <span className="message-card-time">{formatTimestamp(message.timestamp)}</span>
          {!isUser && onLoadIntoDraft ? (
            <button type="button" className="message-card-action" onClick={() => onLoadIntoDraft(message.id)}>
              Usar como borrador
            </button>
          ) : null}
          {message.status === 'pending' && <span className="message-card-status">orquestando…</span>}
        </div>
      </div>

      <div className="message-card-body">
        <MessageContent
          messageId={message.id}
          content={message.content}
          transcriptions={message.transcriptions}
          onAppendToComposer={!isUser ? onAppendToComposer : undefined}
          onShare={!isUser ? handleShare : undefined}
        />
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
};

export default MessageCard;
