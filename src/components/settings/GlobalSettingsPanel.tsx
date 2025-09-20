import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CommandPreset,
  DefaultRoutingRules,
  GlobalSettings,
  RoutingRule,
  SupportedProvider,
} from '../../types/globalSettings';
import type { PluginCapability } from '../../core/plugins';
import { useProviderDiagnostics } from '../../hooks/useProviderDiagnostics';
import '../GlobalSettingsModal.css';
import './GlobalSettingsPanel.css';
import { usePluginHost } from '../../core/plugins/PluginHostProvider';

type ProviderTestState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  latencyMs?: number;
  modelUsed?: string;
};

interface GlobalSettingsPanelProps {
  isOpen: boolean;
  settings: GlobalSettings;
  onClose: () => void;
  onSave: (settings: GlobalSettings) => void;
  onResetDefaults?: () => void;
}

const cloneSettings = (value: GlobalSettings): GlobalSettings => ({
  version: value.version,
  apiKeys: { ...value.apiKeys },
  commandPresets: value.commandPresets.map((preset) => ({
    ...preset,
    settings: preset.settings ? { ...preset.settings } : undefined,
  })),
  defaultRoutingRules: Object.entries(value.defaultRoutingRules).reduce<DefaultRoutingRules>(
    (acc, [key, rule]) => ({
      ...acc,
      [key]: { ...rule },
    }),
    {}
  ),
  enabledPlugins: [...value.enabledPlugins],
  approvedManifests: Object.entries(value.approvedManifests).reduce(
    (acc, [pluginId, entry]) => {
      acc[pluginId] = {
        checksum: entry.checksum,
        approvedAt: entry.approvedAt,
        manifests: entry.manifests.map((manifest) => ({
          provider: manifest.provider,
          capabilities: [...manifest.capabilities],
          models: manifest.models.map((model) => ({
            ...model,
            aliases: model.aliases ? [...model.aliases] : undefined,
          })),
        })),
      };
      return acc;
    },
    {} as GlobalSettings['approvedManifests'],
  ),
  pluginSettings: Object.entries(value.pluginSettings ?? {}).reduce(
    (acc, [pluginId, entry]) => {
      acc[pluginId] = {
        enabled: entry.enabled,
        credentials: { ...entry.credentials },
        lastApprovedChecksum: entry.lastApprovedChecksum,
      };
      return acc;
    },
    {} as GlobalSettings['pluginSettings'],
  ),
});

const getPresetId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  groq: 'Groq',
};

const toTitle = (value: string) => {
  if (PROVIDER_LABELS[value]) {
    return PROVIDER_LABELS[value];
  }
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const describeCapability = (capability: PluginCapability): string => {
  switch (capability.type) {
    case 'agent-provider':
      return 'Manifiestos de agentes';
    case 'chat-action':
      return `Acción de chat: ${capability.label}`;
    case 'workspace-panel':
      return capability.slot === 'side-panel'
        ? 'Panel lateral integrado'
        : 'Panel principal personalizado';
    case 'mcp-endpoint':
      return `Endpoint MCP (${capability.transport.toUpperCase()})`;
    case 'mcp-session': {
      const transports = capability.endpoints
        .map(endpoint => endpoint.transport.toUpperCase())
        .join(', ');
      return `Sesión MCP (${transports || 'SIN ENDPOINTS'})`;
    }
    default:
      return capability.type;
  }
};

export const GlobalSettingsPanel: React.FC<GlobalSettingsPanelProps> = ({
  isOpen,
  settings,
  onClose,
  onSave,
  onResetDefaults,
}) => {
  const { supportedProviders, validateApiKey, testConnection, getDefaultModel } =
    useProviderDiagnostics();
  const builtinProviders = useMemo(() => supportedProviders, [supportedProviders]);
  const [draft, setDraft] = useState<GlobalSettings>(() => cloneSettings(settings));
  const [activeTab, setActiveTab] = useState<'providers' | 'presets' | 'routing' | 'plugins'>('providers');
  const [touchedProviders, setTouchedProviders] = useState<Record<string, boolean>>({});
  const [testStates, setTestStates] = useState<Record<string, ProviderTestState>>({});
  const [newProviderId, setNewProviderId] = useState('');
  const { plugins: discoveredPlugins, refresh: refreshPlugins } = usePluginHost();

  const pluginEntries = useMemo(
    () => {
      const map = new Map<
        string,
        {
          runtime: (typeof discoveredPlugins)[number] | null;
          settings: GlobalSettings['pluginSettings'][string];
        }
      >();

      discoveredPlugins.forEach(plugin => {
        map.set(plugin.pluginId, {
          runtime: plugin,
          settings:
            draft.pluginSettings[plugin.pluginId] ?? {
              enabled: false,
              credentials: {},
            },
        });
      });

      Object.entries(draft.pluginSettings).forEach(([pluginId, entry]) => {
        if (!map.has(pluginId)) {
          map.set(pluginId, {
            runtime: null,
            settings: entry,
          });
        }
      });

      return Array.from(map.entries())
        .map(([pluginId, value]) => ({
          pluginId,
          runtime: value.runtime,
          settings: value.settings,
        }))
        .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
    },
    [discoveredPlugins, draft.pluginSettings],
  );

  const handleTogglePlugin = useCallback((pluginId: string, enabled: boolean) => {
    setDraft(prev => {
      const current = prev.pluginSettings[pluginId] ?? { enabled: false, credentials: {} };
      const nextEntry = {
        ...current,
        enabled,
        credentials: { ...current.credentials },
      };
      const pluginSettings = {
        ...prev.pluginSettings,
        [pluginId]: nextEntry,
      };
      const enabledSet = new Set(prev.enabledPlugins);
      if (enabled) {
        enabledSet.add(pluginId);
      } else {
        enabledSet.delete(pluginId);
      }
      return {
        ...prev,
        pluginSettings,
        enabledPlugins: Array.from(enabledSet),
      };
    });
  }, []);

  const handlePluginCredentialChange = useCallback(
    (pluginId: string, fieldId: string, value: string) => {
      setDraft(prev => {
        const current = prev.pluginSettings[pluginId] ?? { enabled: false, credentials: {} };
        const nextEntry = {
          ...current,
          credentials: {
            ...current.credentials,
            [fieldId]: value,
          },
        };

        return {
          ...prev,
          pluginSettings: {
            ...prev.pluginSettings,
            [pluginId]: nextEntry,
          },
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (isOpen) {
      setDraft(cloneSettings(settings));
      setActiveTab('providers');
      setTouchedProviders({});
      setTestStates({});
      setNewProviderId('');
    }
  }, [isOpen, settings]);

  const providerOrder = useMemo(() => {
    const seen = new Set<string>();
    const providers: string[] = [];

    builtinProviders.forEach((provider) => {
      if (!seen.has(provider)) {
        providers.push(provider);
        seen.add(provider);
      }
    });

    Object.keys(draft.apiKeys).forEach((provider) => {
      if (!seen.has(provider)) {
        providers.push(provider);
        seen.add(provider);
      }
    });

    return providers;
  }, [builtinProviders, draft.apiKeys]);

  const validationResults = useMemo(() => {
    return providerOrder.reduce<Record<string, ReturnType<typeof validateApiKey>>>(
      (acc, provider) => ({
        ...acc,
        [provider]: validateApiKey(provider, draft.apiKeys[provider] ?? ''),
      }),
      {}
    );
  }, [draft.apiKeys, providerOrder, validateApiKey]);

  const handleApiKeyChange = useCallback((provider: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: value,
      },
    }));
    setTouchedProviders((prev) => ({
      ...prev,
      [provider]: true,
    }));
  }, []);

  const handleTestConnection = useCallback(
    async (provider: string) => {
      const apiKey = draft.apiKeys[provider] ?? '';
      setTouchedProviders((prev) => ({
        ...prev,
        [provider]: true,
      }));

      const validation = validationResults[provider];
      if (!validation?.valid) {
        setTestStates((prev) => ({
          ...prev,
          [provider]: {
            status: 'error',
            message: validation.message ?? 'La API key no parece válida.',
          },
        }));
        return;
      }

      setTestStates((prev) => ({
        ...prev,
        [provider]: { status: 'loading' },
      }));

      const result = await testConnection(provider, apiKey, getDefaultModel(provider));
      setTestStates((prev) => ({
        ...prev,
        [provider]: result.ok
          ? {
              status: 'success',
              latencyMs: result.latencyMs,
              modelUsed: result.modelUsed,
              message: result.message,
            }
          : {
              status: 'error',
              message: result.message,
            },
      }));
    },
    [draft.apiKeys, getDefaultModel, testConnection, validationResults]
  );

  const handleAddProvider = useCallback(() => {
    const normalized = newProviderId.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    setDraft((prev) => {
      if (normalized in prev.apiKeys) {
        return prev;
      }
      return {
        ...prev,
        apiKeys: {
          ...prev.apiKeys,
          [normalized]: '',
        },
      };
    });
    setNewProviderId('');
  }, [newProviderId]);

  const handleRemoveProvider = useCallback((provider: string) => {
    if (builtinProviders.includes(provider as SupportedProvider)) {
      return;
    }
    setDraft((prev) => {
      const { [provider]: _removed, ...rest } = prev.apiKeys;
      return {
        ...prev,
        apiKeys: rest,
      };
    });
    setTouchedProviders((prev) => {
      const { [provider]: _removed, ...rest } = prev;
      return rest;
    });
    setTestStates((prev) => {
      const { [provider]: _removed, ...rest } = prev;
      return rest;
    });
  }, [builtinProviders]);

  const handlePresetChange = useCallback(
    (id: string, patch: Partial<CommandPreset>) => {
      setDraft((prev) => ({
        ...prev,
        commandPresets: prev.commandPresets.map((preset) =>
          preset.id === id
            ? {
                ...preset,
                ...patch,
                settings:
                  patch.settings !== undefined
                    ? patch.settings
                    : preset.settings
                    ? { ...preset.settings }
                    : undefined,
              }
            : preset
        ),
      }));
    },
    []
  );

  const handlePresetSettingsChange = useCallback(
    (id: string, patch: CommandPreset['settings']) => {
      setDraft((prev) => ({
        ...prev,
        commandPresets: prev.commandPresets.map((preset) =>
          preset.id === id
            ? {
                ...preset,
                settings: {
                  ...preset.settings,
                  ...patch,
                },
              }
            : preset
        ),
      }));
    },
    []
  );

  const handleAddPreset = useCallback(() => {
    const newPreset: CommandPreset = {
      id: getPresetId(),
      label: 'Nuevo preset',
      prompt: 'Describe la tarea que debe ejecutar este preset...',
      provider: providerOrder[0] ?? '',
      model: '',
    };

    setDraft((prev) => ({
      ...prev,
      commandPresets: [...prev.commandPresets, newPreset],
    }));
  }, [providerOrder]);

  const handleRemovePreset = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      commandPresets: prev.commandPresets.filter((preset) => preset.id !== id),
    }));
  }, []);

  const handleRoutingRuleChange = useCallback(
    (routeKey: string, field: keyof RoutingRule | 'key', value: string) => {
      setDraft((prev) => {
        const currentRule = prev.defaultRoutingRules[routeKey];
        if (!currentRule) {
          return prev;
        }

        if (field === 'key') {
          const newKey = value.trim();
          if (!newKey || newKey === routeKey) {
            return prev;
          }
          if (prev.defaultRoutingRules[newKey]) {
            return prev;
          }
          const { [routeKey]: _removed, ...rest } = prev.defaultRoutingRules;
          return {
            ...prev,
            defaultRoutingRules: {
              ...rest,
              [newKey]: { ...currentRule },
            },
          };
        }

        const trimmed = value.trim();
        return {
          ...prev,
          defaultRoutingRules: {
            ...prev.defaultRoutingRules,
            [routeKey]: {
              ...currentRule,
              [field]:
                field === 'commandPresetId'
                  ? (trimmed ? trimmed : undefined)
                  : trimmed,
            },
          },
        };
      });
    },
    []
  );

  const handleAddRoutingRule = useCallback(() => {
    setDraft((prev) => {
      let candidate = 'chat';
      let index = 1;
      while (prev.defaultRoutingRules[candidate]) {
        candidate = `route-${index}`;
        index += 1;
      }

      return {
        ...prev,
        defaultRoutingRules: {
          ...prev.defaultRoutingRules,
          [candidate]: {
            provider: providerOrder[0] ?? '',
            model: '',
          },
        },
      };
    });
  }, [providerOrder]);

  const handleRemoveRoutingRule = useCallback((routeKey: string) => {
    setDraft((prev) => {
      const { [routeKey]: _removed, ...rest } = prev.defaultRoutingRules;
      return {
        ...prev,
        defaultRoutingRules: rest,
      };
    });
  }, []);

  const handleSave = useCallback(() => {
    onSave(cloneSettings(draft));
    onClose();
  }, [draft, onClose, onSave]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="settings-modal-overlay">
      <div className="settings-modal-content wide">
        <div className="settings-header">
          <h2>🔐 Ajustes Globales de IA</h2>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-main">
          <div className="settings-sidebar">
            {[
              { id: 'providers', label: 'Credenciales', icon: '🔑' },
              { id: 'presets', label: 'Comandos', icon: '🧩' },
              { id: 'routing', label: 'Preferencias', icon: '🧭' },
              { id: 'plugins', label: 'Plugins', icon: '🔌' },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                <span className="tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-content">
            {activeTab === 'providers' && (
              <div className="settings-section">
                <h3>Credenciales por proveedor</h3>
                <p className="setting-hint">
                  Guarda tus API keys de manera local. Nunca se comparten fuera de tu dispositivo.
                </p>

                <div className="setting-group inline">
                  <input
                    type="text"
                    placeholder="Agregar proveedor personalizado"
                    value={newProviderId}
                    onChange={(event) => setNewProviderId(event.target.value)}
                    className="setting-input"
                  />
                  <button className="setting-button" onClick={handleAddProvider}>
                    Añadir
                  </button>
                </div>

                {providerOrder.map((provider) => {
                  const value = draft.apiKeys[provider] ?? '';
                  const validation = validationResults[provider];
                  const testState = testStates[provider] ?? { status: 'idle' };
                  const showValidation = touchedProviders[provider] && !validation?.valid;

                  return (
                    <div className="setting-group" key={provider}>
                      <label className="setting-label">
                        <span>{toTitle(provider)}</span>
                        <input
                          type="password"
                          value={value}
                          placeholder="sk-..."
                          className="setting-input"
                          onChange={(event) => handleApiKeyChange(provider, event.target.value)}
                        />
                      </label>

                      <div className="setting-actions">
                        {!builtinProviders.includes(provider as SupportedProvider) && (
                          <button
                            className="setting-button subtle"
                            onClick={() => handleRemoveProvider(provider)}
                          >
                            Quitar
                          </button>
                        )}
                        <button
                          className="setting-button"
                          onClick={() => handleTestConnection(provider)}
                          disabled={testState.status === 'loading'}
                        >
                          {testState.status === 'loading' ? 'Probando…' : 'Probar conexión'}
                        </button>
                      </div>

                      {showValidation && validation?.message && (
                        <small className="setting-error">{validation.message}</small>
                      )}

                      {testState.status === 'success' && (
                        <small className="setting-success">
                          {testState.message || 'Conexión verificada.'}
                          {typeof testState.latencyMs === 'number' && (
                            <span> · {Math.round(testState.latencyMs)} ms</span>
                          )}
                          {testState.modelUsed && <span> · Modelo: {testState.modelUsed}</span>}
                        </small>
                      )}

                      {testState.status === 'error' && testState.message && (
                        <small className="setting-error">{testState.message}</small>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'presets' && (
              <div className="settings-section">
                <div className="setting-header">
                  <h3>Plantillas de comandos</h3>
                  <button className="setting-button" onClick={handleAddPreset}>
                    Nueva plantilla
                  </button>
                </div>

                {draft.commandPresets.length === 0 && (
                  <p className="setting-hint">
                    Aún no hay plantillas configuradas. Crea una para reutilizar prompts frecuentes.
                  </p>
                )}

                {draft.commandPresets.map((preset) => (
                  <div className="setting-card" key={preset.id}>
                    <div className="setting-card-header">
                      <h4>{preset.label}</h4>
                      <button
                        className="setting-button subtle"
                        onClick={() => handleRemovePreset(preset.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                    <label className="setting-label">
                      <span>Nombre</span>
                      <input
                        type="text"
                        className="setting-input"
                        value={preset.label}
                        onChange={(event) =>
                          handlePresetChange(preset.id, { label: event.target.value })
                        }
                      />
                    </label>
                    <label className="setting-label">
                      <span>Descripción</span>
                      <input
                        type="text"
                        className="setting-input"
                        value={preset.description ?? ''}
                        onChange={(event) =>
                          handlePresetChange(preset.id, { description: event.target.value })
                        }
                        placeholder="Uso recomendado o notas adicionales"
                      />
                    </label>
                    <label className="setting-label">
                      <span>Prompt</span>
                      <textarea
                        className="setting-textarea"
                        rows={4}
                        value={preset.prompt}
                        onChange={(event) =>
                          handlePresetChange(preset.id, { prompt: event.target.value })
                        }
                      />
                    </label>
                    <div className="setting-row">
                      <label className="setting-label">
                        <span>Proveedor</span>
                        <input
                          type="text"
                          className="setting-input"
                          value={preset.provider ?? ''}
                          onChange={(event) =>
                            handlePresetChange(preset.id, { provider: event.target.value })
                          }
                          placeholder="openai, anthropic, groq…"
                        />
                      </label>
                      <label className="setting-label">
                        <span>Modelo</span>
                        <input
                          type="text"
                          className="setting-input"
                          value={preset.model ?? ''}
                          onChange={(event) =>
                            handlePresetChange(preset.id, { model: event.target.value })
                          }
                          placeholder="gpt-4o-mini, claude-3-haiku, etc."
                        />
                      </label>
                    </div>
                    <div className="setting-row">
                      <label className="setting-label">
                        <span>Temperatura</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          className="setting-input"
                          value={preset.settings?.temperature ?? ''}
                          onChange={(event) =>
                            handlePresetSettingsChange(preset.id, {
                              temperature: event.target.value === '' ? undefined : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="setting-label">
                        <span>Máx. tokens</span>
                        <input
                          type="number"
                          min="16"
                          step="8"
                          className="setting-input"
                          value={preset.settings?.maxTokens ?? ''}
                          onChange={(event) =>
                            handlePresetSettingsChange(preset.id, {
                              maxTokens: event.target.value === '' ? undefined : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'routing' && (
              <div className="settings-section">
                <div className="setting-header">
                  <h3>Preferencias por defecto</h3>
                  <button className="setting-button" onClick={handleAddRoutingRule}>
                    Añadir preferencia
                  </button>
                </div>

                {Object.keys(draft.defaultRoutingRules).length === 0 && (
                  <p className="setting-hint">
                    Define reglas para elegir proveedor y modelo automáticamente según el contexto.
                  </p>
                )}

                {Object.entries(draft.defaultRoutingRules).map(([routeKey, rule]) => (
                  <div className="setting-card" key={routeKey}>
                    <div className="setting-card-header">
                      <input
                        type="text"
                        className="setting-input"
                        value={routeKey}
                        onChange={(event) =>
                          handleRoutingRuleChange(routeKey, 'key', event.target.value)
                        }
                      />
                      <button
                        className="setting-button subtle"
                        onClick={() => handleRemoveRoutingRule(routeKey)}
                      >
                        Eliminar
                      </button>
                    </div>

                    <div className="setting-row">
                      <label className="setting-label">
                        <span>Proveedor</span>
                        <input
                          type="text"
                          className="setting-input"
                          value={rule.provider}
                          onChange={(event) =>
                            handleRoutingRuleChange(routeKey, 'provider', event.target.value)
                          }
                          placeholder="openai, anthropic, groq…"
                        />
                      </label>
                      <label className="setting-label">
                        <span>Modelo</span>
                        <input
                          type="text"
                          className="setting-input"
                          value={rule.model}
                          onChange={(event) =>
                            handleRoutingRuleChange(routeKey, 'model', event.target.value)
                          }
                          placeholder="Modelo preferido"
                        />
                      </label>
                    </div>
                    <label className="setting-label">
                      <span>Plantilla vinculada</span>
                      <select
                        className="setting-select"
                        value={rule.commandPresetId ?? ''}
                        onChange={(event) =>
                          handleRoutingRuleChange(routeKey, 'commandPresetId', event.target.value)
                        }
                      >
                        <option value="">Ninguna</option>
                        {draft.commandPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'plugins' && (
              <div className="settings-section">
                <div className="setting-header">
                  <h3>Gestión de plugins</h3>
                  <button type="button" className="setting-button" onClick={() => refreshPlugins()}>
                    Reexplorar
                  </button>
                </div>

                {pluginEntries.length === 0 ? (
                  <p className="setting-hint">
                    No se han detectado plugins en la carpeta <code>plugins/</code> del entorno actual.
                  </p>
                ) : (
                  pluginEntries.map(entry => {
                    const manifest = entry.runtime?.manifest;
                    const credentialFields = manifest?.credentials ?? [];
                    const capabilities = manifest?.capabilities ?? [];
                    const checksum = entry.runtime?.checksum ?? null;
                    const enabled = entry.settings?.enabled ?? false;
                    const approvedChecksum = entry.settings?.lastApprovedChecksum ?? null;
                    const checksumMismatch = Boolean(
                      approvedChecksum && checksum && approvedChecksum !== checksum,
                    );

                    return (
                      <div className="setting-card" key={entry.pluginId}>
                        <div className="setting-card-header">
                          <div>
                            <h4>{manifest?.name ?? entry.pluginId}</h4>
                            <p className="setting-hint">
                              {manifest?.description ??
                                'Plugin pendiente de instalación o validación.'}
                            </p>
                          </div>
                          <label className="setting-label">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) => handleTogglePlugin(entry.pluginId, event.target.checked)}
                              disabled={!manifest}
                            />
                            <span>Activo</span>
                          </label>
                        </div>

                        <div className="setting-meta">
                          <span>{manifest ? 'Disponible' : 'No detectado'}</span>
                          {manifest && <span>Versión {manifest.version}</span>}
                          {checksum && <span className="setting-code">Checksum {checksum.slice(0, 12)}…</span>}
                        </div>

                        {checksumMismatch && (
                          <p className="setting-error">
                            La firma aprobada ({approvedChecksum?.slice(0, 12)}…) no coincide con el
                            manifiesto actual. Revisa el contenido antes de continuar.
                          </p>
                        )}

                        {capabilities.length > 0 && (
                          <ul className="setting-list">
                            {capabilities.map((capability, index) => (
                              <li key={`${entry.pluginId}-cap-${index}`}>
                                {describeCapability(capability)}
                              </li>
                            ))}
                          </ul>
                        )}

                        {credentialFields.length > 0 && (
                          <div className="setting-group">
                            <h5>Credenciales del plugin</h5>
                            {credentialFields.map(field => (
                              <label key={field.id} className="setting-label">
                                <span>{field.label}</span>
                                <input
                                  type={field.secret ? 'password' : 'text'}
                                  className="setting-input"
                                  placeholder={field.description}
                                  value={entry.settings?.credentials?.[field.id] ?? ''}
                                  onChange={(event) =>
                                    handlePluginCredentialChange(
                                      entry.pluginId,
                                      field.id,
                                      event.target.value,
                                    )
                                  }
                                  disabled={!manifest}
                                />
                              </label>
                            ))}
                          </div>
                        )}

                        {!manifest && (
                          <p className="setting-hint">
                            Copia el plugin en <code>plugins/{entry.pluginId}</code> y pulsa «Reexplorar».
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          {onResetDefaults && (
            <button className="setting-button subtle" onClick={onResetDefaults}>
              Restaurar valores por defecto
            </button>
          )}
          <div className="settings-footer-actions">
            <button className="setting-button subtle" onClick={onClose}>
              Cancelar
            </button>
            <button className="setting-button primary" onClick={handleSave}>
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalSettingsPanel;
