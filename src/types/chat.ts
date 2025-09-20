import { AgentKind } from '../core/agents/agentRegistry';

export type ChatActorFilter =
  | 'all'
  | 'user'
  | 'system'
  | `agent:${string}`
  | `kind:${AgentKind}`;
