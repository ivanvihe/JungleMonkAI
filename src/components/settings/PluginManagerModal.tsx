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

  const handleCredentialChange = (pluginId: string, key: string, value: string) => {
    onSettingsChange(prev => {
      const entry = ensurePluginSettingsEntry(prev, pluginId);
      return {
        ...prev,
        pluginSettings: {
          ...prev.pluginSettings,
          [pluginId]: {
            ...entry,
            credentials: {
              ...entry.credentials,
              [key]: value,
            },
          },
        },
      };
    });
  };

  const handleRemoveCredential = (pluginId: string, key: string) => {
    onSettingsChange(prev => {
      const entry = ensurePluginSettingsEntry(prev, pluginId);
      const credentials = { ...entry.credentials };
      delete credentials[key];
      return {
        ...prev,
        pluginSettings: {
          ...prev.pluginSettings,
          [pluginId]: {
            ...entry,
            credentials,
          },
        },
      };
    });
  };

  const handleAddCredential = (pluginId: string) => {
    const key = window.prompt('Introduce un identificador para la credencial del plugin');
    if (!key) {
      return;
    }
    const trimmed = key.trim();
    if (!trimmed) {
      return;
    }
    onSettingsChange(prev => {
      const entry = ensurePluginSettingsEntry(prev, pluginId);
      if (entry.credentials[trimmed] !== undefined) {
        return prev;
      }
      return {
        ...prev,
        pluginSettings: {
          ...prev.pluginSettings,
          [pluginId]: {
            ...entry,
            credentials: {
              ...entry.credentials,
              [trimmed]: '',
            },
          },
        },
      };
    });
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
  const selectedSettings = selectedPlugin
    ? ensurePluginSettingsEntry(settings, selectedPlugin.pluginId)
    : null;

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
        {selectedPlugin && selectedSettings ? (
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
              {Object.keys(selectedSettings.credentials).length ? (
                <ul className="plugin-manager__credentials">
                  {Object.entries(selectedSettings.credentials).map(([key, value]) => (
                    <li key={key} className="plugin-manager__credential">
                      <label>
                        <span>{key}</span>
                        <input
                          type="text"
                          value={value}
                          onChange={event => handleCredentialChange(selectedPlugin.pluginId, key, event.target.value)}
                          placeholder="Introduce el valor"
                        />
                      </label>
                      <button
                        type="button"
                        className="plugin-manager__credential-remove"
                        onClick={() => handleRemoveCredential(selectedPlugin.pluginId, key)}
                        aria-label={`Eliminar la credencial ${key}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="plugin-manager__credentials-empty">
                  No hay credenciales configuradas todavía para este plugin.
                </p>
              )}
              <button
                type="button"
                className="plugin-manager__add-credential"
                onClick={() => handleAddCredential(selectedPlugin.pluginId)}
              >
                Añadir credencial
              </button>
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
