import React, { useCallback, useMemo } from 'react';
import { Card, Typography, Tag, Space, Avatar, Badge, Button } from 'antd';
import { ChatMessage } from '../../../core/messages/messageTypes';
import { MessageContent } from './MessageContent';
import { MessageAttachment } from './MessageAttachment';
import { JarvisActionControls } from './MessageActions';

interface MessageCardProps {
  message: ChatMessage;
  chipColor: string;
  agentDisplayName?: string;
  providerLabel?: string;
  formatTimestamp: (timestamp: string) => string;
  onAppendToComposer?: (value: string) => void;
  onShareMessage?: (agentId: string, messageId: string, canonicalCode?: string) => void;
  onLoadIntoDraft?: (messageId: string) => void;
  onTriggerAction?: (actionId: string) => void;
  onRejectAction?: (actionId: string) => void;
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
  onTriggerAction,
  onRejectAction,
}) => {
  const isUser = message.author === 'user';
  const isSystem = message.author === 'system';
  const authorLabel = isUser ? 'Tú' : isSystem ? 'Control Hub' : agentDisplayName ?? 'Agente';
  const initials = useMemo(() => authorLabel.charAt(0).toUpperCase(), [authorLabel]);
  const handleShare = useCallback(
    (agentId: string, canonicalCode?: string) => {
      if (!onShareMessage) {
        return;
      }
      onShareMessage(agentId, message.id, canonicalCode);
    },
    [message.id, onShareMessage],
  );

  const cardStatus = useMemo(() => {
    if (message.status === 'pending') {
      return <Badge status="processing" text="orquestando…" />;
    }
    if (message.feedback?.hasError) {
      return <Badge status="error" text="requiere revisión" />;
    }
    return null;
  }, [message.feedback?.hasError, message.status]);

  const cardTone = useMemo(() => {
    if (isUser) {
      return '#e6f7ff';
    }
    if (isSystem) {
      return '#f5f5f5';
    }
    return '#ffffff';
  }, [isSystem, isUser]);

  return (
    <Card
      className={`message-card message-card--${message.author}`}
      bordered={false}
      style={{ background: cardTone }}
      data-author={message.author}
    >
      <Space align="start" size="large" style={{ width: '100%' }}>
        <Avatar style={{ backgroundColor: chipColor, color: '#fff' }}>{initials}</Avatar>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space wrap align="center">
            <Typography.Text strong>{authorLabel}</Typography.Text>
            {!isUser && !isSystem && providerLabel ? <Tag color={chipColor}>{providerLabel}</Tag> : null}
            <Typography.Text type="secondary">{formatTimestamp(message.timestamp)}</Typography.Text>
            {cardStatus}
            {!isUser && onLoadIntoDraft ? (
              <Button type="link" size="small" onClick={() => onLoadIntoDraft(message.id)}>
                Usar como borrador
              </Button>
            ) : null}
          </Space>

          <MessageContent
            messageId={message.id}
            content={message.content}
            transcriptions={message.transcriptions}
            onAppendToComposer={!isUser ? onAppendToComposer : undefined}
            onShare={!isUser ? handleShare : undefined}
          />

          {message.attachments?.length ? (
            <Space direction="vertical" className="message-card-attachments" style={{ width: '100%' }}>
              {message.attachments.map(attachment => (
                <MessageAttachment
                  key={attachment.id}
                  attachment={attachment}
                  transcriptions={message.transcriptions}
                />
              ))}
            </Space>
          ) : null}

          {message.modalities?.length ? (
            <Space wrap size="small">
              {message.modalities.map(modality => (
                <Tag key={modality} color="cyan">
                  {modality}
                </Tag>
              ))}
            </Space>
          ) : null}

          {message.actions?.length ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {message.actions.map(action => (
                <JarvisActionControls
                  key={action.id}
                  action={action}
                  onTrigger={onTriggerAction}
                  onReject={onRejectAction}
                />
              ))}
            </Space>
          ) : null}
        </Space>
      </Space>
    </Card>
  );
};

export default MessageCard;
