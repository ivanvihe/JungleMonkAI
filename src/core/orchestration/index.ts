import { criticReviewerStrategy } from './strategies/criticReviewer';
import { sequentialTurnStrategy } from './strategies/sequentialTurn';
import {
  CoordinationStrategy,
  CoordinationStrategyId,
  createInitialSnapshot,
  OrchestrationTraceEntry,
  SharedConversationSnapshot,
} from './types';

const STRATEGIES: Record<CoordinationStrategyId, CoordinationStrategy> = {
  'sequential-turn': sequentialTurnStrategy,
  'critic-reviewer': criticReviewerStrategy,
};

export const listCoordinationStrategies = (): CoordinationStrategy[] => Object.values(STRATEGIES);

export const getCoordinationStrategy = (id: CoordinationStrategyId): CoordinationStrategy => STRATEGIES[id];

export const buildTraceFromBridge = (
  message: { id: string; author: 'system' | 'agent'; agentId?: string; content: string; timestamp: string },
  strategyId: CoordinationStrategyId,
  description?: string,
): OrchestrationTraceEntry => ({
  id: `${message.id}-trace`,
  timestamp: message.timestamp,
  actor: message.author,
  agentId: message.agentId,
  description: description ?? message.content,
  strategyId,
});

export const registerAgentConclusion = (
  snapshot: SharedConversationSnapshot,
  agentId: string,
  content: string,
  timestamp: string,
): SharedConversationSnapshot => {
  const cleaned = content.trim();
  const concise = cleaned.length > 480 ? `${cleaned.slice(0, 477)}…` : cleaned;

  const nextSharedSummary = concise
    ? `Última conclusión (${timestamp.split('T')[0]}): ${concise}`
    : snapshot.sharedSummary;

  return {
    ...snapshot,
    sharedSummary: nextSharedSummary,
    agentSummaries: {
      ...snapshot.agentSummaries,
      [agentId]: concise || 'Respuesta sin contenido utilizable.',
    },
    lastConclusions: [
      ...snapshot.lastConclusions,
      {
        agentId,
        author: 'agent',
        content: concise || '—',
        timestamp,
      },
    ],
  };
};

export const registerSystemNote = (
  snapshot: SharedConversationSnapshot,
  content: string,
  timestamp: string,
): SharedConversationSnapshot => ({
  ...snapshot,
  lastConclusions: [
    ...snapshot.lastConclusions,
    {
      author: 'system',
      content,
      timestamp,
    },
  ],
});

export { createInitialSnapshot, limitSnapshotHistory } from './types';
export type {
  CoordinationStrategyId,
  SharedConversationSnapshot,
  MultiAgentContext,
  OrchestrationPlan,
  OrchestrationTraceEntry,
  OrchestrationProjectContext,
} from './types';
