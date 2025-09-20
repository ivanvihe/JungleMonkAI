import { ApiKeySettings } from '../../types/globalSettings';
import { callAnthropicChat, callGroqChat, callOpenAIChat } from '../../utils/aiProviders';
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
}: FetchAgentReplyOptions): Promise<string> => {
  const providerKey = agent.provider.toLowerCase();
  if (agent.kind !== 'cloud' || !isSupportedProvider(providerKey)) {
    return fallback(agent, prompt);
  }

  const apiKey = apiKeys[providerKey];
  if (!apiKey) {
    return `${agent.name} no tiene una API key configurada. Abre los ajustes globales para habilitar sus respuestas.`;
  }

  const sanitizedPrompt = prompt.trim();
  if (!sanitizedPrompt) {
    return 'Necesito un prompt válido para generar una respuesta.';
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

  return fallback(agent, prompt);
};
