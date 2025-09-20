import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open as openDialog } from '@tauri-apps/api/dialog';
import { join } from '@tauri-apps/api/path';
import {
  CodexEngine,
  CodexPlan,
  CodexPlanExecution,
  CodexReview,
  RepoWorkflowRequest,
  useRepoWorkflow,
} from '../../core/codex';
import { useProjects } from '../../core/projects/ProjectContext';
import { isTauriEnvironment } from '../../core/storage/userDataPathsClient';
import { ProjectBindingPanel } from './ProjectBindingPanel';
import { useGithubRepos } from '../../hooks/useGithubRepos';
import type { GithubRepoSummary } from '../../hooks/useGithubRepos';
import './RepoStudio.css';

type RepoEntryKind = 'file' | 'directory';

interface RepoEntryStatus {
  index?: string | null;
  workdir?: string | null;
  is_conflicted: boolean;
}

interface RepoEntry {
  path: string;
  kind: RepoEntryKind;
  status?: RepoEntryStatus;
}

interface RepoStatus {
  entries: RepoEntry[];
}

interface CommitResult {
  message: string;
  id?: string;
}

interface RepoContextSummary {
  branch?: string | null;
  last_commit?: {
    id: string;
    message?: string | null;
    author?: string | null;
    time?: number | null;
  } | null;
  remote?: {
    name: string;
    url?: string | null;
    branch?: string | null;
  } | null;
}

const parseGithubRemote = (
  url: string,
): { owner?: string; name?: string; webUrl?: string } => {
  const normalized = url.replace(/\.git$/i, '');
  const sshMatch = normalized.match(/github\.com[:/](.+)$/i);
  if (!sshMatch || !sshMatch[1]) {
    return {};
  }
  const [owner, name] = sshMatch[1].split('/');
  if (!owner || !name) {
    return {};
  }
  return {
    owner,
    name,
    webUrl: `https://github.com/${owner}/${name}`,
  };
};

const engine = new CodexEngine({ defaultDryRun: true });

const ensurePlanApproval = (plan: CodexPlan | null, approvals: CodexReview[]): CodexPlanExecution | null => {
  if (!plan) {
    return null;
  }
  return engine.summarizeExecution(plan, approvals);
};

export const RepoStudio: React.FC = () => {
  const [repoPath, setRepoPath] = useState<string>('.');
  const [entries, setEntries] = useState<RepoEntry[]>([]);
  const [statusEntries, setStatusEntries] = useState<RepoEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<RepoEntry | null>(null);
  const [diffPreview, setDiffPreview] = useState<string>('');
  const [analysisPrompt, setAnalysisPrompt] = useState<string>('');
  const [plan, setPlan] = useState<CodexPlan | null>(null);
  const [reviews, setReviews] = useState<CodexReview[]>([]);
  const [execution, setExecution] = useState<CodexPlanExecution | null>(null);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [remoteName, setRemoteName] = useState<string>('origin');
  const [remoteBranch, setRemoteBranch] = useState<string>('');
  const [prOwner, setPrOwner] = useState<string>('');
  const [prRepository, setPrRepository] = useState<string>('');
  const [prTitle, setPrTitle] = useState<string>('');
  const [prBody, setPrBody] = useState<string>('');
  const [prProvider, setPrProvider] = useState<'github' | 'gitlab'>('github');
  const [prBase, setPrBase] = useState<string>('main');
  const [prHead, setPrHead] = useState<string>('');
  const [prDraft, setPrDraft] = useState<boolean>(true);
  const [pushProvider, setPushProvider] = useState<'github' | 'gitlab'>('github');
  const [messages, setMessages] = useState<CommitResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [patchContent, setPatchContent] = useState<string>('');
  const [patchDryRun, setPatchDryRun] = useState<boolean>(true);
  const [repoContext, setRepoContext] = useState<RepoContextSummary | null>(null);
  const [isContextLoading, setIsContextLoading] = useState<boolean>(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);
  const { pendingRequest, clearPendingRequest } = useRepoWorkflow();
  const [activeWorkflow, setActiveWorkflow] = useState<RepoWorkflowRequest | null>(null);
  const [autoPrEnabled, setAutoPrEnabled] = useState<boolean>(false);
  const [autoPrTriggered, setAutoPrTriggered] = useState<boolean>(false);
  const { activeProject, upsertProject, selectProject } = useProjects();
  const isDesktop = useMemo(() => isTauriEnvironment(), []);
  const {
    repos: remoteRepos,
    isLoading: isRemoteLoading,
    error: remoteError,
    ownerFilter,
    setOwnerFilter,
    refresh: refreshRemoteRepos,
    isSupported: remoteSupported,
  } = useGithubRepos(activeProject?.gitOwner);
  const lastProjectIdRef = useRef<string | null>(null);

  const planReady = execution?.readyToExecute ?? false;

  const updateExecution = useCallback((currentPlan: CodexPlan | null, currentReviews: CodexReview[]) => {
    setExecution(ensurePlanApproval(currentPlan, currentReviews));
  }, []);

  const remoteInfo = useMemo(() => {
    const remoteUrl = repoContext?.remote?.url;
    if (remoteUrl) {
      return parseGithubRemote(remoteUrl);
    }
    if (prOwner && prRepository) {
      return {
        owner: prOwner,
        name: prRepository,
        webUrl: `https://github.com/${prOwner}/${prRepository}`,
      };
    }
    return {};
  }, [repoContext?.remote?.url, prOwner, prRepository]);

  const lastCommitTimeLabel = useMemo(() => {
    const timestamp = repoContext?.last_commit?.time;
    if (!timestamp) {
      return null;
    }
    try {
      return new Date(timestamp * 1000).toLocaleString();
    } catch {
      return null;
    }
  }, [repoContext?.last_commit?.time]);

  useEffect(() => {
    const nextProjectId = activeProject?.id ?? null;
    if (lastProjectIdRef.current === nextProjectId) {
      return;
    }

    lastProjectIdRef.current = nextProjectId;

    if (!activeProject) {
      setRepoPath('.');
      setRemoteName('origin');
      setRemoteBranch('');
      setPrOwner('');
      setPrRepository('');
      setPrProvider('github');
      setPushProvider('github');
      return;
    }

    setRepoPath(activeProject.repositoryPath);
    setRemoteName(activeProject.defaultRemote || 'origin');
    setRemoteBranch(activeProject.defaultBranch || '');
    setPrOwner(activeProject.gitOwner ?? '');
    setPrRepository(activeProject.gitRepository ?? '');
    const provider = activeProject.gitProvider === 'gitlab' ? 'gitlab' : 'github';
    setPrProvider(provider);
    setPushProvider(provider);
    if (remoteSupported) {
      void refreshRemoteRepos({ owner: activeProject.gitOwner ?? undefined });
    }
  }, [activeProject]);

  useEffect(() => {
    if (!remoteSupported) {
      return;
    }
    if (!activeProject?.gitOwner) {
      return;
    }
    void refreshRemoteRepos({ owner: activeProject.gitOwner });
  }, [activeProject?.gitOwner, refreshRemoteRepos, remoteSupported]);

  useEffect(() => {
    if (!pendingRequest) {
      return;
    }

    setActiveWorkflow(pendingRequest);
    setRepoPath(pendingRequest.request.context.repositoryPath);
    setAnalysisPrompt(pendingRequest.analysisPrompt);
    setPlan(pendingRequest.plan);
    setCommitMessage(pendingRequest.commitMessage);
    setPrTitle(pendingRequest.prTitle);
    setPrBody(pendingRequest.prBody);
    setReviews([]);
    updateExecution(pendingRequest.plan, []);
    setMessages(prev => [
      { message: `Solicitud recibida desde el chat: ${pendingRequest.plan.summary}` },
      ...prev,
    ]);
    setAutoPrTriggered(false);
    clearPendingRequest();
  }, [pendingRequest, clearPendingRequest, updateExecution]);

  const fetchEntries = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await invoke<RepoEntry[]>('git_list_repository_files', {
        repoPath,
      });
      setEntries(result);
      void refreshContext();
    } catch (err) {
      setError((err as Error).message ?? 'No se pudieron listar los archivos');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStatus = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await invoke<RepoStatus>('git_repository_status', { repoPath });
      setStatusEntries(result.entries);
      void refreshContext();
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo obtener el estado del repositorio');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshContext = useCallback(async () => {
    if (!repoPath) {
      return;
    }
    setIsContextLoading(true);
    setContextError(null);
    try {
      const context = await invoke<RepoContextSummary>('git_get_repository_context', { repoPath });
      setRepoContext(context);
    } catch (err) {
      setContextError(
        (err as Error).message ?? 'No se pudo obtener el contexto del repositorio.',
      );
      setRepoContext(null);
    } finally {
      setIsContextLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  const previewDiff = async (entry: RepoEntry) => {
    if (entry.kind !== 'file') {
      setSelectedEntry(entry);
      setDiffPreview('Selecciona un archivo para ver su diff');
      return;
    }

    try {
      const diff = await invoke<string>('git_get_file_diff', {
        repoPath,
        pathspec: entry.path,
      });
      setSelectedEntry(entry);
      setDiffPreview(diff || 'No hay diferencias registradas para este archivo.');
    } catch (err) {
      setDiffPreview(`No se pudo generar el diff: ${(err as Error).message}`);
      setSelectedEntry(entry);
    }
  };

  const analyzePrompt = () => {
    if (!analysisPrompt.trim()) {
      setError('Escribe una solicitud para generar un plan.');
      return;
    }
    const newPlan = engine.createPlan({
      prompt: analysisPrompt,
      context: {
        repositoryPath: repoPath,
        branch: remoteBranch || undefined,
        riskLevel: 'medium',
      },
      preferDryRun: true,
    });
    setPlan(newPlan);
    setCommitMessage(`chore: ${newPlan.intent}`);
    setPrTitle(newPlan.intent);
    setPrBody(`${newPlan.summary}\n\n- Pasos:\n${newPlan.steps.map(step => `  - ${step.description}`).join('\n')}`);
    setReviews([]);
    updateExecution(newPlan, []);
  };

  const toggleStepApproval = (stepId: string, approved: boolean) => {
    if (!plan) {
      return;
    }
    const nextPlan = engine.withApproval(plan, stepId, approved);
    setPlan(nextPlan);
    updateExecution(nextPlan, reviews);
  };

  const toggleDryRun = (dryRun: boolean) => {
    if (!plan) {
      return;
    }
    const nextPlan = engine.toggleDryRun(plan, dryRun);
    setPlan(nextPlan);
    updateExecution(nextPlan, reviews);
  };

  const registerApproval = (approved: boolean) => {
    if (!plan) {
      return;
    }
    const review: CodexReview = {
      approved,
      reviewer: 'Repo Studio',
      reviewedAt: new Date().toISOString(),
      notes: approved ? 'Aprobado manualmente desde Repo Studio.' : 'Plan rechazado.',
    };
    const nextReviews = [review];
    setReviews(nextReviews);
    updateExecution(plan, nextReviews);
  };

  const stageTargetsFromPlan = useMemo(() => {
    if (!plan) {
      return [] as string[];
    }
    return plan.steps
      .filter(step => step.targetPath && step.requiresApproval && step.approved)
      .map(step => step.targetPath!)
      .filter((value, index, array) => array.indexOf(value) === index);
  }, [plan]);

  const runCommit = async () => {
    if (!plan) {
      setError('Genera un plan antes de commitear.');
      return;
    }

    if (!execution?.readyToExecute) {
      setError('Aprueba el plan y los pasos necesarios antes de crear el commit.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const commitId = await invoke<string>('git_commit_changes', {
        payload: {
          repoPath,
          message: commitMessage,
          files: stageTargetsFromPlan.length > 0 ? stageTargetsFromPlan : undefined,
        },
      });
      setMessages(prev => [{ message: `Commit ${commitId} creado correctamente.`, id: commitId }, ...prev]);
      await refreshContext();
    } catch (err) {
      setError((err as Error).message ?? 'Error al crear el commit');
    } finally {
      setIsLoading(false);
    }
  };

  const runPush = async () => {
    if (!execution?.readyToExecute) {
      setError('Confirma el plan antes de enviar los cambios al remoto.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await invoke('git_push_changes', {
        payload: {
          repoPath,
          remote: remoteName || undefined,
          branch: remoteBranch || undefined,
          provider: pushProvider,
        },
      });
      setMessages(prev => [{ message: `Push enviado a ${remoteName}/${remoteBranch || '(por defecto)'}` }, ...prev]);
      await refreshContext();
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo enviar el push');
    } finally {
      setIsLoading(false);
    }
  };

  const runPull = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await invoke<string>('git_pull_changes', {
        repoPath,
        remote: repoContext?.remote?.name || remoteName || undefined,
        branch: repoContext?.remote?.branch || repoContext?.branch || remoteBranch || undefined,
      });
      const label = result?.trim() ? result.trim() : 'Pull ejecutado correctamente.';
      setMessages(prev => [{ message: label }, ...prev]);
      await fetchStatus();
      await refreshContext();
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo ejecutar git pull');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkRemote = useCallback(
    async (repo: GithubRepoSummary) => {
      if (!isDesktop) {
        setError('La vinculación remota solo está disponible en la aplicación de escritorio.');
        return;
      }

      const cloneUrl = repo.clone_url ?? repo.ssh_url;
      if (!cloneUrl) {
        setError('El repositorio remoto no expone una URL clonable.');
        return;
      }

      try {
        const selection = await openDialog({ directory: true, multiple: false });
        if (typeof selection !== 'string') {
          return;
        }
        const targetDir = await join(selection, repo.name);
        setIsLoading(true);
        setError(null);
        setCloneMessage(null);

        await invoke('git_clone_repository', {
          payload: {
            url: cloneUrl,
            directory: targetDir,
            provider: 'github',
            reference: repo.default_branch ?? undefined,
          },
        });

        const project = upsertProject(
          {
            name: repo.name,
            repositoryPath: targetDir,
            gitProvider: 'github',
            gitOwner: repo.owner,
            gitRepository: repo.name,
            defaultRemote: 'origin',
            defaultBranch: repo.default_branch ?? '',
          },
          { activate: true },
        );

        selectProject(project.id);
        setRepoPath(project.repositoryPath);
        setRemoteName(project.defaultRemote || 'origin');
        setRemoteBranch(project.defaultBranch || '');
        setPrOwner(project.gitOwner ?? repo.owner);
        setPrRepository(project.gitRepository ?? repo.name);
        setPrProvider('github');
        setPushProvider('github');
        setCloneMessage(`Repositorio ${repo.full_name} clonado en ${targetDir}`);
        setOwnerFilter(repo.owner);
        await refreshContext();
        void refreshRemoteRepos({ owner: repo.owner });
      } catch (err) {
        setError((err as Error).message ?? 'No se pudo vincular el repositorio remoto');
      } finally {
        setIsLoading(false);
      }
    },
    [
      isDesktop,
      refreshContext,
      refreshRemoteRepos,
      selectProject,
      setOwnerFilter,
      upsertProject,
    ],
  );

  const runPullRequest = async () => {
    if (!prTitle.trim() || !prHead.trim() || !prOwner.trim() || !prRepository.trim()) {
      setError('Completa título, ramas y coordenadas del repositorio antes de crear el PR/MR.');
      return;
    }

    if (!execution?.readyToExecute) {
      setError('Confirma el plan antes de abrir el PR/MR.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const response = await invoke<{ url: string; number?: number }>('git_create_pull_request', {
        payload: {
          provider: prProvider,
          owner: prOwner,
          repository: prRepository,
          title: prTitle,
          body: prBody,
          head: prHead,
          base: prBase,
          draft: prDraft,
        },
      });
      setMessages(prev => [{ message: `PR/MR creado: ${response.url}` }, ...prev]);
      await refreshContext();
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo crear el PR/MR');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!autoPrEnabled || autoPrTriggered || !execution?.readyToExecute || !activeWorkflow) {
      return;
    }

    if (!prOwner.trim() || !prRepository.trim() || !prHead.trim()) {
      setError('Configura propietario, repositorio y rama origen antes de ejecutar el auto-PR.');
      setAutoPrEnabled(false);
      return;
    }

    const runAutoPullRequest = async () => {
      setIsLoading(true);
      try {
        const response = await invoke<{ url: string; number?: number }>('git_create_pull_request', {
          payload: {
            provider: prProvider,
            owner: prOwner,
            repository: prRepository,
            title: activeWorkflow.prTitle || prTitle || activeWorkflow.plan.intent,
            body: activeWorkflow.prBody,
            head: prHead,
            base: prBase,
            draft: prDraft,
          },
        });
        setMessages(prev => [{ message: `Auto PR/MR creado: ${response.url}` }, ...prev]);
        await refreshContext();
      } catch (err) {
        setError((err as Error).message ?? 'No se pudo crear el PR/MR automáticamente');
      } finally {
        setIsLoading(false);
        setAutoPrTriggered(true);
        setAutoPrEnabled(false);
      }
    };

    void runAutoPullRequest();
  }, [
    activeWorkflow,
    autoPrEnabled,
    autoPrTriggered,
    execution,
    prBase,
    prDraft,
    prHead,
    prOwner,
    prProvider,
    prRepository,
    prTitle,
  ]);

  const runPatch = async () => {
    if (!patchContent.trim()) {
      setError('Proporciona un parche unified diff antes de continuar.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await invoke('git_apply_patch', {
        repoPath,
        patch: patchContent,
        dryRun: patchDryRun,
      });
      const label = patchDryRun ? 'Dry-run verificado para el parche.' : 'Parche aplicado correctamente.';
      setMessages(prev => [{ message: label }, ...prev]);
      if (!patchDryRun) {
        await fetchStatus();
        await refreshContext();
      }
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo aplicar el parche');
    } finally {
      setIsLoading(false);
    }
  };

  const repositoryUrl = remoteInfo.webUrl;
  const contextBranch = repoContext?.branch || remoteBranch;
  const remoteBranchLabel = repoContext?.remote?.branch || prBase;
  const remoteDisplayName = repoContext?.remote?.name || remoteName;

  const handleOpenRepository = useCallback(() => {
    if (!repositoryUrl) {
      return;
    }
    window.open(repositoryUrl, '_blank', 'noopener,noreferrer');
  }, [repositoryUrl]);

  const handleQuickPr = useCallback(() => {
    const owner = prOwner || remoteInfo.owner;
    const repoName = prRepository || remoteInfo.name;
    if (!owner || !repoName) {
      setError('Completa propietario y repositorio antes de lanzar el PR rápido.');
      return;
    }
    if (!execution?.readyToExecute) {
      setError('Confirma el plan antes de crear el PR.');
      return;
    }

    if (contextBranch) {
      setPrHead(contextBranch);
    }
    if (remoteBranchLabel) {
      setPrBase(remoteBranchLabel);
    }
    setPrOwner(owner);
    setPrRepository(repoName);
    setTimeout(() => {
      void runPullRequest();
    }, 0);
  }, [
    contextBranch,
    execution?.readyToExecute,
    remoteBranchLabel,
    remoteInfo.owner,
    remoteInfo.name,
    runPullRequest,
    prOwner,
    prRepository,
  ]);

  return (
    <div className="repo-studio">
      <header className="repo-studio__header">
        <div>
          <h1>Repo Studio</h1>
          <p>Explora, valida y sincroniza cambios de tu repositorio de manera segura.</p>
        </div>
        <div className="repo-studio__actions">
          <button type="button" onClick={fetchEntries} disabled={isLoading}>
            Listar archivos
          </button>
          <button type="button" onClick={fetchStatus} disabled={isLoading}>
            Git status
          </button>
          <button type="button" onClick={() => void refreshContext()} disabled={isContextLoading}>
            Actualizar contexto
          </button>
        </div>
      </header>

      <section className="repo-studio__management">
        <div className="repo-studio__management-panel">
          <ProjectBindingPanel />
        </div>
        <div className="repo-studio__management-columns">
          <div className="repo-studio__workspace-card">
            <h2>Repositorio activo</h2>
            <div className="repo-studio__workspace-grid">
              <label>
                <span>Ruta local</span>
                <input
                  value={repoPath}
                  onChange={event => setRepoPath(event.target.value)}
                  placeholder="/ruta/al/repositorio"
                />
              </label>
              <label>
                <span>Rama de trabajo</span>
                <input
                  value={remoteBranch}
                  onChange={event => setRemoteBranch(event.target.value)}
                  placeholder="main"
                />
              </label>
              <label>
                <span>Remoto preferido</span>
                <input
                  value={remoteName}
                  onChange={event => setRemoteName(event.target.value)}
                  placeholder="origin"
                />
              </label>
              <label>
                <span>Propietario Git</span>
                <input
                  value={prOwner}
                  onChange={event => setPrOwner(event.target.value)}
                  placeholder="org o usuario"
                />
              </label>
              <label>
                <span>Repositorio remoto</span>
                <input
                  value={prRepository}
                  onChange={event => setPrRepository(event.target.value)}
                  placeholder="nombre-del-repo"
                />
              </label>
            </div>
          </div>

          <div className="repo-studio__context-card">
            <header>
              <h3>Contexto del repositorio</h3>
              <span className="repo-studio__context-branch">{contextBranch || 'Rama desconocida'}</span>
            </header>
            {isContextLoading ? (
              <p className="repo-studio__context-loading">Actualizando contexto…</p>
            ) : null}
            <ul className="repo-studio__context-list">
              <li>
                <strong>Remoto activo:</strong> {remoteDisplayName || 'Sin remoto configurado'}
              </li>
              <li>
                <strong>Destino remoto:</strong>{' '}
                {remoteInfo.owner && remoteInfo.name ? `${remoteInfo.owner}/${remoteInfo.name}` : 'Sin coordenadas'}
              </li>
              <li>
                <strong>Último commit:</strong>{' '}
                {repoContext?.last_commit?.message || 'Sin commits recientes'}
              </li>
              {repoContext?.last_commit?.author ? (
                <li>
                  <strong>Autor:</strong> {repoContext.last_commit.author}
                </li>
              ) : null}
            </ul>
            {lastCommitTimeLabel ? (
              <p className="repo-studio__context-meta">Actualizado {lastCommitTimeLabel}</p>
            ) : null}
            {contextError ? <p className="repo-studio__error">{contextError}</p> : null}
            <div className="repo-studio__context-actions">
              <button type="button" onClick={runPull} disabled={isLoading}>
                Git pull
              </button>
              <button type="button" onClick={handleOpenRepository} disabled={!repositoryUrl}>
                Abrir en GitHub
              </button>
              <button type="button" onClick={handleQuickPr} disabled={isLoading || !execution?.readyToExecute}>
                PR con rama actual
              </button>
            </div>
            <div className="repo-studio__diff-panel">
              <h4>Diff seleccionado</h4>
              <pre>{diffPreview || 'Selecciona un archivo para previsualizar el diff.'}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="repo-studio__body">
        <div className="repo-studio__column">
          <h2>Archivos</h2>
          <ul className="repo-studio__list">
            {entries.map(entry => (
              <li key={entry.path}>
                <button type="button" onClick={() => void previewDiff(entry)} className={selectedEntry?.path === entry.path ? 'is-active' : ''}>
                  <span className={`repo-entry repo-entry--${entry.kind}`}>
                    {entry.kind === 'directory' ? '📁' : '📄'} {entry.path}
                  </span>
                  {entry.status ? (
                    <span className="repo-entry__status">
                      {entry.status.workdir ? <span>WT:{entry.status.workdir}</span> : null}
                      {entry.status.index ? <span>IDX:{entry.status.index}</span> : null}
                      {entry.status.is_conflicted ? <span className="warning">Conflicto</span> : null}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="repo-studio__column">
          <h2>Estado</h2>
          <ul className="repo-studio__list">
            {statusEntries.map(entry => (
              <li key={`status-${entry.path}`}>
                <span className="repo-entry repo-entry--status">
                  {entry.path}
                  {entry.status ? (
                    <span className="repo-entry__status">
                      {entry.status.workdir ? <span>WT:{entry.status.workdir}</span> : null}
                      {entry.status.index ? <span>IDX:{entry.status.index}</span> : null}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="repo-studio__analysis">
        <div className="repo-studio__analysis-inputs">
          <textarea
            value={analysisPrompt}
            onChange={event => setAnalysisPrompt(event.target.value)}
            placeholder="Describe qué cambios necesitas (usa `rutas/relativas` para guiar al motor)."
          />
          <div className="repo-studio__analysis-actions">
            <button type="button" onClick={analyzePrompt} disabled={!analysisPrompt.trim()}>
              Generar plan
            </button>
            {plan ? (
              <label>
                <input
                  type="checkbox"
                  checked={plan.safeguards.dryRun}
                  onChange={event => toggleDryRun(event.target.checked)}
                />
                Dry-run activo
              </label>
            ) : null}
            {plan?.safeguards.manualApproval ? (
              <button type="button" onClick={() => registerApproval(true)} disabled={planReady}>
                Aprobar plan
              </button>
            ) : null}
          </div>
        </div>

        {plan ? (
          <div className="repo-studio__plan">
            <header>
              <h3>{plan.summary}</h3>
              <span className={`badge ${planReady ? 'badge--ready' : 'badge--pending'}`}>
                {planReady ? 'Listo para ejecutar' : 'Pendiente de aprobación'}
              </span>
            </header>
            <ul>
              {plan.steps.map(step => (
                <li key={step.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(step.approved)}
                      disabled={!step.requiresApproval}
                      onChange={event => toggleStepApproval(step.id, event.target.checked)}
                    />
                    <span>
                      <strong>{step.action.toUpperCase()}</strong> – {step.description}
                      {step.targetPath ? <em> ({step.targetPath})</em> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <footer>
              <h4>Salvaguardas</h4>
              <ul>
                {plan.safeguards.notes.map(note => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </footer>
          </div>
        ) : null}
      </section>

      <section className="repo-studio__remotes">
        <header>
          <div>
            <h3>Repositorios remotos vinculables</h3>
            <p>Usa tu token almacenado para descubrir proyectos y clonarlos rápidamente.</p>
          </div>
          <div className="repo-studio__remote-controls">
            <input
              value={ownerFilter}
              onChange={event => setOwnerFilter(event.target.value)}
              placeholder="Filtrar por owner"
            />
            <button
              type="button"
              onClick={() => void refreshRemoteRepos({ owner: ownerFilter })}
              disabled={isRemoteLoading}
            >
              Actualizar listado
            </button>
          </div>
        </header>

        {!remoteSupported ? (
          <p className="repo-studio__error">
            El descubrimiento remoto solo está disponible en la aplicación de escritorio.
          </p>
        ) : null}

        {remoteError ? <p className="repo-studio__error">{remoteError}</p> : null}
        {cloneMessage ? <p className="repo-studio__success">{cloneMessage}</p> : null}

        <ul className="repo-studio__remote-list">
          {isRemoteLoading ? (
            <li className="repo-studio__remote-item">Cargando repositorios…</li>
          ) : remoteRepos.length ? (
            remoteRepos.map(repo => (
              <li key={repo.id} className="repo-studio__remote-item">
                <div className="repo-studio__remote-header">
                  <span className="repo-studio__remote-name">{repo.full_name}</span>
                  <span className="repo-studio__remote-visibility">
                    {repo.visibility ?? (repo.private ? 'Privado' : 'Público')}
                  </span>
                </div>
                {repo.description ? <p className="repo-studio__remote-description">{repo.description}</p> : null}
                <p className="repo-studio__remote-meta">
                  <strong>Branch por defecto:</strong> {repo.default_branch ?? 'main'}
                </p>
                <div className="repo-studio__remote-actions">
                  <button type="button" onClick={() => void handleLinkRemote(repo)} disabled={isLoading}>
                    Vincular en local
                  </button>
                  {repo.html_url ? (
                    <button
                      type="button"
                      onClick={() => window.open(repo.html_url as string, '_blank', 'noopener')}
                    >
                      Ver en GitHub
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          ) : (
            <li className="repo-studio__remote-item">No se encontraron repositorios disponibles.</li>
          )}
        </ul>
      </section>

      <section className="repo-studio__operations">
        <div className="repo-studio__card">
          <h3>Aplicar parche</h3>
          <textarea
            value={patchContent}
            onChange={event => setPatchContent(event.target.value)}
            placeholder={'diff --git a/archivo b/archivo\n...'}
          />
          <label className="inline">
            <input type="checkbox" checked={patchDryRun} onChange={event => setPatchDryRun(event.target.checked)} />
            Dry-run primero
          </label>
          <button type="button" onClick={runPatch} disabled={isLoading || !patchContent.trim()}>
            {patchDryRun ? 'Validar parche' : 'Aplicar parche'}
          </button>
        </div>

        <div className="repo-studio__card">
          <h3>Commit</h3>
          <input
            value={commitMessage}
            onChange={event => setCommitMessage(event.target.value)}
            placeholder="Mensaje del commit"
          />
          <button type="button" onClick={runCommit} disabled={isLoading || !commitMessage.trim()}>
            Crear commit
          </button>
          {stageTargetsFromPlan.length > 0 ? (
            <p className="hint">
              Se limitará el commit a: {stageTargetsFromPlan.join(', ')}
            </p>
          ) : null}
        </div>

        <div className="repo-studio__card">
          <h3>Push</h3>
          <label>
            Proveedor
            <select value={pushProvider} onChange={event => setPushProvider(event.target.value as 'github' | 'gitlab')}>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
          </label>
          <label>
            Remoto
            <input value={remoteName} onChange={event => setRemoteName(event.target.value)} />
          </label>
          <label>
            Rama
            <input value={remoteBranch} onChange={event => setRemoteBranch(event.target.value)} />
          </label>
          <button type="button" onClick={runPush} disabled={isLoading}>
            Push seguro
          </button>
        </div>

        <div className="repo-studio__card">
          <h3>Pull/Merge Request</h3>
          <label>
            Proveedor
            <select value={prProvider} onChange={event => setPrProvider(event.target.value as 'github' | 'gitlab')}>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
            </select>
          </label>
          <label>
            Organización/usuario
            <input value={prOwner} onChange={event => setPrOwner(event.target.value)} placeholder="org" />
          </label>
          <label>
            Repositorio
            <input value={prRepository} onChange={event => setPrRepository(event.target.value)} placeholder="repo" />
          </label>
          <label>
            Título
            <input value={prTitle} onChange={event => setPrTitle(event.target.value)} />
          </label>
          <label>
            Cuerpo
            <textarea value={prBody} onChange={event => setPrBody(event.target.value)} />
          </label>
          <label>
            Rama base
            <input value={prBase} onChange={event => setPrBase(event.target.value)} />
          </label>
          <label>
            Rama origen
            <input value={prHead} onChange={event => setPrHead(event.target.value)} placeholder="feature/rama" />
          </label>
          <label className="inline">
            <input type="checkbox" checked={prDraft} onChange={event => setPrDraft(event.target.checked)} />
            PR como borrador
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={autoPrEnabled}
              onChange={event => setAutoPrEnabled(event.target.checked)}
              disabled={!activeWorkflow}
            />
            Auto-PR al aprobar
          </label>
          <button type="button" onClick={runPullRequest} disabled={isLoading || !prTitle.trim() || !prHead.trim()}>
            Crear PR/MR
          </button>
        </div>
      </section>

      {error ? <div className="repo-studio__error">{error}</div> : null}

      {messages.length > 0 ? (
        <section className="repo-studio__log">
          <h3>Historial reciente</h3>
          <ul>
            {messages.map((message, index) => (
              <li key={`${message.id ?? index}-${index}`}>{message.message}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
