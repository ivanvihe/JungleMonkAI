import React from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import { copyToClipboard } from '../../../utils/clipboard';
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

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown);

const escapeHtml = (code: string): string =>
  code.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] ?? char));

const highlightCode = (code: string, language?: string): string => {
  const normalized = language?.toLowerCase();
  if (normalized && hljs.getLanguage(normalized)) {
    return hljs.highlight(code, { language: normalized }).value;
  }

  try {
    return hljs.highlightAuto(code).value;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Fallo al resaltar código', error);
    }
    return escapeHtml(code);
  }
};

const formatLineCount = (code: string): string => {
  const lines = code.split(/\n/).length;
  return `${lines} ${lines === 1 ? 'línea' : 'líneas'}`;
};

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
              const highlighted = highlightCode(segment.code, segment.language);
              const lineLabel = formatLineCount(segment.code);
              const languageClass = segment.language
                ? `language-${segment.language.trim().toLowerCase()}`
                : undefined;

              return (
                <div className="message-code-block" key={`code-${index}-${segmentIndex}`}>
                  <div className="message-code-toolbar">
                    <div className="message-code-meta">
                      {segment.language ? (
                        <span className="message-code-language">{segment.language}</span>
                      ) : (
                        <span className="message-code-language">texto</span>
                      )}
                      <span className="message-code-lines">{lineLabel}</span>
                    </div>
                    <div className="message-code-actions">
                      <button
                        type="button"
                        className="message-code-copy"
                        onClick={() => {
                          void copyToClipboard(segment.code);
                        }}
                        aria-label="Copiar bloque de código"
                        title="Copiar bloque de código"
                      >
                        Copiar
                      </button>
                      <MessageActions
                        messageId={messageId}
                        value={segment.code}
                        onAppend={onAppendToComposer}
                        onShare={onShare}
                      />
                    </div>
                  </div>
                  <pre>
                    <code className={languageClass} dangerouslySetInnerHTML={{ __html: highlighted }} />
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
