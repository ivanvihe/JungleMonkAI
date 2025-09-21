import React, { useEffect, useMemo, useState } from 'react';
import { GlobalSettings, PluginSettingsEntry } from '../../types/globalSettings';
import { usePluginHost } from '../../core/plugins/PluginHostProvider';
import './PluginManagerModal.css';

interface PluginManagerModalProps {
  settings: GlobalSettings;
  onSettingsChange: (updater: (prev: GlobalSettings) => GlobalSettings) => void;
}

const ensurePluginSettingsEntry = (
  settings: GlobalSettings,
  pluginId: string,
): PluginSettingsEntry => {
  const existing = settings.pluginSettings[pluginId];
  if (existing) {
    return existing;
  }
  return { enabled: false, credentials: {} };
};

export const PluginManagerModal: React.FC<PluginManagerModalProps> = ({
  settings,
  onSettingsChange,
}) => {
  const { plugins, refresh } = usePluginHost();
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

  const sortedPlugins = useMemo(
    () =>
      [...plugins].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'es')), // stable alphabetical
    [plugins],
  );

  useEffect(() => {
    if (!sortedPlugins.length) {
      setSelectedPluginId(null);
      return;
    }
    if (!selectedPluginId || !sortedPlugins.some(entry => entry.pluginId === selectedPluginId)) {
      setSelectedPluginId(sortedPlugins[0]?.pluginId ?? null);
    }
  }, [sortedPlugins, selectedPluginId]);

  const handleToggle = (pluginId: string, enabled: boolean) => {
    onSettingsChange(prev => {
      const entry = ensurePluginSettingsEntry(prev, pluginId);
      const enabledSet = new Set(prev.enabledPlugins);
      if (enabled) {
        enabledSet.add(pluginId);
      } else {
        enabledSet.delete(pluginId);
      }

      return {
        ...prev,
        enabledPlugins: Array.from(enabledSet),
        pluginSettings: {
          ...prev.pluginSettings,
          [pluginId]: {
            ...entry,
            enabled,
          },
        },
      };
    });
    refresh();
  };

  if (!sortedPlugins.length) {
    return (
      <div className="plugin-manager__empty">
        <p>No se han detectado plugins instalados.</p>
        <button type="button" onClick={() => void refresh()}>
          Volver a buscar
        </button>
      </div>
    );
  }

  const selectedPlugin = sortedPlugins.find(entry => entry.pluginId === selectedPluginId) ?? null;

  return (
    <div className="plugin-manager">
      <aside className="plugin-manager__list" aria-label="Listado de plugins">
        <div className="plugin-manager__list-header">
          <h3>Plugins detectados</h3>
          <button type="button" onClick={() => void refresh()} className="plugin-manager__refresh">
            ↻ Actualizar
          </button>
        </div>
        <ul>
          {sortedPlugins.map(entry => {
            const enabled = settings.enabledPlugins.includes(entry.pluginId);
            const isActive = entry.pluginId === selectedPluginId;
            return (
              <li key={entry.pluginId}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`plugin-manager__item${isActive ? ' plugin-manager__item--active' : ''}`}
                  onClick={() => setSelectedPluginId(entry.pluginId)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedPluginId(entry.pluginId);
                    }
                  }}
                >
                  <div className="plugin-manager__item-header">
                    <div>
                      <strong>{entry.manifest.name}</strong>
                      <span className="plugin-manager__item-version">v{entry.manifest.version}</span>
                    </div>
                    <button
                      type="button"
                      data-testid={`plugin-toggle-${entry.pluginId}`}
                      className={`plugin-manager__toggle${enabled ? ' plugin-manager__toggle--on' : ''}`}
                      onClick={event => {
                        event.stopPropagation();
                        handleToggle(entry.pluginId, !enabled);
                      }}
                      aria-pressed={enabled}
                      aria-label={`${enabled ? 'Desactivar' : 'Activar'} plugin ${entry.manifest.name}`}
                    >
                      {enabled ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                  {entry.manifest.description && (
                    <p className="plugin-manager__item-description">{entry.manifest.description}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="plugin-manager__details" aria-live="polite">
        {selectedPlugin ? (
          <>
            <header>
              <h3>{selectedPlugin.manifest.name}</h3>
              <span className="plugin-manager__details-version">v{selectedPlugin.manifest.version}</span>
            </header>
            {selectedPlugin.manifest.description && (
              <p className="plugin-manager__details-description">{selectedPlugin.manifest.description}</p>
            )}

            {selectedPlugin.manifest.capabilities?.length ? (
              <section className="plugin-manager__details-block">
                <h4>Capacidades</h4>
                <ul>
                  {selectedPlugin.manifest.capabilities.map(capability => (
                    <li key={capability.id}>
                      <strong>{capability.type}</strong>
                      {capability.label && <span> · {capability.label}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selectedPlugin.manifest.commands?.length ? (
              <section className="plugin-manager__details-block">
                <h4>Comandos</h4>
                <ul>
                  {selectedPlugin.manifest.commands.map(command => (
                    <li key={command.name}>
                      <strong>{command.name}</strong>
                      {command.description && <span> — {command.description}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="plugin-manager__details-block">
              <h4>Credenciales</h4>
              {selectedPlugin.manifest.credentials?.length ? (
                <p className="plugin-manager__credentials-empty">
                  Gestiona las credenciales desde Ajustes globales → {selectedPlugin.manifest.name}.
                </p>
              ) : (
                <p className="plugin-manager__credentials-empty">
                  Este plugin no requiere credenciales configurables.
                </p>
              )}
            </section>
          </>
        ) : (
          <p className="plugin-manager__details-empty">Selecciona un plugin para revisar sus opciones.</p>
        )}
      </section>
    </div>
  );
};

export default PluginManagerModal;
