import { ApiKeySettings } from '../../types/globalSettings';
import {
  ChatProviderResponse,
  callAnthropicChat,
  callGroqChat,
  callOpenAIChat,
} from '../../utils/aiProviders';
import { isSupportedProvider } from '../../utils/globalSettings';
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
