import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CodexAnalysisResult,
  CodexCommitSuggestion,
  CodexOrchestratorTrace,
  CodexPlanWithAnalysis,
  CodexProviderMetadata,
  CodexPullRequestSummary,
  CodexRepositorySnapshot,
  CodexRequest,
  CodexSuggestedPatch,
} from './types';
import type { ChatMessage } from '../messages/messageTypes';
import { useMessages } from '../messages/MessageContext';
import { CodexEngine } from './CodexEngine';
import { CodexOrchestrator } from './CodexOrchestrator';
import { buildRepoWorkflowSubmission, type RepoWorkflowSubmission } from './bridge';
import {
  registerRepoWorkflowHandlers,
  unregisterRepoWorkflowHandlers,
  type RepoWorkflowQueuePayload,
  type RepoWorkflowSyncOptions,
} from './workflowBridge';
import { useProjects } from '../projects/ProjectContext';
import { canUseDesktopGit, gitInvoke, isGitBackendUnavailableError } from '../../utils/runtimeBridge';
import { useAgents } from '../agents/AgentContext';
import type { AgentDefinition } from '../agents/agentRegistry';
import type { ApiKeySettings, ProjectOrchestratorPreferences } from '../../types/globalSettings';
import { useJarvisCore } from '../jarvis/JarvisCoreContext';
import { DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES } from '../../utils/globalSettings';

export type RepoWorkflowExecutionStatus = 'analyzing' | 'ready' | 'fallback' | 'error';

export interface RepoWorkflowRequest {
  id: string;
  sourceMessageId: string;
  sourceAgentId?: string;
  request: CodexRequest;
  plan: RepoWorkflowSubmission['plan'];
  analysisPrompt: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  tags: string[];
  originalResponse: string;
  canonicalCode?: string;
  remoteName?: string;
  status: RepoWorkflowExecutionStatus;
  analysisStatus: RepoWorkflowSubmission['analysisStatus'];
  analysis?: CodexAnalysisResult;
  enrichedPlan?: CodexPlanWithAnalysis;
  suggestedPatches: CodexSuggestedPatch[];
  suggestedCommits: CodexCommitSuggestion[];
  suggestedPullRequest?: CodexPullRequestSummary;
  providerMetadata?: CodexProviderMetadata;
  providerTraces: CodexOrchestratorTrace[];
  analysisErrors: string[];
  repositorySnapshot?: CodexRepositorySnapshot;
}

interface RepoWorkflowContextValue {
  pendingRequest: RepoWorkflowRequest | null;
  queueRequest: (payload: RepoWorkflowQueuePayload) => void;
  clearPendingRequest: () => void;
  syncRepository: (options: RepoWorkflowSyncOptions) => Promise<string | null>;
}

const RepoWorkflowContext = createContext<RepoWorkflowContextValue | undefined>(undefined);

interface ResolvedAgentSelection {
  primary: AgentDefinition | null;
  fallback: AgentDefinition | null;
  preferences: ProjectOrchestratorPreferences;
}

const generateRequestId = (): string => {
  return `repo-request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const findMessageById = (messages: ChatMessage[], messageId: string): ChatMessage | undefined => {
  return messages.find(candidate => candidate.id === messageId);
};

const buildFallbackMessage = (messageId: string, canonicalCode?: string): ChatMessage => ({
  id: messageId,
  author: 'agent',
  content: canonicalCode ?? '',
  canonicalCode: canonicalCode ?? undefined,
  timestamp: new Date().toISOString(),
});

const normalizePreference = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const mergeCandidateList = (target: AgentDefinition[], additions: AgentDefinition[]): void => {
  additions.forEach(candidate => {
    if (!target.includes(candidate)) {
      target.push(candidate);
    }
  });
};

const hasValidCredentials = (agent: AgentDefinition): boolean => {
  if (agent.kind === 'cloud') {
    return Boolean(agent.apiKey?.trim());
  }
  return true;
};

const buildApiKeySettingsFromAgents = (agents: AgentDefinition[]): ApiKeySettings => {
  return agents.reduce<ApiKeySettings>((acc, agent) => {
    const key = agent.apiKey?.trim();
    if (key) {
      acc[agent.provider.toLowerCase()] = key;
    }
    return acc;
  }, {});
};

const computeApiKeySignature = (apiKeys: ApiKeySettings): string => {
  return Object.entries(apiKeys)
    .map(([provider, key]) => `${provider}:${key}`)
    .sort()
    .join('|');
};

const createErrorTrace = (stage: string, error: Error): CodexOrchestratorTrace => ({
  level: 'error',
  stage,
  message: error.message,
  timestamp: new Date().toISOString(),
  payload: { stack: error.stack },
});

export const RepoWorkflowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { messages } = useMessages();
  const engineRef = useRef(new CodexEngine({ defaultDryRun: true }));
  const orchestratorRef = useRef<{ instance: CodexOrchestrator | null; signature: string | null }>({
    instance: null,
    signature: null,
  });
  const analysisAbortRef = useRef<AbortController | null>(null);
  const traceBufferRef = useRef<CodexOrchestratorTrace[]>([]);
  const [pendingRequest, setPendingRequest] = useState<RepoWorkflowRequest | null>(null);
  const { activeProject } = useProjects();
  const { agents } = useAgents();
  const { invokeChat } = useJarvisCore();

  const apiKeys = useMemo<ApiKeySettings>(() => buildApiKeySettingsFromAgents(agents), [agents]);
  const apiKeySignature = useMemo(() => computeApiKeySignature(apiKeys), [apiKeys]);

  const resolvePreferredAgent = useCallback((): ResolvedAgentSelection => {
    const basePreferences: ProjectOrchestratorPreferences = activeProject?.orchestrator
      ? { ...DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES, ...activeProject.orchestrator }
      : { ...DEFAULT_PROJECT_ORCHESTRATOR_PREFERENCES };

    if (!agents.length) {
      return { primary: null, fallback: null, preferences: basePreferences };
    }

    const mode = basePreferences.mode;
    const filteredByMode =
      mode === 'auto'
        ? agents
        : agents.filter(agent =>
            mode === 'cloud' ? agent.kind === 'cloud' : agent.kind === 'local',
          );
    const candidatePool = filteredByMode.length ? filteredByMode : agents;

    const primaryModel = basePreferences.primaryModel?.trim() || activeProject?.preferredModel?.trim() || '';
    const primaryProvider = normalizePreference(
      basePreferences.primaryProvider ?? activeProject?.preferredProvider,
    );

    const fallbackModel = basePreferences.fallbackModel?.trim() || '';
    const fallbackProvider = normalizePreference(basePreferences.fallbackProvider);

    const prioritized: AgentDefinition[] = [];
    const fallbackMatches: AgentDefinition[] = [];

    if (primaryModel) {
      const modelMatches = candidatePool.filter(agent => agent.model === primaryModel);
      if (modelMatches.length) {
        mergeCandidateList(prioritized, modelMatches.filter(agent => agent.active));
        mergeCandidateList(prioritized, modelMatches);
      }
    }

    if (primaryProvider) {
      const providerMatches = candidatePool.filter(
        agent => normalizePreference(agent.provider) === primaryProvider,
      );
      if (providerMatches.length) {
        mergeCandidateList(prioritized, providerMatches.filter(agent => agent.active));
        mergeCandidateList(prioritized, providerMatches);
      }
    }

    if (basePreferences.degradationPolicy !== 'none') {
      if (fallbackModel) {
        const matches = candidatePool.filter(agent => agent.model === fallbackModel);
        if (matches.length) {
          mergeCandidateList(fallbackMatches, matches);
        }
      }

      if (fallbackProvider) {
        const matches = candidatePool.filter(
          agent => normalizePreference(agent.provider) === fallbackProvider,
        );
        if (matches.length) {
          mergeCandidateList(fallbackMatches, matches);
        }
      }

      if (fallbackMatches.length) {
        mergeCandidateList(prioritized, fallbackMatches.filter(agent => agent.active));
        mergeCandidateList(prioritized, fallbackMatches);
      }
    }

    mergeCandidateList(prioritized, candidatePool.filter(agent => agent.active));
    mergeCandidateList(prioritized, candidatePool);

    const primary = prioritized.find(hasValidCredentials) ?? prioritized[0] ?? null;

    let fallback: AgentDefinition | null = null;
    if (basePreferences.degradationPolicy !== 'none') {
      const eligible = fallbackMatches.length ? fallbackMatches : prioritized;
      fallback = eligible.find(candidate => candidate !== primary && hasValidCredentials(candidate)) ??
        eligible.find(candidate => candidate !== primary) ??
        null;
    }

    return {
      primary,
      fallback,
      preferences: basePreferences,
    };
  }, [
    activeProject?.orchestrator,
    activeProject?.preferredModel,
    activeProject?.preferredProvider,
    agents,
  ]);

  const ensureOrchestrator = useCallback((): CodexOrchestrator | null => {
    const { primary: agent, fallback: fallbackAgent, preferences } = resolvePreferredAgent();
    if (!agent) {
      return null;
    }

    const signature = [
      agent.id,
      fallbackAgent?.id ?? '',
      activeProject?.id ?? '',
      apiKeySignature,
      activeProject?.instructions ?? '',
      agent.model,
      preferences.mode,
      preferences.degradationPolicy,
      preferences.retryLimit.toString(),
      preferences.retryDelayMs.toString(),
    ].join('|');

    const existing = orchestratorRef.current;
    if (existing.instance && existing.signature === signature) {
      return existing.instance;
    }

    const needsJarvis = agent.kind === 'local' || fallbackAgent?.kind === 'local';
    const orchestrator = new CodexOrchestrator({
      agent,
      fallbackAgent: fallbackAgent ?? undefined,
      degradationPolicy: preferences.degradationPolicy,
      apiKeys,
      engine: engineRef.current,
      jarvisInvoker: needsJarvis ? invokeChat : null,
      projectInstructions: activeProject?.instructions,
      retryAttempts: preferences.retryLimit,
      retryDelayMs: preferences.retryDelayMs,
      onTrace: trace => {
        traceBufferRef.current = [...traceBufferRef.current, trace];
      },
      onError: (error, stage) => {
        traceBufferRef.current = [...traceBufferRef.current, createErrorTrace(stage, error)];
      },
    });

    orchestratorRef.current = { instance: orchestrator, signature };
    return orchestrator;
  }, [
    resolvePreferredAgent,
    activeProject?.id,
    activeProject?.instructions,
    apiKeys,
    apiKeySignature,
    invokeChat,
  ]);

  const syncRepository = useCallback(async (options: RepoWorkflowSyncOptions) => {
    const { repositoryPath, remote, branch } = options;
    if (!repositoryPath) {
      return null;
    }
    if (!canUseDesktopGit()) {
      return 'Sincronización omitida: entorno no compatible.';
    }

    try {
      const result = await gitInvoke<string>('git_pull_repository', {
        repoPath: repositoryPath,
        remote: remote ?? null,
        branch: branch ?? null,
      });
      return result;
    } catch (error) {
      if (isGitBackendUnavailableError(error)) {
        return error.message;
      }
      const message = (error as Error)?.message ?? 'Error desconocido al sincronizar el repositorio.';
      throw new Error(message);
    }
  }, []);

  const queueRequest = useCallback(
    (payload: RepoWorkflowQueuePayload) => {
      const { messageId, canonicalCode, repositoryPath, branch, riskLevel } = payload;
      const originalMessage =
        findMessageById(messages, messageId) ?? buildFallbackMessage(messageId, canonicalCode);

      const orchestrator = ensureOrchestrator();
      const defaultRepositoryPath = repositoryPath ?? activeProject?.repositoryPath;
      const defaultBranch = branch ?? activeProject?.defaultBranch;
      const remoteName = activeProject?.defaultRemote ?? 'origin';
      const defaultActor = activeProject
        ? [activeProject.preferredProvider, activeProject.preferredModel]
            .filter(Boolean)
            .join(':') || activeProject.name
        : undefined;

      const additionalErrors: string[] = [];
      if (!orchestrator) {
        additionalErrors.push(
          'No hay credenciales activas para ejecutar el análisis remoto. Se utilizará el plan local.',
        );
      }

      const baseSubmission = buildRepoWorkflowSubmission({
        message: originalMessage,
        canonicalCode,
        engine: engineRef.current,
        options: {
          repositoryPath,
          branch: defaultBranch,
          actor: defaultActor,
          riskLevel,
        },
        defaultRepositoryPath,
        additionalErrors,
      });

      if (!baseSubmission.analysisPrompt.trim()) {
        console.warn('La solicitud a Repo Studio carece de contenido analizable.');
        return;
      }

      const requestId = generateRequestId();
      const baseRequest: RepoWorkflowRequest = {
        id: requestId,
        sourceMessageId: originalMessage.id,
        sourceAgentId: originalMessage.agentId ?? originalMessage.originAgentId,
        request: baseSubmission.request,
        plan: baseSubmission.plan,
        analysisPrompt: baseSubmission.analysisPrompt,
        commitMessage: baseSubmission.commitMessage,
        prTitle: baseSubmission.prTitle,
        prBody: baseSubmission.prBody,
        tags: baseSubmission.tags,
        originalResponse: baseSubmission.originalResponse,
        canonicalCode: baseSubmission.canonicalCode ?? canonicalCode,
        remoteName,
        status: orchestrator ? 'analyzing' : 'error',
        analysisStatus: baseSubmission.analysisStatus,
        analysis: baseSubmission.analysis,
        enrichedPlan: baseSubmission.enrichedPlan,
        suggestedPatches: baseSubmission.suggestedPatches,
        suggestedCommits: baseSubmission.suggestedCommits,
        suggestedPullRequest: baseSubmission.suggestedPullRequest,
        providerMetadata: baseSubmission.providerMetadata,
        providerTraces: baseSubmission.providerTraces,
        analysisErrors: baseSubmission.analysisErrors,
        repositorySnapshot: baseSubmission.repositorySnapshot,
      };

      analysisAbortRef.current?.abort();
      analysisAbortRef.current = null;

      if (!orchestrator) {
        setPendingRequest(baseRequest);
        return;
      }

      traceBufferRef.current = [];
      const controller = new AbortController();
      analysisAbortRef.current = controller;
      setPendingRequest(baseRequest);

      void orchestrator
        .analyze(baseSubmission.request, {
          projectInstructions: activeProject?.instructions,
          signal: controller.signal,
        })
        .then(result => {
          if (controller.signal.aborted) {
            return;
          }

          const traces = traceBufferRef.current.slice();
          const submission = buildRepoWorkflowSubmission({
            message: originalMessage,
            canonicalCode,
            engine: engineRef.current,
            options: {
              repositoryPath,
              branch: defaultBranch,
              actor: defaultActor,
              riskLevel,
            },
            defaultRepositoryPath,
            analysis: result,
            traces,
          });

          setPendingRequest(previous => {
            if (!previous || previous.id !== requestId) {
              return previous;
            }
            return {
              ...previous,
              request: submission.request,
              plan: submission.plan,
              commitMessage: submission.commitMessage,
              prTitle: submission.prTitle,
              prBody: submission.prBody,
              tags: submission.tags,
              originalResponse: submission.originalResponse,
              analysis: submission.analysis,
              enrichedPlan: submission.enrichedPlan,
              suggestedPatches: submission.suggestedPatches,
              suggestedCommits: submission.suggestedCommits,
              suggestedPullRequest: submission.suggestedPullRequest,
              providerMetadata: submission.providerMetadata,
              providerTraces: submission.providerTraces,
              analysisErrors: submission.analysisErrors,
              repositorySnapshot: submission.repositorySnapshot,
              analysisStatus: submission.analysisStatus,
              status: result.status === 'success' ? 'ready' : 'fallback',
            } satisfies RepoWorkflowRequest;
          });
        })
        .catch(error => {
          if (controller.signal.aborted) {
            return;
          }

          const traces = traceBufferRef.current.slice();
          const message =
            (error as Error)?.message ??
            'Error desconocido al ejecutar el orquestador. Se utilizará el plan local.';
          const submission = buildRepoWorkflowSubmission({
            message: originalMessage,
            canonicalCode,
            engine: engineRef.current,
            options: {
              repositoryPath,
              branch: defaultBranch,
              actor: defaultActor,
              riskLevel,
            },
            defaultRepositoryPath,
            traces,
            additionalErrors: [message],
          });

          setPendingRequest(previous => {
            if (!previous || previous.id !== requestId) {
              return previous;
            }
            return {
              ...previous,
              request: submission.request,
              plan: submission.plan,
              commitMessage: submission.commitMessage,
              prTitle: submission.prTitle,
              prBody: submission.prBody,
              tags: submission.tags,
              originalResponse: submission.originalResponse,
              analysis: submission.analysis,
              enrichedPlan: submission.enrichedPlan,
              suggestedPatches: submission.suggestedPatches,
              suggestedCommits: submission.suggestedCommits,
              suggestedPullRequest: submission.suggestedPullRequest,
              providerMetadata: submission.providerMetadata,
              providerTraces: submission.providerTraces,
              analysisErrors: submission.analysisErrors,
              repositorySnapshot: submission.repositorySnapshot,
              analysisStatus: submission.analysisStatus,
              status: 'error',
            } satisfies RepoWorkflowRequest;
          });
        })
        .finally(() => {
          if (analysisAbortRef.current === controller) {
            analysisAbortRef.current = null;
          }
          traceBufferRef.current = [];
        });
    },
    [
      messages,
      activeProject?.instructions,
      activeProject?.defaultBranch,
      activeProject?.defaultRemote,
      activeProject?.preferredModel,
      activeProject?.preferredProvider,
      activeProject?.repositoryPath,
      activeProject?.name,
      ensureOrchestrator,
    ],
  );

  const clearPendingRequest = useCallback(() => {
    setPendingRequest(null);
  }, []);

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handlers = { queueRequest, syncRepository } as const;
    registerRepoWorkflowHandlers(handlers);
    return () => {
      unregisterRepoWorkflowHandlers(handlers);
    };
  }, [queueRequest, syncRepository]);

  const value = useMemo(
    () => ({
      pendingRequest,
      queueRequest,
      clearPendingRequest,
      syncRepository,
    }),
    [pendingRequest, queueRequest, clearPendingRequest, syncRepository],
  );

  return <RepoWorkflowContext.Provider value={value}>{children}</RepoWorkflowContext.Provider>;
};

export const useRepoWorkflow = (): RepoWorkflowContextValue => {
  const context = useContext(RepoWorkflowContext);
  if (!context) {
    throw new Error('useRepoWorkflow debe utilizarse dentro de un RepoWorkflowProvider');
  }
  return context;
};
