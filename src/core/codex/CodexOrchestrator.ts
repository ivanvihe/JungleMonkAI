import { CodexEngine } from './CodexEngine';
import type {
  CodexAnalysisArtifacts,
  CodexAnalysisResult,
  CodexOrchestratorTrace,
  CodexPlan,
  CodexPlanStep,
  CodexPlanWithAnalysis,
  CodexProviderMetadata,
  CodexRepositoryDiff,
  CodexRepositorySnapshot,
  CodexRepositoryStatusEntry,
  CodexRepositorySummary,
  CodexRequest,
  CodexSuggestedPatch,
  CodexCommitSuggestion,
  CodexPullRequestSummary,
  CodexPlanStepWithProvider,
  CodexSafeguards,
} from './types';
import { fetchAgentReply, AGENT_SYSTEM_PROMPT } from '../agents/providerRouter';
import type { AgentDefinition } from '../agents/agentRegistry';
import type { ApiKeySettings } from '../../types/globalSettings';
import { gitInvoke, isGitBackendUnavailableError } from '../../utils/runtimeBridge';
import type { JarvisChatRequest, JarvisChatResult } from '../../services/jarvisCoreClient';
import type { ChatProviderResponse } from '../../utils/aiProviders';

interface GitRepositoryStatusResponse {
  entries?: Array<{
    path?: string;
    status?: {
      index?: string | null;
      workdir?: string | null;
      is_conflicted?: boolean;
    };
  }>;
}

interface GitRepositoryContextResponse {
  branch?: string | null;
  last_commit?: CodexRepositorySummary['lastCommit'];
  remote?: CodexRepositorySummary['remote'];
}

interface GitInvoker {
  <T>(command: Parameters<typeof gitInvoke>[0], payload?: Parameters<typeof gitInvoke>[1]): Promise<T>;
}

interface FetchAgentReplyFn {
  (args: Parameters<typeof fetchAgentReply>[0]): ReturnType<typeof fetchAgentReply>;
}

interface JarvisInvoker {
  (payload: JarvisChatRequest): Promise<JarvisChatResult>;
}

interface CodexOrchestratorOptions {
  agent: AgentDefinition;
  apiKeys: ApiKeySettings;
  engine?: CodexEngine;
  fetchReplyFn?: FetchAgentReplyFn;
  gitInvoker?: GitInvoker;
  jarvisInvoker?: JarvisInvoker | null;
  projectInstructions?: string | string[];
  retryAttempts?: number;
  retryDelayMs?: number;
  maxDiffs?: number;
  providerTimeoutMs?: number;
  onTrace?: (trace: CodexOrchestratorTrace) => void;
  onError?: (error: Error, stage: string) => void;
}

export interface CodexAnalysisOptions {
  focusPaths?: string[];
  projectInstructions?: string | string[];
  additionalContext?: string;
  maxDiffs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface ProviderCallResult {
  content: string;
  status: 'success' | 'fallback';
  metadata: CodexProviderMetadata;
  rawResponse?: string;
  errorMessage?: string;
  attempts: number;
}

export class CodexOrchestrator {
  private readonly agent: AgentDefinition;
  private readonly apiKeys: ApiKeySettings;
  private readonly engine: CodexEngine;
  private readonly fetchReply: FetchAgentReplyFn;
  private readonly gitInvoker: GitInvoker;
  private readonly jarvisInvoker: JarvisInvoker | null;
  private readonly baseProjectInstructions: string[];
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly maxDiffs: number;
  private readonly providerTimeoutMs: number | null;
  private readonly onTrace?: (trace: CodexOrchestratorTrace) => void;
  private readonly onError?: (error: Error, stage: string) => void;

  constructor(options: CodexOrchestratorOptions) {
    this.agent = options.agent;
    this.apiKeys = options.apiKeys;
    this.engine = options.engine ?? new CodexEngine({ defaultDryRun: true });
    this.fetchReply = options.fetchReplyFn ?? fetchAgentReply;
    this.gitInvoker = options.gitInvoker ?? gitInvoke;
    this.jarvisInvoker = options.jarvisInvoker ?? null;
    this.baseProjectInstructions = this.normalizeInstructions(options.projectInstructions);
    this.retryAttempts = Math.max(1, options.retryAttempts ?? 2);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 500);
    this.maxDiffs = Math.max(0, options.maxDiffs ?? 5);
    this.providerTimeoutMs = options.providerTimeoutMs ?? null;
    this.onTrace = options.onTrace;
    this.onError = options.onError;
  }

  async analyze(request: CodexRequest, options?: CodexAnalysisOptions): Promise<CodexAnalysisResult> {
    const fallbackPlan = this.engine.createPlan(request);
    const errors: string[] = [];

    const repositoryOutcome = await this.collectRepositorySnapshot(
      request.context.repositoryPath,
      fallbackPlan,
      options,
    );
    errors.push(...repositoryOutcome.errors);

    const finalPrompt = this.composePrompt({
      request,
      plan: fallbackPlan,
      repository: repositoryOutcome.snapshot,
      options,
    });

    this.emitTrace('prompt', 'Prompt generado para el análisis.', finalPrompt);

    let providerResult: ProviderCallResult | null = null;
    if (this.agent.kind === 'cloud' || this.agent.kind === 'local') {
      try {
        providerResult = await this.executeProvider(finalPrompt, fallbackPlan, options);
        if (providerResult.status === 'fallback' && providerResult.errorMessage) {
          errors.push(providerResult.errorMessage);
        }
      } catch (error) {
        const normalizedError = this.normalizeError(error);
        errors.push(normalizedError.message);
        this.emitError('provider', normalizedError);
      }
    } else {
      errors.push('El agente seleccionado no soporta ejecución de análisis de Codex.');
    }

    const normalization = this.normalizeAnalysis({
      fallbackPlan,
      finalPrompt,
      providerResult,
      repository: repositoryOutcome.snapshot,
    });

    return {
      status: normalization.status,
      artifacts: normalization.artifacts,
      repository: repositoryOutcome.snapshot,
      errors: [...errors, ...normalization.errors],
    };
  }

  private normalizeInstructions(input: string | string[] | undefined): string[] {
    if (!input) {
      return [];
    }

    if (Array.isArray(input)) {
      return input.map(item => item.trim()).filter(Boolean);
    }

    return input
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  private emitTrace(stage: string, message: string, payload?: unknown, level: CodexOrchestratorTrace['level'] = 'info') {
    this.onTrace?.({
      level,
      stage,
      message,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  private emitError(stage: string, error: Error) {
    this.emitTrace(stage, error.message, { stack: error.stack }, 'error');
    this.onError?.(error, stage);
  }

  private async collectRepositorySnapshot(
    repositoryPath: string,
    plan: CodexPlan,
    options?: CodexAnalysisOptions,
  ): Promise<{ snapshot: CodexRepositorySnapshot; errors: string[] }> {
    const errors: string[] = [];
    const statusEntries: CodexRepositoryStatusEntry[] = [];
    let summary: CodexRepositorySummary | undefined;

    if (!repositoryPath || !repositoryPath.trim()) {
      const message = 'No se proporcionó una ruta de repositorio válida.';
      this.emitTrace('git:context', message, undefined, 'warning');
      return {
        snapshot: {
          summary: undefined,
          status: [],
          diffs: [],
        },
        errors: [message],
      };
    }

    try {
      const context = await this.gitInvoker<GitRepositoryContextResponse>('git_get_repository_context', {
        repoPath: repositoryPath,
      });
      summary = {
        branch: context?.branch ?? null,
        lastCommit: context?.last_commit ?? null,
        remote: context?.remote ?? null,
      };
      this.emitTrace('git:context', 'Contexto del repositorio obtenido.', summary);
    } catch (error) {
      const normalized = this.normalizeError(error);
      if (isGitBackendUnavailableError(error)) {
        errors.push(normalized.message);
      } else {
        errors.push(`No se pudo obtener el contexto del repositorio: ${normalized.message}`);
      }
      this.emitError('git:context', normalized);
    }

    let statusResponse: GitRepositoryStatusResponse | undefined;
    try {
      statusResponse = await this.gitInvoker<GitRepositoryStatusResponse>('git_repository_status', {
        repoPath: repositoryPath,
      });
    } catch (error) {
      const normalized = this.normalizeError(error);
      if (isGitBackendUnavailableError(error)) {
        errors.push(normalized.message);
      } else {
        errors.push(`No se pudo obtener el estado del repositorio: ${normalized.message}`);
      }
      this.emitError('git:status', normalized);
    }

    if (statusResponse?.entries?.length) {
      for (const entry of statusResponse.entries) {
        const path = typeof entry.path === 'string' ? entry.path : '';
        if (!path) {
          continue;
        }
        const status = entry.status ?? {};
        statusEntries.push({
          path,
          index: status.index ?? null,
          workdir: status.workdir ?? null,
          isConflicted: Boolean(status.is_conflicted),
        });
      }
    }

    const focusCandidates = new Set<string>();
    plan.steps.forEach(step => {
      if (step.targetPath) {
        focusCandidates.add(step.targetPath);
      }
    });

    options?.focusPaths?.forEach(candidate => {
      if (candidate) {
        focusCandidates.add(candidate);
      }
    });

    statusEntries.forEach(entry => {
      if (focusCandidates.size >= (options?.maxDiffs ?? this.maxDiffs)) {
        return;
      }
      focusCandidates.add(entry.path);
    });

    const diffs: CodexRepositoryDiff[] = [];
    const maxDiffs = options?.maxDiffs ?? this.maxDiffs;
    for (const path of Array.from(focusCandidates).slice(0, maxDiffs)) {
      try {
        const diff = await this.gitInvoker<string>('git_get_file_diff', {
          repoPath: repositoryPath,
          pathspec: path,
        });
        if (diff?.trim()) {
          diffs.push({ path, diff });
        }
      } catch (error) {
        const normalized = this.normalizeError(error);
        errors.push(`No se pudo generar el diff para ${path}: ${normalized.message}`);
        this.emitError('git:diff', normalized);
      }
    }

    return {
      snapshot: {
        summary,
        status: statusEntries,
        diffs,
      },
      errors,
    };
  }

  private composePrompt(params: {
    request: CodexRequest;
    plan: CodexPlan;
    repository: CodexRepositorySnapshot;
    options?: CodexAnalysisOptions;
  }): string {
    const { request, repository, options } = params;
    const sections: string[] = [];
    const projectInstructions = [
      ...this.baseProjectInstructions,
      ...this.normalizeInstructions(options?.projectInstructions),
    ];

    if (projectInstructions.length) {
      sections.push(
        [
          '## Instrucciones del proyecto',
          ...projectInstructions.map(instruction => `- ${instruction}`),
        ].join('\n'),
      );
    }

    const repoSummaryLines: string[] = [];
    if (repository.summary?.branch) {
      repoSummaryLines.push(`Rama activa: ${repository.summary.branch}`);
    }
    if (repository.summary?.lastCommit) {
      const commit = repository.summary.lastCommit;
      const parts = [commit?.id].filter(Boolean).join(' ');
      const message = commit?.message ? `: ${commit.message}` : '';
      repoSummaryLines.push(`Último commit ${parts}${message}`);
    }
    if (repository.summary?.remote?.name) {
      const remote = repository.summary.remote;
      repoSummaryLines.push(
        `Remoto configurado: ${remote.name}${remote.branch ? ` (${remote.branch})` : ''}${
          remote.url ? ` → ${remote.url}` : ''
        }`,
      );
    }
    if (repository.status.length) {
      repoSummaryLines.push(
        'Cambios detectados:\n' +
          repository.status
            .map(entry => {
              const index = entry.index ? ` index=${entry.index}` : '';
              const workdir = entry.workdir ? ` workdir=${entry.workdir}` : '';
              const conflict = entry.isConflicted ? ' ⚠ conflicto' : '';
              return `- ${entry.path}${index}${workdir}${conflict}`;
            })
            .join('\n'),
      );
    }

    if (repoSummaryLines.length) {
      sections.push(['## Estado del repositorio', ...repoSummaryLines].join('\n'));
    }

    if (repository.diffs.length) {
      const diffSections = repository.diffs.map(diff => `### Diff ${diff.path}\n\n\`\`\`diff\n${diff.diff}\n\`\`\``);
      sections.push(['## Diffs relevantes', ...diffSections].join('\n\n'));
    }

    if (options?.additionalContext?.trim()) {
      sections.push(['## Contexto adicional', options.additionalContext.trim()].join('\n'));
    }

    sections.push('## Solicitud original', request.prompt.trim());

    sections.push(
      [
        '## Formato requerido',
        'Devuelve **exclusivamente** un objeto JSON con la siguiente estructura:',
        '```json',
        JSON.stringify(
          {
            finalPrompt: '<prompt-explicado>',
            plan: {
              summary: '<resumen-conciso>',
              intent: '<objetivo>',
              safeguards: {
                dryRun: true,
                manualApproval: true,
                notes: ['<nota>'],
              },
              steps: [
                {
                  id: '<identificador>',
                  action: 'modify',
                  description: '<detalle>',
                  targetPath: '<ruta/opcional>',
                  requiresApproval: true,
                  approved: null,
                  rationale: '<explicacion>',
                  confidence: 0.5,
                  notes: ['<nota>'],
                  diffExcerpt: '<fragmento>',
                  providerMetadata: {
                    providerId: this.agent.provider,
                    modelId: this.agent.model,
                  },
                },
              ],
            },
            patches: [
              {
                path: '<ruta>',
                diff: '<diff completo en formato unified>',
                summary: '<resumen>',
                confidence: 0.5,
              },
            ],
            commits: [
              {
                message: 'feat: descripcion',
                description: '<detalle opcional>',
                scope: '<alcance opcional>',
                files: ['<archivo>'],
              },
            ],
            pullRequest: {
              title: 'feat: descripcion breve',
              summary: '<puntos clave>',
              body: '<cuerpo sugerido>',
              highlights: ['<bullet>'],
            },
          },
          null,
          2,
        ),
        '```',
        'No incluyas texto extra fuera del bloque JSON.',
      ].join('\n'),
    );

    return sections.join('\n\n');
  }

  private async executeProvider(
    prompt: string,
    fallbackPlan: CodexPlan,
    options?: CodexAnalysisOptions,
  ): Promise<ProviderCallResult> {
    this.emitTrace('provider:request', 'Enviando prompt al proveedor.', prompt);
    const metadataBase: CodexProviderMetadata = {
      providerId: this.agent.provider,
      modelId: this.agent.model,
    };

    if (this.agent.kind === 'local') {
      if (!this.jarvisInvoker) {
        throw new Error('Jarvis Core no está disponible para ejecutar modelos locales.');
      }

      const attempts = this.retryAttempts;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const start = Date.now();
          const payload: JarvisChatRequest = {
            prompt,
            systemPrompt: AGENT_SYSTEM_PROMPT,
            stream: false,
            signal: options?.signal,
          };
          const result = await this.withTimeout(
            this.jarvisInvoker(payload),
            options?.timeoutMs ?? this.providerTimeoutMs,
            'jarvis',
          );
          const text = await this.normalizeJarvisResult(result);
          const latencyMs = Date.now() - start;
          const metadata: CodexProviderMetadata = {
            ...metadataBase,
            latencyMs,
            attempt,
          };
          this.emitTrace('provider:response', 'Respuesta recibida del modelo local.', text);
          return {
            content: text,
            status: 'success',
            metadata,
            rawResponse: text,
            attempts: attempt,
          };
        } catch (error) {
          lastError = this.normalizeError(error);
          this.emitTrace(
            'provider:retry',
            `Intento ${attempt} con Jarvis falló: ${lastError.message}`,
            { attempt },
            'warning',
          );
          if (attempt < attempts) {
            await this.delay(this.retryDelayMs);
          }
        }
      }

      throw lastError ?? new Error('El modelo local no respondió.');
    }

    const fallbackText = this.formatPlanAsText(fallbackPlan);
    const attempts = this.retryAttempts;
    let lastError: Error | null = null;
    let lastOutcome: ProviderCallResult | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const start = Date.now();
        const outcome = await this.withTimeout(
          this.fetchReply({
            agent: this.agent,
            prompt,
            apiKeys: this.apiKeys,
            fallback: () => fallbackText,
          }),
          options?.timeoutMs ?? this.providerTimeoutMs,
          'provider',
        );

        const content = this.normalizeProviderContent(outcome.response);
        const latencyMs = Date.now() - start;
        const metadata: CodexProviderMetadata = {
          ...metadataBase,
          latencyMs,
          attempt,
        };

        this.emitTrace('provider:response', 'Respuesta recibida del proveedor.', content);

        const normalized: ProviderCallResult = {
          content,
          status: outcome.status,
          metadata,
          rawResponse: content,
          errorMessage: outcome.errorMessage,
          attempts: attempt,
        };

        if (outcome.status === 'success') {
          return normalized;
        }

        lastOutcome = normalized;
        if (attempt < attempts) {
          await this.delay(this.retryDelayMs);
          continue;
        }
        return normalized;
      } catch (error) {
        lastError = this.normalizeError(error);
        this.emitTrace(
          'provider:retry',
          `Intento ${attempt} fallido con el proveedor: ${lastError.message}`,
          { attempt },
          'warning',
        );
        if (attempt < attempts) {
          await this.delay(this.retryDelayMs);
        }
      }
    }

    if (lastOutcome) {
      return lastOutcome;
    }

    throw lastError ?? new Error('El proveedor no pudo procesar la solicitud.');
  }

  private async normalizeJarvisResult(result: JarvisChatResult): Promise<string> {
    if (this.isAsyncIterable(result)) {
      let aggregated = '';
      for await (const event of result) {
        if (!event || typeof event !== 'object') {
          continue;
        }
        const type = (event as { type?: unknown }).type;
        if (type === 'chunk') {
          const delta = typeof (event as { delta?: unknown }).delta === 'string' ? (event as { delta: string }).delta : '';
          aggregated += delta;
        } else if (type === 'result') {
          const message = typeof (event as { message?: unknown }).message === 'string'
            ? (event as { message: string }).message
            : '';
          aggregated = message || aggregated;
        } else if (type === 'error') {
          const errorMessage = typeof (event as { message?: unknown }).message === 'string'
            ? (event as { message: string }).message
            : 'Jarvis Core emitió un error.';
          throw new Error(errorMessage);
        }
      }
      return aggregated.trim();
    }

    const direct = typeof (result as { message?: unknown }).message === 'string'
      ? (result as { message: string }).message
      : '';
    return direct.trim();
  }

  private normalizeProviderContent(response: ChatProviderResponse): string {
    const { content } = response;
    if (typeof content === 'string') {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map(part => {
          if (!part) {
            return '';
          }
          if (typeof part === 'string') {
            return part;
          }
          if (part.type === 'text') {
            return part.text;
          }
          if (part.type === 'image') {
            return part.alt ?? '[imagen]';
          }
          if (part.type === 'audio') {
            return part.transcript ?? '[audio]';
          }
          if (part.type === 'file') {
            return part.name ?? '[archivo]';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    return '';
  }

  private normalizeAnalysis(params: {
    fallbackPlan: CodexPlan;
    finalPrompt: string;
    providerResult: ProviderCallResult | null;
    repository: CodexRepositorySnapshot;
  }): { artifacts: CodexAnalysisArtifacts; status: 'success' | 'fallback'; errors: string[] } {
    const { fallbackPlan, finalPrompt, providerResult } = params;
    const basePlan: CodexPlanWithAnalysis = {
      ...fallbackPlan,
      steps: fallbackPlan.steps.map(step => ({ ...step })) as CodexPlanStepWithProvider[],
    };

    if (!providerResult) {
      return {
        status: 'fallback',
        errors: ['No se recibió respuesta del proveedor, se usa el plan heurístico.'],
        artifacts: {
          finalPrompt,
          plan: basePlan,
          patches: [],
          commits: [],
          providerMetadata: undefined,
          rawResponse: undefined,
        },
      };
    }

    const parsing = this.parseProviderResponse(providerResult.content);

    if (!parsing) {
      return {
        status: 'fallback',
        errors: ['No se pudo interpretar la respuesta del proveedor, se usa el plan heurístico.'],
        artifacts: {
          finalPrompt,
          plan: basePlan,
          patches: [],
          commits: [],
          providerMetadata: providerResult.metadata,
          rawResponse: providerResult.rawResponse,
        },
      };
    }

    const mergedPlan = this.mergePlan(basePlan, parsing.plan);
    const planSafeguards =
      parsing.plan && typeof parsing.plan === 'object' && 'safeguards' in parsing.plan
        ? (parsing.plan as { safeguards?: unknown }).safeguards
        : undefined;
    const safeguards = this.mergeSafeguards(basePlan.safeguards, planSafeguards);
    const patches = this.normalizePatches(parsing.patches, providerResult.metadata);
    const commits = this.normalizeCommits(parsing.commits, providerResult.metadata);
    const prSummary = this.normalizePullRequest(parsing.pullRequest, providerResult.metadata);
    const final = typeof parsing.finalPrompt === 'string' && parsing.finalPrompt.trim()
      ? parsing.finalPrompt.trim()
      : finalPrompt;

    return {
      status: providerResult.status,
      errors: [],
      artifacts: {
        finalPrompt: final,
        plan: {
          ...mergedPlan,
          safeguards,
        },
        patches,
        commits,
        pullRequest: prSummary,
        providerMetadata: this.mergeProviderMetadata(parsing.provider, providerResult.metadata),
        rawResponse: providerResult.rawResponse,
      },
    };
  }

  private mergePlan(base: CodexPlanWithAnalysis, payload: unknown): CodexPlanWithAnalysis {
    const result: CodexPlanWithAnalysis = {
      ...base,
      steps: base.steps.map(step => ({ ...step })) as CodexPlanStepWithProvider[],
    };

    if (!payload || typeof payload !== 'object') {
      return result;
    }

    const plan = payload as Partial<CodexPlanWithAnalysis> & { steps?: unknown };

    if (typeof plan.summary === 'string' && plan.summary.trim()) {
      result.summary = plan.summary.trim();
    }
    if (typeof plan.intent === 'string' && plan.intent.trim()) {
      result.intent = plan.intent.trim();
    }

    if (Array.isArray(plan.steps)) {
      const mergedSteps: CodexPlanStepWithProvider[] = [];
      plan.steps.forEach((rawStep, index) => {
        const baseStep = result.steps[index] ?? result.steps[result.steps.length - 1] ?? this.createPlaceholderStep(index);
        mergedSteps.push(this.mergeStep(baseStep, rawStep));
      });
      result.steps = mergedSteps;
    }

    return result;
  }

  private mergeSafeguards(base: CodexSafeguards, payload: unknown): CodexSafeguards {
    if (!payload || typeof payload !== 'object') {
      return base;
    }

    const candidate = payload as Partial<CodexSafeguards> & { notes?: unknown };
    const notes = Array.isArray(candidate.notes)
      ? candidate.notes.map(note => (typeof note === 'string' ? note : '')).filter(Boolean)
      : base.notes;

    return {
      dryRun: typeof candidate.dryRun === 'boolean' ? candidate.dryRun : base.dryRun,
      manualApproval:
        typeof candidate.manualApproval === 'boolean' ? candidate.manualApproval : base.manualApproval,
      notes,
    };
  }

  private createPlaceholderStep(index: number): CodexPlanStepWithProvider {
    return {
      id: `step-${index}`,
      action: 'inspect',
      description: 'Paso generado por fallback.',
      requiresApproval: false,
    };
  }

  private mergeStep(base: CodexPlanStepWithProvider, payload: unknown): CodexPlanStepWithProvider {
    const merged: CodexPlanStepWithProvider = { ...base };
    if (!payload || typeof payload !== 'object') {
      return merged;
    }

    const candidate = payload as Partial<CodexPlanStepWithProvider> & { metadata?: unknown; providerMetadata?: unknown };

    if (typeof candidate.id === 'string' && candidate.id.trim()) {
      merged.id = candidate.id.trim();
    }
    if (typeof candidate.action === 'string' && this.isValidAction(candidate.action)) {
      merged.action = candidate.action as CodexPlanStep['action'];
    }
    if (typeof candidate.description === 'string' && candidate.description.trim()) {
      merged.description = candidate.description.trim();
    }
    if (typeof candidate.targetPath === 'string' && candidate.targetPath.trim()) {
      merged.targetPath = candidate.targetPath.trim();
    }
    if (typeof candidate.requiresApproval === 'boolean') {
      merged.requiresApproval = candidate.requiresApproval;
    }
    if (typeof candidate.approved === 'boolean') {
      merged.approved = candidate.approved;
    }
    if (typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)) {
      merged.confidence = candidate.confidence;
    }
    if (typeof candidate.diffExcerpt === 'string' && candidate.diffExcerpt.trim()) {
      merged.diffExcerpt = candidate.diffExcerpt.trim();
    }
    if (typeof candidate.rationale === 'string' && candidate.rationale.trim()) {
      merged.rationale = candidate.rationale.trim();
    }
    if (Array.isArray(candidate.notes)) {
      merged.notes = candidate.notes
        .map(note => (typeof note === 'string' ? note.trim() : ''))
        .filter(Boolean);
    }

    if (candidate.metadata && typeof candidate.metadata === 'object') {
      merged.metadata = {
        ...merged.metadata,
        ...(candidate.metadata as Record<string, unknown>),
      };
    }

    const providerMetadata = this.mergeProviderMetadata(candidate.providerMetadata, merged.providerMetadata);
    if (providerMetadata) {
      merged.providerMetadata = providerMetadata;
    }

    return merged;
  }

  private normalizePatches(payload: unknown, fallbackMetadata: CodexProviderMetadata): CodexSuggestedPatch[] {
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const candidate = item as Partial<CodexSuggestedPatch> & { providerMetadata?: unknown };
        if (typeof candidate.path !== 'string' || !candidate.path.trim()) {
          return null;
        }
        if (typeof candidate.diff !== 'string' || !candidate.diff.trim()) {
          return null;
        }
        const metadata = this.mergeProviderMetadata(candidate.providerMetadata, fallbackMetadata);
        return {
          path: candidate.path.trim(),
          diff: candidate.diff,
          summary: typeof candidate.summary === 'string' ? candidate.summary.trim() : undefined,
          confidence:
            typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
              ? candidate.confidence
              : undefined,
          appliesCleanly:
            typeof candidate.appliesCleanly === 'boolean' ? candidate.appliesCleanly : undefined,
          providerMetadata: metadata,
          metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : undefined,
        } satisfies CodexSuggestedPatch;
      })
      .filter((patch): patch is CodexSuggestedPatch => Boolean(patch));
  }

  private normalizeCommits(payload: unknown, fallbackMetadata: CodexProviderMetadata): CodexCommitSuggestion[] {
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const candidate = item as Partial<CodexCommitSuggestion> & { providerMetadata?: unknown };
        if (typeof candidate.message !== 'string' || !candidate.message.trim()) {
          return null;
        }
        const metadata = this.mergeProviderMetadata(candidate.providerMetadata, fallbackMetadata);
        const files = Array.isArray(candidate.files)
          ? candidate.files.map(file => (typeof file === 'string' ? file.trim() : '')).filter(Boolean)
          : undefined;
        return {
          message: candidate.message.trim(),
          description:
            typeof candidate.description === 'string' && candidate.description.trim()
              ? candidate.description.trim()
              : undefined,
          scope: typeof candidate.scope === 'string' && candidate.scope.trim() ? candidate.scope.trim() : undefined,
          breakingChange:
            typeof candidate.breakingChange === 'boolean' ? candidate.breakingChange : undefined,
          files,
          providerMetadata: metadata,
          metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : undefined,
        } satisfies CodexCommitSuggestion;
      })
      .filter((commit): commit is CodexCommitSuggestion => Boolean(commit));
  }

  private normalizePullRequest(payload: unknown, fallbackMetadata: CodexProviderMetadata): CodexPullRequestSummary | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const candidate = payload as Partial<CodexPullRequestSummary> & { highlights?: unknown; providerMetadata?: unknown };
    if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
      return undefined;
    }
    const highlights = Array.isArray(candidate.highlights)
      ? candidate.highlights.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : undefined;
    const metadata = this.mergeProviderMetadata(candidate.providerMetadata, fallbackMetadata);
    return {
      title: candidate.title.trim(),
      summary: typeof candidate.summary === 'string' && candidate.summary.trim() ? candidate.summary.trim() : undefined,
      body: typeof candidate.body === 'string' && candidate.body.trim() ? candidate.body.trim() : undefined,
      highlights,
      providerMetadata: metadata,
      metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : undefined,
    } satisfies CodexPullRequestSummary;
  }

  private mergeProviderMetadata(
    candidate: unknown,
    fallback?: CodexProviderMetadata,
  ): CodexProviderMetadata | undefined {
    const base: CodexProviderMetadata | undefined = fallback ? { ...fallback } : undefined;

    if (!candidate) {
      return base;
    }

    if (typeof candidate === 'string') {
      return {
        providerId: candidate,
        modelId: base?.modelId,
        latencyMs: base?.latencyMs,
        attempt: base?.attempt,
        cost: base?.cost,
        timestamp: base?.timestamp,
        details: base?.details,
      };
    }

    if (typeof candidate !== 'object') {
      return base;
    }

    const normalized = candidate as Partial<CodexProviderMetadata> & { model?: unknown; provider?: unknown; details?: unknown };

    const providerId =
      typeof normalized.providerId === 'string'
        ? normalized.providerId
        : typeof normalized.provider === 'string'
        ? normalized.provider
        : base?.providerId ?? this.agent.provider;

    const modelId =
      typeof normalized.modelId === 'string'
        ? normalized.modelId
        : typeof normalized.model === 'string'
        ? normalized.model
        : base?.modelId ?? this.agent.model;

    const latencyMs =
      typeof normalized.latencyMs === 'number' && Number.isFinite(normalized.latencyMs)
        ? normalized.latencyMs
        : base?.latencyMs;

    const attempt =
      typeof normalized.attempt === 'number' && Number.isFinite(normalized.attempt)
        ? normalized.attempt
        : base?.attempt;

    const cost =
      typeof normalized.cost === 'number' && Number.isFinite(normalized.cost)
        ? normalized.cost
        : base?.cost;

    const timestamp =
      typeof normalized.timestamp === 'string' && normalized.timestamp.trim()
        ? normalized.timestamp.trim()
        : base?.timestamp;

    const details =
      normalized.details && typeof normalized.details === 'object'
        ? { ...base?.details, ...(normalized.details as Record<string, unknown>) }
        : base?.details;

    return {
      providerId,
      modelId,
      latencyMs,
      attempt,
      cost,
      timestamp,
      details,
    };
  }

  private parseProviderResponse(text: string):
    | {
        finalPrompt?: string;
        plan?: unknown;
        patches?: unknown;
        commits?: unknown;
        pullRequest?: unknown;
        provider?: unknown;
      }
    | null {
    if (!text.trim()) {
      return null;
    }

    const direct = this.tryParseJson(text.trim());
    if (direct) {
      return direct as {
        finalPrompt?: string;
        plan?: unknown;
        patches?: unknown;
        commits?: unknown;
        pullRequest?: unknown;
        provider?: unknown;
      };
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) {
      const parsed = this.tryParseJson(fencedMatch[1]);
      if (parsed) {
        return parsed as {
          finalPrompt?: string;
          plan?: unknown;
          patches?: unknown;
          commits?: unknown;
          pullRequest?: unknown;
          provider?: unknown;
        };
      }
    }

    return null;
  }

  private tryParseJson(input: string): unknown | null {
    try {
      return JSON.parse(input);
    } catch (error) {
      return null;
    }
  }

  private formatPlanAsText(plan: CodexPlan): string {
    const lines = [plan.summary, '', '## Pasos propuestos'];
    if (plan.steps.length) {
      plan.steps.forEach(step => {
        const target = step.targetPath ? ` (${step.targetPath})` : '';
        lines.push(`- [${step.action}] ${step.description}${target}`);
      });
    } else {
      lines.push('- Sin pasos identificados.');
    }

    lines.push('', '## Salvaguardas');
    lines.push(`- Dry-run: ${plan.safeguards.dryRun ? 'sí' : 'no'}`);
    lines.push(`- Aprobación manual: ${plan.safeguards.manualApproval ? 'requerida' : 'no requerida'}`);
    if (plan.safeguards.notes.length) {
      plan.safeguards.notes.forEach(note => lines.push(`  - ${note}`));
    }

    return lines.join('\n');
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string') {
      return new Error(error);
    }
    return new Error('Error desconocido.');
  }

  private delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | null | undefined,
    stage: string,
  ): Promise<T> {
    if (!timeoutMs || timeoutMs <= 0) {
      return promise;
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new Error(`Tiempo de espera excedido en ${stage} (${timeoutMs} ms).`);
        reject(error);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result as T;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private isValidAction(action: string): action is CodexPlanStep['action'] {
    return (
      action === 'inspect' ||
      action === 'modify' ||
      action === 'create' ||
      action === 'delete' ||
      action === 'commit' ||
      action === 'run-command' ||
      action === 'push' ||
      action === 'pr'
    );
  }

  private isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
    return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
  }
}
