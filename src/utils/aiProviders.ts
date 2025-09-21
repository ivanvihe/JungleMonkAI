import {
  ChatAttachment,
  ChatContentPart,
  ChatModality,
  ChatTranscription,
} from '../core/messages/messageTypes';

export type ProviderContent = string | ChatContentPart[];

export interface ChatProviderRequest {
  apiKey: string;
  model: string;
  prompt: ProviderContent;
  systemPrompt?: ProviderContent;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatProviderResponse {
  content: ProviderContent;
  modalities: ChatModality[];
  attachments?: ChatAttachment[];
  transcriptions?: ChatTranscription[];
}

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;

type AnthropicLimiter = {
  acquire: (apiKey: string) => boolean;
  release: (apiKey: string) => void;
};

const createAnthropicLimiter = (): AnthropicLimiter => {
  const inFlight = new Map<string, true>();
  return {
    acquire(apiKey: string) {
      const key = apiKey || '__default__';
      if (inFlight.has(key)) {
        return false;
      }
      inFlight.set(key, true);
      return true;
    },
    release(apiKey: string) {
      const key = apiKey || '__default__';
      inFlight.delete(key);
    },
  };
};

type GlobalWithAnthropicLimiter = typeof globalThis & {
  __anthropicLimiter__?: AnthropicLimiter;
};

const getAnthropicLimiter = (): AnthropicLimiter => {
  const globalObj = globalThis as GlobalWithAnthropicLimiter;
  if (!globalObj.__anthropicLimiter__) {
    globalObj.__anthropicLimiter__ = createAnthropicLimiter();
  }
  return globalObj.__anthropicLimiter__;
};

const maskApiKey = (apiKey: string): string => {
  const trimmed = apiKey?.trim?.() ?? '';
  if (!trimmed) {
    return '(vacía)';
  }
  if (trimmed.length <= 8) {
    return '***';
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
};

const GROQ_RECOMMENDED_MODEL = 'llama-3.2-90b-text';

const GROQ_MODEL_ALIASES: Record<string, string> = {
  'llama-3.2-90b': GROQ_RECOMMENDED_MODEL,
  'llama3-90b': GROQ_RECOMMENDED_MODEL,
  'llama3-90b-text': GROQ_RECOMMENDED_MODEL,
  'llama3-70b-8192': GROQ_RECOMMENDED_MODEL,
  'llama-3-70b-8192': GROQ_RECOMMENDED_MODEL,
  'llama3-70b': GROQ_RECOMMENDED_MODEL,
  'llama-3.1-70b-versatile': GROQ_RECOMMENDED_MODEL,
  'mixtral-8x7b-32768': 'mixtral-8x7b-32768',
};

const resolveGroqModel = (requestedModel: string): string => {
  const trimmed = requestedModel?.trim?.() ?? '';
  return GROQ_MODEL_ALIASES[trimmed] ?? trimmed;
};

const isTauriEnvironment = (): boolean =>
  typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);

const isElectronEnvironment = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean(
    (window as unknown as {
      electronAPI?: { callProviderChat?: (provider: string, payload: unknown) => Promise<unknown> };
    }).electronAPI?.callProviderChat,
  );

type RuntimeEnvironment = 'browser' | 'tauri' | 'electron';

const detectRuntime = (): RuntimeEnvironment => {
  if (isElectronEnvironment()) {
    return 'electron';
  }

  if (isTauriEnvironment()) {
    return 'tauri';
  }

  return 'browser';
};

const normalizeBridgeError = (provider: string, error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return new Error(message);
    }
  }

  return new Error(`No se pudo contactar a ${provider}.`);
};

const callProviderThroughBridge = async (
  runtime: Exclude<RuntimeEnvironment, 'browser'>,
  providerId: 'groq' | 'anthropic',
  providerName: string,
  payload: Record<string, unknown>,
): Promise<any> => {
  if (runtime === 'electron') {
    try {
      const api = (window as unknown as {
        electronAPI?: { callProviderChat?: (provider: string, request: Record<string, unknown>) => Promise<unknown> };
      }).electronAPI;

      if (!api?.callProviderChat) {
        throw new Error('Canal de chat no disponible en Electron.');
      }

      return await api.callProviderChat(providerId, payload);
    } catch (error) {
      throw normalizeBridgeError(providerName, error);
    }
  }

  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke('providers_chat', { provider: providerId, payload });
  } catch (error) {
    throw normalizeBridgeError(providerName, error);
  }
};

const toContentParts = (value: unknown): ChatContentPart[] => {
  if (!value) {
    return [];
  }
  if (typeof value === 'string') {
    return [{ type: 'text', text: value }];
  }
  if (Array.isArray(value)) {
    return value
      .map(entry => {
        if (!entry) {
          return undefined;
        }
        if (typeof entry === 'string') {
          return { type: 'text', text: entry };
        }
        if (typeof entry === 'object') {
          if ('text' in entry && typeof (entry as { text?: unknown }).text === 'string') {
            return { type: 'text', text: (entry as { text: string }).text };
          }
          if ('type' in entry) {
            const type = (entry as { type?: string }).type;
            if (type === 'text' && typeof (entry as { text?: unknown }).text === 'string') {
              return { type: 'text', text: (entry as { text: string }).text };
            }
            if (type === 'image_url') {
              const url = (entry as { image_url?: { url?: string } }).image_url?.url;
              if (typeof url === 'string') {
                return { type: 'image', url };
              }
            }
            if (type === 'image' && typeof (entry as { url?: unknown }).url === 'string') {
              return { type: 'image', url: (entry as { url: string }).url };
            }
            if (type === 'audio' && typeof (entry as { url?: unknown }).url === 'string') {
              return {
                type: 'audio',
                url: (entry as { url: string }).url,
                durationSeconds: (entry as { duration?: number }).duration,
              };
            }
            if (type === 'file' && typeof (entry as { url?: unknown }).url === 'string') {
              return {
                type: 'file',
                url: (entry as { url: string }).url,
                name: (entry as { name?: string }).name,
                mimeType: (entry as { mimeType?: string }).mimeType,
              };
            }
          }
          if ('content' in entry) {
            return toContentParts((entry as { content?: unknown }).content);
          }
        }
        return undefined;
      })
      .flat()
      .filter((part): part is ChatContentPart => Boolean(part));
  }
  if (typeof value === 'object' && 'content' in (value as Record<string, unknown>)) {
    return toContentParts((value as Record<string, unknown>).content);
  }
  return [];
};

const collapseContent = (parts: ChatContentPart[]): ProviderContent => {
  if (!parts.length) {
    return '';
  }

  if (parts.length === 1) {
    const [first] = parts;
    if (typeof first === 'string') {
      return first;
    }
    if (first.type === 'text') {
      return first.text;
    }
  }

  return parts.map(part => (typeof part === 'string' ? { type: 'text', text: part } : part));
};

const detectModalities = (
  content: ProviderContent,
  attachments?: ChatAttachment[],
  transcriptions?: ChatTranscription[],
): ChatModality[] => {
  const modalities = new Set<ChatModality>();

  const registerPart = (part: ChatContentPart) => {
    if (typeof part === 'string') {
      modalities.add('text');
      return;
    }

    if (part.type === 'text') {
      modalities.add('text');
      return;
    }

    if (part.type === 'image') {
      modalities.add('image');
      return;
    }

    if (part.type === 'audio') {
      modalities.add('audio');
      return;
    }

    if (part.type === 'file') {
      modalities.add('file');
    }
  };

  if (Array.isArray(content)) {
    content.forEach(registerPart);
  } else if (typeof content === 'string') {
    if (content.trim()) {
      modalities.add('text');
    }
  }

  attachments?.forEach(attachment => {
    if (attachment.type === 'image') {
      modalities.add('image');
    }
    if (attachment.type === 'audio') {
      modalities.add('audio');
    }
    if (attachment.type === 'file') {
      modalities.add('file');
    }
  });

  transcriptions?.forEach(() => modalities.add('text'));

  return Array.from(modalities);
};

const ensureContent = (content: ProviderContent, provider: string): ProviderContent => {
  const asText = typeof content === 'string' ? content : contentToPlainText(content);
  if (!asText.trim()) {
    throw new Error(`${provider} devolvió una respuesta vacía`);
  }
  return content;
};

const contentToPlainText = (content: ProviderContent): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map(part => {
      if (typeof part === 'string') {
        return part;
      }
      if (part.type === 'text') {
        return part.text;
      }
      if (part.type === 'image') {
        return part.alt ?? '[imagen]';
      }
      if (part.type === 'audio') {
        return part.transcript ?? '[audio]';
      }
      if (part.type === 'file') {
        return part.name ?? '[archivo]';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const mapContentToOpenAI = (content: ProviderContent) => {
  const parts = Array.isArray(content) ? content : [{ type: 'text', text: content }];

  return parts.map(part => {
    if (typeof part === 'string') {
      return { type: 'text', text: part };
    }

    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }

    if (part.type === 'image') {
      return { type: 'image_url', image_url: { url: part.url } };
    }

    if (part.type === 'audio') {
      return { type: 'input_audio', input_audio: { url: part.url } };
    }

    if (part.type === 'file') {
      return { type: 'file', file: { url: part.url, name: part.name, mimeType: part.mimeType } };
    }

    return { type: 'text', text: '' };
  });
};

export const callOpenAIChat = async ({
  apiKey,
  model,
  prompt,
  systemPrompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature = DEFAULT_TEMPERATURE,
}: ChatProviderRequest): Promise<ChatProviderResponse> => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        ...(systemPrompt
          ? [
              {
                role: 'system',
                content: mapContentToOpenAI(systemPrompt),
              },
            ]
          : []),
        {
          role: 'user',
          content: mapContentToOpenAI(prompt),
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `OpenAI respondió con ${response.status}`);
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0]?.message?.content;
  const contentParts = toContentParts(choice);
  const content = collapseContent(contentParts);
  const ensuredContent = ensureContent(content, 'OpenAI');
  return {
    content: ensuredContent,
    modalities: detectModalities(ensuredContent),
  };
};

export const callGroqChat = async ({
  apiKey,
  model,
  prompt,
  systemPrompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature = DEFAULT_TEMPERATURE,
}: ChatProviderRequest): Promise<ChatProviderResponse> => {
  const sanitizedApiKey = apiKey?.trim?.() ?? apiKey;
  const runtime = detectRuntime();

  const performGroqRequest = async (modelName: string) => {
    const body = {
      model: modelName,
      max_tokens: maxTokens,
      temperature,
      messages: [
        ...(systemPrompt
          ? [
              {
                role: 'system',
                content: contentToPlainText(systemPrompt),
              },
            ]
          : []),
        {
          role: 'user',
          content: contentToPlainText(prompt),
        },
      ],
    };

    if (runtime === 'browser') {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sanitizedApiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error?.message || `Groq respondió con ${response.status}`);
      }

      return response.json();
    }

    return callProviderThroughBridge(runtime, 'groq', 'Groq', {
      apiKey: sanitizedApiKey,
      body,
    });
  };

  let activeModel = resolveGroqModel(model);
  let payload: any;
  let attemptedFallback = false;

  while (true) {
    try {
      payload = await performGroqRequest(activeModel);
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      const shouldRetryWithRecommended =
        !attemptedFallback &&
        activeModel !== GROQ_RECOMMENDED_MODEL &&
        /deprecat/i.test(message);

      if (shouldRetryWithRecommended) {
        console.warn(
          `Groq indicó que el modelo "${activeModel}" está obsoleto. Reintentando con "${GROQ_RECOMMENDED_MODEL}". ` +
            'Actualiza tus presets o prueba "mixtral-8x7b-32768" si necesitas una alternativa compatible.',
        );
        activeModel = GROQ_RECOMMENDED_MODEL;
        attemptedFallback = true;
        continue;
      }

      if (/deprecat/i.test(message)) {
        throw new Error(
          `Groq marcó el modelo "${activeModel}" como obsoleto. Cambia al modelo recomendado "${GROQ_RECOMMENDED_MODEL}" ` +
            'o utiliza "mixtral-8x7b-32768" como alternativa temporal.',
        );
      }

      throw error instanceof Error ? error : new Error(message || 'Groq rechazó la solicitud.');
    }
  }

  const choice = payload?.choices?.[0]?.message?.content;
  const contentParts = toContentParts(choice);
  const content = collapseContent(contentParts);
  const ensuredContent = ensureContent(content, 'Groq');
  return {
    content: ensuredContent,
    modalities: detectModalities(ensuredContent),
  };
};

export const callAnthropicChat = async ({
  apiKey,
  model,
  prompt,
  systemPrompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  temperature = DEFAULT_TEMPERATURE,
}: ChatProviderRequest): Promise<ChatProviderResponse> => {
  const sanitizedApiKey = apiKey?.trim?.() ?? apiKey;
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    ...(systemPrompt
      ? {
          system: contentToPlainText(systemPrompt),
        }
      : {}),
    messages: [
      {
        role: 'user',
        content: contentToPlainText(prompt),
      },
    ],
  };
  const limiter = getAnthropicLimiter();
  if (!limiter.acquire(sanitizedApiKey)) {
    console.warn('Solicitud de Anthropic rechazada por límite de concurrencia.', {
      apiKey: maskApiKey(sanitizedApiKey),
    });
    throw new Error(
      'Otra solicitud de Anthropic está en curso para esta API key. Intenta nuevamente en unos segundos.',
    );
  }

  let payload: any;

  try {
    const runtime = detectRuntime();

    if (runtime === 'browser') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': sanitizedApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message = error?.error?.message || error?.error || error?.message;
        throw new Error(message || `Anthropic respondió con ${response.status}`);
      }

      payload = await response.json();
    } else {
      payload = await callProviderThroughBridge(runtime, 'anthropic', 'Anthropic', {
        apiKey: sanitizedApiKey,
        body,
      });
    }
  } finally {
    limiter.release(sanitizedApiKey);
  }

  const content = payload?.content;
  const contentParts = toContentParts(content);
  const normalizedContent = collapseContent(contentParts);
  const ensuredContent = ensureContent(normalizedContent, 'Anthropic');
  return {
    content: ensuredContent,
    modalities: detectModalities(ensuredContent),
  };
};
