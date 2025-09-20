import { CoordinationStrategy, OrchestrationPlan } from '../types';
import {
  AgentRoleAssignment,
  InternalBridgeMessage,
  MultiAgentContext,
  SharedConversationSnapshot,
} from '../types';
import { AgentDefinition } from '../../agents/agentRegistry';

const isReviewer = (role: AgentRoleAssignment | undefined): boolean => {
  if (!role?.role) {
    return false;
  }
  const normalized = role.role.toLowerCase();
  return normalized.includes('crític') || normalized.includes('critic') || normalized.includes('revisor');
};

const splitRoles = (
  agents: AgentDefinition[],
  roles: Record<string, AgentRoleAssignment | undefined>,
): { producers: AgentDefinition[]; reviewers: AgentDefinition[] } => {
  const producers: AgentDefinition[] = [];
  const reviewers: AgentDefinition[] = [];

  agents.forEach(agent => {
    if (isReviewer(roles[agent.id])) {
      reviewers.push(agent);
    } else {
      producers.push(agent);
    }
  });

  if (producers.length === 0 && reviewers.length > 1) {
    producers.push(reviewers.shift()!);
  }

  if (reviewers.length === 0 && producers.length > 1) {
    reviewers.push(producers[producers.length - 1]);
  }

  return { producers, reviewers };
};

const buildProducerInstructions = (
  agent: AgentDefinition,
  role: AgentRoleAssignment | undefined,
  snapshot: SharedConversationSnapshot,
  userPrompt: string,
): string[] => {
  const instructions: string[] = [];
  if (role?.role) {
    instructions.push(`Rol productor: ${role.role}.`);
  }
  if (role?.objective) {
    instructions.push(`Objetivo prioritario: ${role.objective}.`);
  }
  if (snapshot.sharedSummary) {
    instructions.push(`Resumen colectivo vigente: ${snapshot.sharedSummary}`);
  }
  if (snapshot.lastConclusions.length) {
    const last = snapshot.lastConclusions
      .slice(-2)
      .map(entry => `${entry.author === 'system' ? 'Coordinador' : `Agente ${entry.agentId ?? 'desconocido'}`}: ${entry.content}`)
      .join('\n');
    instructions.push(`Contexto inmediato:\n${last}`);
  }
  instructions.push(`Genera una propuesta sólida para: ${userPrompt}`);
  instructions.push('Incluye supuestos clave y pasos ejecutables.');
  return instructions;
};

const buildReviewerInstructions = (
  agent: AgentDefinition,
  role: AgentRoleAssignment | undefined,
  snapshot: SharedConversationSnapshot,
  userPrompt: string,
): string[] => {
  const instructions: string[] = [];
  instructions.push('Actúas como crítico/revisor de la propuesta previa.');
  if (role?.role) {
    instructions.push(`Rol asignado: ${role.role}.`);
  }
  if (role?.objective) {
    instructions.push(`Criterios clave: ${role.objective}.`);
  }
  if (snapshot.lastConclusions.length) {
    const [latest] = snapshot.lastConclusions.slice(-1);
    if (latest) {
      instructions.push(`Última propuesta recibida: ${latest.content}`);
    }
  }
  instructions.push(`Valida o mejora la respuesta respecto a: ${userPrompt}`);
  instructions.push('Entrega veredicto y mejoras puntuales.');
  return instructions;
};

const buildContext = (
  agent: AgentDefinition,
  role: AgentRoleAssignment | undefined,
  snapshot: SharedConversationSnapshot,
  userPrompt: string,
  instructions: string[],
): MultiAgentContext => ({
  strategyId: 'critic-reviewer',
  snapshot,
  role,
  instructions,
  userPrompt,
});

export const criticReviewerStrategy: CoordinationStrategy = {
  id: 'critic-reviewer',
  label: 'Productor + crítico',
  description: 'Un agente genera propuestas y otro(s) las audita antes de publicarlas.',
  buildPlan: ({ userPrompt, agents, snapshot, roles }): OrchestrationPlan => {
    const timestamp = new Date().toISOString();
    const { producers, reviewers } = splitRoles(agents, roles);
    const sharedMessages: InternalBridgeMessage[] = [
      {
        id: `bridge-critic-${timestamp}`,
        author: 'system',
        content: `Coordinador: modo crítico. Productores (${producers.length}) → Revisores (${reviewers.length}).`,
        timestamp,
      },
    ];

    const steps = [
      ...producers.map(agent => ({
        agent,
        prompt: userPrompt,
        context: buildContext(agent, roles[agent.id], snapshot, userPrompt, buildProducerInstructions(agent, roles[agent.id], snapshot, userPrompt)),
      })),
      ...reviewers.map(agent => ({
        agent,
        prompt: userPrompt,
        context: buildContext(agent, roles[agent.id], snapshot, userPrompt, buildReviewerInstructions(agent, roles[agent.id], snapshot, userPrompt)),
      })),
    ];

    return {
      steps,
      sharedBridgeMessages: sharedMessages,
      nextSnapshot: {
        ...snapshot,
        turn: snapshot.turn + 1,
      },
    };
  },
};
