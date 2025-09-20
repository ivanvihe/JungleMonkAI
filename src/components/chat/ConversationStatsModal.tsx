import React, { useMemo } from 'react';
import './ConversationStatsModal.css';
import { OverlayModal } from '../common/OverlayModal';
import { useMessages } from '../../core/messages/MessageContext';
import { ChatAuthor } from '../../core/messages/messageTypes';

interface ConversationStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AuthorBreakdown {
  author: ChatAuthor;
  count: number;
  label: string;
}

export const ConversationStatsModal: React.FC<ConversationStatsModalProps> = ({ isOpen, onClose }) => {
  const { messages, pendingResponses, formatTimestamp } = useMessages();

  const stats = useMemo(() => {
    const publicMessages = messages.filter(message => message.visibility !== 'internal');

    const breakdown: AuthorBreakdown[] = (
      [
        { author: 'user' as const, label: 'Mensajes de usuario' },
        { author: 'agent' as const, label: 'Respuestas de agentes' },
        { author: 'system' as const, label: 'Mensajes del sistema' },
      ] satisfies { author: ChatAuthor; label: string }[]
    ).map(({ author, label }) => ({
      author,
      label,
      count: publicMessages.filter(message => message.author === author).length,
    }));

    const lastMessage = messages[messages.length - 1] ?? null;

    return {
      totalMessages: messages.length,
      publicCount: publicMessages.length,
      internalCount: messages.length - publicMessages.length,
      breakdown,
      pendingResponses,
      lastMessage,
    };
  }, [messages, pendingResponses]);

  const lastTimestamp = stats.lastMessage ? formatTimestamp(stats.lastMessage.timestamp) : null;
  const lastDate = stats.lastMessage ? new Date(stats.lastMessage.timestamp) : null;
  const lastAbsoluteTimestamp =
    lastDate && !Number.isNaN(lastDate.getTime()) ? lastDate.toLocaleString() : null;

  return (
    <OverlayModal
      title="Estadísticas de la conversación"
      isOpen={isOpen}
      onClose={onClose}
      width={420}
    >
      <div className="conversation-stats" aria-live="polite">
        <div className="conversation-stats__summary">
          <div className="conversation-stats__total">
            <span className="conversation-stats__label">Mensajes totales</span>
            <span className="conversation-stats__value">{stats.totalMessages}</span>
            <span className="conversation-stats__hint">
              {stats.publicCount} públicos · {stats.internalCount} internos
            </span>
          </div>
          <div className="conversation-stats__pending">
            <span className="conversation-stats__label">Pendientes</span>
            <span
              className={`conversation-stats__value${stats.pendingResponses ? ' is-warning' : ''}`}
            >
              {stats.pendingResponses}
            </span>
          </div>
        </div>

        <div className="conversation-stats__grid">
          {stats.breakdown.map(bucket => (
            <div key={bucket.author} className="conversation-stats__card">
              <span className="conversation-stats__card-label">{bucket.label}</span>
              <span className="conversation-stats__card-value">{bucket.count}</span>
            </div>
          ))}
        </div>

        <div className="conversation-stats__meta">
          <div className="conversation-stats__meta-row">
            <span className="conversation-stats__meta-label">Último mensaje</span>
            <span className="conversation-stats__meta-value" title={lastAbsoluteTimestamp ?? undefined}>
              {stats.lastMessage ? (
                <>
                  <span className="conversation-stats__meta-author">{stats.lastMessage.author}</span>
                  <span>{lastTimestamp}</span>
                </>
              ) : (
                'Sin actividad registrada'
              )}
            </span>
          </div>
        </div>
      </div>
    </OverlayModal>
  );
};

export default ConversationStatsModal;
