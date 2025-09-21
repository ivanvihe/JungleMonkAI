import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiKeySettings,
  GlobalSettings,
  McpCredentialEntry,
  PluginSettingsEntry,
} from '../../types/globalSettings';
import {
  providerSecretExists,
  revealProviderSecret,
  storeProviderSecret,
} from '../../utils/secrets';
import { OverlayModal } from '../common/OverlayModal';
import { usePluginHost } from '../../core/plugins/PluginHostProvider';
import { PluginSettingsSection } from './PluginSettingsSection';
import { McpSettingsSection } from './McpSettingsSection';
import './GlobalSettingsDialog.css';

interface GlobalSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GlobalSettings;
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: string, value: string) => void;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
}

interface SettingsSectionDescriptor {
  id: string;
  label: string;
  icon?: string;
  render: () => React.ReactNode;
}

const PROVIDER_FIELDS: Array<{ id: keyof ApiKeySettings; label: string; placeholder: string }> = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'anthropic-...' },
  { id: 'groq', label: 'Groq', placeholder: 'groq-...' },
];

export const GlobalSettingsDialog: React.FC<GlobalSettingsDialogProps> = ({
  isOpen,
  onClose,
  settings,
  apiKeys,
  onApiKeyChange,
  onSettingsChange,
}) => {
  const { plugins: runtimePlugins } = usePluginHost();
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [githubStored, setGithubStored] = useState(false);
  const [gitlabStored, setGitlabStored] = useState(false);
  const [huggingFaceStored, setHuggingFaceStored] = useState(false);
  const [githubInput, setGithubInput] = useState('');
  const [gitlabInput, setGitlabInput] = useState('');
  const [secretError, setSecretError] = useState<string | null>(null);
  const [jarvisFieldTouched, setJarvisFieldTouched] = useState<{ host: boolean; port: boolean }>({
    host: false,
    port: false,
  });
  const previousGithubOwnerRef = useRef<string>(settings.githubDefaultOwner ?? '');
  const onApiKeyChangeRef = useRef(onApiKeyChange);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    onApiKeyChangeRef.current = onApiKeyChange;
  }, [onApiKeyChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const checkSecrets = async () => {
      try {
        const revealed = await revealProviderSecret('github');
        if (cancelled) {
          return;
        }

        if (revealed && revealed.trim()) {
          setGithubStored(true);
          setGithubInput(revealed);
          onApiKeyChangeRef.current('github', '__secure__');
        } else {
          try {
            const storedGithub = await providerSecretExists('github');
            if (cancelled) {
              return;
            }
            setGithubStored(storedGithub);
            setGithubInput('');
            onApiKeyChangeRef.current('github', storedGithub ? '__secure__' : '');
          } catch {
            if (cancelled) {
              return;
            }
            setGithubStored(false);
            setGithubInput('');
            onApiKeyChangeRef.current('github', '');
          }
        }
      } catch {
        if (!cancelled) {
          setGithubStored(false);
          setGithubInput('');
          onApiKeyChangeRef.current('github', '');
        }
      }

      try {
        const storedGitlab = await providerSecretExists('gitlab');
        if (!cancelled) {
          setGitlabStored(storedGitlab);
        }
      } catch {
        if (!cancelled) {
          setGitlabStored(false);
        }
      }

      try {
        const storedHuggingFace = await providerSecretExists('huggingface');
        if (!cancelled) {
          setHuggingFaceStored(storedHuggingFace);
        }
      } catch {
        if (!cancelled) {
          setHuggingFaceStored(false);
        }
      }
    };

    void checkSecrets();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSecretError(null);
      setGitlabInput('');
    } else {
      setGithubInput('');
      setGitlabInput('');
      setSecretError(null);
      setActiveSectionId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setJarvisFieldTouched({ host: false, port: false });
    }
  }, [isOpen]);

  const handleSecretSave = async (provider: 'github' | 'gitlab', value: string) => {
    const trimmed = value.trim();
    try {
      setSecretError(null);
      await storeProviderSecret(provider, trimmed);
      try {
        const stored = await providerSecretExists(provider);
        if (provider === 'github') {
          setGithubStored(stored);
          setGithubInput('');
          onApiKeyChange('github', stored ? '__secure__' : '');
        } else {
          setGitlabStored(stored);
          setGitlabInput('');
          onApiKeyChange('gitlab', stored ? '__secure__' : '');
        }
      } catch (verificationError) {
        console.error('Error verifying stored secret', verificationError);
        if (provider === 'github') {
          const fallbackStored = Boolean(trimmed);
          setGithubStored(fallbackStored);
          setGithubInput('');
          onApiKeyChange('github', fallbackStored ? '__secure__' : '');
        } else {
          const fallbackStored = Boolean(trimmed);
          setGitlabStored(fallbackStored);
          setGitlabInput('');
          onApiKeyChange('gitlab', fallbackStored ? '__secure__' : '');
        }
      }
    } catch (error) {
      console.error('Error storing secret', error);
      setSecretError('No se pudo guardar el token seguro.');
    }
  };

  const handleGithubDefaultOwnerChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onSettingsChange(prev => ({
        ...prev,
        githubDefaultOwner: trimmed || undefined,
      }));
    },
    [onSettingsChange],
  );

  const updateModelPreferences = useCallback(
    (
      updater: (
        previous: GlobalSettings['modelPreferences'],
      ) => GlobalSettings['modelPreferences'],
    ) => {
      onSettingsChange(prev => ({
        ...prev,
        modelPreferences: updater(prev.modelPreferences),
      }));
    },
    [onSettingsChange],
  );

  const handleModelStorageDirChange = useCallback(
    (value: string | null) => {
      updateModelPreferences(prev => ({
        ...prev,
        storageDir: value && value.trim() ? value.trim() : null,
      }));
    },
    [updateModelPreferences],
  );

  const handleModelStorageBrowse = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const { open } = await import('@tauri-apps/api/dialog');
      const selection = await open({ directory: true, multiple: false });
      if (typeof selection === 'string' && selection.trim()) {
        handleModelStorageDirChange(selection);
        return;
      }
    } catch (error) {
      console.warn('No se pudo abrir el selector de carpetas', error);
    }

    const fallback = window.prompt(
      'Selecciona la carpeta de almacenamiento para modelos locales',
      settings.modelPreferences.storageDir ?? '',
    );
    if (typeof fallback === 'string') {
      handleModelStorageDirChange(fallback);
    }
  }, [handleModelStorageDirChange, settings.modelPreferences.storageDir]);

  const handleHuggingFaceApiBaseChange = useCallback(
    (value: string) => {
      updateModelPreferences(prev => ({
        ...prev,
        huggingFace: {
          ...prev.huggingFace,
          apiBaseUrl: value.trim(),
        },
      }));
    },
    [updateModelPreferences],
  );

  const handleHuggingFaceMaxResultsChange = useCallback(
    (value: number) => {
      updateModelPreferences(prev => ({
        ...prev,
        huggingFace: {
          ...prev.huggingFace,
          maxResults: Number.isFinite(value)
            ? Math.min(200, Math.max(10, Math.round(value)))
            : prev.huggingFace.maxResults,
        },
      }));
    },
    [updateModelPreferences],
  );

  const handleUseStoredTokenChange = useCallback(
    (value: boolean) => {
      updateModelPreferences(prev => ({
        ...prev,
        huggingFace: {
          ...prev.huggingFace,
          useStoredToken: value && huggingFaceStored ? value : false,
        },
      }));
    },
    [huggingFaceStored, updateModelPreferences],
  );

  const handlePluginCredentialChange = useCallback(
    (pluginId: string, fieldId: string, value: string) => {
      onSettingsChange(prev => {
        const previousEntry = prev.pluginSettings[pluginId];
        const nextEntry: PluginSettingsEntry = {
          enabled: previousEntry?.enabled ?? prev.enabledPlugins.includes(pluginId),
          credentials: {
            ...(previousEntry?.credentials ?? {}),
            [fieldId]: value,
          },
          lastApprovedChecksum: previousEntry?.lastApprovedChecksum,
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
    [onSettingsChange],
  );

  const handleMcpCredentialChange = useCallback(
    (
      profileId: string,
      fieldId: string,
      entryType: McpCredentialEntry['type'],
      patch: Partial<Pick<McpCredentialEntry, 'value' | 'secretId'>>,
    ) => {
      onSettingsChange(prev => {
        const existingProfile = prev.mcpCredentials[profileId] ?? {};
        const currentEntry = existingProfile[fieldId] ?? {
          id: fieldId,
          type: entryType,
        };
        const nextEntry: McpCredentialEntry = {
          ...currentEntry,
          type: entryType,
          ...patch,
        };
        return {
          ...prev,
          mcpCredentials: {
            ...prev.mcpCredentials,
            [profileId]: {
              ...existingProfile,
              [fieldId]: nextEntry,
            },
          },
        };
      });
    },
    [onSettingsChange],
  );

  const jarvisValidation = useMemo(() => {
    const trimmedHost = settings.jarvisCore.host?.trim() ?? '';
    const hostError = trimmedHost ? null : 'El host o IP es obligatorio.';

    const portValue = settings.jarvisCore.port;
    const portIsInteger = Number.isInteger(portValue);
    const portInRange = portIsInteger && portValue >= 1 && portValue <= 65535;
    const portError = portInRange ? null : 'El puerto debe estar entre 1 y 65535.';

    return {
      errors: {
        host: hostError,
        port: portError,
      },
    };
  }, [settings.jarvisCore.host, settings.jarvisCore.port]);

  const handleJarvisCoreChange = useCallback(
    (patch: Partial<GlobalSettings['jarvisCore']>) => {
      onSettingsChange(prev => ({
        ...prev,
        jarvisCore: {
          ...prev.jarvisCore,
          ...patch,
        },
      }));
    },
    [onSettingsChange],
  );

  const handleJarvisHostChange = useCallback(
    (value: string) => {
      setJarvisFieldTouched(prev => ({ ...prev, host: true }));
      handleJarvisCoreChange({ host: value });
    },
    [handleJarvisCoreChange],
  );

  const handleJarvisPortChange = useCallback(
    (value: string) => {
      setJarvisFieldTouched(prev => ({ ...prev, port: true }));
      const parsed = Number.parseInt(value, 10);
      handleJarvisCoreChange({ port: Number.isFinite(parsed) ? parsed : 0 });
    },
    [handleJarvisCoreChange],
  );

  const handleJarvisUseHttpsChange = useCallback(
    (checked: boolean) => {
      handleJarvisCoreChange({ useHttps: checked });
    },
    [handleJarvisCoreChange],
  );

  const handleJarvisAutoStartChange = useCallback(
    (checked: boolean) => {
      handleJarvisCoreChange({ autoStart: checked });
    },
    [handleJarvisCoreChange],
  );

  const handleJarvisApiKeyChange = useCallback(
    (value: string) => {
      handleJarvisCoreChange({ apiKey: value });
    },
    [handleJarvisCoreChange],
  );

  useEffect(() => {
    const currentDefault = settings.githubDefaultOwner ?? '';
    const previousDefault = previousGithubOwnerRef.current;
    previousGithubOwnerRef.current = currentDefault;

    if (!currentDefault && !previousDefault) {
      return;
    }

    if (!currentDefault) {
      onSettingsChange(prev => ({
        ...prev,
        githubDefaultOwner: undefined,
      }));
    }
  }, [onSettingsChange, settings.githubDefaultOwner]);

  useEffect(() => {
    if (!huggingFaceStored && settings.modelPreferences.huggingFace.useStoredToken) {
      handleUseStoredTokenChange(false);
    }
  }, [handleUseStoredTokenChange, huggingFaceStored, settings.modelPreferences.huggingFace.useStoredToken]);

  const sidePanelPosition = settings.workspacePreferences.sidePanel.position;

  const handlePositionChange = (position: 'left' | 'right') => {
    if (position === sidePanelPosition) {
      return;
    }
    onSettingsChange(prev => ({
      ...prev,
      workspacePreferences: {
        ...prev.workspacePreferences,
        sidePanel: {
          ...prev.workspacePreferences.sidePanel,
          position,
        },
      },
    }));
  };

  const dataLocationSummary = useMemo(() => {
    const { dataLocation } = settings;
    if (dataLocation.useCustomPath && dataLocation.customPath) {
      return `Carpeta personalizada: ${dataLocation.customPath}`;
    }
    return dataLocation.defaultPath
      ? `Usando la ruta predeterminada (${dataLocation.defaultPath})`
      : 'Usando la ruta predeterminada del sistema';
  }, [settings]);

  const modelStorageDir = settings.modelPreferences.storageDir ?? '';
  const huggingFacePrefs = settings.modelPreferences.huggingFace;
  const huggingFaceTokenStatus = huggingFaceStored ? 'Token almacenado disponible' : 'Token no encontrado';

  const pluginEntriesById = useMemo(() => {
    const map = new Map<string, (typeof runtimePlugins)[number]>();
    runtimePlugins.forEach(entry => {
      map.set(entry.pluginId, entry);
    });
    return map;
  }, [runtimePlugins]);

  const jarvisHostError = jarvisValidation.errors.host;
  const jarvisPortError = jarvisValidation.errors.port;
  const showJarvisHostError = jarvisFieldTouched.host && Boolean(jarvisHostError);
  const showJarvisPortError = jarvisFieldTouched.port && Boolean(jarvisPortError);

  const sections: SettingsSectionDescriptor[] = [
    {
      id: 'providers',
      label: 'Proveedores',
      icon: '🔑',
      render: () => (
        <div className="settings-section">
          <h3>Conecta proveedores</h3>
          <p>Guarda tus credenciales para habilitar canales en caliente.</p>
          <div className="provider-form">
            {PROVIDER_FIELDS.map(field => (
              <label key={field.id}>
                <span>{field.label}</span>
                <input
                  type="password"
                  value={apiKeys[field.id] ?? ''}
                  placeholder={field.placeholder}
                  onChange={event => onApiKeyChange(field.id, event.target.value)}
                />
              </label>
            ))}

            <div className="secure-provider">
              <label htmlFor="github-secret">
                GitHub <span className="badge">{githubStored ? 'guardado' : 'pendiente'}</span>
              </label>
              <div className="secure-input">
                <input
                  id="github-secret"
                  type="password"
                  placeholder={githubStored ? 'token almacenado' : 'ghp_...'}
                  value={githubInput}
                  onChange={event => setGithubInput(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void handleSecretSave('github', githubInput)}
                  disabled={!githubInput.trim() && !githubStored}
                >
                  {githubInput.trim() || !githubStored ? 'Guardar' : 'Eliminar'}
                </button>
              </div>
              <label htmlFor="github-default-owner" className="github-default-owner">
                Usuario/organización por defecto
              </label>
              <input
                id="github-default-owner"
                type="text"
                value={settings.githubDefaultOwner ?? ''}
                placeholder="org"
                onChange={event => handleGithubDefaultOwnerChange(event.target.value)}
              />
            </div>

            <div className="secure-provider">
              <label htmlFor="gitlab-secret">
                GitLab <span className="badge">{gitlabStored ? 'guardado' : 'pendiente'}</span>
              </label>
              <div className="secure-input">
                <input
                  id="gitlab-secret"
                  type="password"
                  placeholder={gitlabStored ? 'token almacenado' : 'glpat-...'}
                  value={gitlabInput}
                  onChange={event => setGitlabInput(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void handleSecretSave('gitlab', gitlabInput)}
                  disabled={!gitlabInput.trim() && !gitlabStored}
                >
                  {gitlabInput.trim() || !gitlabStored ? 'Guardar' : 'Eliminar'}
                </button>
              </div>
            </div>

            {secretError && <p className="settings-error">{secretError}</p>}
            <p className="settings-hint">
              La administración de perfiles de proyecto ahora se realiza directamente desde Repo Studio.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'jarvis',
      label: 'Jarvis Core',
      icon: '🤖',
      render: () => (
        <div className="settings-section">
          <h3>Conexión con Jarvis Core</h3>
          <p>Configura el host, el puerto y la autenticación de Jarvis Core.</p>

          <div className="provider-form">
            <label>
              <span>Host o IP</span>
              <input
                type="text"
                value={settings.jarvisCore.host}
                onChange={event => handleJarvisHostChange(event.target.value)}
                placeholder="127.0.0.1"
              />
            </label>
            {showJarvisHostError && jarvisHostError && (
              <p className="settings-error">{jarvisHostError}</p>
            )}

            <label>
              <span>Puerto</span>
              <input
                type="number"
                min="1"
                max="65535"
                value={settings.jarvisCore.port || ''}
                onChange={event => handleJarvisPortChange(event.target.value)}
              />
            </label>
            {showJarvisPortError && jarvisPortError && (
              <p className="settings-error">{jarvisPortError}</p>
            )}

            <div className="jarvis-core-toggles">
              <label className="jarvis-core-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(settings.jarvisCore.useHttps)}
                  onChange={event => handleJarvisUseHttpsChange(event.target.checked)}
                />
                <span>Usar HTTPS</span>
              </label>
              <label className="jarvis-core-toggle">
                <input
                  type="checkbox"
                  checked={settings.jarvisCore.autoStart}
                  onChange={event => handleJarvisAutoStartChange(event.target.checked)}
                />
                <span>Iniciar Jarvis Core automáticamente</span>
              </label>
            </div>

            <label>
              <span>Token o API key (opcional)</span>
              <input
                type="password"
                value={settings.jarvisCore.apiKey ?? ''}
                placeholder="Bearer token o secreto opcional"
                onChange={event => handleJarvisApiKeyChange(event.target.value)}
              />
            </label>
          </div>
        </div>
      ),
    },
    {
      id: 'models',
      label: 'Modelos',
      icon: '💾',
      render: () => (
        <div className="settings-section">
          <h3>Preferencias de modelos</h3>
          <p>Ajusta el directorio local y la conexión con la galería de Hugging Face.</p>

          <div className="model-preferences">
            <div className="model-preferences__field">
              <label htmlFor="model-storage-dir">Directorio de modelos locales</label>
              <div className="model-preferences__input-row">
                <input
                  id="model-storage-dir"
                  type="text"
                  value={modelStorageDir}
                  placeholder="Usar directorio predeterminado"
                  onChange={event => handleModelStorageDirChange(event.target.value)}
                />
                <button type="button" onClick={() => void handleModelStorageBrowse()}>
                  Seleccionar…
                </button>
                <button
                  type="button"
                  onClick={() => handleModelStorageDirChange(null)}
                  disabled={!modelStorageDir}
                >
                  Restablecer
                </button>
              </div>
              <p className="model-preferences__hint">
                El gestor de modelos utilizará esta carpeta para guardar descargas locales.
              </p>
            </div>

            <div className="model-preferences__field">
              <label htmlFor="huggingface-api-base">URL base de la API de Hugging Face</label>
              <input
                id="huggingface-api-base"
                type="url"
                value={huggingFacePrefs.apiBaseUrl}
                onChange={event => handleHuggingFaceApiBaseChange(event.target.value)}
                placeholder="https://huggingface.co"
              />
            </div>

            <div className="model-preferences__field model-preferences__field--compact">
              <label htmlFor="huggingface-max-results">Máximo de resultados por búsqueda</label>
              <input
                id="huggingface-max-results"
                type="number"
                min={10}
                max={200}
                value={huggingFacePrefs.maxResults}
                onChange={event => handleHuggingFaceMaxResultsChange(Number(event.target.value))}
              />
              <p className="model-preferences__hint">
                Limita el tamaño de página utilizado en la galería para optimizar las peticiones.
              </p>
            </div>

            <div className="model-preferences__field model-preferences__token">
              <label>
                <input
                  type="checkbox"
                  checked={huggingFacePrefs.useStoredToken && huggingFaceStored}
                  onChange={event => handleUseStoredTokenChange(event.target.checked)}
                  disabled={!huggingFaceStored}
                />
                <span>Usar token almacenado de Hugging Face</span>
              </label>
              <span
                className={`model-preferences__token-status ${huggingFaceStored ? 'is-available' : 'is-missing'}`}
              >
                {huggingFaceTokenStatus}
              </span>
              {!huggingFaceStored && (
                <p className="model-preferences__hint">
                  Guarda tu token de Hugging Face en la pestaña de proveedores para activar esta opción.
                </p>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'preferences',
      label: 'Preferencias',
      icon: '⚙️',
      render: () => (
        <div className="settings-section">
          <h3>Preferencias generales</h3>
          <p>Personaliza la interfaz del estudio y revisa la configuración local.</p>

          <div className="preference-card">
            <span>Posición del panel lateral</span>
            <div className="preference-options">
              <label>
                <input
                  type="radio"
                  name="sidebar-position"
                  value="left"
                  checked={sidePanelPosition === 'left'}
                  onChange={() => handlePositionChange('left')}
                />
                Izquierda
              </label>
              <label>
                <input
                  type="radio"
                  name="sidebar-position"
                  value="right"
                  checked={sidePanelPosition === 'right'}
                  onChange={() => handlePositionChange('right')}
                />
                Derecha
              </label>
            </div>
          </div>

          <div className="preference-card">
            <span>Ubicación de datos</span>
            <p>{dataLocationSummary}</p>
          </div>
        </div>
      ),
    },
  ];

  const pluginSections: SettingsSectionDescriptor[] = settings.enabledPlugins.map(pluginId => {
    const entry = pluginEntriesById.get(pluginId);
    const manifest = entry?.manifest ?? null;
    const credentials = settings.pluginSettings[pluginId]?.credentials ?? {};
    return {
      id: `plugin-${pluginId}`,
      label: manifest?.name ?? `Plugin ${pluginId}`,
      icon: '🔌',
      render: () => (
        <PluginSettingsSection
          pluginId={pluginId}
          manifest={manifest}
          credentials={credentials}
          onCredentialChange={(fieldId, value) => handlePluginCredentialChange(pluginId, fieldId, value)}
        />
      ),
    };
  });

  const mcpSections: SettingsSectionDescriptor[] = settings.mcpProfiles.map(profile => {
    const credentials = settings.mcpCredentials[profile.id];
    return {
      id: `mcp-${profile.id}`,
      label: profile.label,
      icon: '🌐',
      render: () => (
        <McpSettingsSection
          profile={profile}
          credentials={credentials}
          onCredentialChange={(fieldId, type, patch) =>
            handleMcpCredentialChange(profile.id, fieldId, type, patch)
          }
        />
      ),
    };
  });

  const allSections = [...sections, ...pluginSections, ...mcpSections];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!allSections.length) {
      if (activeSectionId !== null) {
        setActiveSectionId(null);
      }
      return;
    }

    if (!activeSectionId || !allSections.some(section => section.id === activeSectionId)) {
      setActiveSectionId(allSections[0].id);
    }
  }, [activeSectionId, allSections, isOpen]);

  const handleTabKey = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      if (!allSections.length) {
        return;
      }

      const lastIndex = allSections.length - 1;
      let nextIndex = index;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        nextIndex = index === lastIndex ? 0 : index + 1;
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        nextIndex = index === 0 ? lastIndex : index - 1;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = lastIndex;
      }

      const nextSection = allSections[nextIndex];
      if (nextSection) {
        setActiveSectionId(nextSection.id);
        const ref = tabRefs.current[nextSection.id];
        if (ref) {
          ref.focus();
        }
      }
    },
    [allSections],
  );

  const activeSection = allSections.find(section => section.id === activeSectionId) ?? null;

  return (
    <OverlayModal title="Ajustes globales" isOpen={isOpen} onClose={onClose} width={880}>
      <div className="global-settings-dialog">
        <nav
          className="global-settings-tabs"
          role="tablist"
          aria-label="Secciones de ajustes"
          aria-orientation="vertical"
        >
          {allSections.map((section, index) => {
            const isActive = section.id === activeSectionId;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                id={`settings-tab-${section.id}`}
                aria-selected={isActive}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={isActive ? 0 : -1}
                className={isActive ? 'is-active' : ''}
                ref={node => {
                  tabRefs.current[section.id] = node;
                }}
                onClick={() => setActiveSectionId(section.id)}
                onKeyDown={event => handleTabKey(event, index)}
              >
                {section.icon && (
                  <span className="global-settings-tab-icon" aria-hidden="true">
                    {section.icon}
                  </span>
                )}
                <span className="global-settings-tab-label">{section.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="global-settings-content">
          {activeSection ? (
            <section
              role="tabpanel"
              id={`settings-panel-${activeSection.id}`}
              aria-labelledby={`settings-tab-${activeSection.id}`}
            >
              {activeSection.render()}
            </section>
          ) : (
            <p className="global-settings-empty">No hay secciones disponibles.</p>
          )}
        </div>
      </div>
    </OverlayModal>
  );
};

export default GlobalSettingsDialog;
