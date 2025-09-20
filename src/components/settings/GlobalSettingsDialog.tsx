import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiKeySettings, GlobalSettings } from '../../types/globalSettings';
import { providerSecretExists, storeProviderSecret } from '../../utils/secrets';
import { ModelGallery } from '../models/ModelGallery';
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
            💾 Modelos locales
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
              <h3>Modelos locales</h3>
              <p>Descarga y activa modelos compatibles con la orquestación local.</p>
              <ModelGallery />
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
