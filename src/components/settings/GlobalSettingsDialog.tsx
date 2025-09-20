import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ApiKeySettings, GlobalSettings, ProjectProfile } from '../../types/globalSettings';
import { providerSecretExists, storeProviderSecret } from '../../utils/secrets';
import { ModelGallery } from '../models/ModelGallery';
import { OverlayModal } from '../common/OverlayModal';
import { ProjectDraft, useProjects } from '../../core/projects/ProjectContext';
import './GlobalSettingsDialog.css';

interface GlobalSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GlobalSettings;
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: string, value: string) => void;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
}

type SettingsTab = 'providers' | 'models' | 'projects' | 'preferences';

const PROVIDER_FIELDS: Array<{ id: keyof ApiKeySettings; label: string; placeholder: string }> = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'anthropic-...' },
  { id: 'groq', label: 'Groq', placeholder: 'groq-...' },
];

const createDraftFromProject = (project?: ProjectProfile | null): ProjectDraft => ({
  id: project?.id,
  name: project?.name ?? '',
  repositoryPath: project?.repositoryPath ?? '',
  defaultBranch: project?.defaultBranch ?? '',
  instructions: project?.instructions ?? '',
  preferredProvider: project?.preferredProvider ?? '',
  preferredModel: project?.preferredModel ?? '',
});

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
  const { projects, activeProject, selectProject, upsertProject, removeProject } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => activeProject?.id ?? 'new');
  const [projectForm, setProjectForm] = useState<ProjectDraft>(() => createDraftFromProject(activeProject));
  const [projectError, setProjectError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveTab('providers');
    setProjectError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!projects.length) {
      setSelectedProjectId('new');
      setProjectForm(createDraftFromProject());
      setProjectError(null);
      return;
    }

    if (!activeProject) {
      if (!projects.some(project => project.id === selectedProjectId)) {
        const [first] = projects;
        if (first) {
          setSelectedProjectId(first.id);
          setProjectForm(createDraftFromProject(first));
          setProjectError(null);
        }
      }
      return;
    }

    if (selectedProjectId === 'new' || selectedProjectId === activeProject.id) {
      setSelectedProjectId(activeProject.id);
      setProjectForm(createDraftFromProject(activeProject));
      setProjectError(null);
      return;
    }

    if (!projects.some(project => project.id === selectedProjectId)) {
      setSelectedProjectId(activeProject.id);
      setProjectForm(createDraftFromProject(activeProject));
      setProjectError(null);
    }
  }, [isOpen, activeProject, projects, selectedProjectId]);

  const handleProjectSelectChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setProjectError(null);
      if (value === 'new') {
        setSelectedProjectId('new');
        setProjectForm(createDraftFromProject());
        return;
      }

      setSelectedProjectId(value);
      const match = projects.find(project => project.id === value) ?? null;
      setProjectForm(createDraftFromProject(match));
    },
    [projects],
  );

  const updateFormField = useCallback(
    (field: keyof ProjectDraft) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { value } = event.target;
        setProjectForm(prev => ({ ...prev, [field]: value }));
        setProjectError(null);
      },
    [],
  );

  const handleSaveProject = useCallback(() => {
    if (!projectForm.name?.trim() || !projectForm.repositoryPath?.trim()) {
      setProjectError('Indica al menos nombre y ruta del repositorio.');
      return;
    }

    try {
      const saved = upsertProject(projectForm, { activate: selectedProjectId === 'new' });
      setSelectedProjectId(saved.id);
      setProjectForm(createDraftFromProject(saved));
      setProjectError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el proyecto.';
      setProjectError(message);
    }
  }, [projectForm, selectedProjectId, upsertProject]);

  const handleActivateProject = useCallback(() => {
    if (selectedProjectId === 'new') {
      return;
    }
    selectProject(selectedProjectId);
    setProjectError(null);
  }, [selectProject, selectedProjectId]);

  const handleDeleteProject = useCallback(() => {
    if (selectedProjectId === 'new') {
      setProjectForm(createDraftFromProject());
      setProjectError(null);
      return;
    }

    removeProject(selectedProjectId);
    setSelectedProjectId('new');
    setProjectForm(createDraftFromProject());
    setProjectError(null);
  }, [removeProject, selectedProjectId]);

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
            className={activeTab === 'projects' ? 'is-active' : ''}
            onClick={() => setActiveTab('projects')}
          >
            🗂 Proyectos
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

          {activeTab === 'projects' && (
            <div className="settings-section">
              <h3>Perfiles de proyecto</h3>
              <p>Gestiona repositorios, ramas y preferencias por proyecto.</p>

              <div className="project-manager">
                <label htmlFor="project-selector">Proyecto</label>
                <select
                  id="project-selector"
                  value={selectedProjectId}
                  onChange={handleProjectSelectChange}
                >
                  <option value="new">Nuevo proyecto…</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <label htmlFor="project-name">Nombre</label>
                <input
                  id="project-name"
                  type="text"
                  value={projectForm.name ?? ''}
                  onChange={updateFormField('name')}
                  placeholder="Nombre descriptivo"
                />

                <label htmlFor="project-path">Repositorio</label>
                <input
                  id="project-path"
                  type="text"
                  value={projectForm.repositoryPath ?? ''}
                  onChange={updateFormField('repositoryPath')}
                  placeholder="/ruta/al/repositorio"
                />

                <label htmlFor="project-branch">Rama por defecto</label>
                <input
                  id="project-branch"
                  type="text"
                  value={projectForm.defaultBranch ?? ''}
                  onChange={updateFormField('defaultBranch')}
                  placeholder="main"
                />

                <label htmlFor="project-provider">Proveedor preferido</label>
                <input
                  id="project-provider"
                  type="text"
                  value={projectForm.preferredProvider ?? ''}
                  onChange={updateFormField('preferredProvider')}
                  placeholder="openai"
                />

                <label htmlFor="project-model">Modelo preferido</label>
                <input
                  id="project-model"
                  type="text"
                  value={projectForm.preferredModel ?? ''}
                  onChange={updateFormField('preferredModel')}
                  placeholder="gpt-4"
                />

                <label htmlFor="project-instructions">Instrucciones fijas</label>
                <textarea
                  id="project-instructions"
                  value={projectForm.instructions ?? ''}
                  onChange={updateFormField('instructions')}
                  placeholder="Notas clave para este repositorio"
                  rows={3}
                />

                {projectError && <p className="project-error">{projectError}</p>}

                <div className="project-actions">
                  <button type="button" onClick={handleSaveProject}>
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={handleActivateProject}
                    disabled={selectedProjectId === 'new' || activeProject?.id === selectedProjectId}
                  >
                    Activar
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={handleDeleteProject}
                    disabled={selectedProjectId === 'new'}
                  >
                    Eliminar
                  </button>
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
