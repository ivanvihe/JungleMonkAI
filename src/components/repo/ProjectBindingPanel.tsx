import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import type { ProjectDraft } from '../../core/projects/ProjectContext';
import { useProjects } from '../../core/projects/ProjectContext';
import { isTauriEnvironment } from '../../core/storage/userDataPathsClient';

interface DraftDefaults {
  defaultRemote?: string;
  defaultGitProvider?: ProjectDraft['gitProvider'];
  defaultGitOwner?: string;
}

interface ProjectBindingPanelProps {
  defaults?: DraftDefaults;
}

const createDraft = (draft?: Partial<ProjectDraft> | null, defaults?: DraftDefaults): ProjectDraft => ({
  id: draft?.id,
  name: draft?.name ?? '',
  repositoryPath: draft?.repositoryPath ?? '',
  gitProvider: draft?.gitProvider ?? defaults?.defaultGitProvider,
  gitOwner: draft?.gitOwner ?? defaults?.defaultGitOwner,
  gitRepository: draft?.gitRepository ?? '',
  defaultRemote: draft?.defaultRemote ?? defaults?.defaultRemote ?? 'origin',
  defaultBranch: draft?.defaultBranch ?? '',
  instructions: draft?.instructions ?? '',
  preferredProvider: draft?.preferredProvider ?? '',
  preferredModel: draft?.preferredModel ?? '',
});

export const ProjectBindingPanel: React.FC<ProjectBindingPanelProps> = ({ defaults }) => {
  const { projects, activeProject, selectProject, upsertProject, removeProject } = useProjects();
  const [selectedId, setSelectedId] = useState<string>(() => activeProject?.id ?? 'new');
  const [draft, setDraft] = useState<ProjectDraft>(() => createDraft(activeProject, defaults));
  const [error, setError] = useState<string | null>(null);
  const isDesktop = useMemo(() => isTauriEnvironment(), []);

  useEffect(() => {
    if (!projects.length) {
      setSelectedId('new');
      setDraft(createDraft(null, defaults));
      return;
    }

    if (!selectedId || selectedId === 'new') {
      if (activeProject) {
        setSelectedId(activeProject.id);
        setDraft(createDraft(activeProject, defaults));
      }
      return;
    }

    const match = projects.find(project => project.id === selectedId);
    if (match) {
      setDraft(createDraft(match, defaults));
    } else if (activeProject) {
      setSelectedId(activeProject.id);
      setDraft(createDraft(activeProject, defaults));
    }
  }, [activeProject, defaults, projects, selectedId]);

  const handleSelectChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setError(null);
      if (value === 'new') {
        setSelectedId('new');
        setDraft(createDraft(null, defaults));
        return;
      }

      setSelectedId(value);
      const match = projects.find(project => project.id === value);
      setDraft(createDraft(match, defaults));
    },
    [defaults, projects],
  );

  const updateField = useCallback(
    (field: keyof ProjectDraft) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setDraft(previous => ({ ...previous, [field]: value }));
        setError(null);
      },
    [],
  );

  const handleBrowse = useCallback(async () => {
    if (!isDesktop) {
      setError('La selección de carpetas solo está disponible en la aplicación de escritorio.');
      return;
    }

    try {
      const selection = await open({ directory: true, multiple: false });
      if (typeof selection === 'string') {
        setDraft(previous => ({ ...previous, repositoryPath: selection }));
      }
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo abrir el selector de carpetas.');
    }
  }, [isDesktop]);

  const handleSave = useCallback(() => {
    try {
      const project = upsertProject(draft, { activate: selectedId === 'new' });
      setSelectedId(project.id);
      setDraft(createDraft(project, defaults));
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo guardar el proyecto.');
    }
  }, [draft, defaults, selectedId, upsertProject]);

  const handleActivate = useCallback(() => {
    if (!selectedId || selectedId === 'new') {
      return;
    }
    selectProject(selectedId);
  }, [selectProject, selectedId]);

  const handleDelete = useCallback(() => {
    if (!selectedId || selectedId === 'new') {
      return;
    }
    removeProject(selectedId);
    setSelectedId('new');
    setDraft(createDraft(null, defaults));
  }, [defaults, removeProject, selectedId]);

  return (
    <div className="project-binding">
      <header className="project-binding__header">
        <div>
          <h3>Contexto de proyecto</h3>
          <p>Selecciona o crea un perfil para sincronizar tus preferencias Git.</p>
        </div>
        <select value={selectedId} onChange={handleSelectChange} aria-label="Proyecto activo">
          <option value="new">Nuevo proyecto…</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </header>

      <div className="project-binding__grid">
        <label>
          <span>Nombre</span>
          <input value={draft.name} onChange={updateField('name')} placeholder="Nombre descriptivo" />
        </label>
        <label className="project-binding__path-field">
          <span>Ruta local</span>
          <div className="project-binding__path-input">
            <input
              value={draft.repositoryPath}
              onChange={updateField('repositoryPath')}
              placeholder="/ruta/al/repositorio"
            />
            <button type="button" onClick={handleBrowse} className="ghost" aria-label="Seleccionar carpeta">
              📁
            </button>
          </div>
        </label>
        <label>
          <span>Proveedor Git</span>
          <select value={draft.gitProvider ?? ''} onChange={updateField('gitProvider')}>
            <option value="">Sin especificar</option>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </select>
        </label>
        <label>
          <span>Organización o usuario</span>
          <input
            value={draft.gitOwner ?? ''}
            onChange={updateField('gitOwner')}
            placeholder="org o usuario"
          />
        </label>
        <label>
          <span>Repositorio remoto</span>
          <input
            value={draft.gitRepository ?? ''}
            onChange={updateField('gitRepository')}
            placeholder="nombre-del-repo"
          />
        </label>
        <label>
          <span>Remoto por defecto</span>
          <input value={draft.defaultRemote ?? ''} onChange={updateField('defaultRemote')} placeholder="origin" />
        </label>
        <label>
          <span>Rama por defecto</span>
          <input value={draft.defaultBranch ?? ''} onChange={updateField('defaultBranch')} placeholder="main" />
        </label>
        <label>
          <span>Proveedor preferido</span>
          <input
            value={draft.preferredProvider ?? ''}
            onChange={updateField('preferredProvider')}
            placeholder="openai"
          />
        </label>
        <label>
          <span>Modelo preferido</span>
          <input
            value={draft.preferredModel ?? ''}
            onChange={updateField('preferredModel')}
            placeholder="gpt-4"
          />
        </label>
        <label className="project-binding__span-2">
          <span>Instrucciones fijas</span>
          <textarea
            value={draft.instructions ?? ''}
            onChange={updateField('instructions')}
            rows={3}
            placeholder="Notas o directrices para este repositorio"
          />
        </label>
      </div>

      {error ? <p className="project-binding__error">{error}</p> : null}

      <footer className="project-binding__actions">
        <button type="button" onClick={handleSave}>
          Guardar
        </button>
        <button
          type="button"
          onClick={handleActivate}
          disabled={selectedId === 'new' || activeProject?.id === selectedId}
        >
          Activar
        </button>
        <button type="button" className="danger" onClick={handleDelete} disabled={selectedId === 'new'}>
          Eliminar
        </button>
      </footer>
    </div>
  );
};

export default ProjectBindingPanel;
