import React from 'react';
import { ChatAttachment, ChatTranscription } from '../../../core/messages/messageTypes';
import { AudioPlayer } from './AudioPlayer';

interface MessageAttachmentProps {
  attachment: ChatAttachment;
  transcriptions?: ChatTranscription[];
}

export const MessageAttachment: React.FC<MessageAttachmentProps> = ({ attachment, transcriptions }) => {
  if (attachment.type === 'image' && attachment.url) {
    return (
      <figure className="message-attachment image-attachment">
        <img src={attachment.url} alt={attachment.name ?? 'Imagen adjunta'} />
        {attachment.name && <figcaption>{attachment.name}</figcaption>}
      </figure>
    );
  }

  if (attachment.type === 'audio' && attachment.url) {
    const relatedTranscriptions = transcriptions?.filter(item => item.attachmentId === attachment.id);
    return (
      <div className="message-attachment audio-attachment">
        <AudioPlayer src={attachment.url} title={attachment.name} mimeType={attachment.mimeType} transcriptions={relatedTranscriptions} />
      </div>
    );
  }

  return (
    <div className="message-attachment file-attachment">
      {attachment.url ? (
        <a href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer">
          {attachment.name ?? 'Archivo adjunto'}
        </a>
      ) : (
        <span>{attachment.name ?? 'Archivo adjunto'}</span>
      )}
      {attachment.mimeType && <span className="attachment-meta">{attachment.mimeType}</span>}
    </div>
  );
};

export default MessageAttachment;
