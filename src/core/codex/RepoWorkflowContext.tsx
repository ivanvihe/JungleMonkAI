import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { CodexRequest } from './types';
import type { ChatMessage } from '../messages/messageTypes';
import { useMessages } from '../messages/MessageContext';
import { CodexEngine } from './CodexEngine';
import { buildRepoWorkflowSubmission, type RepoWorkflowSubmission } from './bridge';
import { useProjects } from '../projects/ProjectContext';

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
}

interface QueuePayload {
  messageId: string;
  canonicalCode?: string;
  repositoryPath?: string;
  branch?: string;
  riskLevel?: RepoWorkflowSubmission['request']['context']['riskLevel'];
}

interface RepoWorkflowContextValue {
  pendingRequest: RepoWorkflowRequest | null;
  queueRequest: (payload: QueuePayload) => void;
  clearPendingRequest: () => void;
}

const RepoWorkflowContext = createContext<RepoWorkflowContextValue | undefined>(undefined);

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

export const RepoWorkflowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { messages } = useMessages();
  const engineRef = useRef(new CodexEngine({ defaultDryRun: true }));
  const [pendingRequest, setPendingRequest] = useState<RepoWorkflowRequest | null>(null);
  const { activeProject } = useProjects();

  const queueRequest = useCallback(
    (payload: QueuePayload) => {
      const { messageId, canonicalCode, repositoryPath, branch, riskLevel } = payload;
      const originalMessage = findMessageById(messages, messageId) ?? buildFallbackMessage(messageId, canonicalCode);

      const defaultRepositoryPath = repositoryPath ?? activeProject?.repositoryPath;
      const defaultBranch = branch ?? activeProject?.defaultBranch;
      const defaultActor = activeProject
        ? [activeProject.preferredProvider, activeProject.preferredModel]
            .filter(Boolean)
            .join(':') || activeProject.name
        : undefined;

      const submission = buildRepoWorkflowSubmission({
        message: originalMessage,
        canonicalCode,
        engine: engineRef.current,
        options: {
          repositoryPath: repositoryPath,
          branch: defaultBranch,
          actor: defaultActor,
          riskLevel,
        },
        defaultRepositoryPath,
      });

      if (!submission.analysisPrompt.trim()) {
        console.warn('La solicitud a Repo Studio carece de contenido analizable.');
        return;
      }

      const request: RepoWorkflowRequest = {
        id: generateRequestId(),
        sourceMessageId: originalMessage.id,
        sourceAgentId: originalMessage.agentId ?? originalMessage.originAgentId,
        request: submission.request,
        plan: submission.plan,
        analysisPrompt: submission.analysisPrompt,
        commitMessage: submission.commitMessage,
        prTitle: submission.prTitle,
        prBody: submission.prBody,
        tags: submission.tags,
        originalResponse: submission.originalResponse,
        canonicalCode: submission.canonicalCode ?? canonicalCode,
      };

      setPendingRequest(request);
    },
    [messages, activeProject],
  );

  const clearPendingRequest = useCallback(() => {
    setPendingRequest(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingRequest,
      queueRequest,
      clearPendingRequest,
    }),
    [pendingRequest, queueRequest, clearPendingRequest],
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
