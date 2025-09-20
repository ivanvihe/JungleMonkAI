import React, { useCallback } from 'react';

interface MessageActionsProps {
  value: string;
  onAppend?: (value: string) => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({ value, onAppend }) => {
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

  return (
    <div className="message-actions" role="group" aria-label="Acciones del bloque de código">
      <button type="button" className="message-action" onClick={handleCopy}>
        Copiar
      </button>
      {onAppend ? (
        <button type="button" className="message-action" onClick={handleAppend}>
          Añadir al compositor
        </button>
      ) : null}
    </div>
  );
};

export default MessageActions;
