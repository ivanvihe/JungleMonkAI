import { useCallback, useMemo } from 'react';
import { callAnthropicChat, callGroqChat, callOpenAIChat } from '../utils/aiProviders';
import {
  getSupportedProviders,
  isSupportedProvider,
} from '../utils/globalSettings';
import { SupportedProvider } from '../types/globalSettings';

export interface ApiKeyValidationResult {
  valid: boolean;
  message?: string;
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs?: number;
  modelUsed?: string;
  message?: string;
}

const PROVIDER_PATTERNS: Partial<Record<SupportedProvider, RegExp>> = {
  openai: /^sk-[a-zA-Z0-9]{20,}$/,
  anthropic: /^sk-ant-[a-zA-Z0-9]{20,}$/,
  groq: /^gsk_[a-zA-Z0-9]{20,}$/,
};

const PROVIDER_TEST_MODELS: Record<SupportedProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  groq: 'mixtral-8x7b-32768',
};

const TEST_PROMPT = 'Responde únicamente con "OK".';

const getTimestamp = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const useProviderDiagnostics = () => {
  const supportedProviders = useMemo(() => getSupportedProviders(), []);

  const validateApiKey = useCallback(
    (provider: string, rawKey: string): ApiKeyValidationResult => {
      const apiKey = rawKey?.trim?.() ?? '';
      if (!apiKey) {
        return { valid: false, message: 'Ingresa una API key para continuar.' };
      }

      if (!isSupportedProvider(provider)) {
        return { valid: true };
      }

      const pattern = PROVIDER_PATTERNS[provider];
      if (pattern && !pattern.test(apiKey)) {
        return {
          valid: false,
          message: 'El formato de la API key parece inválido.',
        };
      }

      return { valid: true };
    },
    []
  );

  const testConnection = useCallback(
    async (provider: string, rawKey: string, model?: string): Promise<ProviderTestResult> => {
      const apiKey = rawKey?.trim?.() ?? '';
      if (!apiKey) {
        return { ok: false, message: 'Ingresa una API key antes de probar.' };
      }

      if (!isSupportedProvider(provider)) {
        return {
          ok: false,
          message: 'El diagnóstico automático no está disponible para este proveedor.',
        };
      }

      const selectedModel = model?.trim() || PROVIDER_TEST_MODELS[provider];
      const requestPayload = {
        apiKey,
        model: selectedModel,
        prompt: TEST_PROMPT,
        systemPrompt: 'Eres un monitor de conectividad. Devuelve "OK".',
        maxTokens: 8,
        temperature: 0,
      } as const;

      const start = getTimestamp();

      try {
        switch (provider) {
          case 'openai':
            await callOpenAIChat(requestPayload);
            break;
          case 'anthropic':
            await callAnthropicChat(requestPayload);
            break;
          case 'groq':
            await callGroqChat(requestPayload);
            break;
          default:
            return {
              ok: false,
              message: 'Proveedor no soportado para diagnóstico.',
            };
        }

        const latencyMs = getTimestamp() - start;
        return {
          ok: true,
          latencyMs,
          modelUsed: selectedModel,
          message: 'Conexión exitosa.',
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'No fue posible completar la prueba de conexión.';
        return {
          ok: false,
          message,
        };
      }
    },
    []
  );

  const getDefaultModel = useCallback(
    (provider: string): string | undefined => {
      if (!isSupportedProvider(provider)) {
        return undefined;
      }
      return PROVIDER_TEST_MODELS[provider];
    },
    []
  );

  return {
    supportedProviders,
    validateApiKey,
    testConnection,
    getDefaultModel,
  };
};

export type UseProviderDiagnostics = ReturnType<typeof useProviderDiagnostics>;
