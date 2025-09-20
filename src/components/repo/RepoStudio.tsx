import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { CodexEngine, CodexPlan, CodexPlanExecution, CodexReview } from '../../core/codex';
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

  const planReady = execution?.readyToExecute ?? false;

  const updateExecution = (currentPlan: CodexPlan | null, currentReviews: CodexReview[]) => {
    setExecution(ensurePlanApproval(currentPlan, currentReviews));
  };

  const fetchEntries = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await invoke<RepoEntry[]>('git_list_repository_files', {
        repoPath,
      });
      setEntries(result);
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
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo obtener el estado del repositorio');
    } finally {
      setIsLoading(false);
    }
  };

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
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo enviar el push');
    } finally {
      setIsLoading(false);
    }
  };

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
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo crear el PR/MR');
    } finally {
      setIsLoading(false);
    }
  };

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
      }
    } catch (err) {
      setError((err as Error).message ?? 'No se pudo aplicar el parche');
    } finally {
      setIsLoading(false);
    }
  };

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
        </div>
      </header>

      <section className="repo-studio__controls">
        <label>
          Ruta del repositorio
          <input value={repoPath} onChange={event => setRepoPath(event.target.value)} placeholder="/ruta/al/repositorio" />
        </label>
        <label>
          Rama activa
          <input value={remoteBranch} onChange={event => setRemoteBranch(event.target.value)} placeholder="main" />
        </label>
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
          <h2>Diff seleccionado</h2>
          <pre className="repo-studio__diff">{diffPreview || 'Selecciona un archivo para previsualizar el diff.'}</pre>
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
