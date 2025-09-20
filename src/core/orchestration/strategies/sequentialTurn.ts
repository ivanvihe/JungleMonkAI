import { CoordinationStrategy, OrchestrationPlan } from '../types';
import {
  AgentRoleAssignment,
  InternalBridgeMessage,
  MultiAgentContext,
  SharedConversationSnapshot,
} from '../types';
import { AgentDefinition } from '../../agents/agentRegistry';

const buildInstructions = (
  agent: AgentDefinition,
  role: AgentRoleAssignment | undefined,
  snapshot: SharedConversationSnapshot,
  userPrompt: string,
): string[] => {
  const instructions: string[] = [];

  if (role?.role) {
    instructions.push(`Rol asignado: ${role.role}.`);
  }
  if (role?.objective) {
    instructions.push(`Objetivo específico: ${role.objective}.`);
  }

  const personalSummary = snapshot.agentSummaries[agent.id];
  if (personalSummary) {
    instructions.push(`Tu último aporte registrado: ${personalSummary}`);
  }

  if (snapshot.sharedSummary) {
    instructions.push(`Resumen colectivo: ${snapshot.sharedSummary}`);
  }

  if (snapshot.lastConclusions.length) {
    const recent = snapshot.lastConclusions
      .slice(-3)
      .map(entry => `${entry.author === 'system' ? 'Coordinador' : `Agente ${entry.agentId ?? 'desconocido'}`}: ${entry.content}`)
      .join('\n');
    instructions.push(`Conclusiones recientes:\n${recent}`);
  }

  instructions.push(`Nueva petición del usuario: ${userPrompt}`);

  return instructions;
};

const buildContext = (
  agent: AgentDefinition,
  role: AgentRoleAssignment | undefined,
  snapshot: SharedConversationSnapshot,
  userPrompt: string,
): MultiAgentContext => ({
  strategyId: 'sequential-turn',
  snapshot,
  role,
  instructions: buildInstructions(agent, role, snapshot, userPrompt),
  userPrompt,
});

export const sequentialTurnStrategy: CoordinationStrategy = {
  id: 'sequential-turn',
  label: 'Turno secuencial',
  description: 'Cada agente responde en orden compartiendo el contexto acumulado.',
  buildPlan: ({ userPrompt, agents, snapshot, roles }): OrchestrationPlan => {
    const timestamp = new Date().toISOString();
    const sharedBridge: InternalBridgeMessage = {
      id: `bridge-system-${timestamp}`,
      author: 'system',
      content: `Coordinador: turno #${snapshot.turn + 1}. Participarán ${agents.length} agente(s) en secuencia.`,
      timestamp,
    };

    const steps = agents.map(agent => ({
      agent,
      prompt: userPrompt,
      context: buildContext(agent, roles[agent.id], snapshot, userPrompt),
    }));

    return {
      steps,
      sharedBridgeMessages: [sharedBridge],
      nextSnapshot: {
        ...snapshot,
        turn: snapshot.turn + 1,
      },
    };
  },
};
