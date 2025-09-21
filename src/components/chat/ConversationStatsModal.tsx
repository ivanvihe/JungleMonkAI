import React, { useCallback, useMemo, useState } from 'react';
import './ConversationStatsModal.css';
import { OverlayModal } from '../common/OverlayModal';
import { useMessages } from '../../core/messages/MessageContext';
import { ChatAuthor } from '../../core/messages/messageTypes';
import { useJarvisCore } from '../../core/jarvis/JarvisCoreContext';

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
  const {
    config,
    runtimeStatus,
    lastError,
    lastHealthMessage,
    activeModel,
    downloads,
    uptimeMs,
    ensureOnline,
  } = useJarvisCore();
  const [retrying, setRetrying] = useState(false);

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

  const jarvisStatusLabel = useMemo(() => {
    switch (runtimeStatus) {
      case 'ready':
        return { label: 'Operativo', tone: 'success' } as const;
      case 'starting':
        return { label: 'Iniciando', tone: 'warning' } as const;
      case 'error':
        return { label: 'Con incidencias', tone: 'danger' } as const;
      default:
        return { label: 'Sin conexión', tone: 'muted' } as const;
    }
  }, [runtimeStatus]);

  const jarvisHint = lastError ?? lastHealthMessage ?? 'Servicio listo para recibir peticiones.';

  const activeDownloads = useMemo(() => Object.values(downloads), [downloads]);

  const uptimeLabel = useMemo(() => {
    if (!uptimeMs || uptimeMs <= 0) {
      return 'Sin datos de actividad';
    }
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days} día${days === 1 ? '' : 's'} · ${hours.toString().padStart(2, '0')}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }, [uptimeMs]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await ensureOnline();
    } finally {
      setRetrying(false);
    }
  }, [ensureOnline]);

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

        <div className="conversation-stats__jarvis" role="region" aria-label="Estado de Jarvis Core">
          <div className="conversation-stats__section-header">
            <span className="conversation-stats__section-title">JarvisCore</span>
            <span className={`status-pill status-pill--${jarvisStatusLabel.tone}`} title={jarvisHint}>
              {jarvisStatusLabel.label}
            </span>
          </div>
          <div className="conversation-stats__jarvis-grid">
            <div className="conversation-stats__jarvis-item">
              <span className="conversation-stats__meta-label">Host</span>
              <span className="conversation-stats__meta-value">{config.host || '127.0.0.1'}</span>
            </div>
            <div className="conversation-stats__jarvis-item">
              <span className="conversation-stats__meta-label">Puerto</span>
              <span className="conversation-stats__meta-value">{config.port}</span>
            </div>
            <div className="conversation-stats__jarvis-item">
              <span className="conversation-stats__meta-label">Modelo activo</span>
              <span className="conversation-stats__meta-value">{activeModel ?? 'Sin asignar'}</span>
            </div>
            <div className="conversation-stats__jarvis-item">
              <span className="conversation-stats__meta-label">Actividad</span>
              <span className="conversation-stats__meta-value">{uptimeLabel}</span>
            </div>
          </div>
          <div className="conversation-stats__downloads">
            <span className="conversation-stats__meta-label">Descargas en curso</span>
            {activeDownloads.length ? (
              <ul className="conversation-stats__download-list">
                {activeDownloads.map(entry => {
                  const progress =
                    typeof entry.percent === 'number' && Number.isFinite(entry.percent)
                      ? `${Math.round(entry.percent)}%`
                      : entry.total && entry.total > 0
                      ? `${Math.round((entry.downloaded / entry.total) * 100)}%`
                      : entry.status;
                  return (
                    <li key={entry.modelId} className="conversation-stats__download-item">
                      <span className="conversation-stats__download-name">{entry.modelId}</span>
                      <span className="conversation-stats__download-progress">{progress}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="conversation-stats__downloads-empty">Sin transferencias activas</span>
            )}
          </div>
          <button
            type="button"
            className="conversation-stats__jarvis-action"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? 'Reconectando…' : 'Reintentar conexión'}
          </button>
        </div>
      </div>
    </OverlayModal>
  );
};

export default ConversationStatsModal;
