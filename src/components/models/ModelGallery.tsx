import React from 'react';
import { useLocalModels } from '../../hooks/useLocalModels';
import './ModelGallery.css';

const STATUS_LABELS: Record<string, string> = {
  not_installed: 'No instalado',
  downloading: 'Descargando',
  ready: 'Listo',
};

const formatSize = (size: number): string => {
  if (!size) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const ModelGallery: React.FC = () => {
  const {
    models,
    isLoading,
    error,
    download,
    activate,
    refresh,
    connectionState,
    startJarvis,
    isRemote,
  } = useLocalModels();

  const isOnline = connectionState.status === 'online';
  const isConnecting = connectionState.status === 'connecting';

  return (
    <div className="model-gallery">
      <header className="model-gallery__header">
        <div>
          <h3>Modelos locales</h3>
          <p>Descarga y activa modelos compatibles con Jungle Monk Studio.</p>
        </div>
        <div className="model-gallery__header-actions">
          <button type="button" onClick={() => void refresh()} disabled={isLoading}>
            Actualizar
          </button>
        </div>
      </header>

      {!isOnline && (
        <div className="model-gallery__notice" role="status">
          <p>{connectionState.message}</p>
          <button type="button" onClick={() => void startJarvis()} disabled={isConnecting}>
            Conectar JarvisCore
          </button>
        </div>
      )}

      {error && <div className="model-gallery__error">{error}</div>}

      <div className="model-gallery__list">
        {models.map(model => {
          const statusLabel = STATUS_LABELS[model.status] ?? model.status;
          const progress = Math.round((model.progress ?? 0) * 100);
          return (
            <article
              key={model.id}
              className={`model-card model-card--${model.status} ${model.active ? 'is-active' : ''}`}
            >
              <header className="model-card__header">
                <div>
                  <h4>{model.name}</h4>
                  <span className="model-card__status">{statusLabel}</span>
                </div>
                {model.active && <span className="model-card__pill">Activo</span>}
              </header>

              <div className="model-card__source">
                <span className="model-card__provider">{model.provider}</span>
                {!!model.tags.length && (
                  <ul className="model-card__tags">
                    {model.tags.map(tag => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="model-card__description">{model.description}</p>

              <dl className="model-card__meta">
                <div>
                  <dt>Tamaño</dt>
                  <dd>{formatSize(model.size)}</dd>
                </div>
                <div>
                  <dt>Checksum</dt>
                  <dd className="model-card__checksum">{model.checksum}</dd>
                </div>
                {model.localPath && (
                  <div>
                    <dt>Ruta local</dt>
                    <dd className="model-card__path">{model.localPath}</dd>
                  </div>
                )}
              </dl>

              <footer className="model-card__actions">
                {model.status === 'not_installed' && (
                  <button
                    type="button"
                    onClick={() => void download(model.id)}
                    disabled={isLoading || !isRemote || !isOnline}
                  >
                    Descargar
                  </button>
                )}
                {model.status === 'downloading' && (
                  <div className="model-card__progress">
                    <div className="model-card__progress-bar" style={{ width: `${progress}%` }} />
                    <span>{progress}%</span>
                  </div>
                )}
                {model.status === 'ready' && !model.active && (
                  <button type="button" onClick={() => void activate(model.id)} disabled={!isOnline}>
                    Activar
                  </button>
                )}
                {model.status === 'ready' && model.active && <span className="model-card__hint">Listo para usar</span>}
              </footer>
            </article>
          );
        })}

        {!models.length && !isLoading && (
          <div className="model-gallery__empty">No hay modelos locales disponibles.</div>
        )}
      </div>
    </div>
  );
};

export default ModelGallery;
