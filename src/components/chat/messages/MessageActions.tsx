import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPresenceList } from '../../agents/AgentPresenceList';
import { useAgents } from '../../../core/agents/AgentContext';
import type { AgentPresenceEntry } from '../../../core/agents/presence';
import { useRepoWorkflow } from '../../../core/codex';
import { usePluginHost } from '../../../core/plugins/PluginHostProvider';
import type { ChatMessageAction } from '../../../core/messages/messageTypes';

interface MessageActionsProps {
  messageId: string;
  value: string;
  onAppend?: (value: string) => void;
  onShare?: (agentId: string, canonicalCode?: string) => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  messageId,
  value,
  onAppend,
  onShare,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { agents } = useAgents();
  const { queueRequest } = useRepoWorkflow();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { messageActions: pluginActions } = usePluginHost();

  const handleCopy = useCallback(() => {
    const clipboard = typeof window !== 'undefined' ? window.navigator?.clipboard : undefined;
    if (clipboard?.writeText) {
      clipboard.writeText(value).catch(() => {
        // Silently ignore clipboard errors to avoid disrupting the UI
      });
    }
  }, [value]);

  const handleAppend = useCallback(() => {
    if (onAppend) {
      onAppend(value);
    }
  }, [onAppend, value]);

  const handleTogglePicker = useCallback(() => {
    if (!onShare) {
      return;
    }
    setIsPickerOpen(prev => !prev);
  }, [onShare]);

  const shareableAgents = useMemo(() => agents.filter(agent => agent.active), [agents]);

  const noopToggleAgent = useCallback((_: string) => {}, []);
  const noopUpdateRole = useCallback(
    (_agentId: string, _updates: { role?: string; objective?: string }) => {},
    [],
  );

  const presenceMap = useMemo(() => {
    const now = Date.now();
    const entries = new Map<string, AgentPresenceEntry>();
    shareableAgents.forEach(agent => {
      entries.set(agent.id, {
        status: 'online',
        lastChecked: now,
        message: 'Disponible para recibir mensajes compartidos',
      });
    });
    return entries;
  }, [shareableAgents]);

  const handleShareWithAgent = useCallback(
    (agentId: string) => {
      if (!onShare) {
        return;
      }
      onShare(agentId, value);
      setIsPickerOpen(false);
    },
    [onShare, value],
  );

  const handleSendToRepoStudio = useCallback(() => {
    if (!value.trim()) {
      return;
    }
    queueRequest({ messageId, canonicalCode: value });
  }, [messageId, queueRequest, value]);

  const handlePluginAction = useCallback(
    (action: (typeof pluginActions)[number]) => {
      void action.run({ messageId, value });
    },
    [messageId, value],
  );

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPickerOpen]);

  return (
    <div ref={containerRef} className="message-actions" role="group" aria-label="Acciones del bloque de código">
      <button type="button" className="message-action" onClick={handleCopy}>
        Copiar
      </button>
      {onAppend ? (
        <button type="button" className="message-action" onClick={handleAppend}>
          Añadir al compositor
        </button>
      ) : null}
      {onShare ? (
        <button type="button" className="message-action" onClick={handleTogglePicker}>
          Enviar a…
        </button>
      ) : null}
      <button type="button" className="message-action" onClick={handleSendToRepoStudio}>
        Enviar a Repo Studio
      </button>
      {pluginActions.map(action => (
        <button
          key={`${action.pluginId}-${action.id}`}
          type="button"
          className="message-action"
          onClick={() => handlePluginAction(action)}
          title={action.description}
        >
          {action.label}
        </button>
      ))}
      {onShare && isPickerOpen ? (
        <div className="message-action-popover" role="dialog" aria-label={`Compartir mensaje ${messageId}`}>
          {shareableAgents.length === 0 ? (
            <p className="message-action-empty">No hay agentes activos para compartir.</p>
          ) : (
            <AgentPresenceList
              agents={shareableAgents}
              presence={presenceMap}
              onToggleAgent={noopToggleAgent}
              onUpdateRole={noopUpdateRole}
              selectionMode
              onSelectAgent={handleShareWithAgent}
            />
          )}
        </div>
      ) : null}
    </div>
  );
};

export default MessageActions;

interface JarvisActionControlsProps {
  action: ChatMessageAction;
  onTrigger?: (actionId: string) => void;
  onReject?: (actionId: string) => void;
}

const renderStatusLabel = (status: ChatMessageAction['status']): string => {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'accepted':
      return 'Aprobada';
    case 'executing':
      return 'Ejecutando…';
    case 'completed':
      return 'Completada';
    case 'rejected':
      return 'Descartada';
    case 'failed':
      return 'Error';
    default:
      return status;
  }
};

export const JarvisActionControls: React.FC<JarvisActionControlsProps> = ({
  action,
  onTrigger,
  onReject,
}) => {
  const handleTrigger = useCallback(() => {
    onTrigger?.(action.id);
  }, [action.id, onTrigger]);

  const handleReject = useCallback(() => {
    onReject?.(action.id);
  }, [action.id, onReject]);

  const canTrigger = action.status === 'pending' || action.status === 'failed';

  return (
    <div className={`jarvis-action-card jarvis-action-${action.status}`}>
      <div className="jarvis-action-header">
        <span className="jarvis-action-label">{action.label}</span>
        <span className="jarvis-action-status">{renderStatusLabel(action.status)}</span>
      </div>
      {action.description ? <p className="jarvis-action-description">{action.description}</p> : null}
      <div className="jarvis-action-controls">
        {canTrigger ? (
          <button type="button" className="message-action" onClick={handleTrigger}>
            Ejecutar
          </button>
        ) : null}
        {canTrigger && onReject ? (
          <button type="button" className="message-action" onClick={handleReject}>
            Descartar
          </button>
        ) : null}
        {action.status === 'executing' ? <span className="jarvis-action-progress">Procesando…</span> : null}
        {action.status === 'completed' && action.resultPreview ? (
          <span className="jarvis-action-result-label">Resultado disponible</span>
        ) : null}
        {action.status === 'rejected' ? (
          <span className="jarvis-action-result-label">Rechazada</span>
        ) : null}
        {action.status === 'failed' && !canTrigger ? (
          <span className="jarvis-action-error">Error detectado</span>
        ) : null}
      </div>
      {action.resultPreview ? (
        <pre className="jarvis-action-result" aria-label={`Resultado de ${action.label}`}>
          {action.resultPreview}
        </pre>
      ) : null}
      {action.errorMessage ? (
        <p className="jarvis-action-error-message">{action.errorMessage}</p>
      ) : null}
    </div>
  );
};
