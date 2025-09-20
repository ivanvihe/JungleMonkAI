import React, { useMemo } from 'react';
import './SidePanel.css';
import { useLocalModels } from '../../hooks/useLocalModels';

interface SidePanelProps {
  onOpenGlobalSettings: () => void;
}

const formatStatus = (status: string, active: boolean, progress?: number) => {
  if (status === 'ready') {
    return active ? 'Activo' : 'Listo';
  }
  if (status === 'downloading') {
    const percent = Math.round((progress ?? 0) * 100);
    return percent > 0 ? `${percent}%` : 'Descargando';
  }
  return 'No instalado';
};

export const SidePanel: React.FC<SidePanelProps> = ({ onOpenGlobalSettings }) => {
  const { models, isLoading, error, refresh } = useLocalModels();

  const summary = useMemo(() => {
    const activeModel = models.find(model => model.active) ?? null;
    const readyCount = models.filter(model => model.status === 'ready').length;
    const downloadingCount = models.filter(model => model.status === 'downloading').length;

    return { activeModel, readyCount, downloadingCount };
  }, [models]);

  return (
    <div className="sidebar">
      <section className="sidebar-section">
        <header>
          <h2>Modelos locales</h2>
          <p>Revisa rápidamente los modelos descargados en este equipo.</p>
        </header>

        <div className="model-panel">
          <div className="model-panel__summary">
            <span className="model-panel__summary-label">Modelo activo</span>
            <strong>{summary.activeModel ? summary.activeModel.name : 'Ninguno'}</strong>
            <span className="model-panel__summary-sub">
              {summary.activeModel
                ? summary.activeModel.provider
                : 'Gestiona los modelos para activarlos en el orquestador local.'}
            </span>
          </div>

          <div className="model-panel__counts">
            <div>
              <span className="model-panel__count-label">Listos</span>
              <span className="model-panel__count-value">{summary.readyCount}</span>
            </div>
            <div>
              <span className="model-panel__count-label">Descargando</span>
              <span className="model-panel__count-value">{summary.downloadingCount}</span>
            </div>
          </div>

          {isLoading && <p className="model-panel__loading">Sincronizando inventario…</p>}
          {error && <p className="model-panel__error">{error}</p>}

          <ul className="model-panel__list">
            {models.map(model => (
              <li
                key={model.id}
                className={`model-panel__item ${model.active ? 'is-active' : ''}`}
                aria-label={`${model.name} · ${formatStatus(model.status, model.active, model.progress)}`}
              >
                <div className="model-panel__item-info">
                  <span className="model-panel__name">{model.name}</span>
                  <span className="model-panel__provider">{model.provider}</span>
                </div>
                <span className={`model-panel__status status-${model.status}`}>
                  {formatStatus(model.status, model.active, model.progress)}
                </span>
              </li>
            ))}
          </ul>

          {!models.length && !isLoading && (
            <p className="model-panel__empty">No hay modelos locales instalados.</p>
          )}
        </div>

        <div className="model-panel__actions">
          <button type="button" onClick={() => void refresh()} disabled={isLoading}>
            Actualizar
          </button>
          <button type="button" className="primary" onClick={onOpenGlobalSettings}>
            Gestionar descargas
          </button>
        </div>
      </section>
    </div>
  );
};

export default SidePanel;
