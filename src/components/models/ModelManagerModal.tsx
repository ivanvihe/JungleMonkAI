import React, { useCallback, useMemo, useState } from 'react';
import { OverlayModal } from '../common/OverlayModal';
import { useHuggingFaceCatalog } from '../../hooks/useHuggingFaceCatalog';
import { useLocalModels } from '../../hooks/useLocalModels';
import type { HuggingFacePreferences } from '../../types/globalSettings';
import './ModelManagerModal.css';

interface ModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  storageDir: string | null;
  huggingFacePreferences: HuggingFacePreferences;
  onStorageDirChange: (nextPath: string | null) => void;
  huggingFaceToken?: string;
}

const TASK_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas las tareas' },
  { value: 'text-generation', label: 'Generación de texto' },
  { value: 'text2text-generation', label: 'Instrucciones' },
  { value: 'conversational', label: 'Conversacional' },
  { value: 'translation', label: 'Traducción' },
  { value: 'summarization', label: 'Resumen' },
];

const LIBRARY_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas las librerías' },
  { value: 'transformers', label: 'Transformers' },
  { value: 'ggml', label: 'GGML / GGUF' },
  { value: 'safetensors', label: 'SafeTensors' },
];

const formatCount = (value: number | undefined): string => {
  if (!value) {
    return '—';
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
};

const formatDate = (value: string | undefined): string => {
  if (!value) {
    return '—';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString();
  } catch {
    return value;
  }
};

export const ModelManagerModal: React.FC<ModelManagerModalProps> = ({
  isOpen,
  onClose,
  storageDir,
  huggingFacePreferences,
  onStorageDirChange,
  huggingFaceToken,
}) => {
  const [syncToken, setSyncToken] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');

  const {
    models: catalogModels,
    isLoading: isCatalogLoading,
    error: catalogError,
    page,
    hasNextPage,
    hasPreviousPage,
    search,
    filters,
    setSearch,
    setFilters,
    setPage,
    refresh: refreshCatalog,
  } = useHuggingFaceCatalog({
    apiBaseUrl: huggingFacePreferences.apiBaseUrl,
    pageSize: 12,
    maxResults: huggingFacePreferences.maxResults,
    initialSearch: '',
    initialFilters: {},
    accessToken: huggingFacePreferences.useStoredToken ? huggingFaceToken : undefined,
  });

  const {
    models: localModels,
    isLoading: isLocalLoading,
    error: localError,
    download,
    activate,
    refresh: refreshLocal,
    connectionState,
    startJarvis,
  } = useLocalModels({ storageDir, syncToken });

  const isOnline = connectionState.status === 'online';
  const isConnecting = connectionState.status === 'connecting';

  const localMap = useMemo(() => {
    const map = new Map<string, typeof localModels[number]>();
    localModels.forEach(model => {
      map.set(model.id, model);
    });
    return map;
  }, [localModels]);

  const handleApplySearch = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSearch(searchDraft);
      setPage(0);
    },
    [searchDraft, setPage, setSearch],
  );

  const handleResetFilters = useCallback(() => {
    setSearch('');
    setSearchDraft('');
    setFilters({ task: undefined, library: undefined });
    setPage(0);
  }, [setFilters, setPage, setSearch]);

  const handleDownload = useCallback(
    async (model: typeof catalogModels[number]) => {
      const preferredFile =
        model.files.find(file => file.fileName.toLowerCase().endsWith('.gguf')) ??
        model.files.find(file => file.fileName.toLowerCase().endsWith('.safetensors')) ??
        model.files[0];

      if (!preferredFile) {
        await download(model.id, { repoId: model.id });
        setSyncToken(value => value + 1);
        await refreshLocal();
        return;
      }

      await download(model.id, {
        repoId: model.id,
        filename: preferredFile.fileName,
        checksum: preferredFile.checksum,
        hfToken: huggingFacePreferences.useStoredToken ? huggingFaceToken : undefined,
      });
      setSyncToken(value => value + 1);
      await refreshLocal();
    },
    [download, refreshLocal, huggingFacePreferences.useStoredToken, huggingFaceToken],
  );

  const handleActivate = useCallback(
    async (modelId: string) => {
      await activate(modelId);
      setSyncToken(value => value + 1);
      await refreshLocal();
    },
    [activate, refreshLocal],
  );

  const handleBrowseStorage = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const module = await import('@tauri-apps/api/dialog');
      const selection = await module.open({ directory: true, multiple: false });
      if (typeof selection === 'string' && selection.trim()) {
        onStorageDirChange(selection);
        setSyncToken(value => value + 1);
        await refreshLocal();
        return;
      }
    } catch (error) {
      console.warn('No se pudo abrir el selector de carpetas', error);
    }

    const next = window.prompt('Ruta donde se guardarán los modelos locales', storageDir ?? '');
    if (typeof next === 'string') {
      onStorageDirChange(next.trim() ? next.trim() : null);
      setSyncToken(value => value + 1);
      await refreshLocal();
    }
  }, [onStorageDirChange, refreshLocal, storageDir]);

  const handleStorageInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      const trimmed = value.trim();
      onStorageDirChange(trimmed ? trimmed : null);
      setSyncToken(prev => prev + 1);
    },
    [onStorageDirChange],
  );

  return (
    <OverlayModal title="Gestor de modelos" isOpen={isOpen} onClose={onClose} width={960}>
      <div className="model-manager">
        <section className="model-manager__preferences">
          <div className="model-manager__storage">
            <label htmlFor="model-storage">Carpeta de almacenamiento</label>
            <div className="model-manager__storage-input">
              <input
                id="model-storage"
                type="text"
                value={storageDir ?? ''}
                placeholder="Usar ubicación predeterminada"
                onChange={handleStorageInputChange}
              />
              <button type="button" onClick={() => void handleBrowseStorage()}>
                Seleccionar…
              </button>
            </div>
            <p className="model-manager__storage-hint">
              Los modelos descargados se guardarán en esta carpeta. Cambia la ruta si necesitas un disco externo.
            </p>
          </div>

          <form className="model-manager__filters" onSubmit={handleApplySearch}>
            <div className="model-manager__search">
              <label htmlFor="catalog-search">Buscar modelos</label>
              <div>
                <input
                  id="catalog-search"
                  type="search"
                  placeholder="Nombre, autor o etiqueta"
                  value={searchDraft}
                  onChange={event => setSearchDraft(event.target.value)}
                />
                <button type="submit" disabled={isCatalogLoading}>
                  Buscar
                </button>
              </div>
            </div>

            <div className="model-manager__filter-grid">
              <label>
                <span>Tarea</span>
                <select
                  value={filters.task ?? ''}
                  onChange={event => setFilters({
                    task: event.target.value || undefined,
                    library: filters.library,
                  })}
                >
                  {TASK_FILTERS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Librería</span>
                <select
                  value={filters.library ?? ''}
                  onChange={event => setFilters({
                    task: filters.task,
                    library: event.target.value || undefined,
                  })}
                >
                  {LIBRARY_FILTERS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="model-manager__filters-footer">
              <div className="model-manager__pagination">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={!hasPreviousPage || isCatalogLoading}
                >
                  ← Anterior
                </button>
                <span>
                  Página {page + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasNextPage || isCatalogLoading}
                >
                  Siguiente →
                </button>
              </div>
              <div className="model-manager__filters-actions">
                <button type="button" onClick={handleResetFilters}>
                  Limpiar filtros
                </button>
                <button type="button" onClick={() => refreshCatalog()} disabled={isCatalogLoading}>
                  Actualizar catálogo
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="model-manager__content">
          <div className="model-manager__catalog">
            <header>
              <h3>Catálogo de Hugging Face</h3>
              {search && <span className="model-manager__query">Filtro activo: “{search}”</span>}
            </header>
            {catalogError && <div className="model-manager__error">{catalogError}</div>}
            <div className="model-manager__catalog-grid">
              {catalogModels.map(model => {
                const local = localMap.get(model.id);
                const status = local?.status ?? 'not_installed';
                const isActive = Boolean(local?.active);
                const isReady = status === 'ready';
                const isDownloading = status === 'downloading';
                const progress = local?.progress ?? 0;

                return (
                  <article key={model.id} className={`model-card model-card--${status}`}>
                    <header className="model-card__header">
                      <h4>{model.name}</h4>
                      {model.pipelineTag && <span className="model-card__tag">{model.pipelineTag}</span>}
                    </header>
                    <dl className="model-card__stats">
                      <div>
                        <dt>Descargas</dt>
                        <dd>{formatCount(model.downloads)}</dd>
                      </div>
                      <div>
                        <dt>Favoritos</dt>
                        <dd>{formatCount(model.likes)}</dd>
                      </div>
                      <div>
                        <dt>Actualizado</dt>
                        <dd>{formatDate(model.lastModified)}</dd>
                      </div>
                    </dl>
                    <footer className="model-card__footer">
                      {isDownloading && (
                        <div className="model-card__progress">
                          <div className="model-card__progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
                          <span>{Math.round(progress * 100)}%</span>
                        </div>
                      )}
                      {!isDownloading && !isReady && (
                        <button
                          type="button"
                          onClick={() => void handleDownload(model)}
                          disabled={isCatalogLoading || isLocalLoading || !isOnline}
                        >
                          Descargar
                        </button>
                      )}
                      {isReady && !isActive && (
                        <button
                          type="button"
                          onClick={() => void handleActivate(model.id)}
                          disabled={isLocalLoading || !isOnline}
                        >
                          Activar
                        </button>
                      )}
                      {isReady && isActive && <span className="model-card__active">Activo</span>}
                      {!local && <span className="model-card__status">No instalado</span>}
                    </footer>
                  </article>
                );
              })}

              {!catalogModels.length && !isCatalogLoading && (
                <div className="model-manager__empty">No se encontraron modelos para los filtros seleccionados.</div>
              )}

              {isCatalogLoading && <div className="model-manager__loading">Cargando catálogo…</div>}
            </div>
          </div>

          <aside className="model-manager__local">
            <header>
              <h3>Modelos instalados</h3>
            </header>
            {!isOnline && (
              <div className="model-manager__notice" role="status">
                <p>{connectionState.message}</p>
                <button type="button" onClick={() => void startJarvis()} disabled={isConnecting}>
                  Conectar JarvisCore
                </button>
              </div>
            )}
            {localError && <div className="model-manager__error">{localError}</div>}
            <ul className="model-manager__local-list">
              {localModels.map(model => (
                <li key={model.id} className={model.active ? 'is-active' : ''}>
                  <div>
                    <span className="model-manager__local-name">{model.name}</span>
                    <span className="model-manager__local-status">{model.status}</span>
                  </div>
                  {model.progress !== undefined && model.status === 'downloading' && (
                    <div className="model-manager__local-progress" aria-live="polite">
                      {Math.round(model.progress * 100)}%
                    </div>
                  )}
                  {model.status === 'ready' && !model.active && (
                    <button
                      type="button"
                      onClick={() => void handleActivate(model.id)}
                      disabled={isLocalLoading || !isOnline}
                    >
                      Activar
                    </button>
                  )}
                  {model.status === 'ready' && model.active && <span className="model-manager__local-active">Activo</span>}
                </li>
              ))}

              {!localModels.length && !isLocalLoading && (
                <li className="model-manager__empty">Aún no se han descargado modelos locales.</li>
              )}

              {isLocalLoading && <li className="model-manager__loading">Sincronizando con el registro local…</li>}
            </ul>
          </aside>
        </section>
      </div>
    </OverlayModal>
  );
};

export default ModelManagerModal;
