import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPresenceList } from '../../agents/AgentPresenceList';
import { useAgents } from '../../../core/agents/AgentContext';
import type { AgentPresenceEntry } from '../../../core/agents/presence';
import { useRepoWorkflow } from '../../../core/codex';

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
