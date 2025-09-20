import React, { useCallback, useRef } from 'react';
import { ChatAttachment } from '../../../core/messages/messageTypes';

interface AttachmentPickerProps {
  attachments: ChatAttachment[];
  onAdd: (attachments: ChatAttachment[]) => void;
  onRemove: (attachmentId: string) => void;
}

const inferAttachmentType = (file: File): ChatAttachment['type'] => {
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  if (file.type.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || Number.isNaN(bytes)) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const AttachmentPicker: React.FC<AttachmentPickerProps> = ({ attachments, onAdd, onRemove }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFiles = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    event => {
      const fileList = event.target.files;
      if (!fileList?.length) {
        return;
      }

      const newAttachments: ChatAttachment[] = Array.from(fileList).map(file => {
        const id = `${inferAttachmentType(file)}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const type = inferAttachmentType(file);
        const url = URL.createObjectURL(file);

        return {
          id,
          type,
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          url,
        };
      });

      onAdd(newAttachments);
      event.target.value = '';
    },
    [onAdd],
  );

  return (
    <div className="attachment-picker">
      <button type="button" className="ghost-button" onClick={handleClick}>
        Adjuntar archivos
      </button>
      <input
        ref={inputRef}
        type="file"
        className="attachment-picker-input"
        multiple
        hidden
        onChange={handleFiles}
      />

      {attachments.length > 0 && (
        <ul className="attachment-picker-list">
          {attachments.map(attachment => (
            <li key={attachment.id} className={`attachment-item attachment-${attachment.type}`}>
              <div className="attachment-item-meta">
                <span className="attachment-name">{attachment.name ?? attachment.id}</span>
                {attachment.mimeType && <span className="attachment-type">{attachment.mimeType}</span>}
                {formatFileSize(attachment.sizeBytes) && (
                  <span className="attachment-size">{formatFileSize(attachment.sizeBytes)}</span>
                )}
              </div>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => onRemove(attachment.id)}
                aria-label={`Eliminar adjunto ${attachment.name ?? attachment.id}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AttachmentPicker;
