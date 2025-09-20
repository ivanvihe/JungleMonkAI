import { ApiKeySettings } from '../../types/globalSettings';
import {
  ChatProviderResponse,
  callAnthropicChat,
  callGroqChat,
  callOpenAIChat,
} from '../../utils/aiProviders';
import { isSupportedProvider } from '../../utils/globalSettings';
import { ChatContentPart, ChatMessage } from '../messages/messageTypes';
import type { CoordinationStrategyId, MultiAgentContext } from '../orchestration';
import { AgentDefinition } from './agentRegistry';
import { getAgentDisplayName } from '../../utils/agentDisplay';

export const AGENT_SYSTEM_PROMPT =
  'Actúas como parte de un colectivo de agentes creativos. Responde de forma concisa, en español cuando sea posible, y especifica los supuestos importantes que utilices al contestar.';

const buildSystemPrompt = (context: MultiAgentContext | undefined): string => {
  if (!context) {
    return AGENT_SYSTEM_PROMPT;
  }

  const extras: string[] = [];

  if (context.role?.role) {
    extras.push(`Asumes el rol de ${context.role.role}.`);
  }

  if (context.role?.objective) {
    extras.push(`Objetivo actual: ${context.role.objective}.`);
  }

  if (context.strategyId) {
    extras.push(`La estrategia coordinada en vigor es «${context.strategyId}».`);
  }

  if (!extras.length) {
    return AGENT_SYSTEM_PROMPT;
  }

  return [AGENT_SYSTEM_PROMPT, ...extras].join('\n\n');
};

const buildPromptWithContext = (
  agent: AgentDefinition,
  prompt: string,
  context: MultiAgentContext | undefined,
): { prompt: string; systemPrompt: string } => {
  const sanitizedPrompt = prompt.trim();
  if (!context) {
    return { prompt: sanitizedPrompt, systemPrompt: AGENT_SYSTEM_PROMPT };
  }

  const sections: string[] = [];

  if (context.snapshot.sharedSummary) {
    sections.push(`Resumen colectivo compartido:\n${context.snapshot.sharedSummary}`);
  }

  const otherSummaries = Object.entries(context.snapshot.agentSummaries)
    .filter(([agentId]) => agentId !== agent.id)
    .map(([, summary]) => summary)
    .filter(Boolean);

  if (otherSummaries.length) {
    sections.push(`Aportes previos de otros agentes:\n- ${otherSummaries.slice(-3).join('\n- ')}`);
  }

  if (context.snapshot.lastConclusions.length) {
    const latest = context.snapshot.lastConclusions
      .slice(-3)
      .map(entry => `${entry.author === 'system' ? 'Coordinador' : `Agente ${entry.agentId ?? 'desconocido'}`}: ${entry.content}`)
      .join('\n');
    sections.push(`Conclusiones recientes:\n${latest}`);
  }

  if (context.instructions?.length) {
    sections.push(`Instrucciones del coordinador:\n- ${context.instructions.join('\n- ')}`);
  }

  if (context.bridgeMessages?.length) {
    const bridgeSummary = context.bridgeMessages
      .slice(-3)
      .map(message => `${message.author === 'system' ? 'Sistema' : `Agente ${message.agentId ?? 'desconocido'}`}: ${message.content}`)
      .join('\n');
    sections.push(`Mensajes internos relevantes:\n${bridgeSummary}`);
  }

  sections.push(`Solicitud del usuario:\n${sanitizedPrompt}`);

  return {
    prompt: sections.join('\n\n'),
    systemPrompt: buildSystemPrompt(context),
  };
};

export interface FetchAgentReplyOptions {
  agent: AgentDefinition;
  prompt: string;
  apiKeys: ApiKeySettings;
  fallback: (agent: AgentDefinition, prompt?: string, context?: MultiAgentContext) => string;
  context?: MultiAgentContext;
  onTrace?: (trace: AgentExchangeTrace) => void;
}

export interface AgentExchangeTrace {
  agentId: string;
  agentName: string;
  type: 'request' | 'response' | 'fallback';
  payload: string;
  timestamp: string;
  strategyId?: CoordinationStrategyId;
}

export const fetchAgentReply = async ({
  agent,
  prompt,
  apiKeys,
  fallback,
  context,
  onTrace,
}: FetchAgentReplyOptions): Promise<ChatProviderResponse> => {
  const displayName = getAgentDisplayName(agent);
  const providerKey = agent.provider.toLowerCase();
  if (agent.kind !== 'cloud' || !isSupportedProvider(providerKey)) {
    const fallbackContent = fallback(agent, prompt, context);
    onTrace?.({
      agentId: agent.id,
      agentName: displayName,
      type: 'fallback',
      payload: fallbackContent,
      timestamp: new Date().toISOString(),
      strategyId: context?.strategyId,
    });
    return {
      content: fallbackContent,
      modalities: ['text'],
    };
  }

  const apiKey = apiKeys[providerKey];
  if (!apiKey) {
    const payload = `${displayName} no tiene una API key configurada. Abre los ajustes globales para habilitar sus respuestas.`;
    onTrace?.({
      agentId: agent.id,
      agentName: displayName,
      type: 'fallback',
      payload,
      timestamp: new Date().toISOString(),
      strategyId: context?.strategyId,
    });
    return {
      content: payload,
      modalities: ['text'],
    };
  }

  const sanitizedPrompt = prompt.trim();
  if (!sanitizedPrompt) {
    const payload = 'Necesito un prompt válido para generar una respuesta.';
    onTrace?.({
      agentId: agent.id,
      agentName: displayName,
      type: 'fallback',
      payload,
      timestamp: new Date().toISOString(),
      strategyId: context?.strategyId,
    });
    return {
      content: payload,
      modalities: ['text'],
    };
  }

  const { prompt: decoratedPrompt, systemPrompt } = buildPromptWithContext(agent, sanitizedPrompt, context);
  onTrace?.({
    agentId: agent.id,
    agentName: displayName,
    type: 'request',
    payload: decoratedPrompt,
    timestamp: new Date().toISOString(),
    strategyId: context?.strategyId,
  });

  const runAndTrace = async (
    executor: () => Promise<ChatProviderResponse>,
  ): Promise<ChatProviderResponse> => {
    const response = await executor();
    onTrace?.({
      agentId: agent.id,
      agentName: displayName,
      type: 'response',
      payload: contentToPlainText(response.content),
      timestamp: new Date().toISOString(),
      strategyId: context?.strategyId,
    });
    return response;
  };

  if (providerKey === 'openai') {
    return runAndTrace(() =>
      callOpenAIChat({
        apiKey,
        model: agent.model,
        prompt: decoratedPrompt,
        systemPrompt,
      }),
    );
  }

  if (providerKey === 'anthropic') {
    return runAndTrace(() =>
      callAnthropicChat({
        apiKey,
        model: agent.model,
        prompt: decoratedPrompt,
        systemPrompt,
      }),
    );
  }

  if (providerKey === 'groq') {
    return runAndTrace(() =>
      callGroqChat({
        apiKey,
        model: agent.model,
        prompt: decoratedPrompt,
        systemPrompt,
      }),
    );
  }

  const fallbackContent = fallback(agent, prompt, context);
  onTrace?.({
    agentId: agent.id,
    agentName: displayName,
    type: 'fallback',
    payload: fallbackContent,
    timestamp: new Date().toISOString(),
    strategyId: context?.strategyId,
  });
  return {
    content: fallbackContent,
    modalities: ['text'],
  };
};

const contentToPlainText = (content: ChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((part: ChatContentPart | string) => {
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
    .join('\n');
};

export interface CorrectionRouteOptions {
  correctionId: string;
  originalMessage: ChatMessage;
  correctedText: string;
  notes?: string;
  tags?: string[];
  agent: AgentDefinition;
  reviewer?: AgentDefinition | null;
}

export interface CorrectionRouteResult {
  prompt: string;
  targetAgent: AgentDefinition;
}

export const buildCorrectionPipeline = ({
  correctionId,
  originalMessage,
  correctedText,
  notes,
  tags,
  agent,
  reviewer,
}: CorrectionRouteOptions): CorrectionRouteResult => {
  const targetAgent = reviewer ?? agent;

  const originalText = contentToPlainText(originalMessage.content);
  const contextHeader = `Corrección registrada (${correctionId}).`;
  const tagLine = tags?.length ? `Etiquetas asociadas: ${tags.join(', ')}.` : 'Sin etiquetas registradas.';
  const notesLine = notes?.trim().length ? `Notas del operador: ${notes.trim()}` : 'No se añadieron notas adicionales.';

  const promptSections = [
    contextHeader,
    `Mensaje original del agente ${getAgentDisplayName(agent)}:\n${originalText || '[vacío]'}`,
    `Propuesta corregida por el operador:\n${correctedText.trim() || '[sin contenido]'}`,
    notesLine,
    tagLine,
    'Revisa la corrección, valida los cambios y entrega una respuesta definitiva que incorpore los ajustes necesarios. '
      + 'Si la corrección es inválida, justifícalo y propone una alternativa correcta.',
  ];

  return {
    prompt: promptSections.join('\n\n'),
    targetAgent,
  };
};
