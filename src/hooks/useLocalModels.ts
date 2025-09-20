import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgents } from '../core/agents/AgentContext';

export type LocalModelStatus = 'not_installed' | 'downloading' | 'ready';

export interface LocalModel {
  id: string;
  name: string;
  description: string;
  size: number;
  checksum: string;
  status: LocalModelStatus;
  localPath?: string;
  active: boolean;
  progress?: number;
}

interface BackendModelSummary {
  id: string;
  name: string;
  description: string;
  size: number;
  checksum: string;
  status: LocalModelStatus;
  local_path?: string | null;
  active: boolean;
}

interface UseLocalModelsResult {
  models: LocalModel[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  download: (modelId: string) => Promise<void>;
  activate: (modelId: string) => Promise<void>;
}

const isTauri = () => typeof window !== 'undefined' && Boolean((window as any).__TAURI__);

const statusToAgentStatus = (status: LocalModelStatus, active: boolean): 'Disponible' | 'Inactivo' | 'Cargando' => {
  if (status === 'downloading') {
    return 'Cargando';
  }
  if (status === 'ready') {
    return active ? 'Disponible' : 'Inactivo';
  }
  return 'Inactivo';
};

export const useLocalModels = (): UseLocalModelsResult => {
  const { agents, updateLocalAgentState } = useAgents();
  const [rawModels, setRawModels] = useState<LocalModel[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = useMemo<LocalModel[]>(
    () =>
      rawModels.map(model => ({
        ...model,
        progress:
          model.status === 'downloading'
            ? progressMap[model.id] ?? 0
            : model.status === 'ready'
            ? 1
            : undefined,
      })),
    [rawModels, progressMap],
  );

  useEffect(() => {
    models.forEach(model => {
      updateLocalAgentState(model.id, statusToAgentStatus(model.status, model.active), model.active);
    });
  }, [models, updateLocalAgentState]);

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      const localAgents = agents.filter(agent => agent.kind === 'local');
      setRawModels(
        localAgents.map(agent => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          size: 0,
          checksum: agent.model,
          status: agent.status === 'Cargando' ? 'downloading' : agent.status === 'Disponible' ? 'ready' : 'not_installed',
          localPath: undefined,
          active: agent.active,
        })),
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      const result = await invoke<BackendModelSummary[]>('list_models');
      setRawModels(
        result.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          size: model.size,
          checksum: model.checksum,
          status: model.status,
          localPath: model.local_path ?? undefined,
          active: model.active,
        })),
      );
    } catch (err) {
      console.error('Error listing models', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [agents]);

  const download = useCallback(
    async (modelId: string) => {
      if (!isTauri()) {
        setError('La descarga solo está disponible dentro de la aplicación de escritorio.');
        return;
      }

      try {
        setError(null);
        const { invoke } = await import('@tauri-apps/api/tauri');
        setProgressMap(prev => ({ ...prev, [modelId]: 0 }));
        setRawModels(prev =>
          prev.map(model =>
            model.id === modelId
              ? {
                  ...model,
                  status: 'downloading',
                }
              : model,
          ),
        );
        await invoke('download_model', { modelId });
      } catch (err) {
        console.error('Error downloading model', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  const activate = useCallback(
    async (modelId: string) => {
      if (!isTauri()) {
        setRawModels(prev =>
          prev.map(model => ({
            ...model,
            active: model.id === modelId,
          })),
        );
        updateLocalAgentState(modelId, 'Disponible', true);
        return;
      }

      try {
        setError(null);
        const { invoke } = await import('@tauri-apps/api/tauri');
        await invoke('activate_model', { modelId });
        await refresh();
      } catch (err) {
        console.error('Error activating model', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh, updateLocalAgentState],
  );

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlistenProgress: Promise<() => void> | null = null;
    let unlistenComplete: Promise<() => void> | null = null;
    let unlistenError: Promise<() => void> | null = null;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenProgress = listen('model-download-progress', event => {
          const payload = event.payload as { id: string; progress: number };
          setProgressMap(prev => ({ ...prev, [payload.id]: payload.progress ?? 0 }));
        });
        unlistenComplete = listen('model-download-complete', event => {
          const payload = event.payload as { id: string };
          setProgressMap(prev => ({ ...prev, [payload.id]: 1 }));
          void refresh();
        });
        unlistenError = listen('model-download-error', event => {
          const payload = event.payload as { id: string; error?: string };
          setError(payload.error ?? 'Error desconocido al descargar el modelo.');
          setProgressMap(prev => ({ ...prev, [payload.id]: 0 }));
          void refresh();
        });
      } catch (err) {
        console.warn('No se pudo inicializar la escucha de eventos de modelos', err);
      }
    };

    setup();

    return () => {
      if (unlistenProgress) {
        unlistenProgress.then(unlisten => unlisten());
      }
      if (unlistenComplete) {
        unlistenComplete.then(unlisten => unlisten());
      }
      if (unlistenError) {
        unlistenError.then(unlisten => unlisten());
      }
    };
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    models,
    isLoading,
    error,
    refresh,
    download,
    activate,
  };
};

