import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiKeySettings, GlobalSettings } from '../../types/globalSettings';
import { providerSecretExists, storeProviderSecret } from '../../utils/secrets';
import { OverlayModal } from '../common/OverlayModal';
import './GlobalSettingsDialog.css';

interface GlobalSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GlobalSettings;
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: string, value: string) => void;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
}

type SettingsTab = 'providers' | 'models' | 'preferences';

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const [githubStored, setGithubStored] = useState(false);
  const [gitlabStored, setGitlabStored] = useState(false);
  const [huggingFaceStored, setHuggingFaceStored] = useState(false);
  const [githubInput, setGithubInput] = useState('');
  const [gitlabInput, setGitlabInput] = useState('');
  const [secretError, setSecretError] = useState<string | null>(null);
  const previousGithubOwnerRef = useRef<string>(settings.githubDefaultOwner ?? '');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const checkSecrets = async () => {
      try {
        const storedGithub = await providerSecretExists('github');
        setGithubStored(storedGithub);
      } catch {
        setGithubStored(false);
      }

      try {
        const storedGitlab = await providerSecretExists('gitlab');
        setGitlabStored(storedGitlab);
      } catch {
        setGitlabStored(false);
      }

      try {
        const storedHuggingFace = await providerSecretExists('huggingface');
        setHuggingFaceStored(storedHuggingFace);
      } catch {
        setHuggingFaceStored(false);
      }
    };

    void checkSecrets();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveTab('providers');
    setSecretError(null);
    setGithubInput('');
    setGitlabInput('');
  }, [isOpen]);

  const handleSecretSave = async (provider: 'github' | 'gitlab', value: string) => {
    try {
      setSecretError(null);
      await storeProviderSecret(provider, value.trim());
      if (provider === 'github') {
        setGithubStored(Boolean(value.trim()));
        setGithubInput('');
      } else {
        setGitlabStored(Boolean(value.trim()));
        setGitlabInput('');
      }
      onApiKeyChange(provider, value.trim() ? '__secure__' : '');
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

  return (
    <OverlayModal title="Ajustes globales" isOpen={isOpen} onClose={onClose} width={880}>
      <div className="global-settings-dialog">
        <nav className="global-settings-tabs" aria-label="Secciones de ajustes">
          <button
            type="button"
            className={activeTab === 'providers' ? 'is-active' : ''}
            onClick={() => setActiveTab('providers')}
          >
            🔑 Proveedores
          </button>
          <button
            type="button"
            className={activeTab === 'models' ? 'is-active' : ''}
            onClick={() => setActiveTab('models')}
          >
            💾 Preferencias de modelos
          </button>
          <button
            type="button"
            className={activeTab === 'preferences' ? 'is-active' : ''}
            onClick={() => setActiveTab('preferences')}
          >
            ⚙️ Preferencias
          </button>
        </nav>

        <div className="global-settings-content">
          {activeTab === 'providers' && (
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
          )}

          {activeTab === 'models' && (
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
          )}

          {activeTab === 'preferences' && (
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
          )}
        </div>
      </div>
    </OverlayModal>
  );
};

export default GlobalSettingsDialog;
