import { AgentDefinition } from '../core/agents/agentRegistry';

export const getAgentDisplayName = (agent: AgentDefinition): string =>
  agent.kind === 'local' ? 'Jarvis' : agent.name;

export const getAgentVersionLabel = (agent: AgentDefinition): string =>
  agent.kind === 'local' ? agent.name : agent.name;

export const getAgentChannelLabel = (agent: AgentDefinition): string => {
  if (agent.kind === 'local') {
    return 'Jarvis';
  }

  if (agent.channel === 'gpt') {
    return 'GPT';
  }

  if (agent.channel === 'claude') {
    return 'Claude';
  }

  if (agent.channel === 'groq') {
    return 'Groq';
  }

  return agent.name;
};
