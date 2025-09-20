import { ApiKeySettings } from '../../types/globalSettings';
import {
  ChatProviderResponse,
  callAnthropicChat,
  callGroqChat,
  callOpenAIChat,
} from '../../utils/aiProviders';
import { isSupportedProvider } from '../../utils/globalSettings';
import { ChatContentPart, ChatMessage } from '../messages/messageTypes';
import { AgentDefinition } from './agentRegistry';

export const AGENT_SYSTEM_PROMPT =
  'Actúas como parte de un colectivo de agentes creativos. Responde de forma concisa, en español cuando sea posible, y especifica los supuestos importantes que utilices al contestar.';

export interface FetchAgentReplyOptions {
  agent: AgentDefinition;
  prompt: string;
  apiKeys: ApiKeySettings;
  fallback: (agent: AgentDefinition, prompt?: string) => string;
}

export const fetchAgentReply = async ({
  agent,
  prompt,
  apiKeys,
  fallback,
}: FetchAgentReplyOptions): Promise<ChatProviderResponse> => {
  const providerKey = agent.provider.toLowerCase();
  if (agent.kind !== 'cloud' || !isSupportedProvider(providerKey)) {
    return {
      content: fallback(agent, prompt),
      modalities: ['text'],
    };
  }

  const apiKey = apiKeys[providerKey];
  if (!apiKey) {
    return {
      content: `${agent.name} no tiene una API key configurada. Abre los ajustes globales para habilitar sus respuestas.`,
      modalities: ['text'],
    };
  }

  const sanitizedPrompt = prompt.trim();
  if (!sanitizedPrompt) {
    return {
      content: 'Necesito un prompt válido para generar una respuesta.',
      modalities: ['text'],
    };
  }

  if (providerKey === 'openai') {
    return callOpenAIChat({
      apiKey,
      model: agent.model,
      prompt: sanitizedPrompt,
      systemPrompt: AGENT_SYSTEM_PROMPT,
    });
  }

  if (providerKey === 'anthropic') {
    return callAnthropicChat({
      apiKey,
      model: agent.model,
      prompt: sanitizedPrompt,
      systemPrompt: AGENT_SYSTEM_PROMPT,
    });
  }

  if (providerKey === 'groq') {
    return callGroqChat({
      apiKey,
      model: agent.model,
      prompt: sanitizedPrompt,
      systemPrompt: AGENT_SYSTEM_PROMPT,
    });
  }

  return {
    content: fallback(agent, prompt),
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
    `Mensaje original del agente ${agent.name}:\n${originalText || '[vacío]'}`,
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
