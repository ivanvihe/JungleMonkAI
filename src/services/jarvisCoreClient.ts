export type JarvisModelState = 'not_installed' | 'downloading' | 'ready' | 'active';

export interface JarvisDownloadProgress {
  modelId: string;
  status: string;
  downloaded: number;
  total: number | null;
  percent: number | null;
  error: string | null;
  errorCode: number | null;
}

export interface JarvisModelMetadata {
  model_id: string;
  repo_id?: string;
  filename?: string;
  checksum?: string;
  tags?: string[];
  state: JarvisModelState;
  local_path?: string;
  active_path?: string;
  runtime?: unknown;
}

export interface JarvisModelInfo extends JarvisModelMetadata {
  progress?: JarvisDownloadProgress;
}

export interface JarvisChatHistoryItem {
  role: string;
  content: string;
}

export interface JarvisChatRequest {
  prompt: string;
  systemPrompt?: string;
  history?: JarvisChatHistoryItem[];
  stream?: boolean;
  signal?: AbortSignal;
}

export interface JarvisChatResponse {
  message: string;
  actions?: unknown[];
}

export type JarvisChatEvent = Record<string, unknown>;
export type JarvisChatResult = JarvisChatResponse | AsyncIterable<JarvisChatEvent>;

export type JarvisActionKind = 'open' | 'read' | 'run';

export interface DownloadModelPayload {
  repoId: string;
  filename: string;
  hfToken?: string;
  checksum?: string;
  tags?: string[];
}

export interface JarvisCoreClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface JarvisCoreClient {
  getHealth: (options?: RequestOptions) => Promise<{ status: string }>;
  listModels: (options?: RequestOptions) => Promise<JarvisModelInfo[]>;
  downloadModel: (
    modelId: string,
    payload: DownloadModelPayload,
    options?: RequestOptions,
  ) => Promise<JarvisModelInfo>;
  activateModel: (modelId: string, options?: RequestOptions) => Promise<JarvisModelInfo>;
  sendChat: (payload: JarvisChatRequest) => Promise<JarvisChatResult>;
  triggerAction: <T = unknown>(
    kind: JarvisActionKind,
    payload: Record<string, unknown>,
    options?: RequestOptions,
  ) => Promise<T>;
}

export class JarvisCoreError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'JarvisCoreError';
    this.status = status;
  }
}

const buildUrl = (base: string, path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!base.endsWith('/')) {
    return `${base}${normalized}`;
  }
  return `${base.replace(/\/+$/, '')}${normalized}`;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new JarvisCoreError('Invalid JSON response from Jarvis Core', response.status);
  }
};

const normalizeProgress = (
  modelId: string,
  payload: Record<string, unknown> | null | undefined,
): JarvisDownloadProgress => {
  const downloadedValue = payload?.downloaded;
  const totalValue = payload?.total;
  const percentValue = payload?.percent;
  const errorValue = payload?.error;
  const errorCodeValue = (payload as Record<string, unknown> | undefined)?.error_code;

  const downloaded =
    typeof downloadedValue === 'number' && Number.isFinite(downloadedValue) ? downloadedValue : 0;
  const total =
    typeof totalValue === 'number' && Number.isFinite(totalValue) ? totalValue : null;
  const percent =
    typeof percentValue === 'number' && Number.isFinite(percentValue) ? percentValue : null;

  return {
    modelId,
    status: typeof payload?.status === 'string' ? payload.status : 'unknown',
    downloaded,
    total,
    percent,
    error: typeof errorValue === 'string' ? errorValue : null,
    errorCode:
      typeof errorCodeValue === 'number' && Number.isFinite(errorCodeValue)
        ? errorCodeValue
        : null,
  };
};

const sanitizeBaseUrl = (raw: string): string => {
  if (!raw) {
    return 'http://127.0.0.1:8000';
  }
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    url.pathname = '';
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    return raw.replace(/\/$/, '');
  }
};

export const createJarvisCoreClient = ({
  baseUrl,
  apiKey,
  fetchImpl,
}: JarvisCoreClientOptions): JarvisCoreClient => {
  const resolvedFetch = fetchImpl ?? globalThis.fetch;
  if (typeof resolvedFetch !== 'function') {
    throw new JarvisCoreError('Fetch implementation is required for Jarvis Core client', 0);
  }

  const normalizedBaseUrl = sanitizeBaseUrl(baseUrl);

  const performRequest = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers ?? {});
    if (apiKey && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }

    let body = init.body;
    if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string' && !(body instanceof Blob)) {
      body = JSON.stringify(body);
    }

    if (body !== undefined && !(body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await resolvedFetch(buildUrl(normalizedBaseUrl, path), {
      ...init,
      headers,
      body,
    });

    if (!response.ok) {
      let message = response.statusText || 'Request to Jarvis Core failed';
      try {
        const clone = response.clone();
        const text = await clone.text();
        if (text) {
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            const detail = typeof parsed.detail === 'string' ? parsed.detail : undefined;
            const payloadMessage = typeof parsed.message === 'string' ? parsed.message : undefined;
            message = detail ?? payloadMessage ?? text;
          } catch (error) {
            message = text;
          }
        }
      } catch (error) {
        // ignore parsing errors and fall back to status text
      }
      throw new JarvisCoreError(message || 'Request to Jarvis Core failed', response.status);
    }

    return response;
  };

  const fetchProgress = async (
    modelId: string,
    options?: RequestOptions,
  ): Promise<JarvisDownloadProgress | undefined> => {
    try {
      const response = await performRequest(`/models/${encodeURIComponent(modelId)}/progress`, {
        method: 'GET',
        signal: options?.signal,
      });
      const payload = await parseJson<Record<string, unknown>>(response);
      return normalizeProgress(modelId, payload);
    } catch (error) {
      if (error instanceof JarvisCoreError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  };

  return {
    async getHealth(options) {
      const response = await performRequest('/health', {
        method: 'GET',
        signal: options?.signal,
      });
      return parseJson<{ status: string }>(response);
    },

    async listModels(options) {
      const response = await performRequest('/models', {
        method: 'GET',
        signal: options?.signal,
      });
      const models = await parseJson<JarvisModelMetadata[]>(response);
      const enriched: JarvisModelInfo[] = [];

      for (const model of models) {
        if (model.state === 'downloading') {
          try {
            const progress = await fetchProgress(model.model_id, options);
            enriched.push({ ...model, progress });
          } catch (error) {
            enriched.push({ ...model });
          }
        } else {
          enriched.push({ ...model });
        }
      }

      return enriched;
    },

    async downloadModel(modelId, payload, options) {
      const response = await performRequest(`/models/${encodeURIComponent(modelId)}/download`, {
        method: 'POST',
        signal: options?.signal,
        body: {
          repo_id: payload.repoId,
          filename: payload.filename,
          hf_token: payload.hfToken,
          checksum: payload.checksum,
          tags: payload.tags ?? [],
        },
      });
      const metadata = await parseJson<JarvisModelMetadata>(response);
      const progress = await fetchProgress(modelId, options);
      const result: JarvisModelInfo = progress ? { ...metadata, progress } : { ...metadata };
      return result;
    },

    async activateModel(modelId, options) {
      const response = await performRequest(`/models/${encodeURIComponent(modelId)}/activate`, {
        method: 'POST',
        signal: options?.signal,
      });
      return parseJson<JarvisModelInfo>(response);
    },

    async sendChat(payload) {
      const response = await performRequest('/chat/completions', {
        method: 'POST',
        signal: payload.signal,
        body: {
          prompt: payload.prompt,
          system_prompt: payload.systemPrompt,
          history: (payload.history ?? []).map(entry => ({
            role: entry.role,
            content: entry.content,
          })),
          stream: Boolean(payload.stream),
        },
      });

      if (payload.stream && response.headers.get('content-type')?.includes('text/event-stream')) {
        const body = response.body;
        if (!body) {
          return parseJson<JarvisChatResponse>(response.clone());
        }

        const reader = body.getReader();
        const decoder = new TextDecoder();

        const iterator = async function* (): AsyncGenerator<JarvisChatEvent, void, unknown> {
          let buffer = '';

          const extractEvents = (): JarvisChatEvent[] => {
            const events: JarvisChatEvent[] = [];
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
              const chunk = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const dataLines = chunk
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart());

              if (dataLines.length) {
                const payloadText = dataLines.join('\n');
                if (payloadText) {
                  try {
                    events.push(JSON.parse(payloadText) as JarvisChatEvent);
                  } catch (error) {
                    // ignore malformed payloads
                  }
                }
              }

              boundary = buffer.indexOf('\n\n');
            }
            return events;
          };

          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              for (const event of extractEvents()) {
                yield event;
              }
            }

            buffer += decoder.decode();
            for (const event of extractEvents()) {
              yield event;
            }
          } finally {
            reader.releaseLock();
          }
        };

        return iterator();
      }

      return parseJson<JarvisChatResponse>(response);
    },

    async triggerAction(kind, payload, options) {
      const response = await performRequest(`/actions/${kind}`, {
        method: 'POST',
        signal: options?.signal,
        body: payload,
      });
      return parseJson<T>(response);
    },
  };
};
