import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgents } from '../core/agents/AgentContext';
import { useJarvisCore } from '../core/jarvis/JarvisCoreContext';
import {
  JarvisCoreError,
  type DownloadModelPayload,
  type JarvisDownloadProgress,
  type JarvisModelInfo,
} from '../services/jarvisCoreClient';

export type LocalModelStatus = 'not_installed' | 'downloading' | 'ready';

export interface LocalModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  tags: string[];
  size: number;
  checksum: string;
  status: LocalModelStatus;
  localPath?: string;
  active: boolean;
  progress?: number;
  repoId?: string;
  fileName?: string;
}

export type LocalModelsConnectionStatus = 'online' | 'offline' | 'connecting';

export interface LocalModelsConnectionState {
  status: LocalModelsConnectionStatus;
  message: string | null;
  lastError: string | null;
}

export interface UseLocalModelsResult {
  models: LocalModel[];
  isLoading: boolean;
  error: string | null;
  connectionState: LocalModelsConnectionState;
  startJarvis: () => Promise<void>;
  isRemote: boolean;
  refresh: () => Promise<void>;
  download: (modelId: string, overrides?: Partial<DownloadModelPayload>) => Promise<void>;
  activate: (modelId: string) => Promise<void>;
}

export interface UseLocalModelsOptions {
  storageDir?: string | null;
  syncToken?: number;
}

const OFFLINE_MESSAGE = 'Jarvis Core no está disponible. Inicia el servicio y vuelve a intentarlo.';

const statusToAgentStatus = (
  status: LocalModelStatus,
  active: boolean,
): 'Disponible' | 'Inactivo' | 'Cargando' => {
  if (status === 'downloading') {
    return 'Cargando';
  }
  if (status === 'ready') {
    return active ? 'Disponible' : 'Inactivo';
  }
  return 'Inactivo';
};

const normaliseProgress = (progress?: JarvisDownloadProgress | null): number | undefined => {
  if (!progress) {
    return undefined;
  }

  if (typeof progress.percent === 'number' && Number.isFinite(progress.percent)) {
    return Math.max(0, Math.min(100, progress.percent)) / 100;
  }

  if (
    typeof progress.downloaded === 'number' &&
    progress.downloaded >= 0 &&
    typeof progress.total === 'number' &&
    progress.total > 0
  ) {
    return Math.max(0, Math.min(1, progress.downloaded / progress.total));
  }

  return undefined;
};

const describeJarvisModel = (model: JarvisModelInfo): string => {
  if (model.repo_id) {
    return `Modelo registrado desde ${model.repo_id}`;
  }
  return 'Modelo registrado en Jarvis Core.';
};

const resolveProviderLabel = (model: JarvisModelInfo): string => {
  if (model.repo_id) {
    return 'Hugging Face';
  }
  return 'Jarvis Core';
};

const mapJarvisModelToLocal = (
  model: JarvisModelInfo,
  downloads: Record<string, JarvisDownloadProgress>,
): LocalModel => {
  const progress = downloads[model.model_id] ?? model.progress ?? null;
  const status: LocalModelStatus =
    model.state === 'downloading'
      ? 'downloading'
      : model.state === 'ready' || model.state === 'active'
      ? 'ready'
      : 'not_installed';

  return {
    id: model.model_id,
    name: model.model_id,
    description: describeJarvisModel(model),
    provider: resolveProviderLabel(model),
    tags: Array.isArray(model.tags) ? model.tags : [],
    size: 0,
    checksum: model.checksum ?? '',
    status,
    localPath: model.local_path ?? undefined,
    active: model.state === 'active',
    progress: normaliseProgress(progress),
    repoId: model.repo_id ?? undefined,
    fileName: model.filename ?? undefined,
  };
};

const resolveDownloadPayload = (
  modelId: string,
  overrides: Partial<DownloadModelPayload> | undefined,
  jarvisModels: JarvisModelInfo[],
  localModels: LocalModel[],
): DownloadModelPayload | null => {
  const jarvisModel = jarvisModels.find(entry => entry.model_id === modelId);
  const localModel = localModels.find(entry => entry.id === modelId);

  const repoId = overrides?.repoId ?? jarvisModel?.repo_id ?? localModel?.repoId;
  const filename = overrides?.filename ?? jarvisModel?.filename ?? localModel?.fileName;

  if (!repoId || !filename) {
    return null;
  }

  const checksumCandidate = overrides?.checksum ?? jarvisModel?.checksum ?? localModel?.checksum;
  let checksum: string | undefined;
  if (typeof checksumCandidate === 'string') {
    const trimmed = checksumCandidate.trim();
    checksum = trimmed ? trimmed : undefined;
  } else if (checksumCandidate) {
    checksum = checksumCandidate;
  }

  const tagsCandidate =
    overrides?.tags ??
    (Array.isArray(jarvisModel?.tags) ? jarvisModel?.tags : undefined) ??
    (localModel?.tags?.length ? localModel.tags : undefined);

  return {
    repoId,
    filename,
    hfToken: overrides?.hfToken,
    checksum,
    tags: tagsCandidate ?? [],
  };
};

export const useLocalModels = (
  { syncToken }: UseLocalModelsOptions = {},
): UseLocalModelsResult => {
  const { agents, updateLocalAgentState } = useAgents();
  const {
    connected,
    lastError,
    downloads,
    models: jarvisModels,
    ensureOnline,
    refreshModels,
    downloadModel: downloadFromJarvis,
    activateModel: activateInJarvis,
  } = useJarvisCore();

  const [rawModels, setRawModels] = useState<LocalModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const fallbackModels = useMemo(
    () =>
      agents
        .filter(agent => agent.kind === 'local')
        .map<LocalModel>(agent => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          provider: 'Catálogo local',
          tags: [],
          size: 0,
          checksum: agent.model,
          status:
            agent.status === 'Cargando'
              ? 'downloading'
              : agent.status === 'Disponible'
              ? 'ready'
              : 'not_installed',
          localPath: undefined,
          active: agent.active,
        })),
    [agents],
  );

  const remoteModels = useMemo(
    () => jarvisModels.map(model => mapJarvisModelToLocal(model, downloads)),
    [jarvisModels, downloads],
  );

  useEffect(() => {
    if (connected) {
      setRawModels(remoteModels);
    } else {
      setRawModels(fallbackModels);
    }
  }, [connected, remoteModels, fallbackModels]);

  useEffect(() => {
    rawModels.forEach(model => {
      updateLocalAgentState(model.id, statusToAgentStatus(model.status, model.active), model.active);
    });
  }, [rawModels, updateLocalAgentState]);

  const startJarvis = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await ensureOnline();
      await refreshModels();
    } catch (err) {
      console.error('No se pudo establecer conexión con Jarvis Core', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, [ensureOnline, refreshModels]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!connected) {
        await startJarvis();
      } else {
        await refreshModels();
      }
    } catch (err) {
      console.error('No se pudo sincronizar la lista de modelos locales', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [connected, refreshModels, startJarvis]);

  const download = useCallback(
    async (modelId: string, overrides?: Partial<DownloadModelPayload>) => {
      if (!connected) {
        setError(OFFLINE_MESSAGE);
        return;
      }

      const payload = resolveDownloadPayload(modelId, overrides, jarvisModels, rawModels);
      if (!payload) {
        setError('No se encontró información de descarga para el modelo seleccionado.');
        return;
      }

      try {
        setError(null);
        await downloadFromJarvis(modelId, payload);
        await refreshModels();
      } catch (err) {
        console.error('Error al descargar el modelo', err);
        if (err instanceof JarvisCoreError) {
          if (err.status === 401) {
            setError('Jarvis Core rechazó la solicitud (401). Revisa el token configurado.');
            return;
          }
          if (err.status === 503) {
            setError('Jarvis Core no pudo procesar la descarga (503). Inténtalo más tarde.');
            return;
          }
        }
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [connected, jarvisModels, rawModels, downloadFromJarvis, refreshModels],
  );

  const activate = useCallback(
    async (modelId: string) => {
      if (!connected) {
        setError(OFFLINE_MESSAGE);
        return;
      }

      try {
        setError(null);
        await activateInJarvis(modelId);
        await refreshModels();
      } catch (err) {
        console.error('Error al activar el modelo', err);
        if (err instanceof JarvisCoreError) {
          if (err.status === 401) {
            setError('Jarvis Core rechazó la activación (401). Verifica tus credenciales.');
            return;
          }
          if (err.status === 503) {
            setError('Jarvis Core no pudo activar el modelo (503). Intenta nuevamente en unos instantes.');
            return;
          }
        }
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [connected, activateInJarvis, refreshModels],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, syncToken]);

  const connectionState: LocalModelsConnectionState = useMemo(() => {
    if (connected) {
      return {
        status: 'online',
        message: null,
        lastError: null,
      };
    }

    if (isConnecting) {
      return {
        status: 'connecting',
        message: 'Conectando con Jarvis Core…',
        lastError,
      };
    }

    return {
      status: 'offline',
      message: lastError ?? OFFLINE_MESSAGE,
      lastError,
    };
  }, [connected, isConnecting, lastError]);

  return {
    models: rawModels,
    isLoading,
    error,
    connectionState,
    startJarvis,
    isRemote: connected,
    refresh,
    download,
    activate,
  };
};
