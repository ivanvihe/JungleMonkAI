import React, { createContext, useCallback, useContext, useMemo } from 'react';
import type {
  GitHostingProvider,
  GlobalSettings,
  OrchestratorDegradationPolicy,
  OrchestratorExecutionMode,
  ProjectOrchestratorPreferences,
  ProjectProfile,
} from '../../types/globalSettings';
import { DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES } from '../../utils/globalSettings';

interface ProjectProviderProps {
  settings: GlobalSettings;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
  children: React.ReactNode;
}

export interface ProjectDraft {
  id?: string;
  name: string;
  repositoryPath: string;
  gitProvider?: GitHostingProvider;
  gitOwner?: string;
  gitRepository?: string;
  defaultRemote?: string;
  defaultBranch?: string;
  instructions?: string;
  preferredProvider?: string;
  preferredModel?: string;
  orchestratorMode?: OrchestratorExecutionMode;
  fallbackProvider?: string;
  fallbackModel?: string;
  retryLimit?: number;
  retryDelayMs?: number;
  degradationPolicy?: OrchestratorDegradationPolicy;
}

interface ProjectContextValue {
  projects: ProjectProfile[];
  activeProjectId: string | null;
  activeProject: ProjectProfile | null;
  selectProject: (projectId: string | null) => void;
  upsertProject: (draft: ProjectDraft, options?: { activate?: boolean }) => ProjectProfile;
  removeProject: (projectId: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
};

const ensureProjectId = (draft: ProjectDraft, projects: ProjectProfile[]): string => {
  const baseId = draft.id?.trim() || slugify(draft.name) || `project-${Date.now().toString(36)}`;

  if (!projects.some(project => project.id === baseId)) {
    return baseId;
  }

  if (draft.id?.trim()) {
    return draft.id.trim();
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (projects.some(project => project.id === candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }
  return candidate;
};

const sanitizeDraft = (draft: ProjectDraft): ProjectDraft => {
  const normalizedProvider = draft.gitProvider?.toLowerCase().trim();
  const gitProvider: GitHostingProvider | undefined =
    normalizedProvider === 'github' || normalizedProvider === 'gitlab'
      ? (normalizedProvider as GitHostingProvider)
      : undefined;

  const mode: OrchestratorExecutionMode =
    draft.orchestratorMode && ['auto', 'cloud', 'local'].includes(draft.orchestratorMode)
      ? draft.orchestratorMode
      : DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.mode;

  const degradation: OrchestratorDegradationPolicy =
    draft.degradationPolicy && ['none', 'on-error'].includes(draft.degradationPolicy)
      ? draft.degradationPolicy
      : DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.degradationPolicy;

  const retryLimit = Number.isFinite(draft.retryLimit)
    ? Math.min(Math.max(Math.round(draft.retryLimit ?? 0), 1), 5)
    : DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.retryLimit;

  const retryDelayMs = Number.isFinite(draft.retryDelayMs)
    ? Math.min(Math.max(Math.round(draft.retryDelayMs ?? 0), 0), 10_000)
    : DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.retryDelayMs;

  return {
    ...draft,
    name: draft.name.trim(),
    repositoryPath: draft.repositoryPath.trim(),
    gitProvider,
    gitOwner: draft.gitOwner?.trim() || undefined,
    gitRepository: draft.gitRepository?.trim() || undefined,
    defaultRemote: draft.defaultRemote?.trim() || undefined,
    defaultBranch: draft.defaultBranch?.trim() || undefined,
    instructions: draft.instructions?.trim() || undefined,
    preferredProvider: draft.preferredProvider?.trim() || undefined,
    preferredModel: draft.preferredModel?.trim() || undefined,
    orchestratorMode: mode,
    fallbackProvider: draft.fallbackProvider?.trim() || undefined,
    fallbackModel: draft.fallbackModel?.trim() || undefined,
    retryLimit,
    retryDelayMs,
    degradationPolicy: degradation,
  };
};

export const ProjectProvider: React.FC<ProjectProviderProps> = ({
  settings,
  onSettingsChange,
  children,
}) => {
  const projects = settings.projectProfiles;
  const activeProjectId = settings.activeProjectId;

  const activeProject = useMemo(() => {
    if (!activeProjectId) {
      return projects.length ? projects[0] : null;
    }
    return projects.find(project => project.id === activeProjectId) ?? projects[0] ?? null;
  }, [projects, activeProjectId]);

  const selectProject = useCallback(
    (projectId: string | null) => {
      onSettingsChange(previous => {
        const nextProjects = previous.projectProfiles;
        if (!projectId) {
          return {
            ...previous,
            activeProjectId: nextProjects.length ? nextProjects[0].id : null,
          };
        }

        const exists = nextProjects.some(project => project.id === projectId);
        return {
          ...previous,
          activeProjectId: exists ? projectId : nextProjects[0]?.id ?? null,
        };
      });
    },
    [onSettingsChange],
  );

  const upsertProject = useCallback<
    (draft: ProjectDraft, options?: { activate?: boolean }) => ProjectProfile
  >(
    (draft, options) => {
      const sanitized = sanitizeDraft(draft);
      if (!sanitized.name || !sanitized.repositoryPath) {
        throw new Error('El proyecto debe incluir nombre y ruta.');
      }

      let createdProfile: ProjectProfile | null = null;

      onSettingsChange(previous => {
        const existingProjects = previous.projectProfiles;
        const id = ensureProjectId(sanitized, existingProjects);

        const orchestrator: ProjectOrchestratorPreferences = {
          ...DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES,
          mode: sanitized.orchestratorMode ?? DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.mode,
          primaryProvider: sanitized.preferredProvider,
          primaryModel: sanitized.preferredModel,
          fallbackProvider: sanitized.fallbackProvider,
          fallbackModel: sanitized.fallbackModel,
          retryLimit: sanitized.retryLimit ?? DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.retryLimit,
          retryDelayMs: sanitized.retryDelayMs ?? DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.retryDelayMs,
          degradationPolicy:
            sanitized.degradationPolicy ?? DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES.degradationPolicy,
        };

        createdProfile = {
          id,
          name: sanitized.name,
          repositoryPath: sanitized.repositoryPath,
          gitProvider: sanitized.gitProvider,
          gitOwner: sanitized.gitOwner,
          gitRepository: sanitized.gitRepository,
          defaultRemote: sanitized.defaultRemote,
          defaultBranch: sanitized.defaultBranch,
          instructions: sanitized.instructions,
          preferredProvider: orchestrator.primaryProvider,
          preferredModel: orchestrator.primaryModel,
          orchestrator,
        };

        const projectIndex = existingProjects.findIndex(project => project.id === id);
        const nextProjects = [...existingProjects];

        if (projectIndex >= 0) {
          nextProjects[projectIndex] = createdProfile;
        } else {
          nextProjects.push(createdProfile);
        }

        nextProjects.sort((a, b) => a.name.localeCompare(b.name, 'es'));

        const shouldActivate = options?.activate ?? projectIndex < 0;
        const currentActiveId = previous.activeProjectId;
        const stillValid = currentActiveId && nextProjects.some(project => project.id === currentActiveId);

        return {
          ...previous,
          projectProfiles: nextProjects,
          activeProjectId: shouldActivate
            ? createdProfile.id
            : stillValid
            ? currentActiveId
            : nextProjects[0]?.id ?? null,
        };
      });

      if (!createdProfile) {
        throw new Error('No se pudo actualizar el proyecto.');
      }

      return createdProfile;
    },
    [onSettingsChange],
  );

  const removeProject = useCallback(
    (projectId: string) => {
      onSettingsChange(previous => {
        const remaining = previous.projectProfiles.filter(project => project.id !== projectId);
        const nextActive =
          previous.activeProjectId && previous.activeProjectId !== projectId
            ? previous.activeProjectId
            : remaining[0]?.id ?? null;

        return {
          ...previous,
          projectProfiles: remaining,
          activeProjectId: nextActive,
        };
      });
    },
    [onSettingsChange],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProjectId: activeProject?.id ?? null,
      activeProject,
      selectProject,
      upsertProject,
      removeProject,
    }),
    [projects, activeProject, selectProject, upsertProject, removeProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProjects = (): ProjectContextValue => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects debe utilizarse dentro de un ProjectProvider');
  }
  return context;
};
