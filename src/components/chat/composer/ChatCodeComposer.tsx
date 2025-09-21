import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { estimateTokenCount } from '../../../utils/tokens';
import { copyToClipboard } from '../../../utils/clipboard';

interface ChatCodeComposerProps {
  value: string;
  placeholder?: string;
  appendToDraft: (value: string) => void;
  setDraft: (value: string) => void;
  onSend?: () => void;
  disabled?: boolean;
}

interface ToolbarAction {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
  onAction: () => void;
}

const CODE_BLOCK_TEMPLATE = '```\n\n```';

export const ChatCodeComposer: React.FC<ChatCodeComposerProps> = ({
  value,
  placeholder,
  appendToDraft,
  setDraft,
  onSend,
  disabled,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [lastCopied, setLastCopied] = useState<number | null>(null);

  const tokenCount = useMemo(() => estimateTokenCount(value), [value]);

  const wrapSelectionWithCodeBlock = useCallback(
    (language?: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const { selectionStart, selectionEnd } = textarea;
      const currentValue = textarea.value;
      const selectedText = currentValue.slice(selectionStart, selectionEnd);
      const normalizedLanguage = language?.trim() ?? '';
      const fenceHeader = `\`\`\`${normalizedLanguage}\n`;
      const fenceFooter = '\n```\n';
      const before = currentValue.slice(0, selectionStart);
      const after = currentValue.slice(selectionEnd);
      const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
      const headerPrefix = needsLeadingNewline ? `\n${fenceHeader}` : fenceHeader;
      const newValue = `${before}${headerPrefix}${selectedText}${fenceFooter}${after}`;
      setDraft(newValue);

      window.requestAnimationFrame(() => {
        const caretPosition = selectionStart + headerPrefix.length + selectedText.length;
        textarea.selectionStart = caretPosition;
        textarea.selectionEnd = caretPosition;
        textarea.focus();
      });
    },
    [setDraft],
  );

  const insertCodeBlockTemplate = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      appendToDraft(`\n${CODE_BLOCK_TEMPLATE}`);
      return;
    }
    const { selectionStart, selectionEnd } = textarea;
    if (selectionStart !== selectionEnd) {
      wrapSelectionWithCodeBlock();
      return;
    }
    const currentValue = textarea.value;
    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
    const insertion = `${needsLeadingNewline ? '\n' : ''}\`\`\`\n\n\`\`\``;
    const newValue = `${before}${insertion}${after}`;
    setDraft(newValue);

    window.requestAnimationFrame(() => {
      const caretPosition = selectionStart + (needsLeadingNewline ? 5 : 4);
      textarea.selectionStart = caretPosition;
      textarea.selectionEnd = caretPosition;
      textarea.focus();
    });
  }, [appendToDraft, setDraft, wrapSelectionWithCodeBlock]);

  const handleKeyboardShortcuts = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSend?.();
        return;
      }

      if (event.key.toLowerCase() === 'c' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        wrapSelectionWithCodeBlock();
        return;
      }

      if (event.key === '`' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        insertCodeBlockTemplate();
      }
    },
    [insertCodeBlockTemplate, onSend, wrapSelectionWithCodeBlock],
  );

  const handleCopyAll = useCallback(() => {
    copyToClipboard(value)
      .then(() => {
        setLastCopied(Date.now());
      })
      .catch(() => {
        setLastCopied(null);
      });
  }, [value]);

  useEffect(() => {
    if (lastCopied === null) {
      return;
    }
    const timeout = window.setTimeout(() => setLastCopied(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [lastCopied]);

  const toolbarActions: ToolbarAction[] = useMemo(
    () => [
      {
        id: 'code-block',
        icon: '🧱',
        label: 'Bloque de código',
        shortcut: 'Ctrl+Shift+`',
        onAction: insertCodeBlockTemplate,
      },
      {
        id: 'wrap-selection',
        icon: '🪄',
        label: 'Envolver selección',
        shortcut: 'Ctrl+Shift+C',
        onAction: () => wrapSelectionWithCodeBlock(),
      },
      {
        id: 'copy',
        icon: '📋',
        label: lastCopied ? 'Copiado!' : 'Copiar todo',
        onAction: handleCopyAll,
      },
    ],
    [handleCopyAll, insertCodeBlockTemplate, lastCopied, wrapSelectionWithCodeBlock],
  );

  return (
    <div className="chat-code-composer">
      <div className="chat-code-toolbar" role="toolbar" aria-label="Acciones del compositor">
        {toolbarActions.map(action => (
          <button
            key={action.id}
            type="button"
            className={`composer-toolbar-button${action.id === 'copy' && lastCopied ? ' is-active' : ''}`}
            onClick={action.onAction}
            disabled={disabled}
            title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
            aria-label={action.label}
          >
            <span aria-hidden="true">{action.icon}</span>
          </button>
        ))}
        <div className="chat-code-toolbar-spacer" />
        <span className="chat-code-token-count" aria-live="polite">
          {tokenCount} tokens estimados
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={handleKeyboardShortcuts}
        placeholder={placeholder}
        className="chat-code-textarea"
        rows={4}
        disabled={disabled}
      />
    </div>
  );
};

export default ChatCodeComposer;
