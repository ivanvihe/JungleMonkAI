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
import { useProjects } from '../projects/ProjectContext';
import { canUseDesktopGit, gitInvoke, isGitBackendUnavailableError } from '../../utils/runtimeBridge';
import { useAgents } from '../agents/AgentContext';
import type { AgentDefinition } from '../agents/agentRegistry';
import type { ApiKeySettings } from '../../types/globalSettings';
import { useJarvisCore } from '../jarvis/JarvisCoreContext';

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

interface QueuePayload {
  messageId: string;
  canonicalCode?: string;
  repositoryPath?: string;
  branch?: string;
  riskLevel?: RepoWorkflowSubmission['request']['context']['riskLevel'];
}

interface RepoSyncOptions {
  repositoryPath: string;
  remote?: string | null;
  branch?: string | null;
}

interface RepoWorkflowContextValue {
  pendingRequest: RepoWorkflowRequest | null;
  queueRequest: (payload: QueuePayload) => void;
  clearPendingRequest: () => void;
  syncRepository: (options: RepoSyncOptions) => Promise<string | null>;
}

const RepoWorkflowContext = createContext<RepoWorkflowContextValue | undefined>(undefined);

let externalQueueRequest: ((payload: QueuePayload) => void) | null = null;
let externalSyncRepository: ((options: RepoSyncOptions) => Promise<string | null>) | null = null;

export const enqueueRepoWorkflowRequest = (payload: QueuePayload): void => {
  if (!externalQueueRequest) {
    console.warn('No hay proveedor activo de Repo Studio para procesar la solicitud.');
    return;
  }
  externalQueueRequest(payload);
};

export const syncRepositoryViaWorkflow = async (
  options: RepoSyncOptions,
): Promise<string | null> => {
  if (!externalSyncRepository) {
    console.warn('No hay proveedor activo de Repo Studio para sincronizar el repositorio.');
    return null;
  }
  return externalSyncRepository(options);
};

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

  const resolvePreferredAgent = useCallback((): AgentDefinition | null => {
    if (!agents.length) {
      return null;
    }

    const preferredModel = activeProject?.preferredModel?.trim();
    const preferredProvider = normalizePreference(activeProject?.preferredProvider);
    const prioritized: AgentDefinition[] = [];

    if (preferredModel) {
      const modelMatches = agents.filter(agent => agent.model === preferredModel);
      if (modelMatches.length) {
        mergeCandidateList(prioritized, modelMatches.filter(agent => agent.active));
        mergeCandidateList(prioritized, modelMatches);
      }
    }

    if (preferredProvider) {
      const providerMatches = agents.filter(
        agent => normalizePreference(agent.provider) === preferredProvider,
      );
      if (providerMatches.length) {
        mergeCandidateList(prioritized, providerMatches.filter(agent => agent.active));
        mergeCandidateList(prioritized, providerMatches);
      }
    }

    mergeCandidateList(prioritized, agents.filter(agent => agent.active));
    mergeCandidateList(prioritized, agents);

    for (const candidate of prioritized) {
      if (hasValidCredentials(candidate)) {
        return candidate;
      }
    }

    return null;
  }, [agents, activeProject?.preferredModel, activeProject?.preferredProvider]);

  const ensureOrchestrator = useCallback((): CodexOrchestrator | null => {
    const agent = resolvePreferredAgent();
    if (!agent) {
      return null;
    }

    const signature = [
      agent.id,
      activeProject?.id ?? '',
      apiKeySignature,
      activeProject?.instructions ?? '',
      agent.model,
    ].join('|');

    const existing = orchestratorRef.current;
    if (existing.instance && existing.signature === signature) {
      return existing.instance;
    }

    const orchestrator = new CodexOrchestrator({
      agent,
      apiKeys,
      engine: engineRef.current,
      jarvisInvoker: agent.kind === 'local' ? invokeChat : null,
      projectInstructions: activeProject?.instructions,
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

  const syncRepository = useCallback(async (options: RepoSyncOptions) => {
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
    (payload: QueuePayload) => {
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
    externalQueueRequest = queueRequest;
    externalSyncRepository = syncRepository;
    return () => {
      if (externalQueueRequest === queueRequest) {
        externalQueueRequest = null;
      }
      if (externalSyncRepository === syncRepository) {
        externalSyncRepository = null;
      }
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
