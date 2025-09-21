import React from 'react';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  JarvisCoreProvider,
  useJarvisCore,
  type ProgressStreamHandlers,
  type ProgressStreamHandle,
} from '../JarvisCoreContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { GlobalSettings } from '../../../types/globalSettings';
import type { JarvisCoreClient, JarvisModelInfo } from '../../../services/jarvisCoreClient';

const cloneSettings = (): GlobalSettings =>
  JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)) as GlobalSettings;

type ClientMock = {
  [K in keyof JarvisCoreClient]: JarvisCoreClient[K] extends (...args: infer A) => infer R
    ? vi.Mock<Promise<Awaited<R>>, A>
    : JarvisCoreClient[K];
};

const createClientStub = (): ClientMock => ({
  getHealth: vi.fn().mockResolvedValue({ status: 'ok', uptime_seconds: 12 }),
  listModels: vi.fn().mockResolvedValue([] as JarvisModelInfo[]),
  downloadModel: vi.fn(),
  activateModel: vi.fn(),
  sendChat: vi.fn(),
  triggerAction: vi.fn(),
});

const createWrapper = (
  client: ClientMock,
  options?: {
    settings?: GlobalSettings;
    pollingIntervalMs?: number;
    progressStreamFactory?: (url: string, handlers: ProgressStreamHandlers) => ProgressStreamHandle | null;
  },
): React.FC<{ children: React.ReactNode }> => {
  const base = options?.settings ?? cloneSettings();
  const settings = JSON.parse(JSON.stringify(base)) as GlobalSettings;
  settings.jarvisCore.host = settings.jarvisCore.host || '127.0.0.1';
  settings.jarvisCore.port = settings.jarvisCore.port || 8123;

  return ({ children }) => (
    <JarvisCoreProvider
      settings={settings}
      onSettingsChange={() => {}}
      clientOverride={client}
      pollingIntervalMs={options?.pollingIntervalMs}
      progressStreamFactory={options?.progressStreamFactory}
    >
      {children}
    </JarvisCoreProvider>
  );
};

describe('JarvisCoreContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('inicia un EventSource interno cuando está disponible', async () => {
    const client = createClientStub();
    const instances: MockEventSource[] = [];

    class MockEventSource {
      url: string;
      listeners: Record<string, Array<(event: MessageEvent<string> | Event) => void>> = {
        message: [],
        error: [],
      };
      closed = false;

      constructor(url: string) {
        this.url = url;
        instances.push(this);
      }

      addEventListener(type: 'message' | 'error', listener: (event: MessageEvent<string> | Event) => void) {
        this.listeners[type]?.push(listener);
      }

      removeEventListener(type: 'message' | 'error', listener: (event: MessageEvent<string> | Event) => void) {
        this.listeners[type] = this.listeners[type]?.filter(handler => handler !== listener) ?? [];
      }

      emitMessage(data: unknown) {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        this.listeners.message.forEach(listener => listener({ data: payload } as MessageEvent<string>));
      }

      close() {
        this.closed = true;
      }
    }

    const originalEventSource = (globalThis as any).EventSource;
    (globalThis as any).EventSource = MockEventSource;

    try {
      const wrapper = createWrapper(client);
      const { result, unmount } = renderHook(() => useJarvisCore(), { wrapper });

      await act(async () => {
        await Promise.resolve();
      });

      expect(instances).toHaveLength(1);
      expect(instances[0].url).toBe(`${result.current.baseUrl}/models/stream`);

      await act(async () => {
        instances[0].emitMessage({
          model_id: 'auto',
          status: 'downloading',
          downloaded: 256,
          total: 1024,
          percent: 25,
        });
        await Promise.resolve();
      });

      expect(result.current.downloads.auto?.downloaded).toBe(256);

      unmount();

      expect(instances[0].closed).toBe(true);
    } finally {
      (globalThis as any).EventSource = originalEventSource;
    }
  });

  it('ejecuta ensureOnline automáticamente cuando autoStart está activo', async () => {
    const client = createClientStub();
    const wrapper = createWrapper(client);

    renderHook(() => useJarvisCore(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.getHealth).toHaveBeenCalled();
  });

  it('no invoca ensureOnline cuando autoStart está deshabilitado', async () => {
    const client = createClientStub();
    const customSettings = cloneSettings();
    customSettings.jarvisCore.autoStart = false;
    const wrapper = createWrapper(client, { settings: customSettings });

    renderHook(() => useJarvisCore(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(client.getHealth).not.toHaveBeenCalled();
  });

  it('actualiza el modelo activo y el progreso al refrescar', async () => {
    const client = createClientStub();
    client.listModels.mockResolvedValue([
      {
        model_id: 'phi',
        state: 'active',
        repo_id: 'repo',
        filename: 'model.bin',
        checksum: null,
        tags: [],
        local_path: '/tmp/model',
        active_path: '/tmp/model',
        progress: {
          modelId: 'phi',
          status: 'completed',
          downloaded: 4096,
          total: 4096,
          percent: 100,
          error: null,
          errorCode: null,
        },
      } as JarvisModelInfo,
    ]);

    const wrapper = createWrapper(client);
    const { result } = renderHook(() => useJarvisCore(), { wrapper });

    await act(async () => {
      await result.current.refreshModels();
    });

    expect(result.current.activeModel).toBe('phi');
    expect(result.current.downloads.phi.percent).toBe(100);
    expect(result.current.models).toHaveLength(1);
    expect(result.current.models[0].model_id).toBe('phi');
  });

  it('integra actualizaciones de progreso provenientes del streaming', async () => {
    const client = createClientStub();
    let handlers: ProgressStreamHandlers | null = null;
    const streamHandle: ProgressStreamHandle = { close: vi.fn() };
    const progressStreamFactory = vi
      .fn()
      .mockImplementation((url: string, providedHandlers: ProgressStreamHandlers) => {
        handlers = providedHandlers;
        return streamHandle;
      });

    const wrapper = createWrapper(client, { progressStreamFactory });
    const { result } = renderHook(() => useJarvisCore(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(progressStreamFactory).toHaveBeenCalled();

    await act(async () => {
      handlers?.onMessage({ model_id: 'phi', status: 'downloading', downloaded: 512, total: 1024, percent: 50 });
      await Promise.resolve();
    });

    expect(result.current.downloads.phi.downloaded).toBe(512);
  });

  it('cambia a polling cuando no hay streaming disponible', async () => {
    vi.useFakeTimers();
    const client = createClientStub();
    const originalEventSource = (globalThis as any).EventSource;
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).EventSource = undefined;
    (globalThis as any).fetch = undefined;

    try {
      const wrapper = createWrapper(client, {
        pollingIntervalMs: 1500,
      });

      renderHook(() => useJarvisCore(), { wrapper });

      await act(async () => {
        await Promise.resolve();
      });

      expect(client.listModels).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1500);
        await Promise.resolve();
      });

      expect(client.listModels).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).EventSource = originalEventSource;
      (globalThis as any).fetch = originalFetch;
    }
  });

  it('normaliza el estado del runtime y el tiempo de actividad', async () => {
    const client = createClientStub();
    const wrapper = createWrapper(client);

    const { result } = renderHook(() => useJarvisCore(), { wrapper });

    await act(async () => {
      await result.current.ensureOnline();
    });

    expect(result.current.runtimeStatus).toBe('ready');
    expect(result.current.uptimeMs).toBe(12000);
    expect(result.current.lastHealthMessage).toBeNull();
  });
});
