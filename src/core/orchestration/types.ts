import type { AgentDefinition } from '../agents/agentRegistry';
import type { ChatMessage } from '../messages/messageTypes';

export type CoordinationStrategyId = 'sequential-turn' | 'critic-reviewer';

export interface AgentRoleAssignment {
  role?: string;
  objective?: string;
}

export interface SharedConversationSnapshot {
  turn: number;
  sharedSummary: string;
  agentSummaries: Record<string, string>;
  lastConclusions: Array<{
    agentId?: string;
    author: 'system' | 'agent';
    content: string;
    timestamp: string;
  }>;
}

export interface InternalBridgeMessage {
  id: string;
  author: 'system' | 'agent';
  agentId?: string;
  content: string;
  timestamp: string;
}

export interface OrchestrationProjectContext {
  id: string;
  name: string;
  repositoryPath: string;
  defaultBranch?: string;
  instructions?: string;
  preferredProvider?: string;
  preferredModel?: string;
}

export interface MultiAgentContext {
  strategyId: CoordinationStrategyId;
  snapshot: SharedConversationSnapshot;
  role?: AgentRoleAssignment;
  instructions?: string[];
  bridgeMessages?: InternalBridgeMessage[];
  userPrompt: string;
  project?: OrchestrationProjectContext;
}

export interface OrchestrationStepPlan {
  agent: AgentDefinition;
  prompt: string;
  context: MultiAgentContext;
  bridgeMessages?: InternalBridgeMessage[];
}

export interface OrchestrationPlan {
  steps: OrchestrationStepPlan[];
  sharedBridgeMessages: InternalBridgeMessage[];
  nextSnapshot: SharedConversationSnapshot;
}

export interface OrchestrationTraceEntry {
  id: string;
  timestamp: string;
  actor: 'system' | 'agent';
  agentId?: string;
  description: string;
  details?: string;
  strategyId: CoordinationStrategyId;
}

export interface CoordinationStrategy {
  id: CoordinationStrategyId;
  label: string;
  description: string;
  buildPlan: (input: {
    userPrompt: string;
    agents: AgentDefinition[];
    snapshot: SharedConversationSnapshot;
    roles: Record<string, AgentRoleAssignment | undefined>;
    agentPrompts?: Record<string, string | undefined>;
    project?: OrchestrationProjectContext;
  }) => OrchestrationPlan;
}

export const createInitialSnapshot = (): SharedConversationSnapshot => ({
  turn: 0,
  sharedSummary: 'Sin conclusiones previas registradas.',
  agentSummaries: {},
  lastConclusions: [],
});

export const limitSnapshotHistory = (
  snapshot: SharedConversationSnapshot,
  maxEntries = 8,
): SharedConversationSnapshot => ({
  ...snapshot,
  lastConclusions:
    snapshot.lastConclusions.length > maxEntries
      ? snapshot.lastConclusions.slice(-maxEntries)
      : snapshot.lastConclusions,
});

export const summarizeMessage = (message: ChatMessage): string => {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .map(part => {
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
    .join('\n');
};
