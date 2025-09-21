import type { MultiAgentContext } from '../orchestration';

export type ChatAuthor = 'system' | 'user' | 'agent';

export type ChatVisibility = 'public' | 'internal';

export type ChatModality = 'text' | 'image' | 'audio' | 'video' | 'file';

export type ChatActionKind = 'open' | 'read' | 'run' | string;

export interface ChatAttachment {
  id: string;
  type: 'image' | 'audio' | 'file';
  url?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  previewUrl?: string;
  waveform?: number[];
  metadata?: Record<string, unknown>;
}

export interface ChatTranscription {
  id: string;
  text: string;
  language?: string;
  confidence?: number;
  modality?: Exclude<ChatModality, 'text'>;
  attachmentId?: string;
  createdAt?: string;
  source?: ChatAuthor;
}

export type ChatContentPart =
  | string
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      url: string;
      alt?: string;
    }
  | {
      type: 'audio';
      url: string;
      durationSeconds?: number;
      transcript?: string;
    }
  | {
      type: 'file';
      url: string;
      name?: string;
      mimeType?: string;
    };

export interface ChatMessage {
  id: string;
  author: ChatAuthor;
  content: string | ChatContentPart[];
  timestamp: string;
  agentId?: string;
  originAgentId?: string;
  status?: 'pending' | 'sent';
  sourcePrompt?: string;
  attachments?: ChatAttachment[];
  modalities?: ChatModality[];
  transcriptions?: ChatTranscription[];
  feedback?: MessageFeedback;
  correctionId?: string;
  visibility?: ChatVisibility;
  orchestrationContext?: MultiAgentContext;
  sharedByMessageId?: string;
  canonicalCode?: string;
  actions?: ChatMessageAction[];
}

export interface ChatSuggestedAction {
  kind: ChatActionKind;
  payload: Record<string, unknown>;
  label?: string;
  description?: string;
  requiresConfirmation?: boolean;
}

export interface ChatMessageAction extends ChatSuggestedAction {
  id: string;
  status: 'pending' | 'accepted' | 'executing' | 'completed' | 'rejected' | 'failed';
  createdAt: string;
  updatedAt: string;
  agentId?: string;
  resultPreview?: string;
  errorMessage?: string;
  messageId?: string;
}

export interface MessageFeedback {
  hasError?: boolean;
  notes?: string;
  tags?: string[];
  lastUpdatedAt?: string;
}

export interface MessageCorrection {
  id: string;
  messageId: string;
  agentId?: string;
  reviewerId?: string;
  createdAt: string;
  updatedAt: string;
  correctedText: string;
  notes?: string;
  tags?: string[];
}
