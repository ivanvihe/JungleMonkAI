import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GlobalSettings, JarvisCoreSettings } from '../../types/globalSettings';
import { startDesktopJarvis, stopDesktopJarvis } from '../../utils/runtimeBridge';
import {
  createJarvisCoreClient,
  type DownloadModelPayload,
  type JarvisActionKind,
  type JarvisChatRequest,
  type JarvisChatResult,
  type JarvisCoreClient,
  type JarvisHealthResponse,
  type JarvisDownloadProgress,
  type JarvisModelInfo,
} from '../../services/jarvisCoreClient';

interface ProgressStreamPayload {
  modelId?: string;
  model_id?: string;
  status?: string;
  downloaded?: number;
  total?: number | null;
  percent?: number | null;
  error?: string | null;
  errorCode?: number | null;
  error_code?: number | null;
}

export interface ProgressStreamHandlers {
  onMessage: (payload: ProgressStreamPayload) => void;
  onError: (error: unknown) => void;
}

export interface ProgressStreamHandle {
  close: () => void;
}

export type ProgressStreamFactory = (
  url: string,
  handlers: ProgressStreamHandlers,
) => ProgressStreamHandle | null;

interface JarvisCoreProviderProps {
  settings: GlobalSettings;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
  children: React.ReactNode;
  pollingIntervalMs?: number;
  progressStreamFactory?: ProgressStreamFactory;
  clientOverride?: JarvisCoreClient;
}

export interface JarvisCoreContextValue {
  connected: boolean;
  lastError: string | null;
  activeModel: string | null;
  downloads: Record<string, JarvisDownloadProgress>;
  models: JarvisModelInfo[];
  runtimeStatus: JarvisRuntimeStatus;
  uptimeMs: number | null;
  config: JarvisCoreSettings;
  baseUrl: string;
  lastHealthMessage: string | null;
  ensureOnline: () => Promise<void>;
  refreshModels: () => Promise<JarvisModelInfo[]>;
  downloadModel: (modelId: string, payload: DownloadModelPayload) => Promise<JarvisModelInfo>;
  activateModel: (modelId: string) => Promise<JarvisModelInfo>;
  invokeChat: (payload: JarvisChatRequest) => Promise<JarvisChatResult>;
  launchAction: <T = unknown>(kind: JarvisActionKind, payload: Record<string, unknown>) => Promise<T>;
}

const JarvisCoreContext = createContext<JarvisCoreContextValue | undefined>(undefined);

const STREAM_ENDPOINT = '/models/stream';

export type JarvisRuntimeStatus = 'offline' | 'starting' | 'ready' | 'error';

const NORMALIZED_READY_STATES = new Set(['ok', 'ready', 'online', 'healthy']);

const normalizeRuntimeStatus = (status?: string | null): JarvisRuntimeStatus => {
  if (typeof status === 'string') {
    const normalized = status.trim().toLowerCase();
    if (NORMALIZED_READY_STATES.has(normalized)) {
      return 'ready';
    }
    if (normalized.includes('start') || normalized.includes('boot')) {
      return 'starting';
    }
    if (normalized.includes('error') || normalized.includes('fail')) {
      return 'error';
    }
  }
  return 'offline';
};

const extractUptimeMs = (payload: JarvisHealthResponse | null | undefined): number | null => {
  if (!payload) {
    return null;
  }

  const candidates = [payload.uptimeMs, payload.uptime_ms, payload.uptime_seconds, payload.uptime];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      if (candidate > 1000) {
        return candidate;
      }
      if (payload.uptime_seconds === candidate || payload.uptime === candidate) {
        return Math.round(candidate * 1000);
      }
      return Math.round(candidate);
    }
  }
  return null;
};

const deriveBaseUrl = (host: string, port: number, useHttps?: boolean): string => {
  const trimmedHost = host.trim();
  const normalizedPort = Number.isFinite(port) && port > 0 ? Math.trunc(port) : 8000;
  const protocol = useHttps ? 'https' : 'http';
  try {
    const base = trimmedHost.includes('://') ? trimmedHost : `${protocol}://${trimmedHost || '127.0.0.1'}`;
    const url = new URL(base);
    url.protocol = useHttps ? 'https:' : 'http:';
    url.port = normalizedPort.toString();
    url.pathname = '';
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    return `${protocol}://${trimmedHost || '127.0.0.1'}:${normalizedPort}`;
  }
};

const resolveJarvisApiKey = (settings: GlobalSettings): string | undefined => {
  if (typeof settings.jarvisCore.apiKey === 'string' && settings.jarvisCore.apiKey.trim()) {
    return settings.jarvisCore.apiKey.trim();
  }
  const candidates = ['jarvis-core', 'jarvisCore'];
  for (const key of candidates) {
    const value = settings.apiKeys[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const normalizeProgressEvent = (
  payload: ProgressStreamPayload,
): JarvisDownloadProgress | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rawId = typeof payload.modelId === 'string' && payload.modelId.trim()
    ? payload.modelId.trim()
    : typeof payload.model_id === 'string' && payload.model_id.trim()
    ? payload.model_id.trim()
    : '';

  if (!rawId) {
    return null;
  }

  const downloaded =
    typeof payload.downloaded === 'number' && Number.isFinite(payload.downloaded)
      ? payload.downloaded
      : 0;
  const total =
    typeof payload.total === 'number' && Number.isFinite(payload.total)
      ? payload.total
      : null;
  const percent =
    typeof payload.percent === 'number' && Number.isFinite(payload.percent)
      ? payload.percent
      : null;

  const rawErrorCode =
    typeof payload.errorCode === 'number' && Number.isFinite(payload.errorCode)
      ? payload.errorCode
      : typeof payload.error_code === 'number' && Number.isFinite(payload.error_code)
      ? payload.error_code
      : null;

  return {
    modelId: rawId,
    status: typeof payload.status === 'string' ? payload.status : 'unknown',
    downloaded,
    total,
    percent,
    error: typeof payload.error === 'string' ? payload.error : null,
    errorCode: rawErrorCode,
  };
};

export const JarvisCoreProvider: React.FC<JarvisCoreProviderProps> = ({
  settings,
  onSettingsChange: _onSettingsChange,
  children,
  pollingIntervalMs,
  progressStreamFactory,
  clientOverride,
}) => {
  const jarvisConfig = settings.jarvisCore;
  const apiKey = resolveJarvisApiKey(settings);
  const baseUrl = useMemo(
    () => deriveBaseUrl(jarvisConfig.host, jarvisConfig.port, jarvisConfig.useHttps),
    [jarvisConfig.host, jarvisConfig.port, jarvisConfig.useHttps],
  );

  const client = useMemo<JarvisCoreClient | null>(() => {
    if (clientOverride) {
      return clientOverride;
    }
    try {
      return createJarvisCoreClient({ baseUrl, apiKey });
    } catch (error) {
      console.warn('No se pudo inicializar el cliente de Jarvis Core', error);
      return null;
    }
  }, [clientOverride, baseUrl, apiKey]);

  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, JarvisDownloadProgress>>({});
  const [models, setModels] = useState<JarvisModelInfo[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<JarvisRuntimeStatus>('offline');
  const [uptimeMs, setUptimeMs] = useState<number | null>(null);
  const [lastHealthMessage, setLastHealthMessage] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamHandleRef = useRef<ProgressStreamHandle | null>(null);
  const startStreamRef = useRef<() => boolean>(() => false);

  const normalizedPolling = useMemo(() => {
    const candidate = pollingIntervalMs ?? 5000;
    if (!Number.isFinite(candidate) || candidate <= 0) {
      return 5000;
    }
    return Math.max(1000, Math.trunc(candidate));
  }, [pollingIntervalMs]);

  const startDesktopRuntime = useCallback(async () => {
    if (!jarvisConfig.autoStart) {
      return;
    }

    try {
      const status = await startDesktopJarvis();
      if (!mountedRef.current) {
        return;
      }
      if (status?.lastError) {
        setLastError(status.lastError);
      }
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      setLastError(
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar el runtime local de Jarvis.',
      );
    }
  }, [jarvisConfig.autoStart]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (streamHandleRef.current) {
        streamHandleRef.current.close();
        streamHandleRef.current = null;
      }
    };
  }, []);

  const ensureOnline = useCallback(async () => {
    if (!client) {
      if (mountedRef.current) {
        setConnected(false);
        setRuntimeStatus('offline');
        setUptimeMs(null);
        setLastHealthMessage(null);
        setLastError('Jarvis Core no está configurado.');
      }
      return;
    }

    if (mountedRef.current) {
      setRuntimeStatus(prev => (prev === 'ready' ? prev : 'starting'));
      setLastError(null);
      setLastHealthMessage(null);
    }

    try {
      const health = await client.getHealth();
      if (!mountedRef.current) {
        return;
      }

      const normalizedStatus = normalizeRuntimeStatus(health?.status ?? health?.message ?? null);
      setRuntimeStatus(normalizedStatus === 'offline' ? 'ready' : normalizedStatus);
      setConnected(true);
      setLastError(null);
      setUptimeMs(extractUptimeMs(health));
      const detail =
        typeof health?.detail === 'string'
          ? health.detail
          : typeof health?.message === 'string'
          ? health.message
          : null;
      setLastHealthMessage(detail);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      setConnected(false);
      setRuntimeStatus('error');
      setUptimeMs(null);
      setLastHealthMessage(null);
      setLastError(
        error instanceof Error ? error.message : 'No se pudo establecer conexión con Jarvis Core.',
      );
    }
  }, [client]);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }

    if (!client) {
      if (jarvisConfig.autoStart) {
        void startDesktopRuntime();
      }
      setConnected(false);
      setRuntimeStatus('offline');
      setUptimeMs(null);
      setLastHealthMessage(null);
      if (streamHandleRef.current) {
        streamHandleRef.current.close();
        streamHandleRef.current = null;
      }
      setStreaming(false);
      return;
    }

    if (!jarvisConfig.autoStart) {
      setConnected(false);
      setRuntimeStatus('offline');
      setUptimeMs(null);
      setLastHealthMessage(null);
      if (streamHandleRef.current) {
        streamHandleRef.current.close();
        streamHandleRef.current = null;
      }
      setStreaming(false);
      return;
    }

    setRuntimeStatus(prev => (prev === 'ready' ? prev : 'starting'));
    setLastError(null);
    setLastHealthMessage(null);

    void startDesktopRuntime();
    void ensureOnline();
  }, [
    client,
    ensureOnline,
    startDesktopRuntime,
    jarvisConfig.apiKey,
    jarvisConfig.autoStart,
    jarvisConfig.host,
    jarvisConfig.port,
    jarvisConfig.useHttps,
  ]);

  useEffect(() => {
    if (!jarvisConfig.autoStart) {
      void stopDesktopJarvis();
    }
  }, [jarvisConfig.autoStart]);

  const refreshModels = useCallback(async () => {
    if (!client) {
      if (mountedRef.current) {
        setConnected(false);
        setDownloads({});
        setActiveModel(null);
        setModels([]);
        setRuntimeStatus('offline');
        setUptimeMs(null);
      }
      return [];
    }

    try {
      const models = await client.listModels();
      if (!mountedRef.current) {
        return models;
      }

      let nextActive: string | null = null;
      const nextDownloads: Record<string, JarvisDownloadProgress> = {};

      models.forEach((model: JarvisModelInfo) => {
        if (model.state === 'active') {
          nextActive = model.model_id;
        }
        if (model.progress) {
          nextDownloads[model.model_id] = model.progress;
        } else if (model.state === 'downloading') {
          nextDownloads[model.model_id] = {
            modelId: model.model_id,
            status: 'downloading',
            downloaded: 0,
            total: null,
            percent: null,
            error: null,
            errorCode: null,
          };
        }
      });

      setConnected(true);
      setDownloads(nextDownloads);
      setActiveModel(nextActive);
      setModels(models);
      setLastError(null);
      setRuntimeStatus(prev => (prev === 'offline' || prev === 'starting' || prev === 'error' ? 'ready' : prev));
      return models;
    } catch (error) {
      if (!mountedRef.current) {
        return [];
      }
      setConnected(false);
      setLastError(
        error instanceof Error
          ? error.message
          : 'No se pudo sincronizar el estado del runtime de Jarvis.',
      );
      setModels([]);
      setRuntimeStatus('error');
      setUptimeMs(null);
      return [];
    }
  }, [client]);

  const handleProgressUpdate = useCallback(
    (payload: ProgressStreamPayload) => {
      const normalized = normalizeProgressEvent(payload);
      if (!normalized || !mountedRef.current) {
        return;
      }

      setDownloads(previous => ({
        ...previous,
        [normalized.modelId]: normalized,
      }));

      if (['completed', 'error', 'cancelled', 'active'].includes(normalized.status)) {
        void refreshModels();
      }
    },
    [refreshModels],
  );

  const startStream = useCallback(() => {
    if (!jarvisConfig.autoStart) {
      setStreaming(false);
      return false;
    }

    if (!progressStreamFactory || !client) {
      setStreaming(false);
      return false;
    }

    try {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const handle = progressStreamFactory(`${baseUrl}${STREAM_ENDPOINT}`, {
        onMessage: handleProgressUpdate,
        onError: () => {
          if (!mountedRef.current) {
            return;
          }
          if (streamHandleRef.current) {
            streamHandleRef.current.close();
            streamHandleRef.current = null;
          }
          setStreaming(false);
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            startStreamRef.current();
          }, normalizedPolling);
        },
      });

      if (!handle) {
        setStreaming(false);
        return false;
      }

      if (streamHandleRef.current) {
        streamHandleRef.current.close();
      }
      streamHandleRef.current = handle;
      setStreaming(true);
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setStreaming(false);
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            startStreamRef.current();
          }, normalizedPolling);
        }
      }
      return false;
    }
  }, [
    progressStreamFactory,
    client,
    baseUrl,
    handleProgressUpdate,
    normalizedPolling,
    jarvisConfig.autoStart,
  ]);

  startStreamRef.current = startStream;

  useEffect(() => {
    if (!client) {
      setStreaming(false);
      if (streamHandleRef.current) {
        streamHandleRef.current.close();
        streamHandleRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    if (!progressStreamFactory) {
      setStreaming(false);
      if (streamHandleRef.current) {
        streamHandleRef.current.close();
        streamHandleRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    const started = startStream();
    if (!started) {
      setStreaming(false);
    }

    return () => {
      if (streamHandleRef.current) {
        streamHandleRef.current.close();
        streamHandleRef.current = null;
      }
    };
  }, [client, progressStreamFactory, startStream]);

  useEffect(() => {
    if (!client) {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    if (streaming) {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
    }

    pollingTimerRef.current = setInterval(() => {
      void refreshModels();
    }, normalizedPolling);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [client, streaming, refreshModels, normalizedPolling]);

  useEffect(() => {
    if (!client) {
      setConnected(false);
      setDownloads({});
      setActiveModel(null);
      setRuntimeStatus('offline');
      setUptimeMs(null);
      setLastHealthMessage(null);
      return;
    }

    if (jarvisConfig.autoStart) {
      void ensureOnline();
    }
    void refreshModels();
  }, [client, ensureOnline, refreshModels, jarvisConfig.autoStart]);

  const invokeChat = useCallback(
    (payload: JarvisChatRequest) => {
      if (!client) {
        return Promise.reject(new Error('Jarvis Core no está disponible.'));
      }
      return client.sendChat(payload);
    },
    [client],
  );

  const launchAction = useCallback(
    <T,>(kind: JarvisActionKind, payload: Record<string, unknown>) => {
      if (!client) {
        return Promise.reject(new Error('Jarvis Core no está disponible.'));
      }
      return client.triggerAction<T>(kind, payload);
    },
    [client],
  );

  const downloadModel = useCallback(
    async (modelId: string, payload: DownloadModelPayload) => {
      if (!client) {
        throw new Error('Jarvis Core no está disponible.');
      }

      const result = await client.downloadModel(modelId, payload);
      if (mountedRef.current) {
        setConnected(true);
        setRuntimeStatus(prev => (prev === 'offline' ? 'ready' : prev));
        if (result.progress) {
          setDownloads(previous => ({
            ...previous,
            [modelId]: result.progress as JarvisDownloadProgress,
          }));
        }
      }
      return result;
    },
    [client],
  );

  const activateModel = useCallback(
    async (modelId: string) => {
      if (!client) {
        throw new Error('Jarvis Core no está disponible.');
      }

      const result = await client.activateModel(modelId);
      if (mountedRef.current) {
        setConnected(true);
        setRuntimeStatus('ready');
        setActiveModel(result.model_id ?? modelId);
      }
      return result;
    },
    [client],
  );

  const value = useMemo<JarvisCoreContextValue>(
    () => ({
      connected,
      lastError,
      activeModel,
      downloads,
      models,
      runtimeStatus,
      uptimeMs,
      config: jarvisConfig,
      baseUrl,
      lastHealthMessage,
      ensureOnline,
      refreshModels,
      downloadModel,
      activateModel,
      invokeChat,
      launchAction,
    }),
    [
      connected,
      lastError,
      activeModel,
      downloads,
      models,
      runtimeStatus,
      uptimeMs,
      jarvisConfig,
      baseUrl,
      lastHealthMessage,
      ensureOnline,
      refreshModels,
      downloadModel,
      activateModel,
      invokeChat,
      launchAction,
    ],
  );

  return <JarvisCoreContext.Provider value={value}>{children}</JarvisCoreContext.Provider>;
};

export const useJarvisCore = (): JarvisCoreContextValue => {
  const context = useContext(JarvisCoreContext);
  if (!context) {
    throw new Error('JarvisCoreProvider debe envolver el árbol de componentes.');
  }
  return context;
};
