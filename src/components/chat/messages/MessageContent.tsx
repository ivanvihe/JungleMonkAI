import React from 'react';
import {
  ChatContentPart,
  ChatTranscription,
} from '../../../core/messages/messageTypes';
import {
  normalizeContentParts,
  splitMarkdownContent,
} from '../../../core/messages/format';
import { AudioPlayer } from './AudioPlayer';
import { MessageActions } from './MessageActions';

interface MessageContentProps {
  messageId: string;
  content: string | ChatContentPart[];
  transcriptions?: ChatTranscription[];
  onAppendToComposer?: (value: string) => void;
  onShare?: (agentId: string, canonicalCode?: string) => void;
}

export const MessageContent: React.FC<MessageContentProps> = ({
  messageId,
  content,
  transcriptions,
  onAppendToComposer,
  onShare,
}) => {
  const parts = normalizeContentParts(content);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          const segments = splitMarkdownContent(part.text);
          if (!segments.length) {
            return null;
          }

          return segments.map((segment, segmentIndex) => {
            if (segment.kind === 'code') {
              return (
                <div className="message-code-block" key={`code-${index}-${segmentIndex}`}>
                  <div className="message-code-toolbar">
                    {segment.language ? (
                      <span className="message-code-language">{segment.language}</span>
                    ) : null}
                    <MessageActions
                      messageId={messageId}
                      value={segment.code}
                      onAppend={onAppendToComposer}
                      onShare={onShare}
                    />
                  </div>
                  <pre>
                    <code>{segment.code}</code>
                  </pre>
                </div>
              );
            }

            return (
              <p key={`text-${index}-${segmentIndex}`} className="message-card-content">
                {segment.text}
              </p>
            );
          });
        }

        if (part.type === 'image') {
          return (
            <figure key={`image-${index}`} className="message-card-media">
              <img src={part.url} alt={part.alt ?? 'Imagen generada'} />
              {part.alt && <figcaption>{part.alt}</figcaption>}
            </figure>
          );
        }

        if (part.type === 'audio') {
          const relatedTranscriptions = transcriptions?.filter(item => !item.attachmentId);
          return (
            <div key={`audio-${index}`} className="message-card-media">
              <AudioPlayer src={part.url} title="Respuesta de audio" transcriptions={relatedTranscriptions} />
            </div>
          );
        }

        if (part.type === 'file') {
          return (
            <div key={`file-${index}`} className="message-card-media">
              <a href={part.url} target="_blank" rel="noreferrer">
                {part.name ?? 'Archivo'}
              </a>
            </div>
          );
        }

        return null;
      })}
    </>
  );
};

export default MessageContent;
