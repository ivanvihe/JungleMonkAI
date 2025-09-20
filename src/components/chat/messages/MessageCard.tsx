import React from 'react';
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
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  chipColor,
  agentDisplayName,
  providerLabel,
  formatTimestamp,
  onAppendToComposer,
}) => {
  const isUser = message.author === 'user';
  const isSystem = message.author === 'system';
  const authorLabel = isUser ? 'Tú' : isSystem ? 'Control Hub' : agentDisplayName ?? 'Agente';

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
          {message.status === 'pending' && <span className="message-card-status">orquestando…</span>}
        </div>
      </div>

      <div className="message-card-body">
        <MessageContent
          content={message.content}
          transcriptions={message.transcriptions}
          onAppendToComposer={!isUser ? onAppendToComposer : undefined}
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
