import { ChatContentPart } from './messageTypes';

export type NormalizedContentPart =
  | { type: 'text'; text: string }
  | Extract<ChatContentPart, { type: 'image' }>
  | Extract<ChatContentPart, { type: 'audio' }>
  | Extract<ChatContentPart, { type: 'file' }>;

export interface MarkdownTextSegment {
  kind: 'text';
  text: string;
}

export interface MarkdownCodeSegment {
  kind: 'code';
  code: string;
  language?: string;
}

export type MarkdownSegment = MarkdownTextSegment | MarkdownCodeSegment;

export function normalizeContentParts(content: string | ChatContentPart[]): NormalizedContentPart[] {
  if (!content) {
    return [];
  }

  if (Array.isArray(content)) {
    return content
      .map<NormalizedContentPart | null>(part => {
        if (!part) {
          return null;
        }

        if (typeof part === 'string') {
          return { type: 'text', text: part };
        }

        if ('type' in part) {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          }

          return part as NormalizedContentPart;
        }

        return null;
      })
      .filter((part): part is NormalizedContentPart => part !== null);
  }

  return [{ type: 'text', text: content }];
}

const CODE_BLOCK_REGEX = /```([^\n`]*)\r?\n([\s\S]*?)```/g;

export function splitMarkdownContent(text: string): MarkdownSegment[] {
  if (!text.includes('```')) {
    return text ? [{ kind: 'text', text }] : [];
  }

  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state in case the function is reused
  CODE_BLOCK_REGEX.lastIndex = 0;

  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const [block, language, code = ''] = match;
    const index = match.index ?? 0;

    if (index > lastIndex) {
      const preceding = text.slice(lastIndex, index);
      if (preceding.trim().length > 0) {
        segments.push({ kind: 'text', text: preceding });
      }
    }

    const cleanedCode = code.replace(/\s+$/u, '');
    segments.push({
      kind: 'code',
      code: cleanedCode,
      language: language?.trim() || undefined,
    });

    lastIndex = index + block.length;
  }

  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex);
    if (trailing.trim().length > 0) {
      segments.push({ kind: 'text', text: trailing });
    }
  }

  if (segments.length === 0 && text.trim().length > 0) {
    return [{ kind: 'text', text }];
  }

  return segments;
}
