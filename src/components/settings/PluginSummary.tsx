import React from 'react';
import { GlobalSettings } from '../../types/globalSettings';
import { usePluginHost } from '../../core/plugins/PluginHostProvider';
import './PluginSummary.css';

interface PluginSummaryProps {
  settings: GlobalSettings;
  onSettingsChange: (updater: (prev: GlobalSettings) => GlobalSettings) => void;
}

export const PluginSummary: React.FC<PluginSummaryProps> = ({ settings, onSettingsChange }) => {
  const { plugins, refresh } = usePluginHost();

  const handleToggle = (pluginId: string, enabled: boolean) => {
    onSettingsChange(prev => {
      const enabledSet = new Set(prev.enabledPlugins);
      if (enabled) {
        enabledSet.add(pluginId);
      } else {
        enabledSet.delete(pluginId);
      }

      const pluginSettings = {
        ...prev.pluginSettings,
        [pluginId]: {
          ...(prev.pluginSettings[pluginId] ?? { credentials: {} }),
          enabled,
        },
      };

      return {
        ...prev,
        enabledPlugins: Array.from(enabledSet),
        pluginSettings,
      };
    });
  };

  if (!plugins.length) {
    return (
      <div className="plugin-summary">
        <p>No se han detectado plugins instalados.</p>
        <button type="button" onClick={() => void refresh()}>
          Volver a buscar
        </button>
      </div>
    );
  }

  return (
    <div className="plugin-summary">
      <p>Activa o desactiva rápidamente los plugins detectados.</p>
      <ul>
        {plugins.map(entry => {
          const { manifest, pluginId } = entry;
          const enabled = settings.enabledPlugins.includes(pluginId);
          return (
            <li key={pluginId}>
              <header>
                <div>
                  <strong>{manifest.name}</strong>
                  <span>{manifest.version}</span>
                </div>
                <button type="button" onClick={() => handleToggle(pluginId, !enabled)}>
                  {enabled ? 'Desactivar' : 'Activar'}
                </button>
              </header>
              {manifest.description && <p>{manifest.description}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PluginSummary;
